-- ============================================================================
-- Migration: 005_seo_optimizer_client_config.sql
-- Purpose:   Per-client configuration table for seo-optimizer.
--            Required because public.clientes does NOT have gsc_property_url
--            or a status column. This table is the explicit opt-in for clients
--            who participate in monthly optimization runs.
-- Depends:   001 (FK to public.clientes via seo_optimizer.run_events, etc.).
-- ============================================================================
-- Why a separate table:
--   - public.clientes columns are: id, name, created_at, language, onboarding_manual_tasks
--   - We need per-client: gsc_property_url, is_active for opt-in, language override,
--     SEO specialist user id (TBD when frontend lands), preferred Slack channel.
--   - Putting these in seo_optimizer.* keeps our module self-contained without
--     adding columns to Orbit's clientes table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS seo_optimizer.client_config (
    client_id              UUID            PRIMARY KEY,
    -- GSC property URL — either 'sc-domain:example.com' or 'https://example.com/'
    gsc_property_url       TEXT            NOT NULL,
    -- Opt-in flag — only clients with is_active=true are processed by orchestrator
    is_active              BOOLEAN         NOT NULL DEFAULT TRUE,
    -- Override: if non-null, use this language for the analyst regardless of clientes.language
    language_override      TEXT,
    -- Routing: which Slack channel receives the per-client notifications (nullable → uses fallback)
    slack_channel_id       TEXT,
    -- Routing: which user (Orbit user) is the SEO specialist for this client
    seo_specialist_user_id UUID,
    -- Routing: which user is the redactor / content writer
    redactor_user_id       UUID,
    -- Free-form overrides (tunable thresholds per client, etc.)
    overrides              JSONB           NOT NULL DEFAULT '{}'::jsonb,
    created_at             TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- FK to public.clientes (best-effort)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clientes') THEN
        ALTER TABLE seo_optimizer.client_config
            ADD CONSTRAINT fk_client_config_client
            FOREIGN KEY (client_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_config_active
    ON seo_optimizer.client_config (is_active)
    WHERE is_active = TRUE;

-- updated_at trigger
DROP TRIGGER IF EXISTS client_config_updated_at ON seo_optimizer.client_config;
CREATE TRIGGER client_config_updated_at
    BEFORE UPDATE ON seo_optimizer.client_config
    FOR EACH ROW
    EXECUTE FUNCTION seo_optimizer.tg_set_updated_at();

-- ============================================================================
-- View: v_active_clients — what the orchestrator iterates over
-- ============================================================================
-- Joins client_config with public.clientes for name lookup.
-- Also pulls dominioprincipal from proyectos_seo as a fallback hint if gsc_property_url is missing.

CREATE OR REPLACE VIEW seo_optimizer.v_active_clients AS
SELECT
    cc.client_id,
    c.name                                AS client_name,
    cc.gsc_property_url,
    cc.is_active,
    COALESCE(cc.language_override, c.language)        AS language,
    cc.slack_channel_id,
    cc.seo_specialist_user_id,
    cc.redactor_user_id,
    cc.overrides,
    -- Helpful for debugging: where Orbit thinks this client's main domain is
    (SELECT ps.dominioprincipal FROM public.proyectos_seo ps
     WHERE ps.client_id = cc.client_id
     LIMIT 1)                              AS orbit_main_domain
FROM seo_optimizer.client_config cc
LEFT JOIN public.clientes c ON c.id = cc.client_id
WHERE cc.is_active = TRUE
ORDER BY c.name NULLS LAST;

COMMENT ON VIEW seo_optimizer.v_active_clients IS
  'Active clients for the monthly run. orchestrator iterates this. To onboard '
  'a new client: INSERT INTO seo_optimizer.client_config (client_id, gsc_property_url) VALUES (...).';

-- Grants
GRANT SELECT, INSERT, UPDATE ON seo_optimizer.client_config TO service_role;
GRANT SELECT ON seo_optimizer.client_config TO authenticated;
GRANT SELECT ON seo_optimizer.v_active_clients TO service_role, authenticated;
