-- ============================================================================
-- Migration: 001_seo_optimizer_schema.sql
-- Project:   Light_House (stjugsrkrweakvzmizpq)
-- Purpose:   Creates schema seo_optimizer with all base tables, indexes,
--            FK constraints, CHECK constraints, and DB triggers for the
--            monthly content optimization pipeline.
-- Reference: ARCHITECTURE.md (canonical design document)
-- ============================================================================
-- IMPORTANT: This migration is idempotent (uses IF NOT EXISTS where possible),
-- but is NOT safe to run twice on top of itself if rows already exist with
-- different constraint definitions. For dev/staging, re-run after DROP SCHEMA.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SCHEMA + EXTENSIONS
-- ----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS seo_optimizer;

COMMENT ON SCHEMA seo_optimizer IS
  'Offensive SEO content optimization pipeline. Sibling of seo_sentinel (defensive). '
  'Identifies opportunities monthly, requires SEO specialist approval, generates HTML rewrites '
  'for human copywriters to implement. See ARCHITECTURE.md.';

-- Required extensions (most should already exist in Light_House)
CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_net;          -- net.http_post for triggers
-- pg_cron is created separately (in 003)

-- ----------------------------------------------------------------------------
-- 2. UTILITY FUNCTIONS
-- ----------------------------------------------------------------------------

-- Generic updated_at trigger function (used by multiple tables)
CREATE OR REPLACE FUNCTION seo_optimizer.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION seo_optimizer.tg_set_updated_at IS
  'Trigger function: sets updated_at = NOW() on UPDATE. Attach to any table with an updated_at column.';

-- ----------------------------------------------------------------------------
-- 3. TABLE: runs
-- ----------------------------------------------------------------------------
-- One row per monthly orchestrator execution.

CREATE TABLE IF NOT EXISTS seo_optimizer.runs (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_source      TEXT            NOT NULL
                                        CHECK (trigger_source IN ('cron','manual','watchdog_retry')),
    period_start        DATE            NOT NULL,
    period_end          DATE            NOT NULL,
    period_prev_start   DATE            NOT NULL,  -- YoY baseline window
    period_prev_end     DATE            NOT NULL,
    status              TEXT            NOT NULL DEFAULT 'running'
                                        CHECK (status IN ('running','completed','partial','failed')),
    clients_total       INTEGER         NOT NULL DEFAULT 0,
    clients_processed   INTEGER         NOT NULL DEFAULT 0,
    clients_failed      INTEGER         NOT NULL DEFAULT 0,
    started_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    error_message       TEXT,
    metadata            JSONB           NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT runs_period_valid CHECK (period_end >= period_start),
    CONSTRAINT runs_prev_period_valid CHECK (period_prev_end >= period_prev_start)
);

CREATE INDEX IF NOT EXISTS idx_runs_status_started
    ON seo_optimizer.runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_runs_period
    ON seo_optimizer.runs (period_end DESC);

DROP TRIGGER IF EXISTS runs_updated_at ON seo_optimizer.runs;
CREATE TRIGGER runs_updated_at
    BEFORE UPDATE ON seo_optimizer.runs
    FOR EACH ROW
    EXECUTE FUNCTION seo_optimizer.tg_set_updated_at();

COMMENT ON TABLE seo_optimizer.runs IS
  'One row per monthly pipeline execution. Tracks orchestration state across all clients.';

-- ----------------------------------------------------------------------------
-- 4. TABLE: run_events
-- ----------------------------------------------------------------------------
-- Append-only event log for full traceability. Mirrors seo_sentinel.run_events.

CREATE TABLE IF NOT EXISTS seo_optimizer.run_events (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          UUID            NOT NULL REFERENCES seo_optimizer.runs(id) ON DELETE CASCADE,
    client_id       UUID,                                    -- nullable, FK declared below
    event_source    TEXT            NOT NULL,                -- e.g. 'orchestrator', 'gsc_ingestor'
    event_type      TEXT            NOT NULL
                                    CHECK (event_type IN (
                                        'run_started','run_completed','run_failed',
                                        'agent_started','agent_completed','agent_failed',
                                        'opportunity_detected','opportunity_dispatched',
                                        'approval_received','rewrite_generated','implementation_marked',
                                        'reeval_completed','warning'
                                    )),
    occurred_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    payload         JSONB,
    error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_run_events_run_time
    ON seo_optimizer.run_events (run_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_run_events_client_type
    ON seo_optimizer.run_events (client_id, event_type);

CREATE INDEX IF NOT EXISTS idx_run_events_failures
    ON seo_optimizer.run_events (event_type, occurred_at DESC)
    WHERE event_type IN ('agent_failed','run_failed','warning');

COMMENT ON TABLE seo_optimizer.run_events IS
  'Append-only event log. Every agent emits events here for traceability and debugging.';

-- FK to public.clientes is added later, after we verify the column name matches.
-- For now, we leave client_id as plain UUID. The verification step in Phase 5
-- will add: ALTER TABLE seo_optimizer.run_events ADD CONSTRAINT fk_run_events_client
--          FOREIGN KEY (client_id) REFERENCES public.clientes(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 5. TABLE: gsc_url_query_metrics
-- ----------------------------------------------------------------------------
-- Granular GSC data: URL × query × period.

CREATE TABLE IF NOT EXISTS seo_optimizer.gsc_url_query_metrics (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id              UUID            NOT NULL REFERENCES seo_optimizer.runs(id) ON DELETE CASCADE,
    client_id           UUID            NOT NULL,
    period_start        DATE            NOT NULL,
    period_end          DATE            NOT NULL,
    url                 TEXT            NOT NULL,
    query               TEXT            NOT NULL,
    country             TEXT,                              -- e.g. 'ARG', 'COL', 'BRA' — nullable for global
    device              TEXT,                              -- 'MOBILE'|'DESKTOP'|'TABLET' — nullable for combined
    -- Current period metrics
    clicks              INTEGER         NOT NULL DEFAULT 0,
    impressions         INTEGER         NOT NULL DEFAULT 0,
    ctr                 NUMERIC(6,4)    NOT NULL DEFAULT 0,   -- 0.0000 to 1.0000
    position            NUMERIC(6,2)    NOT NULL DEFAULT 0,   -- 0.00 to 999.99
    -- YoY (year-over-year) baseline
    clicks_prev         INTEGER,
    impressions_prev    INTEGER,
    ctr_prev            NUMERIC(6,4),
    position_prev       NUMERIC(6,2),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gsc_url_query_metrics
    ON seo_optimizer.gsc_url_query_metrics
        (run_id, client_id, url, query, COALESCE(country, ''), COALESCE(device, ''));

CREATE INDEX IF NOT EXISTS idx_gsc_metrics_client_url
    ON seo_optimizer.gsc_url_query_metrics (client_id, url);

CREATE INDEX IF NOT EXISTS idx_gsc_metrics_client_query
    ON seo_optimizer.gsc_url_query_metrics (client_id, query);

CREATE INDEX IF NOT EXISTS idx_gsc_metrics_run_url
    ON seo_optimizer.gsc_url_query_metrics (run_id, url);

CREATE INDEX IF NOT EXISTS idx_gsc_metrics_position_filter
    ON seo_optimizer.gsc_url_query_metrics (client_id, position)
    WHERE position >= 5 AND position <= 15;   -- speed up striking-distance category

COMMENT ON TABLE seo_optimizer.gsc_url_query_metrics IS
  'Granular GSC data per run: clicks/impressions/CTR/position by URL × query, current + YoY.';

-- ----------------------------------------------------------------------------
-- 6. TABLE: article_snapshots
-- ----------------------------------------------------------------------------
-- HTML version analyzed during a run. Provenance + drift detection between runs.

CREATE TABLE IF NOT EXISTS seo_optimizer.article_snapshots (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                  UUID            NOT NULL REFERENCES seo_optimizer.runs(id) ON DELETE CASCADE,
    client_id               UUID            NOT NULL,
    content_item_id         UUID,                                -- FK to public.content_items, nullable
    content_item_version    INTEGER,                             -- copy of content_items.version at fetch time
    url                     TEXT            NOT NULL,
    source                  TEXT            NOT NULL
                                            CHECK (source IN ('live','content_items','fallback_failed')),
    html                    TEXT,                                -- full fetched HTML (or article_content if fallback)
    title_tag               TEXT,
    meta_description        TEXT,
    h1                      TEXT,
    headings                JSONB,                               -- [{level:int, text:string}]
    word_count              INTEGER,
    fetched_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    error_message           TEXT,                                -- when source='fallback_failed'
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_article_snapshots_run_client_url
    ON seo_optimizer.article_snapshots (run_id, client_id, url);

CREATE INDEX IF NOT EXISTS idx_article_snapshots_content_item
    ON seo_optimizer.article_snapshots (content_item_id);

CREATE INDEX IF NOT EXISTS idx_article_snapshots_client_url
    ON seo_optimizer.article_snapshots (client_id, url, fetched_at DESC);

COMMENT ON TABLE seo_optimizer.article_snapshots IS
  'Snapshot of the article HTML analyzed during a run. Used for: (1) provenance — what version did the analyst see, '
  '(2) drift detection — comparing snapshots across runs to detect implementation, (3) input for the writer agent.';

-- ----------------------------------------------------------------------------
-- 7. TABLE: opportunities  (core table)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS seo_optimizer.opportunities (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                      UUID            NOT NULL REFERENCES seo_optimizer.runs(id) ON DELETE CASCADE,
    client_id                   UUID            NOT NULL,
    content_item_id             UUID,                                 -- FK to public.content_items, nullable
    article_url                 TEXT            NOT NULL,
    article_title               TEXT,
    article_language            TEXT,                                 -- 'es', 'en', 'pt-BR'
    category                    TEXT            NOT NULL
                                                CHECK (category IN (
                                                    'decay','striking_distance','low_ctr',
                                                    'semantic_coverage','cannibalization','intent_mismatch'
                                                )),
    -- Scoring
    score                       NUMERIC(12,2)   NOT NULL,
    rank_within_client          INTEGER         NOT NULL CHECK (rank_within_client BETWEEN 1 AND 100),
    traffic_potential_estimate  NUMERIC(12,2),                        -- projected monthly clicks if implemented
    effort_level                TEXT            NOT NULL
                                                CHECK (effort_level IN ('low','medium','high')),
    confidence                  TEXT            NOT NULL
                                                CHECK (confidence IN ('high','medium','low')),
    -- Content
    evidence                    JSONB           NOT NULL,             -- queries, metrics, positions, etc.
    recommendation_summary      TEXT            NOT NULL,             -- 1-2 line plain text
    recommendation_details      JSONB           NOT NULL,             -- structured: what to change, where
    -- State machine
    status                      TEXT            NOT NULL DEFAULT 'pending'
                                                CHECK (status IN (
                                                    'pending','approved','rejected',
                                                    'writing','ready_for_writer',
                                                    'implemented','observing','closed'
                                                )),
    decided_by                  UUID,                                 -- user_id from auth.users (SEO specialist)
    decided_at                  TIMESTAMPTZ,
    decision_reason             TEXT,
    implemented_at              TIMESTAMPTZ,
    implemented_by              UUID,                                 -- user_id (redactor)
    reeval_due_at               DATE,                                 -- set by trigger when status -> implemented
    reeval_outcome              TEXT
                                                CHECK (reeval_outcome IN ('improved','unchanged','worsened','inconclusive')),
    reeval_completed_at         TIMESTAMPTZ,
    -- Dedupe (memory of rejections across runs)
    dedupe_key                  TEXT            NOT NULL UNIQUE,
    -- Audit
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_client_status
    ON seo_optimizer.opportunities (client_id, status);

CREATE INDEX IF NOT EXISTS idx_opportunities_reeval_due
    ON seo_optimizer.opportunities (reeval_due_at)
    WHERE status = 'implemented';

CREATE INDEX IF NOT EXISTS idx_opportunities_run_rank
    ON seo_optimizer.opportunities (run_id, rank_within_client);

CREATE INDEX IF NOT EXISTS idx_opportunities_content_item
    ON seo_optimizer.opportunities (content_item_id, status);

CREATE INDEX IF NOT EXISTS idx_opportunities_pending_age
    ON seo_optimizer.opportunities (created_at)
    WHERE status = 'pending';

DROP TRIGGER IF EXISTS opportunities_updated_at ON seo_optimizer.opportunities;
CREATE TRIGGER opportunities_updated_at
    BEFORE UPDATE ON seo_optimizer.opportunities
    FOR EACH ROW
    EXECUTE FUNCTION seo_optimizer.tg_set_updated_at();

COMMENT ON TABLE seo_optimizer.opportunities IS
  'Core table: optimization proposals detected by the analyst. Each row is a single proposed change to a '
  'specific article in a specific category. SEO specialist approves/rejects; on approval, /writer generates '
  'the rewrite. Status machine documented in ARCHITECTURE.md section 8.';

COMMENT ON COLUMN seo_optimizer.opportunities.dedupe_key IS
  'Stable hash for cross-run dedup. Format: {client_id}:{content_item_id}:{category}:{evidence_hash}. '
  'Used to skip proposals previously rejected.';

-- ----------------------------------------------------------------------------
-- 8. TABLE: opportunity_rewrites
-- ----------------------------------------------------------------------------
-- Output of the /writer agent (only generated after approval).

CREATE TABLE IF NOT EXISTS seo_optimizer.opportunity_rewrites (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id              UUID            NOT NULL REFERENCES seo_optimizer.opportunities(id) ON DELETE CASCADE,
    original_html               TEXT            NOT NULL,        -- snapshot at time of rewrite
    proposed_html               TEXT            NOT NULL,
    proposed_title_tag          TEXT,
    proposed_meta_description   TEXT,
    proposed_h1                 TEXT,
    diff_html                   TEXT            NOT NULL,        -- visual diff for the writer
    change_summary              TEXT            NOT NULL,        -- bullet-point summary
    generated_at                TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    generated_by_model          TEXT            NOT NULL,        -- e.g. 'anthropic/claude-sonnet-4.5'
    tokens_input                INTEGER,
    tokens_output               INTEGER,
    status                      TEXT            NOT NULL DEFAULT 'draft'
                                                CHECK (status IN ('draft','delivered_to_writer','in_cms','live','revoked')),
    delivered_at                TIMESTAMPTZ,
    in_cms_at                   TIMESTAMPTZ,
    live_at                     TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rewrites_opportunity
    ON seo_optimizer.opportunity_rewrites (opportunity_id);

CREATE INDEX IF NOT EXISTS idx_rewrites_status
    ON seo_optimizer.opportunity_rewrites (status, generated_at DESC);

DROP TRIGGER IF EXISTS rewrites_updated_at ON seo_optimizer.opportunity_rewrites;
CREATE TRIGGER rewrites_updated_at
    BEFORE UPDATE ON seo_optimizer.opportunity_rewrites
    FOR EACH ROW
    EXECUTE FUNCTION seo_optimizer.tg_set_updated_at();

COMMENT ON TABLE seo_optimizer.opportunity_rewrites IS
  'HTML rewrites generated by the /writer agent after SEO approval. Includes diff for human review. '
  'Status tracks the flow: draft → delivered_to_writer → in_cms → live.';

-- ----------------------------------------------------------------------------
-- 9. TABLE: rejection_log
-- ----------------------------------------------------------------------------
-- Memory of rejections. Populated by trigger when opportunity.status -> 'rejected'.

CREATE TABLE IF NOT EXISTS seo_optimizer.rejection_log (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id      UUID            NOT NULL REFERENCES seo_optimizer.opportunities(id) ON DELETE CASCADE,
    client_id           UUID            NOT NULL,
    content_item_id     UUID,
    category            TEXT            NOT NULL,
    dedupe_key          TEXT            NOT NULL UNIQUE,    -- same as opportunity.dedupe_key
    rejected_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    rejected_by         UUID,
    reason              TEXT,
    reopened            BOOLEAN         NOT NULL DEFAULT FALSE,
    reopened_at         TIMESTAMPTZ,
    reopened_by         UUID
);

CREATE INDEX IF NOT EXISTS idx_rejection_log_client_active
    ON seo_optimizer.rejection_log (client_id, dedupe_key)
    WHERE reopened = FALSE;

CREATE INDEX IF NOT EXISTS idx_rejection_log_category
    ON seo_optimizer.rejection_log (category, rejected_at DESC);

COMMENT ON TABLE seo_optimizer.rejection_log IS
  'Persistent memory of rejected proposals. The analyst queries this table to avoid re-proposing the same '
  'change. Use reopened=TRUE to allow re-proposal (manual override by SEO).';

-- ----------------------------------------------------------------------------
-- 10. TABLE: reeval_results
-- ----------------------------------------------------------------------------
-- Outcome of the +45 day re-evaluation.

CREATE TABLE IF NOT EXISTS seo_optimizer.reeval_results (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id              UUID            NOT NULL REFERENCES seo_optimizer.opportunities(id) ON DELETE CASCADE,
    reeval_run_id               UUID            REFERENCES seo_optimizer.runs(id) ON DELETE SET NULL,
    -- Before/after metrics (30-day windows)
    clicks_before               INTEGER,
    clicks_after                INTEGER,
    clicks_delta_pct            NUMERIC(8,2),
    position_before             NUMERIC(6,2),
    position_after              NUMERIC(6,2),
    position_delta              NUMERIC(6,2),
    impressions_before          INTEGER,
    impressions_after           INTEGER,
    impressions_delta_pct       NUMERIC(8,2),
    -- Verdict
    outcome                     TEXT            NOT NULL
                                                CHECK (outcome IN ('improved','unchanged','worsened','inconclusive')),
    confidence_in_outcome       TEXT            NOT NULL
                                                CHECK (confidence_in_outcome IN ('high','medium','low')),
    notes                       TEXT,                              -- LLM-generated insight (optional)
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reeval_opportunity
    ON seo_optimizer.reeval_results (opportunity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reeval_outcome
    ON seo_optimizer.reeval_results (outcome, created_at DESC);

COMMENT ON TABLE seo_optimizer.reeval_results IS
  'Re-evaluation results 45 days after an opportunity is implemented. Closes the feedback loop: did the '
  'change actually improve metrics? Used by v_outcomes_summary for system credibility tracking.';

-- ============================================================================
-- 11. FOREIGN KEYS TO public schema (added at the end to allow IF EXISTS check)
-- ============================================================================
-- Note: these FKs reference Orbit's existing tables. We use ON DELETE SET NULL
-- so deletions in Orbit don't cascade into our optimization history.

-- public.clientes
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clientes') THEN
        ALTER TABLE seo_optimizer.run_events
            ADD CONSTRAINT fk_run_events_client
            FOREIGN KEY (client_id) REFERENCES public.clientes(id) ON DELETE SET NULL;
        ALTER TABLE seo_optimizer.gsc_url_query_metrics
            ADD CONSTRAINT fk_gsc_metrics_client
            FOREIGN KEY (client_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
        ALTER TABLE seo_optimizer.article_snapshots
            ADD CONSTRAINT fk_article_snapshots_client
            FOREIGN KEY (client_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
        ALTER TABLE seo_optimizer.opportunities
            ADD CONSTRAINT fk_opportunities_client
            FOREIGN KEY (client_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
        ALTER TABLE seo_optimizer.rejection_log
            ADD CONSTRAINT fk_rejection_log_client
            FOREIGN KEY (client_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
        RAISE NOTICE 'FKs to public.clientes added';
    ELSE
        RAISE WARNING 'public.clientes not found — FKs skipped. Update migration if table name differs.';
    END IF;
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'FKs to public.clientes already exist — skipping';
END $$;

-- public.content_items
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='content_items') THEN
        ALTER TABLE seo_optimizer.article_snapshots
            ADD CONSTRAINT fk_article_snapshots_content_item
            FOREIGN KEY (content_item_id) REFERENCES public.content_items(id) ON DELETE SET NULL;
        ALTER TABLE seo_optimizer.opportunities
            ADD CONSTRAINT fk_opportunities_content_item
            FOREIGN KEY (content_item_id) REFERENCES public.content_items(id) ON DELETE SET NULL;
        ALTER TABLE seo_optimizer.rejection_log
            ADD CONSTRAINT fk_rejection_log_content_item
            FOREIGN KEY (content_item_id) REFERENCES public.content_items(id) ON DELETE SET NULL;
        RAISE NOTICE 'FKs to public.content_items added';
    ELSE
        RAISE WARNING 'public.content_items not found — FKs skipped.';
    END IF;
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'FKs to public.content_items already exist — skipping';
END $$;

-- ============================================================================
-- 12. STATE MACHINE TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 12.1 Trigger: opportunities approved → POST to /writer
-- ----------------------------------------------------------------------------
-- When status transitions 'pending' → 'approved', we async-call the Python
-- writer endpoint on Railway. The endpoint will set status='writing' immediately
-- and then 'ready_for_writer' when done.

CREATE OR REPLACE FUNCTION seo_optimizer.tg_dispatch_writer_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_railway_url   TEXT;
    v_internal_key  TEXT;
BEGIN
    -- Only fire on the specific transition
    IF NOT (OLD.status = 'pending' AND NEW.status = 'approved') THEN
        RETURN NEW;
    END IF;

    -- Read secrets from Vault
    SELECT decrypted_secret INTO v_railway_url
        FROM vault.decrypted_secrets WHERE name = 'SEO_OPTIMIZER_RAILWAY_URL';
    SELECT decrypted_secret INTO v_internal_key
        FROM vault.decrypted_secrets WHERE name = 'SEO_OPTIMIZER_INTERNAL_SECRET';

    IF v_railway_url IS NULL OR v_internal_key IS NULL THEN
        -- Don't block the UPDATE; log a warning via run_events
        INSERT INTO seo_optimizer.run_events (run_id, client_id, event_source, event_type, payload, error_message)
        VALUES (
            NEW.run_id, NEW.client_id, 'db_trigger', 'warning',
            jsonb_build_object('opportunity_id', NEW.id, 'reason', 'missing_vault_secrets'),
            'SEO_OPTIMIZER_RAILWAY_URL or SEO_OPTIMIZER_INTERNAL_SECRET not in vault'
        );
        RETURN NEW;
    END IF;

    -- Fire-and-forget POST to /writer
    PERFORM net.http_post(
        url := v_railway_url || '/writer',
        headers := jsonb_build_object(
            'content-type', 'application/json',
            'x-internal-secret', v_internal_key
        ),
        body := jsonb_build_object('opportunity_id', NEW.id)::text
    );

    -- Audit event
    INSERT INTO seo_optimizer.run_events (run_id, client_id, event_source, event_type, payload)
    VALUES (
        NEW.run_id, NEW.client_id, 'db_trigger', 'approval_received',
        jsonb_build_object('opportunity_id', NEW.id, 'category', NEW.category)
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunities_approved_dispatch ON seo_optimizer.opportunities;
CREATE TRIGGER opportunities_approved_dispatch
    AFTER UPDATE OF status ON seo_optimizer.opportunities
    FOR EACH ROW
    WHEN (OLD.status = 'pending' AND NEW.status = 'approved')
    EXECUTE FUNCTION seo_optimizer.tg_dispatch_writer_on_approval();

-- ----------------------------------------------------------------------------
-- 12.2 Trigger: opportunities implemented → set reeval_due_at = +45 days
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION seo_optimizer.tg_set_reeval_due()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'implemented' AND OLD.status = 'ready_for_writer' THEN
        NEW.implemented_at = COALESCE(NEW.implemented_at, NOW());
        NEW.reeval_due_at = (NEW.implemented_at::date) + INTERVAL '45 days';

        INSERT INTO seo_optimizer.run_events (run_id, client_id, event_source, event_type, payload)
        VALUES (
            NEW.run_id, NEW.client_id, 'db_trigger', 'implementation_marked',
            jsonb_build_object(
                'opportunity_id', NEW.id,
                'implemented_by', NEW.implemented_by,
                'reeval_due_at', NEW.reeval_due_at
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunities_implemented_reeval ON seo_optimizer.opportunities;
CREATE TRIGGER opportunities_implemented_reeval
    BEFORE UPDATE OF status ON seo_optimizer.opportunities
    FOR EACH ROW
    WHEN (NEW.status = 'implemented' AND OLD.status = 'ready_for_writer')
    EXECUTE FUNCTION seo_optimizer.tg_set_reeval_due();

-- ----------------------------------------------------------------------------
-- 12.3 Trigger: opportunities rejected → copy to rejection_log
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION seo_optimizer.tg_log_rejection()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
        INSERT INTO seo_optimizer.rejection_log
            (opportunity_id, client_id, content_item_id, category, dedupe_key,
             rejected_at, rejected_by, reason)
        VALUES
            (NEW.id, NEW.client_id, NEW.content_item_id, NEW.category, NEW.dedupe_key,
             NOW(), NEW.decided_by, NEW.decision_reason)
        ON CONFLICT (dedupe_key) DO UPDATE
            SET rejected_at = EXCLUDED.rejected_at,
                rejected_by = EXCLUDED.rejected_by,
                reason = EXCLUDED.reason,
                reopened = FALSE,
                reopened_at = NULL;

        INSERT INTO seo_optimizer.run_events (run_id, client_id, event_source, event_type, payload)
        VALUES (
            NEW.run_id, NEW.client_id, 'db_trigger', 'warning',
            jsonb_build_object(
                'opportunity_id', NEW.id,
                'event', 'rejected',
                'reason', NEW.decision_reason
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunities_rejected_log ON seo_optimizer.opportunities;
CREATE TRIGGER opportunities_rejected_log
    AFTER UPDATE OF status ON seo_optimizer.opportunities
    FOR EACH ROW
    WHEN (NEW.status = 'rejected' AND OLD.status != 'rejected')
    EXECUTE FUNCTION seo_optimizer.tg_log_rejection();

-- ----------------------------------------------------------------------------
-- 12.4 Trigger: enforce state machine transitions
-- ----------------------------------------------------------------------------
-- Prevents illegal status transitions (e.g. pending -> implemented directly).

CREATE OR REPLACE FUNCTION seo_optimizer.tg_enforce_status_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    -- Allowed FROM -> TO transitions
    v_allowed BOOLEAN := FALSE;
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    v_allowed := CASE
        WHEN OLD.status = 'pending'           AND NEW.status IN ('approved','rejected')      THEN TRUE
        WHEN OLD.status = 'approved'          AND NEW.status = 'writing'                     THEN TRUE
        WHEN OLD.status = 'writing'           AND NEW.status = 'ready_for_writer'            THEN TRUE
        WHEN OLD.status = 'ready_for_writer'  AND NEW.status = 'implemented'                 THEN TRUE
        WHEN OLD.status = 'implemented'       AND NEW.status IN ('observing','closed')       THEN TRUE
        WHEN OLD.status = 'observing'         AND NEW.status = 'closed'                      THEN TRUE
        -- Special: writer can rollback ready_for_writer -> approved (regenerate request)
        WHEN OLD.status = 'ready_for_writer'  AND NEW.status = 'approved'                    THEN TRUE
        ELSE FALSE
    END;

    IF NOT v_allowed THEN
        RAISE EXCEPTION 'Invalid status transition: % -> % (opportunity_id=%)',
            OLD.status, NEW.status, OLD.id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunities_enforce_status ON seo_optimizer.opportunities;
CREATE TRIGGER opportunities_enforce_status
    BEFORE UPDATE OF status ON seo_optimizer.opportunities
    FOR EACH ROW
    EXECUTE FUNCTION seo_optimizer.tg_enforce_status_transitions();

-- ============================================================================
-- 13. ROW LEVEL SECURITY
-- ============================================================================
-- For v1, RLS is intentionally DISABLED. Reasoning:
--   - All access is via the Python agents using the service_role key (bypasses RLS).
--   - The frontend (when built) will use service_role via a backend proxy, not anon key.
--   - Once the frontend is built with proper auth, enable RLS with policies.
-- IMPORTANT: This means the anon key has FULL ACCESS. Do NOT expose the anon key
-- to any client until RLS is enabled with policies.

-- (No RLS statements here intentionally — to be added when the frontend lands.)

-- ============================================================================
-- 14. PERMISSIONS
-- ============================================================================
-- Grant schema usage to authenticated and service_role.

GRANT USAGE ON SCHEMA seo_optimizer TO authenticated, service_role, anon;
GRANT ALL ON ALL TABLES IN SCHEMA seo_optimizer TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA seo_optimizer TO authenticated;
-- anon: no grants. Once frontend lands, will add SELECT-only policies via RLS.

ALTER DEFAULT PRIVILEGES IN SCHEMA seo_optimizer
    GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA seo_optimizer
    GRANT SELECT ON TABLES TO authenticated;

-- ============================================================================
-- DONE.
-- Next migrations:
--   002_seo_optimizer_views.sql       — Health and operational views
--   003_seo_optimizer_cron.sql        — pg_cron schedules + watchdog function
--   004_seo_optimizer_outbox_reuse.sql— Outbox table extension (or reuse check)
-- ============================================================================
