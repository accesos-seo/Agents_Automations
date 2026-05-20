-- ============================================================================
-- 003_oew_views.sql
-- Vistas de observabilidad del pipeline OEW.
--
-- Depends on:
--   - 001_oew_schema.sql (tablas operativas)
--   - seo_data_hub.ingestion_runs, seo_data_hub.brands_registry
--   - public.notifications_outbox (existente, creada por V1/Lighthouse)
--
-- Idempotencia: CREATE OR REPLACE VIEW.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- v_pipeline_health
-- Una sola fila con counters para dashboards y la validation_checklist
-- (paso 14). Si CUALQUIER counter > 0, hay algo que investigar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW organic_early_warning.v_pipeline_health AS
SELECT
  -- Runs colgados (orchestrator/baseline/evaluator stuck en 'running' >30 min).
  (SELECT COUNT(*)::INT
   FROM organic_early_warning.analysis_runs
   WHERE status = 'running'
     AND started_at < NOW() - INTERVAL '30 minutes'
  ) AS runs_stuck,

  -- Diagnostics generados últimas 24h sin entry correspondiente en incident_log
  -- (es decir, detective corrió pero dispatcher nunca encoló la alerta).
  (SELECT COUNT(*)::INT
   FROM organic_early_warning.incident_diagnostics d
   LEFT JOIN organic_early_warning.incident_log l ON l.incident_id = d.incident_id
   WHERE d.created_at > NOW() - INTERVAL '24 hours'
     AND l.id IS NULL
  ) AS diagnostics_pending_dispatch,

  -- Locks colgados del outbox-worker para fuente 'oew_alert'.
  (SELECT COUNT(*)::INT
   FROM public.notifications_outbox
   WHERE source = 'oew_alert'
     AND status = 'pending'
     AND locked_at IS NOT NULL
     AND locked_at < NOW() - INTERVAL '5 minutes'
  ) AS outbox_stale_locks_oew,

  -- Corridas del hub fallidas últimas 24h (cualquier source).
  (SELECT COUNT(*)::INT
   FROM seo_data_hub.ingestion_runs
   WHERE status = 'failed'
     AND started_at > NOW() - INTERVAL '24 hours'
  ) AS ingestion_runs_failed_24h,

  -- Alertas OEW enviadas exitosamente últimas 24h (no es error: es métrica).
  (SELECT COUNT(*)::INT
   FROM public.notifications_outbox
   WHERE source = 'oew_alert'
     AND status = 'sent'
     AND sent_at > NOW() - INTERVAL '24 hours'
  ) AS alerts_sent_24h;

COMMENT ON VIEW organic_early_warning.v_pipeline_health IS
  'Una sola fila con counters de salud del pipeline. Esperado: todos en 0 excepto alerts_sent_24h.';

-- ---------------------------------------------------------------------------
-- v_open_incidents
-- Vista de operación: incidents abiertos con metadata legible
-- (brand_name + thematic_cluster).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW organic_early_warning.v_open_incidents AS
SELECT
  i.id                                AS incident_id,
  i.brand_id,
  b.name                              AS brand_name,
  i.severity,
  i.signal_count,
  i.window_start,
  i.window_end,
  i.url_overlap_pct,
  i.dispatch_status,
  i.first_seen_at,
  i.last_updated_at,
  d.thematic_cluster,
  d.executive_summary,
  d.degraded                          AS llm_degraded,
  i.run_id
FROM organic_early_warning.incidents i
JOIN seo_data_hub.brands_registry b              ON b.id = i.brand_id
LEFT JOIN organic_early_warning.incident_diagnostics d ON d.incident_id = i.id
WHERE i.status = 'open'
ORDER BY
  CASE i.severity WHEN 'RED' THEN 1 WHEN 'YELLOW' THEN 2 ELSE 3 END,
  i.last_updated_at DESC;

COMMENT ON VIEW organic_early_warning.v_open_incidents IS
  'Incidents WHERE status=open con brand_name + thematic_cluster. Ordenados por severidad.';

-- ---------------------------------------------------------------------------
-- v_signal_summary
-- Agregación de signal_events últimos 7 días por signal_id.
-- Útil para detectar señales ruidosas (alto volumen) o silenciosas (cero).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW organic_early_warning.v_signal_summary AS
SELECT
  se.signal_id,
  sd.code,
  sd.kind,
  sd.cadence,
  COUNT(*)                                                          AS events_total,
  COUNT(*) FILTER (WHERE se.severity_hint = 'WATCH')                AS events_watch,
  COUNT(*) FILTER (WHERE se.severity_hint = 'YELLOW')               AS events_yellow,
  COUNT(*) FILTER (WHERE se.severity_hint = 'RED')                  AS events_red,
  COUNT(*) FILTER (WHERE se.false_positive = TRUE)                  AS events_false_positive,
  AVG(se.deviation_sigma)                                           AS avg_deviation_sigma,
  MIN(se.created_at)                                                AS first_event_at,
  MAX(se.created_at)                                                AS last_event_at
FROM organic_early_warning.signal_events se
JOIN organic_early_warning.signal_definitions sd ON sd.id = se.signal_id
WHERE se.created_at > NOW() - INTERVAL '7 days'
GROUP BY se.signal_id, sd.code, sd.kind, sd.cadence
ORDER BY events_total DESC;

COMMENT ON VIEW organic_early_warning.v_signal_summary IS
  'signal_events últimos 7d agrupados por signal_id. Tuning: alta cuenta => bajar weight o subir k_factor.';
