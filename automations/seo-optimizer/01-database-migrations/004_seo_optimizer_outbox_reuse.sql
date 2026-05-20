-- ============================================================================
-- Migration: 004_seo_optimizer_outbox_reuse.sql
-- Purpose:   Ensure public.notifications_outbox exists with the columns we need,
--            and add an index optimized for source='seo_optimizer' queries.
-- Depends:   001 (uses similar style); independent otherwise.
-- ============================================================================
-- This migration is idempotent and harmless if the outbox already exists
-- (Lighthouse / seo_sentinel may have created it). It only ADDS columns and
-- indexes; it does not drop anything.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create outbox table if missing
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications_outbox (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    source          TEXT            NOT NULL,                    -- e.g. 'seo_optimizer', 'seo_sentinel'
    target_type     TEXT            NOT NULL                     -- 'slack_dm' | 'slack_channel' | 'email' | ...
                                    CHECK (target_type IN ('slack_dm','slack_channel','email','webhook')),
    channel_id      TEXT            NOT NULL,                    -- Slack channel/user ID or email address
    payload         JSONB           NOT NULL,                    -- Slack Block Kit or email content
    dedupe_key      TEXT            NOT NULL UNIQUE,             -- prevents duplicate sends
    status          TEXT            NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','sent','failed')),
    locked_at       TIMESTAMPTZ,                                 -- pessimistic lock by worker
    locked_by       TEXT,
    retry_count     INTEGER         NOT NULL DEFAULT 0,
    next_retry_at   TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. Defensive ADD COLUMN — if the table existed but with fewer columns
-- ----------------------------------------------------------------------------
-- Each statement is independently safe.

DO $$
BEGIN
    -- locked_at / locked_by (pessimistic lock pattern)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='notifications_outbox' AND column_name='locked_at') THEN
        ALTER TABLE public.notifications_outbox ADD COLUMN locked_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='notifications_outbox' AND column_name='locked_by') THEN
        ALTER TABLE public.notifications_outbox ADD COLUMN locked_by TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='notifications_outbox' AND column_name='retry_count') THEN
        ALTER TABLE public.notifications_outbox ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='notifications_outbox' AND column_name='next_retry_at') THEN
        ALTER TABLE public.notifications_outbox ADD COLUMN next_retry_at TIMESTAMPTZ;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Indexes optimized for our worker query
-- ----------------------------------------------------------------------------
-- The outbox worker query:
--   SELECT ... FROM notifications_outbox
--   WHERE source='seo_optimizer' AND status='pending' AND (next_retry_at IS NULL OR next_retry_at <= NOW())
--   FOR UPDATE SKIP LOCKED LIMIT 10;

CREATE INDEX IF NOT EXISTS idx_notifications_outbox_source_status
    ON public.notifications_outbox (source, status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_notifications_outbox_seo_optimizer_pending
    ON public.notifications_outbox (created_at)
    WHERE source = 'seo_optimizer' AND status = 'pending';

-- For monitoring / dashboards
CREATE INDEX IF NOT EXISTS idx_notifications_outbox_sent
    ON public.notifications_outbox (source, sent_at DESC)
    WHERE status = 'sent';

-- ----------------------------------------------------------------------------
-- 4. updated_at maintenance
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_notifications_outbox_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS notifications_outbox_updated_at ON public.notifications_outbox;
CREATE TRIGGER notifications_outbox_updated_at
    BEFORE UPDATE ON public.notifications_outbox
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_notifications_outbox_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Permissions
-- ----------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.notifications_outbox TO service_role;
GRANT SELECT ON public.notifications_outbox TO authenticated;

COMMENT ON TABLE public.notifications_outbox IS
  'Shared outbox for ALL notification systems (seo_sentinel, seo_optimizer, lighthouse, etc.). '
  'Distinguish by source column. Worker(s) claim rows with FOR UPDATE SKIP LOCKED and send to Slack/email/etc.';

-- ============================================================================
-- DONE.
-- After applying all 4 migrations, verify with:
--   SELECT table_name FROM information_schema.tables WHERE table_schema='seo_optimizer';
--   SELECT jobname FROM cron.job WHERE jobname LIKE 'seo-optimizer-%';
--   SELECT count(*) FROM information_schema.columns WHERE table_schema='seo_optimizer';
-- ============================================================================
