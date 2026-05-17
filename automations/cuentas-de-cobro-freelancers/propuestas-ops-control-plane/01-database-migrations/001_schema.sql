-- ============================================================================
-- 001_schema.sql
-- Sistema de cuentas de cobro mensuales para redactores (y otros freelancers)
-- ----------------------------------------------------------------------------
-- Aplicado en producción como: freelancer_invoices_v1_schema (2026-05-15)
-- ============================================================================
-- Modelo: salario fijo mensual. La cuenta de cobro se genera automáticamente
-- 2 días antes del fin de cada mes y se envía por correo + Slack.
-- Flujo: draft -> sent -> acknowledged_by_writer -> admin_approved -> paid
-- ============================================================================

-- 1. Enum de estado
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'freelancer_invoice_status') THEN
    CREATE TYPE public.freelancer_invoice_status AS ENUM (
      'draft',
      'sent',
      'acknowledged_by_writer',
      'rejected_by_writer',
      'admin_approved',
      'paid',
      'cancelled'
    );
  END IF;
END$$;

-- 2. Configuración por freelancer (salario fijo + canal + admin responsable)
CREATE TABLE IF NOT EXISTS public.freelancer_invoice_settings (
  user_id              uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  is_active            boolean NOT NULL DEFAULT true,
  monthly_amount       numeric(12,2) NOT NULL DEFAULT 0 CHECK (monthly_amount >= 0),
  currency             text NOT NULL DEFAULT 'USD',
  payment_method       text,
  payment_account      jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_user_id        uuid REFERENCES public.users(id),
  notification_email   text,
  notification_slack_id text,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 3. Cuenta de cobro
CREATE TABLE IF NOT EXISTS public.freelancer_invoices (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL REFERENCES public.users(id),
  period_year                int NOT NULL,
  period_month               int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_start               date NOT NULL,
  period_end                 date NOT NULL,
  rate_type                  text NOT NULL DEFAULT 'monthly_fixed',
  monthly_amount             numeric(12,2) NOT NULL,
  bonus_amount               numeric(12,2) NOT NULL DEFAULT 0,
  deduction_amount           numeric(12,2) NOT NULL DEFAULT 0,
  total_amount               numeric(12,2) GENERATED ALWAYS AS
                                (monthly_amount + bonus_amount - deduction_amount) STORED,
  currency                   text NOT NULL DEFAULT 'USD',
  status                     public.freelancer_invoice_status NOT NULL DEFAULT 'draft',
  document_url               text,
  google_doc_id              text,
  writer_token               text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  admin_token                text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  writer_acknowledged_at     timestamptz,
  writer_response            text,
  writer_rejected_at         timestamptz,
  writer_rejection_reason    text,
  admin_user_id              uuid REFERENCES public.users(id),
  admin_approved_at          timestamptz,
  admin_notes                text,
  paid_at                    timestamptz,
  payment_reference          text,
  escalation_level           int NOT NULL DEFAULT 0,
  follow_up_count            int NOT NULL DEFAULT 0,
  last_followup_at           timestamptz,
  next_followup_at           timestamptz,
  sent_at                    timestamptz,
  last_writer_notified_at    timestamptz,
  last_admin_notified_at     timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  created_by                 uuid REFERENCES public.users(id),
  metadata                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT freelancer_invoices_unique_user_period UNIQUE (user_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_freelancer_invoices_status        ON public.freelancer_invoices (status);
CREATE INDEX IF NOT EXISTS idx_freelancer_invoices_period        ON public.freelancer_invoices (period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_freelancer_invoices_user          ON public.freelancer_invoices (user_id, period_year DESC, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_freelancer_invoices_next_followup ON public.freelancer_invoices (next_followup_at)
  WHERE status IN ('sent', 'acknowledged_by_writer');
CREATE UNIQUE INDEX IF NOT EXISTS uq_freelancer_invoices_writer_token ON public.freelancer_invoices (writer_token);
CREATE UNIQUE INDEX IF NOT EXISTS uq_freelancer_invoices_admin_token  ON public.freelancer_invoices (admin_token);

-- 4. Audit trail
CREATE TABLE IF NOT EXISTS public.freelancer_invoice_events (
  id            bigserial PRIMARY KEY,
  invoice_id    uuid NOT NULL REFERENCES public.freelancer_invoices(id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  actor_user_id uuid REFERENCES public.users(id),
  actor_role    text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freelancer_invoice_events_invoice ON public.freelancer_invoice_events (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_freelancer_invoice_events_type    ON public.freelancer_invoice_events (event_type, created_at DESC);

-- 5. Trigger updated_at común
CREATE OR REPLACE FUNCTION public.touch_freelancer_invoice_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_freelancer_invoices ON public.freelancer_invoices;
CREATE TRIGGER trg_touch_freelancer_invoices
  BEFORE UPDATE ON public.freelancer_invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_freelancer_invoice_updated_at();

DROP TRIGGER IF EXISTS trg_touch_freelancer_invoice_settings ON public.freelancer_invoice_settings;
CREATE TRIGGER trg_touch_freelancer_invoice_settings
  BEFORE UPDATE ON public.freelancer_invoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_freelancer_invoice_updated_at();

-- 6. Trigger de auditoría: cada cambio de status genera un evento
CREATE OR REPLACE FUNCTION public.log_freelancer_invoice_status_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.freelancer_invoice_events (invoice_id, event_type, payload)
    VALUES (NEW.id, 'created', jsonb_build_object('status', NEW.status));
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.freelancer_invoice_events (invoice_id, event_type, payload)
    VALUES (NEW.id, 'status_changed', jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_freelancer_invoice_status ON public.freelancer_invoices;
CREATE TRIGGER trg_log_freelancer_invoice_status
  AFTER INSERT OR UPDATE OF status ON public.freelancer_invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_freelancer_invoice_status_change();

-- 7. RLS
ALTER TABLE public.freelancer_invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freelancer_invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freelancer_invoice_events   ENABLE ROW LEVEL SECURITY;

CREATE POLICY freelancer_invoices_owner_read ON public.freelancer_invoices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR admin_user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.users u
                    JOIN public.agency_roles ar ON ar.id = u.agency_role_id
                    WHERE u.id = auth.uid()
                      AND ar.name IN ('General Director','Director General','KAM (Key Account Manager)')));

CREATE POLICY freelancer_invoice_settings_owner_read ON public.freelancer_invoice_settings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR admin_user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.users u
                    JOIN public.agency_roles ar ON ar.id = u.agency_role_id
                    WHERE u.id = auth.uid()
                      AND ar.name IN ('General Director','Director General','KAM (Key Account Manager)')));

CREATE POLICY freelancer_invoice_events_owner_read ON public.freelancer_invoice_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.freelancer_invoices i
                 WHERE i.id = freelancer_invoice_events.invoice_id
                   AND (i.user_id = auth.uid()
                        OR i.admin_user_id = auth.uid()
                        OR EXISTS (SELECT 1 FROM public.users u
                                   JOIN public.agency_roles ar ON ar.id = u.agency_role_id
                                   WHERE u.id = auth.uid()
                                     AND ar.name IN ('General Director','Director General','KAM (Key Account Manager)')))));

COMMENT ON TABLE  public.freelancer_invoices IS 'Cuentas de cobro mensuales para redactores y freelancers. Se generan automáticamente 2 días antes del fin de mes.';
COMMENT ON TABLE  public.freelancer_invoice_settings IS 'Configuración fija por freelancer: monto mensual, admin responsable, canal preferido.';
COMMENT ON TABLE  public.freelancer_invoice_events IS 'Audit trail de la cuenta de cobro: cada cambio de status, follow-up y confirmación.';
COMMENT ON COLUMN public.freelancer_invoices.writer_token IS 'Token público para que el redactor confirme "He recibido" sin login.';
COMMENT ON COLUMN public.freelancer_invoices.admin_token IS 'Token público para que el administrador apruebe sin login.';
