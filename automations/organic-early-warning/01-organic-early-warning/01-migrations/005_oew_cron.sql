-- ============================================================================
-- 005_oew_cron.sql
-- Cron jobs del sistema OEW (pg_cron) + función auxiliar para invocar edge fns.
--
-- Depends on:
--   - 001..004 aplicados
--   - Extensiones pg_cron y pg_net ya instaladas (las instala el hub).
--   - Vault: SUPABASE_FUNCTIONS_URL, OEW_INTERNAL_SECRET cargados.
--
-- Convenciones:
--   - Cron canónico documentado en ARCHITECTURE.md "Visión global"
--   - Watchdog */2 min (CONVENTIONS.md §6)
--   - Idempotencia: cron.unschedule antes de cron.schedule
-- ============================================================================

-- ---------------------------------------------------------------------------
-- _invoke_function: helper privado para invocar una edge function de oew-*.
-- Lee SUPABASE_FUNCTIONS_URL + OEW_INTERNAL_SECRET del Vault.
-- Devuelve el request_id de net.http_post (bigint).
--
-- Usado por los crons que necesitan disparar HTTP. El watchdog se invoca
-- directamente como SELECT organic_early_warning.watchdog() (SQL puro,
-- no necesita HTTP).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION organic_early_warning._invoke_function(
  fn_name TEXT,
  payload JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_functions_url   TEXT;
  v_internal_secret TEXT;
  v_request_id      BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_functions_url
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_FUNCTIONS_URL'
    LIMIT 1;

  SELECT decrypted_secret INTO v_internal_secret
    FROM vault.decrypted_secrets
    WHERE name = 'OEW_INTERNAL_SECRET'
    LIMIT 1;

  IF v_functions_url IS NULL OR v_internal_secret IS NULL THEN
    RAISE WARNING 'organic_early_warning._invoke_function: SUPABASE_FUNCTIONS_URL u OEW_INTERNAL_SECRET no cargados en Vault. Skipping invoke de %.', fn_name;
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := rtrim(v_functions_url, '/') || '/' || fn_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_internal_secret
    ),
    body    := payload
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION organic_early_warning._invoke_function(TEXT, JSONB) IS
  'Helper: POST a edge function oew-* con x-internal-secret. Usado por pg_cron.';

-- ---------------------------------------------------------------------------
-- Re-creación idempotente de los 4 crons del OEW.
-- pg_cron.schedule no es idempotente por sí solo, así que primero unschedule
-- (silencioso si no existe) y luego schedule.
-- ---------------------------------------------------------------------------

-- Cron 1: oew-orchestrator — Martes 13:00 UTC (= 08:00 CO)
SELECT cron.unschedule('oew-orchestrator') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'oew-orchestrator'
);
SELECT cron.schedule(
  'oew-orchestrator',
  '0 13 * * 2',
  $cron$
    SELECT organic_early_warning._invoke_function(
      'oew-orchestrator',
      '{"trigger":"cron"}'::jsonb
    );
  $cron$
);

-- Cron 2: oew-digest-weekly — Viernes 23:00 UTC (= 18:00 CO)
SELECT cron.unschedule('oew-digest-weekly') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'oew-digest-weekly'
);
SELECT cron.schedule(
  'oew-digest-weekly',
  '0 23 * * 5',
  $cron$
    SELECT organic_early_warning._invoke_function(
      'oew-digest-weekly',
      '{"trigger":"cron"}'::jsonb
    );
  $cron$
);

-- Cron 3: oew-watchdog — */2 min, llama directo a la función SQL (sin HTTP)
SELECT cron.unschedule('oew-watchdog') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'oew-watchdog'
);
SELECT cron.schedule(
  'oew-watchdog',
  '*/2 * * * *',
  $cron$
    SELECT organic_early_warning.watchdog();
  $cron$
);

-- Cron 4: oew-outbox-worker — cada 30s
--
-- NOTA / TODO operativo:
-- ----------------------------------------------------------------------------
-- Este cron asume que existe una edge function 'oew-outbox-worker'
-- construida por un sub-agente paralelo. Si esa fn NO se construye:
--
--   a) Si el outbox-worker general (heredado de V1/Lighthouse) YA filtra por
--      todas las sources (incluyendo 'oew_alert'), este cron es REDUNDANTE
--      y conviene desactivarlo:
--         UPDATE cron.job SET active = false WHERE jobname = 'oew-outbox-worker';
--
--   b) Si el outbox-worker de V1 filtra sólo por su propia source
--      (ej. 'seo_sentinel'), este cron es NECESARIO. Construir la fn
--      'oew-outbox-worker' con la misma lógica que el de V1 pero filtrando
--      WHERE source = 'oew_alert'.
--
-- Por ahora se crea apuntando a /oew-outbox-worker. Si la edge fn no existe,
-- pg_net devolverá 404 y el cron loguea fail (no rompe el sistema).
-- ----------------------------------------------------------------------------
SELECT cron.unschedule('oew-outbox-worker') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'oew-outbox-worker'
);
SELECT cron.schedule(
  'oew-outbox-worker',
  '*/30 * * * * *',  -- cada 30 segundos (sintaxis pg_cron 6-fields)
  $cron$
    SELECT organic_early_warning._invoke_function(
      'oew-outbox-worker',
      '{}'::jsonb
    );
  $cron$
);
