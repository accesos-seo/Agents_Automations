-- Migration 002 — Especialista responsable + watchdog de informes huérfanos
--
-- 1. Agrega `created_by uuid` a analysis_requests y analysis_runs para trazar
--    qué especialista disparó cada análisis. El frontend debe inyectar
--    `auth.uid()` al crear cada request.
--
-- 2. Crea un watchdog (función + cron job) que detecta orquestaciones que
--    quedaron "huérfanas": completaron el pipeline pero nunca generaron el row
--    en `reports`. Cada 2 minutos despacha el agent_6 para esos casos.
--
-- Idempotente: se puede correr varias veces sin romper nada.

-- ─────────────────────────────────────────────────────────────────────────────
-- Parte 1: Especialista responsable
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ahrefs_web_analysis.analysis_requests
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE ahrefs_web_analysis.analysis_runs
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE ahrefs_web_analysis.reports
  ADD COLUMN IF NOT EXISTS created_by uuid;

COMMENT ON COLUMN ahrefs_web_analysis.analysis_requests.created_by IS
  'auth.uid() del especialista que disparó el análisis. Nullable: cron jobs y backfills no tienen owner.';

CREATE INDEX IF NOT EXISTS idx_analysis_requests_created_by
  ON ahrefs_web_analysis.analysis_requests(created_by)
  WHERE created_by IS NOT NULL;

-- Vista helper: análisis con datos del especialista resueltos
CREATE OR REPLACE VIEW ahrefs_web_analysis.v_analysis_with_specialist AS
SELECT
  ar.id AS request_id,
  ar.target_url,
  ar.client_name,
  ar.country,
  ar.request_status,
  ar.created_at AS requested_at,
  ar.completed_at,
  ar.created_by AS specialist_id,
  u.full_name AS specialist_name,
  u.email AS specialist_email,
  u.photo_url AS specialist_photo,
  ar.orchestration_id
FROM ahrefs_web_analysis.analysis_requests ar
LEFT JOIN public.users u ON u.id = ar.created_by;

GRANT SELECT ON ahrefs_web_analysis.v_analysis_with_specialist TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Parte 2: Watchdog de informes huérfanos
-- ─────────────────────────────────────────────────────────────────────────────

-- Función auxiliar: detecta orquestaciones completas sin report
CREATE OR REPLACE FUNCTION ahrefs_web_analysis.find_orphan_orchestrations(
  p_lookback_minutes integer DEFAULT 60,
  p_max_results integer DEFAULT 10
)
RETURNS TABLE (
  orchestration_id uuid,
  domain text,
  client_id uuid,
  completed_at timestamptz,
  minutes_since_completed numeric,
  has_data boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      po.id AS orchestration_id,
      po.domain,
      po.completed_at,
      EXTRACT(EPOCH FROM (NOW() - po.completed_at))/60 AS minutes_since_completed
    FROM ahrefs_web_analysis.pipeline_orchestrations po
    WHERE po.orchestration_status = 'complete'
      AND po.completed_at IS NOT NULL
      AND po.completed_at > NOW() - (p_lookback_minutes || ' minutes')::interval
      AND NOT EXISTS (
        SELECT 1
        FROM ahrefs_web_analysis.reports r
        JOIN ahrefs_web_analysis.analysis_runs ar2 ON ar2.id = r.run_id
        WHERE ar2.domain = po.domain
          AND r.generated_at >= po.completed_at - INTERVAL '5 minutes'
      )
    ORDER BY po.completed_at DESC
    LIMIT p_max_results
  )
  SELECT
    b.orchestration_id,
    b.domain,
    (SELECT ar.client_id FROM ahrefs_web_analysis.analysis_runs ar
     WHERE ar.domain = b.domain AND ar.started_at >= b.completed_at - INTERVAL '10 minutes'
     ORDER BY ar.started_at DESC LIMIT 1) AS client_id,
    b.completed_at,
    ROUND(b.minutes_since_completed::numeric, 2),
    EXISTS (
      SELECT 1 FROM ahrefs_web_analysis.organic_keywords ok
      WHERE ok.client_id = (
        SELECT ar.client_id FROM ahrefs_web_analysis.analysis_runs ar
        WHERE ar.domain = b.domain AND ar.started_at >= b.completed_at - INTERVAL '10 minutes'
        ORDER BY ar.started_at DESC LIMIT 1
      )
    ) AS has_data
  FROM base b;
$$;

-- Función watchdog: despacha al agent_6 los huérfanos
CREATE OR REPLACE FUNCTION ahrefs_web_analysis.watchdog_process_orphans()
RETURNS TABLE (orchestration_id uuid, dispatched boolean, http_request_id bigint, error_msg text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret text;
  v_url text;
  v_orphan record;
  v_request_id bigint;
BEGIN
  -- Cargar secretos del Vault
  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'LIGHTHOUSE_REPORT_INTERNAL_SECRET' LIMIT 1;
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'LIGHTHOUSE_PROJECT_URL' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Vault secrets not configured. Set LIGHTHOUSE_REPORT_INTERNAL_SECRET and LIGHTHOUSE_PROJECT_URL.';
    RETURN;
  END;

  IF v_secret IS NULL OR v_url IS NULL THEN
    RAISE NOTICE 'Vault secrets are NULL. Skipping watchdog run.';
    RETURN;
  END IF;

  FOR v_orphan IN
    SELECT * FROM ahrefs_web_analysis.find_orphan_orchestrations(60, 5)
  LOOP
    BEGIN
      SELECT net.http_post(
        url := v_url || '/functions/v1/lighthouse-report-builder',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', v_secret
        ),
        body := jsonb_build_object(
          'orchestration_id', v_orphan.orchestration_id,
          'triggered_by', 'watchdog'
        ),
        timeout_milliseconds := 120000
      ) INTO v_request_id;

      orchestration_id := v_orphan.orchestration_id;
      dispatched := true;
      http_request_id := v_request_id;
      error_msg := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      orchestration_id := v_orphan.orchestration_id;
      dispatched := false;
      http_request_id := NULL;
      error_msg := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

-- Estado del watchdog (para monitoreo)
CREATE OR REPLACE VIEW ahrefs_web_analysis.v_watchdog_status AS
SELECT
  (SELECT COUNT(*) FROM ahrefs_web_analysis.find_orphan_orchestrations(60, 100)) AS pending_orphans_last_hour,
  (SELECT COUNT(*) FROM ahrefs_web_analysis.find_orphan_orchestrations(60, 100) WHERE has_data = true) AS with_data,
  (SELECT COUNT(*) FROM ahrefs_web_analysis.find_orphan_orchestrations(60, 100) WHERE has_data = false) AS without_data,
  NOW() AS checked_at;

GRANT SELECT ON ahrefs_web_analysis.v_watchdog_status TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Activación del cron — comentado para evitar ejecución accidental antes de
-- que el agent_6 esté desplegado. Descomentar tras el deploy.
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT cron.schedule(
--   'lighthouse-watchdog',
--   '*/2 * * * *',  -- cada 2 minutos
--   $$ SELECT ahrefs_web_analysis.watchdog_process_orphans(); $$
-- );

-- Para desactivar:
-- SELECT cron.unschedule('lighthouse-watchdog');

-- ─────────────────────────────────────────────────────────────────────────────
-- Test manual del watchdog
-- ─────────────────────────────────────────────────────────────────────────────

-- Ver orquestaciones huérfanas detectadas en la última hora:
-- SELECT * FROM ahrefs_web_analysis.find_orphan_orchestrations(60, 20);

-- Disparar manualmente (sin esperar al cron):
-- SELECT * FROM ahrefs_web_analysis.watchdog_process_orphans();

-- Estado general:
-- SELECT * FROM ahrefs_web_analysis.v_watchdog_status;
