-- ============================================================================
-- Organic Early Warning V2 — Data Hub
-- Migration 004: cron jobs (pg_cron + pg_net)
--
-- 5 jobs:
--   hub-gsc-weekly        → Lunes 06:00 UTC → POST /hub-gsc-weekly
--   hub-ga4-weekly        → Lunes 06:15 UTC → POST /hub-ga4-weekly
--   hub-cwv-weekly        → Lunes 06:30 UTC → POST /hub-cwv-weekly
--   hub-ahrefs-monthly    → Día 28 06:00 UTC → POST /hub-ahrefs-monthly
--   hub-watchdog          → cada 5 min      → SELECT seo_data_hub.watchdog()
--
-- Pre-requisitos en vault.secrets:
--   - SUPABASE_FUNCTIONS_URL  (ej. 'https://stjugsrkrweakvzmizpq.functions.supabase.co')
--   - HUB_INTERNAL_SECRET     (compartido con todas las hub-* edge fns)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ----------------------------------------------------------------------------
-- Helper: _invoke_function(fn_name, payload)
-- Recupera SUPABASE_FUNCTIONS_URL + HUB_INTERNAL_SECRET de Vault y dispara
-- net.http_post. Devuelve el request_id (BIGINT) que pg_net usa para tracking.
--
-- Centralizar el lookup de Vault en una sola función evita duplicarlo en cada
-- cron job (cambiar de proyecto = cambiar el secret, no 4 jobs).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo_data_hub._invoke_function(
  fn_name TEXT,
  payload JSONB DEFAULT '{"trigger":"cron"}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  functions_url   TEXT;
  internal_secret TEXT;
  request_id      BIGINT;
BEGIN
  SELECT decrypted_secret
    INTO functions_url
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_FUNCTIONS_URL'
    LIMIT 1;

  SELECT decrypted_secret
    INTO internal_secret
    FROM vault.decrypted_secrets
    WHERE name = 'HUB_INTERNAL_SECRET'
    LIMIT 1;

  IF functions_url IS NULL OR internal_secret IS NULL THEN
    -- Loguear y devolver NULL en lugar de romper el cron (un cron que rompe
    -- queda en cron.job_run_details como failed, pero no avisa).
    INSERT INTO seo_data_hub.run_events
      (event_source, event_type, payload, error_message)
    VALUES (
      'hub-cron-helper',
      'warning',
      jsonb_build_object('fn_name', fn_name, 'has_url', functions_url IS NOT NULL,
                         'has_secret', internal_secret IS NOT NULL),
      'Missing SUPABASE_FUNCTIONS_URL or HUB_INTERNAL_SECRET in vault.decrypted_secrets'
    );
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := functions_url || '/' || fn_name,
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', internal_secret
    ),
    body    := payload
  ) INTO request_id;

  RETURN request_id;
END;
$$;

COMMENT ON FUNCTION seo_data_hub._invoke_function(TEXT, JSONB)
  IS 'Helper para los cron jobs del hub: lee secretos de Vault y dispara net.http_post.';

-- ----------------------------------------------------------------------------
-- Limpiar jobs previos (si una migración anterior los creó con otro comando).
-- cron.unschedule devuelve error si el job no existe → envolvemos en DO/BEGIN.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  job_names TEXT[] := ARRAY[
    'hub-gsc-weekly',
    'hub-ga4-weekly',
    'hub-cwv-weekly',
    'hub-ahrefs-monthly',
    'hub-watchdog'
  ];
  j TEXT;
BEGIN
  FOREACH j IN ARRAY job_names LOOP
    BEGIN
      PERFORM cron.unschedule(j);
    EXCEPTION WHEN OTHERS THEN
      -- Job no existía; OK.
      NULL;
    END;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1) hub-gsc-weekly — Lunes 06:00 UTC
-- ----------------------------------------------------------------------------
SELECT cron.schedule(
  'hub-gsc-weekly',
  '0 6 * * 1',
  $cmd$ SELECT seo_data_hub._invoke_function('hub-gsc-weekly', '{"trigger":"cron"}'::jsonb); $cmd$
);

-- ----------------------------------------------------------------------------
-- 2) hub-ga4-weekly — Lunes 06:15 UTC
-- ----------------------------------------------------------------------------
SELECT cron.schedule(
  'hub-ga4-weekly',
  '15 6 * * 1',
  $cmd$ SELECT seo_data_hub._invoke_function('hub-ga4-weekly', '{"trigger":"cron"}'::jsonb); $cmd$
);

-- ----------------------------------------------------------------------------
-- 3) hub-cwv-weekly — Lunes 06:30 UTC
-- ----------------------------------------------------------------------------
SELECT cron.schedule(
  'hub-cwv-weekly',
  '30 6 * * 1',
  $cmd$ SELECT seo_data_hub._invoke_function('hub-cwv-weekly', '{"trigger":"cron"}'::jsonb); $cmd$
);

-- ----------------------------------------------------------------------------
-- 4) hub-ahrefs-monthly — Día 28 06:00 UTC
-- ----------------------------------------------------------------------------
SELECT cron.schedule(
  'hub-ahrefs-monthly',
  '0 6 28 * *',
  $cmd$ SELECT seo_data_hub._invoke_function('hub-ahrefs-monthly', '{"trigger":"cron"}'::jsonb); $cmd$
);

-- ----------------------------------------------------------------------------
-- 5) hub-watchdog — cada 5 minutos (SQL directo, sin HTTP)
-- ----------------------------------------------------------------------------
SELECT cron.schedule(
  'hub-watchdog',
  '*/5 * * * *',
  $cmd$ SELECT seo_data_hub.watchdog(); $cmd$
);

-- ----------------------------------------------------------------------------
-- Verificación (consultable post-migración):
--   SELECT jobid, jobname, schedule, active FROM cron.job
--   WHERE jobname LIKE 'hub-%' ORDER BY jobname;
-- ----------------------------------------------------------------------------
