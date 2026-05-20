-- ============================================================================
-- Organic Early Warning V2 — Data Hub
-- Migration 003: watchdog
--
-- seo_data_hub.watchdog() corre cada 5 minutos (definido en migration 004).
-- Checks canónicos (CONVENTIONS §6) + extras del hub:
--   1) ingestion_runs huérfanos → marcar 'failed' + run_events
--   2) Ahrefs credit budget exhausted → encolar alerta en notifications_outbox
--   3) Asegurar particiones por delante (3 meses)
--
-- Devuelve jsonb con conteos por check (observabilidad).
-- ============================================================================

CREATE OR REPLACE FUNCTION seo_data_hub.watchdog()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  -- Resultado
  orphans_marked         INT := 0;
  ahrefs_alert_enqueued  INT := 0;
  partitions_ensured     INT := 0;

  -- Auxiliares
  rec                    RECORD;
  current_month          TEXT;
  ahrefs_failed          RECORD;
  slack_admin_channel    TEXT;
  outbox_dedupe_key      TEXT;
BEGIN
  -- ──────────────────────────────────────────────────────────────────────────
  -- CHECK 1: runs huérfanos en 'running' > 30 min → 'failed'
  -- ──────────────────────────────────────────────────────────────────────────
  FOR rec IN
    SELECT id
    FROM seo_data_hub.ingestion_runs
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '30 minutes'
  LOOP
    UPDATE seo_data_hub.ingestion_runs
       SET status        = 'failed',
           completed_at  = NOW(),
           error_message = COALESCE(error_message, '')
                           || ' [watchdog: marked failed after 30min in running]'
     WHERE id = rec.id;

    INSERT INTO seo_data_hub.run_events
      (run_id, event_source, event_type, payload, error_message)
    VALUES (
      rec.id,
      'hub-watchdog',
      'watchdog_triggered',
      jsonb_build_object('reason', 'ingestion_run_orphan_30min'),
      'Run stuck in running > 30min, marked failed by watchdog'
    );

    orphans_marked := orphans_marked + 1;
  END LOOP;

  -- ──────────────────────────────────────────────────────────────────────────
  -- CHECK 2: Ahrefs credits agotados en el mes corriente → alerta a admin
  -- Trigger:
  --   * Última corrida de ahrefs del mes actual (period_month = mes actual)
  --     con status='failed' Y error_message ILIKE '%credit%' OR '%402%'
  -- Idempotencia: dedupe_key 'hub:ahrefs_credits:<period_month>' ON CONFLICT DO NOTHING.
  -- ──────────────────────────────────────────────────────────────────────────
  current_month := to_char((NOW() AT TIME ZONE 'UTC')::DATE, 'YYYY-MM');

  SELECT id, period_month, error_message, started_at, completed_at
    INTO ahrefs_failed
    FROM seo_data_hub.ingestion_runs
    WHERE source = 'ahrefs'
      AND period_month = current_month
      AND status = 'failed'
      AND (error_message ILIKE '%credit%' OR error_message ILIKE '%402%')
    ORDER BY started_at DESC
    LIMIT 1;

  IF FOUND THEN
    -- Leer SLACK_ADMIN_CHANNEL desde Vault, con fallback hard-coded.
    BEGIN
      SELECT decrypted_secret
        INTO slack_admin_channel
        FROM vault.decrypted_secrets
        WHERE name = 'SLACK_ADMIN_CHANNEL'
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      slack_admin_channel := NULL;
    END;

    IF slack_admin_channel IS NULL OR slack_admin_channel = '' THEN
      slack_admin_channel := 'C0B1B3V4ZB5';   -- fallback #alerts-operaciones
    END IF;

    outbox_dedupe_key := 'hub:ahrefs_credits:' || current_month;

    -- Encolar alerta en outbox (compartido con todos los sistemas).
    -- public.notifications_outbox ya existe (creado por Lighthouse).
    -- TODO: si el schema de notifications_outbox cambia (columnas), revisar
    -- este INSERT. Esquema actual asumido: source, target_type, channel_id,
    -- payload (JSONB), dedupe_key UNIQUE, status default 'pending'.
    BEGIN
      INSERT INTO public.notifications_outbox
        (source, target_type, channel_id, payload, dedupe_key)
      VALUES (
        'hub_admin_alert',
        'channel',
        slack_admin_channel,
        jsonb_build_object(
          'text',         'Ahrefs credit budget exhausted',
          'period_month', current_month,
          'ingestion_run_id', ahrefs_failed.id,
          'error_message', ahrefs_failed.error_message,
          'severity',     'admin'
        ),
        outbox_dedupe_key
      )
      ON CONFLICT (dedupe_key) DO NOTHING;

      IF FOUND THEN
        ahrefs_alert_enqueued := 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Si el outbox tiene un schema distinto, no rompemos el watchdog;
      -- logueamos el warning y seguimos.
      INSERT INTO seo_data_hub.run_events
        (event_source, event_type, payload, error_message)
      VALUES (
        'hub-watchdog',
        'warning',
        jsonb_build_object('check', 'ahrefs_credits', 'period_month', current_month),
        'Failed to enqueue outbox alert: ' || SQLERRM
      );
    END;

    -- Registramos el trigger en run_events independientemente del outbox.
    INSERT INTO seo_data_hub.run_events
      (run_id, event_source, event_type, payload, error_message)
    VALUES (
      ahrefs_failed.id,
      'hub-watchdog',
      'watchdog_triggered',
      jsonb_build_object(
        'reason', 'ahrefs_credit_budget_exhausted',
        'period_month', current_month,
        'dedupe_key', outbox_dedupe_key
      ),
      ahrefs_failed.error_message
    );
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- CHECK 3: asegurar particiones mensuales por delante (3 meses)
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT seo_data_hub.ensure_monthly_partitions(3)
    INTO partitions_ensured;

  -- ──────────────────────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'orphans_marked',        orphans_marked,
    'ahrefs_alert_enqueued', ahrefs_alert_enqueued,
    'partitions_ensured',    partitions_ensured,
    'checked_at',            NOW()
  );
END;
$$;

COMMENT ON FUNCTION seo_data_hub.watchdog()
  IS 'Watchdog del data hub: marca runs huérfanos, alerta Ahrefs sin créditos, asegura particiones. Programado cada 5 min en migration 004.';
