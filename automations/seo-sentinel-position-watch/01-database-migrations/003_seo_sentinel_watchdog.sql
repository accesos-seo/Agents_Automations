-- ============================================================
-- seo_sentinel — Watchdog + cron jobs
-- ============================================================
-- Función `watchdog_pipeline()` que ejecuta 3 chequeos cada 2 min
-- y dos cron jobs:
--   · seo-sentinel-watchdog  (*/2 * * * *)
--   · seo-sentinel-daily     (0 13 * * *   = 08:00 CO)
--
-- Los secretos se leen desde vault.decrypted_secrets:
--   · SUPABASE_FUNCTIONS_URL          (ej: https://<ref>.functions.supabase.co)
--   · SEO_SENTINEL_INTERNAL_SECRET    (header x-internal-secret)
--   · SLACK_BOT_TOKEN                 (xoxb-...)
--   · SLACK_ADMIN_CHANNEL             (ej: C09ADMIN)
-- ============================================================

-- ============================================================
-- FUNCIÓN: seo_sentinel.watchdog_pipeline()
-- ============================================================
CREATE OR REPLACE FUNCTION seo_sentinel.watchdog_pipeline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seo_sentinel, public, pg_temp
AS $$
DECLARE
  v_functions_url TEXT;
  v_internal_secret TEXT;
  v_slack_token TEXT;
  v_slack_admin_channel TEXT;
  v_orphan RECORD;
  v_diagnostic RECORD;
  v_orphans_count INTEGER := 0;
  v_dispatched_count INTEGER := 0;
  v_unlocked_count INTEGER := 0;
BEGIN
  -- ------------------------------------------------------------
  -- Leer secretos desde vault.decrypted_secrets
  -- ------------------------------------------------------------
  SELECT decrypted_secret INTO v_functions_url
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_FUNCTIONS_URL'
    LIMIT 1;

  SELECT decrypted_secret INTO v_internal_secret
    FROM vault.decrypted_secrets
    WHERE name = 'SEO_SENTINEL_INTERNAL_SECRET'
    LIMIT 1;

  SELECT decrypted_secret INTO v_slack_token
    FROM vault.decrypted_secrets
    WHERE name = 'SLACK_BOT_TOKEN'
    LIMIT 1;

  SELECT decrypted_secret INTO v_slack_admin_channel
    FROM vault.decrypted_secrets
    WHERE name = 'SLACK_ADMIN_CHANNEL'
    LIMIT 1;

  -- ------------------------------------------------------------
  -- CHECK 1: Runs huérfanos (running > 30 min)
  -- ------------------------------------------------------------
  FOR v_orphan IN
    SELECT id, trigger_source, started_at, brands_total, brands_processed
    FROM seo_sentinel.analysis_runs
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '30 minutes'
  LOOP
    UPDATE seo_sentinel.analysis_runs
       SET status = 'failed',
           completed_at = NOW(),
           error_message = COALESCE(error_message, '') || ' [watchdog: timeout > 30min]'
     WHERE id = v_orphan.id;

    INSERT INTO seo_sentinel.run_events (
      run_id, event_source, event_type, payload, error_message
    )
    VALUES (
      v_orphan.id,
      'watchdog',
      'watchdog_triggered',
      jsonb_build_object(
        'reason', 'orphan_run',
        'started_at', v_orphan.started_at,
        'brands_total', v_orphan.brands_total,
        'brands_processed', v_orphan.brands_processed
      ),
      'watchdog: run timeout'
    );

    -- Notificar al canal admin de Slack (si hay token + canal)
    IF v_slack_token IS NOT NULL AND v_slack_admin_channel IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://slack.com/api/chat.postMessage',
        headers := jsonb_build_object(
          'Content-Type', 'application/json; charset=utf-8',
          'Authorization', 'Bearer ' || v_slack_token
        ),
        body := jsonb_build_object(
          'channel', v_slack_admin_channel,
          'text', '[seo_sentinel] watchdog: run huérfano marcado como failed',
          'blocks', jsonb_build_array(
            jsonb_build_object(
              'type', 'section',
              'text', jsonb_build_object(
                'type', 'mrkdwn',
                'text', '*[seo_sentinel] Run huérfano detectado*' ||
                        E'\n• run_id: `' || v_orphan.id::text || '`' ||
                        E'\n• trigger: `' || v_orphan.trigger_source || '`' ||
                        E'\n• started_at: `' || v_orphan.started_at::text || '`' ||
                        E'\n• brands procesadas: `' || v_orphan.brands_processed::text || '/' || v_orphan.brands_total::text || '`'
              )
            )
          )
        )
      );
    END IF;

    v_orphans_count := v_orphans_count + 1;
  END LOOP;

  -- ------------------------------------------------------------
  -- CHECK 2: Diagnostics no despachados (saved sin entry en log, > 24h NO,
  -- en realidad: saved AND NOT in incident_log AND created_at > NOW()-24h
  -- para no reintentar eternamente). Forzamos dispatch con force:true.
  -- ------------------------------------------------------------
  IF v_functions_url IS NOT NULL AND v_internal_secret IS NOT NULL THEN
    FOR v_diagnostic IN
      SELECT d.id AS incident_id, d.brand_id, d.anomaly_date
      FROM seo_sentinel.incident_diagnostics d
      WHERE d.diagnosis_saved = true
        AND d.created_at > NOW() - INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1
          FROM seo_sentinel.incident_log l
          WHERE l.incident_id = d.id
        )
    LOOP
      PERFORM net.http_post(
        url := v_functions_url || '/seo-sentinel-dispatcher',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', v_internal_secret
        ),
        body := jsonb_build_object(
          'incident_id', v_diagnostic.incident_id,
          'force', true
        )
      );

      -- Skip si run_id es NULL (FK NOT NULL violation): solo log si tenemos run vinculado.
      INSERT INTO seo_sentinel.run_events (
        run_id, brand_id, event_source, event_type, payload
      )
      SELECT
        d.run_id,
        v_diagnostic.brand_id,
        'watchdog',
        'watchdog_triggered',
        jsonb_build_object(
          'reason', 'diagnostic_not_dispatched',
          'incident_id', v_diagnostic.incident_id,
          'anomaly_date', v_diagnostic.anomaly_date
        )
      FROM seo_sentinel.incident_diagnostics d
      WHERE d.id = v_diagnostic.incident_id
        AND d.run_id IS NOT NULL;

      v_dispatched_count := v_dispatched_count + 1;
    END LOOP;
  END IF;

  -- ------------------------------------------------------------
  -- CHECK 3: Outbox stale locks (pending + locked_at > 5 min)
  -- ------------------------------------------------------------
  WITH unlocked AS (
    UPDATE public.notifications_outbox
       SET locked_at = NULL,
           locked_by = NULL
     WHERE source = 'seo_sentinel_alert'
       AND status = 'pending'
       AND locked_at IS NOT NULL
       AND locked_at < NOW() - INTERVAL '5 minutes'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_unlocked_count FROM unlocked;

  -- ------------------------------------------------------------
  -- Log final del barrido
  -- ------------------------------------------------------------
  RAISE NOTICE '[seo_sentinel.watchdog] orphans=%, dispatched=%, unlocked=%',
    v_orphans_count, v_dispatched_count, v_unlocked_count;
END;
$$;

-- ============================================================
-- CRON: watchdog cada 2 minutos
-- ============================================================
DO $$
BEGIN
  -- Desprogramar si ya existe (idempotencia del archivo)
  PERFORM cron.unschedule('seo-sentinel-watchdog')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'seo-sentinel-watchdog'
  );
END;
$$;

SELECT cron.schedule(
  'seo-sentinel-watchdog',
  '*/2 * * * *',
  $$SELECT seo_sentinel.watchdog_pipeline();$$
);

-- ============================================================
-- CRON: corrida diaria a 08:00 CO (= 13:00 UTC)
-- POST al orchestrator con {trigger:'cron'} + x-internal-secret
-- ============================================================
DO $$
BEGIN
  PERFORM cron.unschedule('seo-sentinel-daily')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'seo-sentinel-daily'
  );
END;
$$;

SELECT cron.schedule(
  'seo-sentinel-daily',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_FUNCTIONS_URL' LIMIT 1) || '/seo-sentinel-orchestrator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SEO_SENTINEL_INTERNAL_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);
