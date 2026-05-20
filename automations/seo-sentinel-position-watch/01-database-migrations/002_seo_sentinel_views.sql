-- ============================================================
-- seo_sentinel — Vistas de verificación end-to-end
-- ============================================================
-- Dos vistas para health-check y debugging rápido:
--   · v_pipeline_health    → semáforo del estado operativo
--   · v_recent_anomalies   → snapshot de anomalías últimos 7 días
-- ============================================================

-- ============================================================
-- VISTA: seo_sentinel.v_pipeline_health
-- Cuatro counts agregados para chequeo rápido del pipeline
-- ============================================================
CREATE OR REPLACE VIEW seo_sentinel.v_pipeline_health AS
SELECT
  (
    SELECT COUNT(*)
    FROM seo_sentinel.analysis_runs
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '30 minutes'
  ) AS runs_stuck,
  (
    SELECT COUNT(*)
    FROM seo_sentinel.incident_diagnostics d
    WHERE d.diagnosis_saved = true
      AND NOT EXISTS (
        SELECT 1
        FROM seo_sentinel.incident_log l
        WHERE l.incident_id = d.id
      )
  ) AS diagnostics_pending_dispatch,
  (
    SELECT COUNT(*)
    FROM public.notifications_outbox
    WHERE source = 'seo_sentinel_alert'
      AND status = 'pending'
      AND locked_at IS NOT NULL
      AND locked_at < NOW() - INTERVAL '5 minutes'
  ) AS outbox_stale_locks,
  (
    SELECT COUNT(*)
    FROM public.notifications_outbox
    WHERE source = 'seo_sentinel_alert'
      AND status = 'sent'
      AND sent_at > NOW() - INTERVAL '24 hours'
  ) AS alerts_sent_24h;

-- ============================================================
-- VISTA: seo_sentinel.v_recent_anomalies
-- Snapshot de anomalías últimos 7 días (clicks + position)
-- ============================================================
CREATE OR REPLACE VIEW seo_sentinel.v_recent_anomalies AS
SELECT
  'clicks'::TEXT AS kind,
  ca.id,
  ca.brand_id,
  b.name AS brand_name,
  ca.anomaly_date,
  ca.severity,
  ca.wow_drop_pct AS metric_value,
  ca.anomaly_type,
  NULL::TEXT AS url,
  NULL::TEXT AS query,
  ca.false_positive,
  ca.created_at
FROM seo_sentinel.clicks_anomalies ca
JOIN seo_sentinel.brands b ON b.id = ca.brand_id
WHERE ca.created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'position'::TEXT AS kind,
  pa.id,
  pa.brand_id,
  b.name AS brand_name,
  pa.anomaly_date,
  pa.severity,
  pa.position_delta AS metric_value,
  NULL::TEXT AS anomaly_type,
  pa.url,
  pa.query,
  false AS false_positive,
  pa.created_at
FROM seo_sentinel.position_anomalies pa
JOIN seo_sentinel.brands b ON b.id = pa.brand_id
WHERE pa.created_at > NOW() - INTERVAL '7 days'

ORDER BY created_at DESC;
