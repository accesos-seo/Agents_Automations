# 00 — Data Flow End-to-End

Trazabilidad de un evento desde el cron diario hasta la notificación Slack. Cada paso menciona la tabla/edge-fn involucrada y qué columna observar para confirmar progreso.

## Diagrama temporal

```
T+0s     cron pg_cron 08:00 CO       → POST orchestrator {trigger:'cron'}
T+0s     orchestrator                → INSERT analysis_runs (status='running')
T+0s     orchestrator                → INSERT run_events (event_type='agent_started')
T+0s     orchestrator                → SELECT brands WHERE status='active'
T+0s     orchestrator                → POST en paralelo gsc-ingestor (1 por brand) + ga4-ingestor (fire&forget)
T+5-30s  gsc-ingestor                → GSC API paginada → UPSERT traffic_daily + position_snapshots
T+5-30s  gsc-ingestor                → UPDATE traffic_daily SET integrity_status='approved'
T+5-30s  gsc-ingestor                → INSERT run_events (event_type='agent_completed')
T+15s    ga4-ingestor                → GA4 API → UPDATE traffic_daily SET ga4_*
T+30s    orchestrator                → POST analyst {run_id}
T+30-60s analyst (por brand+date):
                                       · Compara clicks D-1 vs D-8 → wow_pct
                                       · Si |wow_pct| >= threshold AND no false-positive:
                                           INSERT clicks_anomalies
                                           POST detective
                                       · Compara posiciones (url,query) D vs D-7:
                                           INSERT position_anomalies (batch)
                                           POST detective (concurrent pool, max 5)
T+45-75s detective (por anomaly):
                                       · Idempotencia: skip si ya existe diagnostic
                                       · Build context: top URLs + top keywords
                                       · LLM → thematic_cluster
                                       · INSERT incident_diagnostics (diagnosis_saved=true)
                                       · POST dispatcher {incident_id}
T+50-80s dispatcher (por incident):
                                       · Idempotencia: skip si ya en incident_log
                                       · LLM → executive_summary
                                       · Lookup brand_team_routing + CEO_SLACK_USER_ID
                                       · UPSERT 2 rows en notifications_outbox (dedupe_key)
                                       · INSERT run_events (event_type='alert_enqueued')
T+60-110s outbox-worker (cron cada 30s):
                                       · UPDATE outbox SET locked_at,locked_by WHERE pending
                                       · POST Slack chat.postMessage por cada row
                                       · UPDATE outbox SET status='sent'
                                       · INSERT incident_log
                                       · INSERT run_events (event_type='alert_sent')
T+60-110s CEO recibe DM en Slack
T+60-110s Canal de marca (#alerts-operaciones C0B1B3V4ZB5) recibe mensaje en Slack
T+60-110s Especialista (team_lead_user_id) recibe DM en Slack
```

**Tiempos totales esperados:**
- Pipeline ingesta + análisis (orchestrator awaits): 30-90s
- Hasta primer mensaje Slack entregado: 60-120s (depende del próximo tick del outbox-worker)
- Si hay errores transitorios de Slack: hasta +14 min (2+4+8 min de retries)

## Cómo seguir un run específico

Una vez disparado, el `run_id` (UUID) se propaga por todo el pipeline. Para ver el estado:

```sql
-- Estado general del run
SELECT id, trigger_source, started_at, completed_at, status,
       brands_total, brands_processed, brands_failed, error_message
FROM seo_sentinel.analysis_runs
WHERE id = '<RUN_ID>';

-- Timeline detallada de eventos
SELECT occurred_at, event_source, event_type, brand_id, payload, error_message
FROM seo_sentinel.run_events
WHERE run_id = '<RUN_ID>'
ORDER BY occurred_at;

-- Datos extraídos
SELECT brand_id, date, clicks, impressions, position, anomaly_status, anomaly_type
FROM seo_sentinel.traffic_daily
WHERE run_id = '<RUN_ID>'
ORDER BY date DESC;

-- Anomalías detectadas (clicks)
SELECT brand_id, anomaly_date, wow_drop_pct, anomaly_type, severity, false_positive
FROM seo_sentinel.clicks_anomalies
WHERE run_id = '<RUN_ID>';

-- Anomalías detectadas (posiciones)
SELECT brand_id, anomaly_date, url, query, prev_position, current_position,
       position_delta, lost_top10, severity
FROM seo_sentinel.position_anomalies
WHERE run_id = '<RUN_ID>';

-- Diagnostics generados
SELECT id AS incident_id, brand_id, anomaly_date, anomaly_kind, thematic_cluster,
       LENGTH(executive_summary) AS summary_len, dispatch_status
FROM seo_sentinel.incident_diagnostics
WHERE run_id = '<RUN_ID>';

-- Notificaciones encoladas/enviadas (no por run_id directamente; via incident_id)
SELECT n.target_type, n.channel_id, n.status, n.retry_count, n.sent_at, n.error_message
FROM public.notifications_outbox n
WHERE n.source = 'seo_sentinel_alert'
  AND n.dedupe_key LIKE 'seo_sentinel:%'
  AND n.created_at > NOW() - INTERVAL '1 hour'
ORDER BY n.created_at DESC;
```

## Cómo identificar un run reciente

```sql
SELECT id, trigger_source, status, started_at, completed_at,
       (completed_at - started_at) AS duration
FROM seo_sentinel.analysis_runs
ORDER BY started_at DESC
LIMIT 10;
```

## Lectura de severity

| Tipo | Trigger | Severidad |
|---|---|---|
| `clicks_drop` | wow_drop_pct >= 30% (absolute) | **RED** |
| `clicks_drop` | wow_drop_pct 20-29% | **YELLOW** |
| `position_drop` | position_delta >= 20 (cualquier posición) | **RED** |
| `position_drop` | lost_top10=true AND position_delta >= 10 | **RED** |
| `position_drop` | position_delta 10-19 (sin lost_top10) | **YELLOW** |

CEO recibe DM en **toda** alerta (RED + YELLOW). Canal de marca también. Especialista (team_lead_user_id de la marca) recibe DM también si está configurado. No hay filtrado por severidad en V1.
