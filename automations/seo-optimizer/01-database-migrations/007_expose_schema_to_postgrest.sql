-- ============================================================================
-- Migration: 007_expose_schema_to_postgrest.sql
-- Purpose:   Expose the seo_optimizer schema to PostgREST API so supabase-js
--            .schema('seo_optimizer') works from Edge Functions.
-- Depends:   001 (schema exists), 005 (client_config exists).
-- ============================================================================
-- Without this, calls like:
--   sb.schema("seo_optimizer").from("runs").insert(...)
-- fail with:
--   "The schema must be one of the following: public, graphql_public, ..."
--
-- Two options to expose a schema:
--   1. Dashboard → Settings → API → Exposed schemas → add 'seo_optimizer'
--   2. SQL (this migration): ALTER ROLE authenticator SET pgrst.db_schemas = '...'
--
-- We use option 2 to keep the change in version control.
-- ============================================================================

ALTER ROLE authenticator SET pgrst.db_schemas =
    'public, graphql_public, ahrefs_web_analysis, seo_optimizer';

-- Reload PostgREST so the change takes effect immediately
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- Sanity check (does not enforce anything, but visible in migration logs)
DO $$
DECLARE
    v_config TEXT;
BEGIN
    SELECT array_to_string(rolconfig, E'\n') INTO v_config
    FROM pg_roles WHERE rolname = 'authenticator';
    RAISE NOTICE 'authenticator role config:%', E'\n' || v_config;
END $$;
