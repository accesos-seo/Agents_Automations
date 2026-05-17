-- ============================================================================
-- 002_functions.sql
-- Funciones de negocio para cuentas de cobro mensuales
-- ----------------------------------------------------------------------------
-- Consolidación de:
--   - freelancer_invoices_v1_functions
--   - freelancer_invoices_v1_fix_partial_unique_conflict
--   - freelancer_invoices_v1_fix_generator_drop_recreate
--   - freelancer_invoices_v2_separate_dispatch_and_doc_pipeline
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) GENERADOR (idempotente: ON CONFLICT por user_id+year+month)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.generate_monthly_freelancer_invoices(int, int);

CREATE OR REPLACE FUNCTION public.generate_monthly_freelancer_invoices(
  p_period_year  int,
  p_period_month int
)
RETURNS TABLE (out_invoice_id uuid, out_user_id uuid, out_monthly_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_period_start date := make_date(p_period_year, p_period_month, 1);
  v_period_end   date := (v_period_start + interval '1 month - 1 day')::date;
BEGIN
  RETURN QUERY
  WITH inserted AS (
    INSERT INTO public.freelancer_invoices AS fi (
      user_id, period_year, period_month, period_start, period_end,
      rate_type, monthly_amount, currency, admin_user_id, status
    )
    SELECT
      s.user_id, p_period_year, p_period_month, v_period_start, v_period_end,
      'monthly_fixed', s.monthly_amount, s.currency, s.admin_user_id, 'draft'
    FROM public.freelancer_invoice_settings s
    JOIN public.users u ON u.id = s.user_id
    WHERE s.is_active = true AND s.monthly_amount > 0
    ON CONFLICT (user_id, period_year, period_month) DO NOTHING
    RETURNING fi.id, fi.user_id, fi.monthly_amount
  )
  SELECT inserted.id, inserted.user_id, inserted.monthly_amount FROM inserted;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) DESPACHADOR: encola notificación a outbox y marca sent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_freelancer_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_invoice  public.freelancer_invoices;
  v_user     public.users;
  v_settings public.freelancer_invoice_settings;
  v_period_label text;
BEGIN
  SELECT * INTO v_invoice FROM public.freelancer_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice no encontrada: %', p_invoice_id;
  END IF;
  IF v_invoice.status NOT IN ('draft', 'sent') THEN RETURN; END IF;

  SELECT * INTO v_user     FROM public.users WHERE id = v_invoice.user_id;
  SELECT * INTO v_settings FROM public.freelancer_invoice_settings WHERE user_id = v_invoice.user_id;
  v_period_label := to_char(make_date(v_invoice.period_year, v_invoice.period_month, 1), 'TMMonth YYYY');

  INSERT INTO public.notifications_outbox (
    source, target_type, target_id, type, payload, dedupe_key, scheduled_for, priority
  ) VALUES (
    'freelancer_invoice', 'email',
    COALESCE(v_settings.notification_email, v_user.email),
    'invoice_sent',
    jsonb_build_object(
      'invoice_id', v_invoice.id, 'user_id', v_invoice.user_id,
      'full_name', v_user.full_name, 'period_label', v_period_label,
      'period_year', v_invoice.period_year, 'period_month', v_invoice.period_month,
      'monthly_amount', v_invoice.monthly_amount, 'total_amount', v_invoice.total_amount,
      'currency', v_invoice.currency, 'document_url', v_invoice.document_url,
      'ack_token', v_invoice.writer_token
    ),
    'invoice_sent_email:' || v_invoice.id::text, now(), 60
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  IF COALESCE(v_settings.notification_slack_id, v_user.slack_id) IS NOT NULL THEN
    INSERT INTO public.notifications_outbox (
      source, target_type, target_id, type, payload, dedupe_key, scheduled_for, priority
    ) VALUES (
      'freelancer_invoice', 'slack_dm',
      COALESCE(v_settings.notification_slack_id, v_user.slack_id),
      'invoice_sent',
      jsonb_build_object(
        'invoice_id', v_invoice.id, 'full_name', v_user.full_name,
        'period_label', v_period_label, 'total_amount', v_invoice.total_amount,
        'currency', v_invoice.currency, 'ack_token', v_invoice.writer_token
      ),
      'invoice_sent_slack:' || v_invoice.id::text, now(), 60
    )
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  UPDATE public.freelancer_invoices
  SET status = 'sent', sent_at = COALESCE(sent_at, now()),
      last_writer_notified_at = now(),
      next_followup_at = now() + interval '24 hours'
  WHERE id = p_invoice_id;

  INSERT INTO public.freelancer_invoice_events (invoice_id, event_type, payload)
  VALUES (p_invoice_id, 'dispatched',
          jsonb_build_object('email', true,
                             'slack', COALESCE(v_settings.notification_slack_id, v_user.slack_id) IS NOT NULL));
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) ACKNOWLEDGE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acknowledge_freelancer_invoice(
  p_token text, p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  UPDATE public.freelancer_invoices
  SET status = 'acknowledged_by_writer',
      writer_acknowledged_at = COALESCE(writer_acknowledged_at, now()),
      writer_response = COALESCE(p_message, writer_response),
      escalation_level = 0, follow_up_count = 0,
      next_followup_at = now() + interval '24 hours'
  WHERE writer_token = p_token
    AND status IN ('sent', 'acknowledged_by_writer')
  RETURNING id INTO v_invoice_id;

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Token inválido o cuenta de cobro ya procesada' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.notify_admin_for_invoice_approval(v_invoice_id);

  INSERT INTO public.freelancer_invoice_events (invoice_id, event_type, payload)
  VALUES (v_invoice_id, 'acknowledged_by_writer', jsonb_build_object('message', p_message));

  RETURN jsonb_build_object('invoice_id', v_invoice_id, 'status', 'acknowledged_by_writer');
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) REJECT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_freelancer_invoice(p_token text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Debes indicar el motivo del rechazo';
  END IF;

  UPDATE public.freelancer_invoices
  SET status = 'rejected_by_writer',
      writer_rejected_at = now(),
      writer_rejection_reason = p_reason,
      next_followup_at = NULL
  WHERE writer_token = p_token
    AND status IN ('sent', 'acknowledged_by_writer')
  RETURNING id INTO v_invoice_id;

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Token inválido o cuenta de cobro ya procesada' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.notify_admin_for_invoice_rejection(v_invoice_id);

  INSERT INTO public.freelancer_invoice_events (invoice_id, event_type, payload)
  VALUES (v_invoice_id, 'rejected_by_writer', jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('invoice_id', v_invoice_id, 'status', 'rejected_by_writer');
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) APPROVE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_freelancer_invoice(
  p_token text, p_admin_user_id uuid, p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  UPDATE public.freelancer_invoices
  SET status = 'admin_approved',
      admin_approved_at = now(),
      admin_user_id = COALESCE(admin_user_id, p_admin_user_id),
      admin_notes = p_notes,
      next_followup_at = NULL,
      escalation_level = 0
  WHERE admin_token = p_token
    AND status = 'acknowledged_by_writer'
  RETURNING id INTO v_invoice_id;

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Token inválido, cuenta no acusada por el redactor, o ya aprobada' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.notify_writer_of_approval(v_invoice_id);

  INSERT INTO public.freelancer_invoice_events (invoice_id, event_type, actor_user_id, payload)
  VALUES (v_invoice_id, 'admin_approved', p_admin_user_id, jsonb_build_object('notes', p_notes));

  RETURN jsonb_build_object('invoice_id', v_invoice_id, 'status', 'admin_approved');
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) MARK PAID
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_freelancer_invoice_paid(
  p_invoice_id uuid, p_admin_user_id uuid, p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE public.freelancer_invoices
  SET status = 'paid', paid_at = now(),
      payment_reference = p_reference, next_followup_at = NULL
  WHERE id = p_invoice_id AND status = 'admin_approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo se puede marcar como pagada una cuenta aprobada' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.freelancer_payments (user_id, period_start, period_end, total_amount, status, paid_at, details)
  SELECT user_id, period_start, period_end, total_amount, 'paid', now(),
    jsonb_build_object('invoice_id', id, 'rate_type', rate_type,
                       'monthly_amount', monthly_amount, 'bonus_amount', bonus_amount,
                       'deduction_amount', deduction_amount, 'payment_reference', p_reference)
  FROM public.freelancer_invoices
  WHERE id = p_invoice_id;

  INSERT INTO public.freelancer_invoice_events (invoice_id, event_type, actor_user_id, payload)
  VALUES (p_invoice_id, 'paid', p_admin_user_id, jsonb_build_object('reference', p_reference));

  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'status', 'paid');
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) NOTIFY HELPERS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_admin_for_invoice_approval(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_invoice public.freelancer_invoices;
  v_admin   public.users;
  v_writer  public.users;
  v_period_label text;
BEGIN
  SELECT * INTO v_invoice FROM public.freelancer_invoices WHERE id = p_invoice_id;
  SELECT * INTO v_writer  FROM public.users WHERE id = v_invoice.user_id;
  SELECT * INTO v_admin   FROM public.users WHERE id = v_invoice.admin_user_id;
  IF v_admin.id IS NULL THEN RETURN; END IF;
  v_period_label := to_char(make_date(v_invoice.period_year, v_invoice.period_month, 1), 'TMMonth YYYY');

  INSERT INTO public.notifications_outbox (source, target_type, target_id, type, payload, dedupe_key, scheduled_for, priority)
  VALUES (
    'freelancer_invoice','email', v_admin.email, 'invoice_pending_approval',
    jsonb_build_object(
      'invoice_id', v_invoice.id, 'writer_full_name', v_writer.full_name,
      'writer_email', v_writer.email, 'period_label', v_period_label,
      'total_amount', v_invoice.total_amount, 'currency', v_invoice.currency,
      'approve_token', v_invoice.admin_token
    ),
    'invoice_pending_email:' || v_invoice.id::text, now(), 70
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  IF v_admin.slack_id IS NOT NULL THEN
    INSERT INTO public.notifications_outbox (source, target_type, target_id, type, payload, dedupe_key, scheduled_for, priority)
    VALUES (
      'freelancer_invoice', 'slack_dm', v_admin.slack_id, 'invoice_pending_approval',
      jsonb_build_object(
        'invoice_id', v_invoice.id, 'writer_full_name', v_writer.full_name,
        'period_label', v_period_label, 'total_amount', v_invoice.total_amount,
        'currency', v_invoice.currency, 'approve_token', v_invoice.admin_token
      ),
      'invoice_pending_slack:' || v_invoice.id::text, now(), 70
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  UPDATE public.freelancer_invoices SET last_admin_notified_at = now() WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_admin_for_invoice_rejection(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_invoice public.freelancer_invoices;
  v_admin   public.users;
  v_writer  public.users;
BEGIN
  SELECT * INTO v_invoice FROM public.freelancer_invoices WHERE id = p_invoice_id;
  SELECT * INTO v_writer  FROM public.users WHERE id = v_invoice.user_id;
  SELECT * INTO v_admin   FROM public.users WHERE id = v_invoice.admin_user_id;
  IF v_admin.id IS NULL THEN RETURN; END IF;

  INSERT INTO public.notifications_outbox (source, target_type, target_id, type, payload, dedupe_key, scheduled_for, priority)
  VALUES (
    'freelancer_invoice', 'email', v_admin.email, 'invoice_rejected_by_writer',
    jsonb_build_object(
      'invoice_id', v_invoice.id, 'writer_full_name', v_writer.full_name,
      'rejection_reason', v_invoice.writer_rejection_reason,
      'period_year', v_invoice.period_year, 'period_month', v_invoice.period_month
    ),
    'invoice_rejected_email:' || v_invoice.id::text, now(), 90
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  IF v_admin.slack_id IS NOT NULL THEN
    INSERT INTO public.notifications_outbox (source, target_type, target_id, type, payload, dedupe_key, scheduled_for, priority)
    VALUES (
      'freelancer_invoice', 'slack_dm', v_admin.slack_id, 'invoice_rejected_by_writer',
      jsonb_build_object(
        'invoice_id', v_invoice.id, 'writer_full_name', v_writer.full_name,
        'rejection_reason', v_invoice.writer_rejection_reason
      ),
      'invoice_rejected_slack:' || v_invoice.id::text, now(), 90
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_writer_of_approval(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_invoice public.freelancer_invoices;
  v_writer  public.users;
  v_period_label text;
BEGIN
  SELECT * INTO v_invoice FROM public.freelancer_invoices WHERE id = p_invoice_id;
  SELECT * INTO v_writer  FROM public.users WHERE id = v_invoice.user_id;
  v_period_label := to_char(make_date(v_invoice.period_year, v_invoice.period_month, 1), 'TMMonth YYYY');

  INSERT INTO public.notifications_outbox (source, target_type, target_id, type, payload, dedupe_key, scheduled_for, priority)
  VALUES (
    'freelancer_invoice', 'email', v_writer.email, 'invoice_approved',
    jsonb_build_object(
      'invoice_id', v_invoice.id, 'full_name', v_writer.full_name,
      'period_label', v_period_label, 'total_amount', v_invoice.total_amount,
      'currency', v_invoice.currency
    ),
    'invoice_approved_email:' || v_invoice.id::text, now(), 50
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  IF v_writer.slack_id IS NOT NULL THEN
    INSERT INTO public.notifications_outbox (source, target_type, target_id, type, payload, dedupe_key, scheduled_for, priority)
    VALUES (
      'freelancer_invoice', 'slack_dm', v_writer.slack_id, 'invoice_approved',
      jsonb_build_object(
        'invoice_id', v_invoice.id, 'full_name', v_writer.full_name,
        'period_label', v_period_label
      ),
      'invoice_approved_slack:' || v_invoice.id::text, now(), 50
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) FOLLOW-UP DISPATCHER
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_freelancer_invoice_followup(p_invoice_id uuid, p_target text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_invoice public.freelancer_invoices;
  v_writer  public.users;
  v_admin   public.users;
  v_level   int;
  v_period_label text;
BEGIN
  SELECT * INTO v_invoice FROM public.freelancer_invoices WHERE id = p_invoice_id;
  SELECT * INTO v_writer  FROM public.users WHERE id = v_invoice.user_id;
  SELECT * INTO v_admin   FROM public.users WHERE id = v_invoice.admin_user_id;
  v_level := v_invoice.escalation_level;
  v_period_label := to_char(make_date(v_invoice.period_year, v_invoice.period_month, 1), 'TMMonth YYYY');

  IF p_target = 'writer' THEN
    INSERT INTO public.notifications_outbox (source, target_type, target_id, type, payload, dedupe_key, scheduled_for, priority)
    VALUES (
      'freelancer_invoice', 'email', v_writer.email, 'invoice_reminder_writer',
      jsonb_build_object(
        'invoice_id', v_invoice.id, 'full_name', v_writer.full_name,
        'period_label', v_period_label, 'total_amount', v_invoice.total_amount,
        'escalation_level', v_level, 'ack_token', v_invoice.writer_token
      ),
      'invoice_followup_writer_email:' || v_invoice.id::text || ':' || v_level::text,
      now(), LEAST(50 + v_level * 10, 99)
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    IF v_writer.slack_id IS NOT NULL THEN
      INSERT INTO public.notifications_outbox (source, target_type, target_id, type, payload, dedupe_key, scheduled_for, priority)
      VALUES (
        'freelancer_invoice', 'slack_dm', v_writer.slack_id, 'invoice_reminder_writer',
        jsonb_build_object(
          'invoice_id', v_invoice.id, 'full_name', v_writer.full_name,
          'period_label', v_period_label, 'total_amount', v_invoice.total_amount,
          'escalation_level', v_level, 'ack_token', v_invoice.writer_token
        ),
        'invoice_followup_writer_slack:' || v_invoice.id::text || ':' || v_level::text,
        now(), LEAST(50 + v_level * 10, 99)
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;

    UPDATE public.freelancer_invoices SET last_writer_notified_at = now() WHERE id = p_invoice_id;

  ELSIF p_target = 'admin' AND v_admin.id IS NOT NULL THEN
    INSERT INTO public.notifications_outbox (source, target_type, target_id, type, payload, dedupe_key, scheduled_for, priority)
    VALUES (
      'freelancer_invoice', 'email', v_admin.email, 'invoice_reminder_admin',
      jsonb_build_object(
        'invoice_id', v_invoice.id, 'writer_full_name', v_writer.full_name,
        'period_label', v_period_label, 'total_amount', v_invoice.total_amount,
        'escalation_level', v_level, 'approve_token', v_invoice.admin_token
      ),
      'invoice_followup_admin_email:' || v_invoice.id::text || ':' || v_level::text,
      now(), LEAST(60 + v_level * 10, 99)
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    IF v_admin.slack_id IS NOT NULL THEN
      INSERT INTO public.notifications_outbox (source, target_type, target_id, type, payload, dedupe_key, scheduled_for, priority)
      VALUES (
        'freelancer_invoice', 'slack_dm', v_admin.slack_id, 'invoice_reminder_admin',
        jsonb_build_object(
          'invoice_id', v_invoice.id, 'writer_full_name', v_writer.full_name,
          'period_label', v_period_label, 'total_amount', v_invoice.total_amount,
          'escalation_level', v_level, 'approve_token', v_invoice.admin_token
        ),
        'invoice_followup_admin_slack:' || v_invoice.id::text || ':' || v_level::text,
        now(), LEAST(60 + v_level * 10, 99)
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;

    UPDATE public.freelancer_invoices SET last_admin_notified_at = now() WHERE id = p_invoice_id;
  END IF;

  INSERT INTO public.freelancer_invoice_events (invoice_id, event_type, payload)
  VALUES (p_invoice_id, 'followup_' || p_target, jsonb_build_object('escalation_level', v_level));
END;
$$;

-- ---------------------------------------------------------------------------
-- 9) ESCALATOR
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escalate_pending_freelancer_invoices()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row RECORD;
  v_count int := 0;
BEGIN
  FOR v_row IN
    SELECT id, status, escalation_level
    FROM public.freelancer_invoices i
    WHERE i.status IN ('sent', 'acknowledged_by_writer')
      AND (i.next_followup_at IS NULL OR i.next_followup_at <= now())
    ORDER BY i.escalation_level ASC, i.next_followup_at ASC NULLS FIRST
    LIMIT 100
  LOOP
    UPDATE public.freelancer_invoices
    SET escalation_level = escalation_level + 1,
        follow_up_count  = follow_up_count + 1,
        last_followup_at = now(),
        next_followup_at = CASE
          WHEN escalation_level + 1 < 3 THEN now() + interval '24 hours'
          WHEN escalation_level + 1 < 5 THEN now() + interval '48 hours'
          ELSE now() + interval '72 hours'
        END
    WHERE id = v_row.id;

    IF v_row.status = 'sent' THEN
      PERFORM public.dispatch_freelancer_invoice_followup(v_row.id, 'writer');
    ELSIF v_row.status = 'acknowledged_by_writer' THEN
      PERFORM public.dispatch_freelancer_invoice_followup(v_row.id, 'admin');
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('escalated_count', v_count, 'ran_at', now());
END;
$$;

-- ---------------------------------------------------------------------------
-- 10) RUNNER MENSUAL (versión v2: solo crea drafts, NO hace dispatch directo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_monthly_freelancer_invoice_generator()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_today       date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_eom         date := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
  v_target_date date := v_eom - interval '2 days';
  v_year        int  := EXTRACT(year  FROM v_today)::int;
  v_month       int  := EXTRACT(month FROM v_today)::int;
  v_generated   int  := 0;
BEGIN
  IF v_today <> v_target_date THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_generation_day',
                              'today', v_today, 'target', v_target_date);
  END IF;

  SELECT count(*) INTO v_generated
  FROM public.generate_monthly_freelancer_invoices(v_year, v_month);

  -- El document-builder se encarga de crear Google Doc y disparar dispatch.
  RETURN jsonb_build_object(
    'generated_count', v_generated,
    'period_year',     v_year,
    'period_month',    v_month,
    'ran_at',          now(),
    'note',            'Drafts creados. Document-builder los procesará en el siguiente cron.'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 11) PERMISOS
-- ---------------------------------------------------------------------------
-- RPCs públicas para confirmación por token
REVOKE ALL ON FUNCTION public.acknowledge_freelancer_invoice(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_freelancer_invoice(text, text)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_freelancer_invoice(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_freelancer_invoice(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_freelancer_invoice(text, text)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_freelancer_invoice(text, uuid, text) TO anon, authenticated;

-- RPC privada de admin
GRANT EXECUTE ON FUNCTION public.mark_freelancer_invoice_paid(uuid, uuid, text) TO authenticated;

-- Funciones internas: solo service_role
REVOKE ALL ON FUNCTION public.generate_monthly_freelancer_invoices(int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_freelancer_invoice(uuid)              FROM PUBLIC;
REVOKE ALL ON FUNCTION public.escalate_pending_freelancer_invoices()         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_monthly_freelancer_invoice_generator()     FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generate_monthly_freelancer_invoices(int, int) TO service_role;
GRANT  EXECUTE ON FUNCTION public.dispatch_freelancer_invoice(uuid)              TO service_role;
GRANT  EXECUTE ON FUNCTION public.escalate_pending_freelancer_invoices()         TO service_role;
GRANT  EXECUTE ON FUNCTION public.run_monthly_freelancer_invoice_generator()     TO service_role;
