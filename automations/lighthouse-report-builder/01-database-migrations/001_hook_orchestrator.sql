-- Hook para que ahrefs-total-orchestrator invoque a lighthouse-report-builder
-- como último paso después de recovery_plan.
--
-- ⚠️ ESTE ARCHIVO ES UNA GUÍA, NO UNA MIGRACIÓN EJECUTABLE.
--
-- La lógica del orquestador está dentro del edge function `ahrefs-total-orchestrator`
-- en TypeScript. Para hookear el agent_6 hay DOS caminos:
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CAMINO A — Modificar el código del orquestador (RECOMENDADO)
-- ─────────────────────────────────────────────────────────────────────────────
-- Agregar al final del flujo del orquestador, después de que recovery_plan
-- termina exitosamente, un bloque equivalente a:
--
--   if (recovery_plan_result.ok) {
--     await fetch(`${SUPABASE_URL}/functions/v1/lighthouse-report-builder`, {
--       method: "POST",
--       headers: {
--         "Content-Type": "application/json",
--         "x-internal-secret": Deno.env.get("LIGHTHOUSE_REPORT_INTERNAL_SECRET"),
--       },
--       body: JSON.stringify({ orchestration_id }),
--     });
--   }
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CAMINO B — Disparar desde pg_cron al detectar orquestaciones sin report
-- ─────────────────────────────────────────────────────────────────────────────
-- Útil para backfill de runs viejos sin tocar el orquestador. Corre cada 5
-- minutos buscando orquestaciones completas sin report y las procesa.

-- Requisitos previos:
--   1. La extensión pg_net debe estar habilitada (CREATE EXTENSION IF NOT EXISTS pg_net).
--   2. LIGHTHOUSE_REPORT_INTERNAL_SECRET debe estar en Supabase Vault.
--   3. La URL del proyecto debe estar en Supabase Vault como LIGHTHOUSE_PROJECT_URL.

-- Función que dispara el agent_6 para una orquestación específica
CREATE OR REPLACE FUNCTION ahrefs_web_analysis.dispatch_lighthouse_report(p_orchestration_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret text;
  v_url text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'LIGHTHOUSE_REPORT_INTERNAL_SECRET' LIMIT 1;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'LIGHTHOUSE_PROJECT_URL' LIMIT 1;

  IF v_secret IS NULL OR v_url IS NULL THEN
    RAISE EXCEPTION 'LIGHTHOUSE secrets not configured in Vault';
  END IF;

  SELECT net.http_post(
    url := v_url || '/functions/v1/lighthouse-report-builder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body := jsonb_build_object('orchestration_id', p_orchestration_id),
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- Worker que busca orquestaciones sin report y las despacha
CREATE OR REPLACE FUNCTION ahrefs_web_analysis.process_orphan_orchestrations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_row record;
BEGIN
  FOR v_row IN
    SELECT po.id
    FROM ahrefs_web_analysis.pipeline_orchestrations po
    WHERE po.orchestration_status = 'complete'
      AND po.completed_at > NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1
        FROM ahrefs_web_analysis.reports r
        JOIN ahrefs_web_analysis.analysis_runs ar ON ar.id = r.run_id
        WHERE ar.domain = po.domain
          AND r.generated_at > po.completed_at - INTERVAL '1 hour'
      )
    LIMIT 5
  LOOP
    PERFORM ahrefs_web_analysis.dispatch_lighthouse_report(v_row.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Cron job: cada 5 minutos. Activar manualmente cuando el agent_6 esté desplegado.
-- SELECT cron.schedule(
--   'lighthouse-report-orphan-worker',
--   '*/5 * * * *',
--   $$ SELECT ahrefs_web_analysis.process_orphan_orchestrations(); $$
-- );
