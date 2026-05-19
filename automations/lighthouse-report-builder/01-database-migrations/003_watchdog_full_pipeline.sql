-- Migration 003 — Watchdog extendido para todo el pipeline (agent_6, agent_7)
--
-- Hace 3 cosas:
--
-- 1. Detecta reports con file_path pero sin published_at → dispara agent_7
--    (Slack notifier que quedó pendiente).
--
-- 2. Detecta reports sin file_path → dispara el exporter de Google Docs.
--
-- 3. Lista helpers para monitorear pipeline health.
--
-- Idempotente, todas las funciones usan CREATE OR REPLACE.

-- ─────────────────────────────────────────────────────────────────────────────
-- Detección de reports pendientes de exportar a Google Docs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ahrefs_web_analysis.find_pending_doc_exports(
  p_lookback_hours integer DEFAULT 24,
  p_max_results integer DEFAULT 10
)
RETURNS TABLE (
  report_id uuid,
  client_id uuid,
  domain text,
  generated_at timestamptz,
  minutes_since_generated numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.id AS report_id,
    r.client_id,
    r.domain,
    r.generated_at,
    ROUND(EXTRACT(EPOCH FROM (NOW() - r.generated_at))::numeric / 60, 2)
  FROM ahrefs_web_analysis.reports r
  WHERE r.file_path IS NULL
    AND r.generated_at > NOW() - (p_lookback_hours || ' hours')::interval
    AND r.report_status IN ('generated', 'generated_partial')
  ORDER BY r.generated_at DESC
  LIMIT p_max_results;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Detección de reports pendientes de notificar por Slack
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ahrefs_web_analysis.find_pending_slack_notifications(
  p_lookback_hours integer DEFAULT 24,
  p_max_results integer DEFAULT 10
)
RETURNS TABLE (
  report_id uuid,
  client_id uuid,
  domain text,
  file_path text,
  has_specialist boolean,
  generated_at timestamptz,
  minutes_since_generated numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.id AS report_id,
    r.client_id,
    r.domain,
    r.file_path,
    (r.created_by IS NOT NULL) AS has_specialist,
    r.generated_at,
    ROUND(EXTRACT(EPOCH FROM (NOW() - r.generated_at))::numeric / 60, 2)
  FROM ahrefs_web_analysis.reports r
  WHERE r.file_path IS NOT NULL
    AND r.published_at IS NULL
    AND r.generated_at > NOW() - (p_lookback_hours || ' hours')::interval
  ORDER BY r.generated_at DESC
  LIMIT p_max_results;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Worker unificado: agent_6 → agent_exporter → agent_7
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ahrefs_web_analysis.watchdog_full_pipeline()
RETURNS TABLE (
  step text,
  target_id uuid,
  dispatched boolean,
  error_msg text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret text;
  v_url text;
  v_orphan record;
  v_report record;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'LIGHTHOUSE_REPORT_INTERNAL_SECRET' LIMIT 1;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'LIGHTHOUSE_PROJECT_URL' LIMIT 1;

  IF v_secret IS NULL OR v_url IS NULL THEN
    step := 'skip';
    target_id := NULL;
    dispatched := false;
    error_msg := 'Vault secrets not configured';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Step 1: huérfanos sin report → agent_6
  FOR v_orphan IN
    SELECT * FROM ahrefs_web_analysis.find_orphan_orchestrations(60, 5)
  LOOP
    BEGIN
      SELECT net.http_post(
        url := v_url || '/functions/v1/lighthouse-report-builder',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
        body := jsonb_build_object('orchestration_id', v_orphan.orchestration_id, 'triggered_by', 'watchdog'),
        timeout_milliseconds := 120000
      ) INTO v_request_id;
      step := 'agent_6'; target_id := v_orphan.orchestration_id; dispatched := true; error_msg := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      step := 'agent_6'; target_id := v_orphan.orchestration_id; dispatched := false; error_msg := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  -- Step 2: reports sin doc → exporter
  FOR v_report IN
    SELECT * FROM ahrefs_web_analysis.find_pending_doc_exports(24, 5)
  LOOP
    BEGIN
      SELECT net.http_post(
        url := v_url || '/functions/v1/lighthouse-google-docs-exporter',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
        body := jsonb_build_object('report_id', v_report.report_id),
        timeout_milliseconds := 60000
      ) INTO v_request_id;
      step := 'exporter'; target_id := v_report.report_id; dispatched := true; error_msg := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      step := 'exporter'; target_id := v_report.report_id; dispatched := false; error_msg := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  -- Step 3: reports con doc pero sin publicar → agent_7
  FOR v_report IN
    SELECT * FROM ahrefs_web_analysis.find_pending_slack_notifications(24, 5)
  LOOP
    BEGIN
      SELECT net.http_post(
        url := v_url || '/functions/v1/lighthouse-slack-notifier',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
        body := jsonb_build_object('report_id', v_report.report_id),
        timeout_milliseconds := 30000
      ) INTO v_request_id;
      step := 'agent_7'; target_id := v_report.report_id; dispatched := true; error_msg := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      step := 'agent_7'; target_id := v_report.report_id; dispatched := false; error_msg := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vista de monitoreo del pipeline completo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW ahrefs_web_analysis.v_pipeline_health AS
SELECT
  (SELECT COUNT(*) FROM ahrefs_web_analysis.find_orphan_orchestrations(60, 100)) AS orphans_without_report,
  (SELECT COUNT(*) FROM ahrefs_web_analysis.find_pending_doc_exports(24, 100)) AS reports_without_doc,
  (SELECT COUNT(*) FROM ahrefs_web_analysis.find_pending_slack_notifications(24, 100)) AS docs_without_slack,
  (SELECT COUNT(*) FROM ahrefs_web_analysis.reports
    WHERE published_at IS NOT NULL
    AND published_at > NOW() - INTERVAL '24 hours') AS notified_last_24h,
  NOW() AS checked_at;

GRANT SELECT ON ahrefs_web_analysis.v_pipeline_health TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Activación del cron unificado — descomentar tras desplegar las 3 functions
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT cron.schedule(
--   'lighthouse-watchdog-full',
--   '*/2 * * * *',
--   $$ SELECT ahrefs_web_analysis.watchdog_full_pipeline(); $$
-- );

-- Test manual:
-- SELECT * FROM ahrefs_web_analysis.watchdog_full_pipeline();
-- SELECT * FROM ahrefs_web_analysis.v_pipeline_health;
