-- ============================================================================
-- 004_oew_watchdog.sql
-- Función watchdog del sistema OEW. Se ejecuta vía pg_cron cada 2 minutos
-- (cron creado en 005_oew_cron.sql).
--
-- Depends on:
--   - 001_oew_schema.sql (tablas operativas)
--   - 003_oew_views.sql (no obligatorio, pero consistente)
--   - seo_data_hub.ingestion_runs
--   - public.notifications_outbox
--   - pg_net (para re-encolar diagnostics sin dispatch)
--   - vault.decrypted_secrets (SUPABASE_FUNCTIONS_URL + OEW_INTERNAL_SECRET)
--
-- Convenciones aplicadas (CONVENTIONS.md §6):
--   - Watchdog corre cada 2-5 min
--   - Mínimo 3 checks: runs huérfanos, diagnostics sin dispatch, outbox stale locks
--   - Aquí extendemos con un 4to check: data del hub stale
-- ============================================================================

CREATE OR REPLACE FUNCTION organic_early_warning.watchdog()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_runs_marked_failed     INT := 0;
  v_diagnostics_requeued   INT := 0;
  v_outbox_locks_cleared   INT := 0;
  v_hub_stale              BOOLEAN := FALSE;
  v_hub_last_completion    TIMESTAMPTZ;
  v_functions_url          TEXT;
  v_internal_secret        TEXT;
  v_request_id             BIGINT;
  r                        RECORD;
  v_now                    TIMESTAMPTZ := NOW();
BEGIN
  -- -----------------------------------------------------------------------
  -- Check 1: Runs huérfanos del orchestrator (analysis_runs stuck >30 min).
  -- Los marcamos como failed e insertamos event watchdog_triggered.
  -- -----------------------------------------------------------------------
  WITH stuck AS (
    UPDATE organic_early_warning.analysis_runs
    SET status        = 'failed',
        completed_at  = v_now,
        error_message = COALESCE(error_message, '') || ' [watchdog_timeout]'
    WHERE status = 'running'
      AND started_at < v_now - INTERVAL '30 minutes'
    RETURNING id
  )
  INSERT INTO organic_early_warning.run_events
    (run_id, event_source, event_type, occurred_at, payload, error_message)
  SELECT id, 'watchdog', 'watchdog_triggered', v_now,
         jsonb_build_object('reason','run_stuck_over_30min'),
         'analysis_run marcado failed por watchdog'
  FROM stuck;

  GET DIAGNOSTICS v_runs_marked_failed = ROW_COUNT;

  -- -----------------------------------------------------------------------
  -- Check 2: Diagnostics generados sin entry en incident_log (últimas 24h).
  -- Re-encolamos al dispatcher con force=true vía net.http_post.
  --
  -- Si no podemos resolver SUPABASE_FUNCTIONS_URL o OEW_INTERNAL_SECRET
  -- (Vault no cargado todavía), saltamos este check sin romper.
  -- -----------------------------------------------------------------------
  BEGIN
    SELECT decrypted_secret INTO v_functions_url
      FROM vault.decrypted_secrets
      WHERE name = 'SUPABASE_FUNCTIONS_URL'
      LIMIT 1;

    SELECT decrypted_secret INTO v_internal_secret
      FROM vault.decrypted_secrets
      WHERE name = 'OEW_INTERNAL_SECRET'
      LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Vault no accesible o secrets no cargados: log y seguir.
    v_functions_url := NULL;
    v_internal_secret := NULL;
  END;

  IF v_functions_url IS NOT NULL AND v_internal_secret IS NOT NULL THEN
    FOR r IN
      SELECT d.incident_id
      FROM organic_early_warning.incident_diagnostics d
      LEFT JOIN organic_early_warning.incident_log l ON l.incident_id = d.incident_id
      WHERE d.created_at > v_now - INTERVAL '24 hours'
        AND l.id IS NULL
      LIMIT 50  -- safety cap: no avalancha en una sola corrida
    LOOP
      SELECT net.http_post(
        url     := rtrim(v_functions_url, '/') || '/oew-dispatcher',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', v_internal_secret
        ),
        body    := jsonb_build_object(
          'incident_id', r.incident_id::text,
          'force', true
        )
      ) INTO v_request_id;

      v_diagnostics_requeued := v_diagnostics_requeued + 1;
    END LOOP;
  END IF;

  -- -----------------------------------------------------------------------
  -- Check 3: Outbox stale locks (source='oew_alert', locked_at >5 min).
  -- Liberamos el lock para que el próximo tick del worker los retome.
  -- -----------------------------------------------------------------------
  UPDATE public.notifications_outbox
  SET locked_at = NULL,
      locked_by = NULL
  WHERE status = 'pending'
    AND source = 'oew_alert'
    AND locked_at IS NOT NULL
    AND locked_at < v_now - INTERVAL '5 minutes';

  GET DIAGNOSTICS v_outbox_locks_cleared = ROW_COUNT;

  -- -----------------------------------------------------------------------
  -- Check 4: Data del hub stale (>7 días sin completar ingesta GSC).
  -- Encolamos una alerta admin (dedupe por día para no spamear).
  -- -----------------------------------------------------------------------
  SELECT MAX(completed_at) INTO v_hub_last_completion
    FROM seo_data_hub.ingestion_runs
    WHERE source = 'gsc'
      AND status = 'completed';

  IF v_hub_last_completion IS NULL
     OR v_hub_last_completion < v_now - INTERVAL '7 days' THEN
    v_hub_stale := TRUE;

    INSERT INTO public.notifications_outbox
      (source, target_type, channel_id, payload, dedupe_key, status, created_at)
    VALUES (
      'oew_alert',
      'channel',
      COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets
         WHERE name='SLACK_ADMIN_CHANNEL' LIMIT 1),
        (SELECT decrypted_secret FROM vault.decrypted_secrets
         WHERE name='SLACK_FALLBACK_CHANNEL' LIMIT 1)
      ),
      jsonb_build_object(
        'text', 'OEW watchdog: data del hub stale (>7 días sin ingesta GSC completed).',
        'last_completion', v_hub_last_completion,
        'detected_at', v_now
      ),
      'oew:hub_stale:' || to_char(v_now, 'YYYY-MM-DD'),
      'pending',
      v_now
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  -- -----------------------------------------------------------------------
  -- Resultado
  -- -----------------------------------------------------------------------
  RETURN jsonb_build_object(
    'runs_marked_failed',     v_runs_marked_failed,
    'diagnostics_requeued',   v_diagnostics_requeued,
    'outbox_locks_cleared',   v_outbox_locks_cleared,
    'hub_stale',              v_hub_stale,
    'hub_last_completion',    v_hub_last_completion,
    'ran_at',                 v_now
  );
END;
$$;

COMMENT ON FUNCTION organic_early_warning.watchdog() IS
  '4 checks: runs huérfanos, diagnostics sin dispatch, outbox stale locks, hub data stale. Cron */2 min.';
