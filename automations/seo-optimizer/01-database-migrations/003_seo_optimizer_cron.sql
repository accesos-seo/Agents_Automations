-- ============================================================================
-- Migration: 003_seo_optimizer_cron.sql
-- Purpose:   pg_cron schedules + watchdog function. All cron jobs that drive
--            the pipeline are defined here.
-- Depends:   001_seo_optimizer_schema.sql, 002_seo_optimizer_views.sql
-- ============================================================================
-- IMPORTANT: Before applying, ensure these Vault secrets exist:
--   - SEO_OPTIMIZER_RAILWAY_URL
--   - SEO_OPTIMIZER_INTERNAL_SECRET
-- Otherwise cron jobs will fire but Railway will receive empty/null headers.
-- ============================================================================

-- Required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;   -- already in 001 but defensive

-- ============================================================================
-- 1. WATCHDOG FUNCTION
-- ============================================================================
-- Runs every 5 minutes. Detects pathological states and self-heals or alerts.

CREATE OR REPLACE FUNCTION seo_optimizer.watchdog_check()
RETURNS TABLE (
    check_name      TEXT,
    items_affected  INT,
    action_taken    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count             INT;
    v_railway_url       TEXT;
    v_internal_key      TEXT;
    v_admin_channel     TEXT;
BEGIN
    SELECT decrypted_secret INTO v_railway_url    FROM vault.decrypted_secrets WHERE name = 'SEO_OPTIMIZER_RAILWAY_URL';
    SELECT decrypted_secret INTO v_internal_key   FROM vault.decrypted_secrets WHERE name = 'SEO_OPTIMIZER_INTERNAL_SECRET';
    -- Admin channel is best-effort; if missing, we just log and skip alerting

    -- --------------------------------------------------------------------
    -- Check 1: Runs stuck in 'running' for > 1 hour → mark failed
    -- --------------------------------------------------------------------
    WITH stuck AS (
        UPDATE seo_optimizer.runs
        SET status = 'failed',
            error_message = COALESCE(error_message, '') || ' [watchdog: timeout after 1h]',
            completed_at = NOW()
        WHERE status = 'running'
          AND started_at < NOW() - INTERVAL '1 hour'
        RETURNING id, run_events_emit(id, 'watchdog', 'run_failed', jsonb_build_object('reason','timeout')) AS evt
    )
    SELECT COUNT(*) INTO v_count FROM stuck;
    IF v_count > 0 THEN
        check_name := 'runs_stuck_1h';
        items_affected := v_count;
        action_taken := 'marked_failed';
        RETURN NEXT;
    END IF;

    -- --------------------------------------------------------------------
    -- Check 2: Outbox locks held > 10 min → reset (worker probably died)
    -- --------------------------------------------------------------------
    UPDATE public.notifications_outbox
    SET locked_at = NULL, locked_by = NULL
    WHERE source = 'seo_optimizer'
      AND status = 'pending'
      AND locked_at IS NOT NULL
      AND locked_at < NOW() - INTERVAL '10 min';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
        check_name := 'outbox_stale_locks';
        items_affected := v_count;
        action_taken := 'lock_reset';
        RETURN NEXT;
    END IF;

    -- --------------------------------------------------------------------
    -- Check 3: Opportunities 'pending' > 30 days → enqueue reminder
    -- --------------------------------------------------------------------
    -- We don't auto-reject — we ping the SEO via outbox.
    INSERT INTO public.notifications_outbox (source, target_type, channel_id, payload, dedupe_key, status)
    SELECT
        'seo_optimizer',
        'slack_channel',
        COALESCE(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SLACK_ADMIN_CHANNEL'),
            'C00000000'
        ),
        jsonb_build_object(
            'text', format('⏰ %s opportunities pending review > 30 days', COUNT(*)),
            'blocks', '[]'::jsonb
        ),
        format('seo_optimizer:watchdog:pending_reminder:%s', to_char(CURRENT_DATE, 'YYYY-MM-DD')),
        'pending'
    FROM seo_optimizer.opportunities
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '30 days'
    HAVING COUNT(*) > 0
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
        check_name := 'pending_decisions_overdue';
        items_affected := v_count;
        action_taken := 'admin_reminder_enqueued';
        RETURN NEXT;
    END IF;

    -- --------------------------------------------------------------------
    -- Check 4: Rewrites stuck in 'writing' > 30 min → retry POST /writer
    -- --------------------------------------------------------------------
    IF v_railway_url IS NOT NULL AND v_internal_key IS NOT NULL THEN
        WITH stuck_writes AS (
            SELECT id, run_id, client_id FROM seo_optimizer.opportunities
            WHERE status = 'writing'
              AND updated_at < NOW() - INTERVAL '30 min'
        )
        SELECT COUNT(*) INTO v_count FROM stuck_writes;

        IF v_count > 0 THEN
            -- Reset them to 'approved' so the trigger re-fires
            UPDATE seo_optimizer.opportunities SET status = 'approved'
            WHERE id IN (SELECT id FROM seo_optimizer.opportunities
                         WHERE status = 'writing' AND updated_at < NOW() - INTERVAL '30 min');

            check_name := 'rewrites_stuck_writing';
            items_affected := v_count;
            action_taken := 'reset_to_approved_for_retry';
            RETURN NEXT;
        END IF;
    END IF;

    RETURN;
END;
$$;

COMMENT ON FUNCTION seo_optimizer.watchdog_check IS
  'Runs every 5 min via pg_cron. Detects stuck states and either self-heals (reset locks/retries) '
  'or alerts the admin channel. Returns a table of actions taken for observability.';

-- Helper used inside watchdog (emit an event from SQL context)
CREATE OR REPLACE FUNCTION run_events_emit(p_run_id UUID, p_source TEXT, p_event_type TEXT, p_payload JSONB)
RETURNS UUID
LANGUAGE sql
AS $$
    INSERT INTO seo_optimizer.run_events (run_id, event_source, event_type, payload)
    VALUES (p_run_id, p_source, p_event_type, p_payload)
    RETURNING id;
$$;

-- ============================================================================
-- 2. CRON JOBS
-- ============================================================================
-- All cron jobs trigger Railway endpoints via net.http_post.
-- The helper function builds the standard headers.

CREATE OR REPLACE FUNCTION seo_optimizer.cron_post(p_path TEXT, p_body JSONB DEFAULT '{}'::jsonb)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url       TEXT;
    v_secret    TEXT;
    v_req_id    BIGINT;
BEGIN
    SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'SEO_OPTIMIZER_RAILWAY_URL';
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'SEO_OPTIMIZER_INTERNAL_SECRET';

    IF v_url IS NULL OR v_secret IS NULL THEN
        RAISE WARNING '[seo_optimizer.cron_post] Missing vault secrets — skipping POST to %', p_path;
        RETURN NULL;
    END IF;

    SELECT net.http_post(
        url := v_url || p_path,
        headers := jsonb_build_object(
            'content-type', 'application/json',
            'x-internal-secret', v_secret
        ),
        body := p_body::text
    ) INTO v_req_id;

    RETURN v_req_id;
END;
$$;

COMMENT ON FUNCTION seo_optimizer.cron_post IS
  'Helper: POSTs to Railway endpoints with auth headers. Returns net.http request id for tracking.';

-- ----------------------------------------------------------------------------
-- Schedule 1: Monthly orchestrator run — day 1 of each month, 09:00 Colombia
-- ----------------------------------------------------------------------------
-- 14:00 UTC = 09:00 America/Bogota (UTC-5 year-round)

SELECT cron.unschedule('seo-optimizer-monthly') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'seo-optimizer-monthly'
);

SELECT cron.schedule(
    'seo-optimizer-monthly',
    '0 14 1 * *',
    $$ SELECT seo_optimizer.cron_post('/orchestrator', '{"trigger":"cron","period_days":90}'::jsonb); $$
);

-- ----------------------------------------------------------------------------
-- Schedule 2: Re-evaluation daily check — 10:00 Colombia
-- ----------------------------------------------------------------------------

SELECT cron.unschedule('seo-optimizer-reeval-daily') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'seo-optimizer-reeval-daily'
);

SELECT cron.schedule(
    'seo-optimizer-reeval-daily',
    '0 15 * * *',
    $$ SELECT seo_optimizer.cron_post('/reeval/batch', '{}'::jsonb); $$
);

-- ----------------------------------------------------------------------------
-- Schedule 3: Outbox worker — every 30 seconds
-- ----------------------------------------------------------------------------
-- pg_cron supports sub-minute schedules via the seconds field (Supabase enables this).

SELECT cron.unschedule('seo-optimizer-outbox-worker') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'seo-optimizer-outbox-worker'
);

SELECT cron.schedule(
    'seo-optimizer-outbox-worker',
    '30 seconds',
    $$ SELECT seo_optimizer.cron_post('/outbox_worker', '{}'::jsonb); $$
);

-- ----------------------------------------------------------------------------
-- Schedule 4: Watchdog — every 5 minutes
-- ----------------------------------------------------------------------------

SELECT cron.unschedule('seo-optimizer-watchdog') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'seo-optimizer-watchdog'
);

SELECT cron.schedule(
    'seo-optimizer-watchdog',
    '*/5 * * * *',
    $$ SELECT * FROM seo_optimizer.watchdog_check(); $$
);

-- ============================================================================
-- 3. SANITY: list scheduled jobs
-- ============================================================================
-- After applying, run:
--   SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'seo-optimizer-%';
-- Expected: 4 rows.

-- ============================================================================
-- DONE.
-- ============================================================================
