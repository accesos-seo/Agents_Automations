# 00 — Data Flow End-to-End

Trazabilidad de un evento desde que el cron del hub dispara el Lunes hasta que el especialista recibe el Slack el Martes. Cada paso menciona la tabla y/o edge function involucrada y la columna que confirma progreso.

V2 son **dos sistemas coordinados secuencialmente**: el hub ingiere el Lunes (no genera alertas), y el orchestrator de oew evalúa el Martes (consume del hub y genera alertas). Si el hub no completó su corrida semanal, el orchestrator de oew sale temprano con warning.

## Diagrama temporal — semana completa

```
LUNES (T+0h = ingesta del hub)
─────────────────────────────────────────────────────────────────────
T+0min     pg_cron 'hub-gsc-weekly'        → POST hub-gsc-weekly {trigger:'cron'}
                                              · INSERT ingestion_runs (status='running', source='gsc')
                                              · INSERT run_events  (event_type='run_started')
T+0-15min  hub-gsc-weekly (por brand)      → GSC Search Analytics API (paginado)
                                              · UPSERT gsc_search_analytics_weekly
                                              · GSC URL Inspection API (top-100 URLs)
                                              · UPSERT gsc_url_inspection_weekly
                                              · GSC Coverage report
                                              · UPSERT gsc_coverage_weekly
                                              · UPDATE ingestion_runs (status='completed', rows_inserted=N)
                                              · INSERT run_events  (event_type='run_completed')

T+15min    pg_cron 'hub-ga4-weekly'        → POST hub-ga4-weekly {trigger:'cron'}
T+15-25min hub-ga4-weekly (por brand)      → GA4 Data API
                                              · UPSERT ga4_organic_weekly
                                              · INSERT run_events

T+30min    pg_cron 'hub-cwv-weekly'        → POST hub-cwv-weekly {trigger:'cron'}
T+30-50min hub-cwv-weekly (por brand)      → CrUX API (1ra opcion), PSI API (fallback)
                                              · UPSERT cwv_weekly (LCP/INP/CLS p75 por device)
                                              · INSERT run_events

T+45min    pg_cron 'hub-watchdog' (*/5)    → SELECT ingestion_runs WHERE status='running'
                                              AND started_at < NOW() - INTERVAL '30 min'
                                              → marca runs huerfanos como 'failed'
                                              → INSERT run_events (event_type='watchdog_triggered')

DIA 28 DEL MES (solo una vez al mes)
─────────────────────────────────────────────────────────────────────
T+0min     pg_cron 'hub-ahrefs-monthly'    → POST hub-ahrefs-monthly {trigger:'cron'}
                                              · Verifica AHREFS_CREDIT_BUDGET_MONTH
                                              · Ahrefs API por brand
                                              · UPSERT ahrefs_backlinks_monthly
                                              · UPSERT ahrefs_serp_monthly
                                              · UPSERT ahrefs_toxic_links_monthly
                                              · INSERT run_events

MARTES (T+24h respecto al hub) — evaluacion de oew
─────────────────────────────────────────────────────────────────────
T+24h        pg_cron 'oew-orchestrator'    → POST oew-orchestrator {trigger:'cron'}
(=Martes     (Martes 13:00 UTC = 08:00 CO)
 13:00 UTC)

T+24h+0s     oew-orchestrator              → SELECT seo_data_hub.ingestion_runs
                                              WHERE status='completed' AND period_end >= start_of_week
                                              · Si no hay corridas frescas del hub:
                                                  INSERT run_events (event_type='warning',
                                                  payload={reason:'hub_data_stale'})
                                                  Sale early sin crear analysis_run.
                                              · Si esta todo OK:
                                                  INSERT analysis_runs (status='running')
                                                  INSERT run_events  (event_type='run_started')
                                                  SELECT brand_routing WHERE active=true

T+24h+5s     oew-orchestrator              → POST oew-baseline-builder {run_id}
T+24h+5-60s  oew-baseline-builder          · Por cada (brand, signal, segment):
                                              SELECT historico de seo_data_hub.*_weekly
                                              Calcula median, MAD, mean, std, trend_slope
                                            · UPSERT baselines
                                            · INSERT run_events (event_type='baseline_recomputed')

T+24h+1min   oew-orchestrator              → POST oew-signal-evaluator {run_id}
T+24h+1-5min oew-signal-evaluator          · Itera 13 signal_definitions WHERE enabled=true
                                            · Por (signal x brand x segment):
                                              SELECT metrica actual de hub
                                              SELECT baseline correspondiente
                                              Compara contra median +/- k*MAD
                                              Si fuera de banda:
                                                INSERT signal_events (severity provisional)
                                                INSERT run_events (event_type='anomaly_detected')

T+24h+5min   oew-orchestrator              → POST oew-incident-clusterer {run_id}
T+24h+5-7min oew-incident-clusterer        · SELECT signal_events de este run
                                            · Agrupa por (brand_id, ventana 14d, solape URLs >=50%)
                                            · Por cada cluster:
                                              INSERT incidents (severity definitiva: WATCH/YELLOW/RED)
                                              UPDATE signal_events SET incident_id=...
                                              INSERT run_events (event_type='incident_clustered')

T+24h+7min   oew-orchestrator              · Por cada incident WHERE severity IN ('YELLOW','RED'):
                                              POST oew-detective {incident_id}
T+24h+7-12min oew-detective (por incident) · Idempotencia: skip si ya existe incident_diagnostics
                                            · Build context: signal_events + top URLs/keywords del hub
                                            · LLM (OpenRouter) -> thematic_cluster + raiz hipotetica
                                            · INSERT incident_diagnostics (diagnosis_saved=true)
                                            · INSERT run_events (event_type='diagnosis_saved')

T+24h+12min  oew-orchestrator              · Por cada incident con diagnostico:
                                              POST oew-dispatcher {incident_id}
T+24h+12-13min oew-dispatcher              · Idempotencia: skip si dedupe_key ya enviado
                                            · LLM -> executive_summary
                                            · SELECT brand_routing (slack_channel_id + team_lead_user_id
                                              + severity_threshold)
                                            · Filtra DM al lead solo si severity >= severity_threshold
                                            · UPSERT 1-2 rows en public.notifications_outbox
                                              dedupe_key='oew:<incident_id>:v1:<target>'
                                              source='oew_alert'
                                            · INSERT incident_log (auditoria inmutable)
                                            · INSERT run_events (event_type='alert_enqueued')

T+24h+13min  oew-orchestrator              · UPDATE analysis_runs (status='completed', completed_at=NOW())
                                            · INSERT run_events (event_type='run_completed')

T+24h+13-14min oew-outbox-worker (cron 30s) · UPDATE notifications_outbox SET locked_at, locked_by
                                              WHERE status='pending' AND source='oew_alert'
                                              LIMIT 25
                                            · POST Slack chat.postMessage por cada row
                                            · UPDATE outbox SET status='sent', sent_at=NOW()
                                            · INSERT run_events (event_type='alert_sent')

T+24h+13-14min  #alerts-operaciones (C0B1B3V4ZB5) recibe el mensaje
T+24h+13-14min  team_lead_user_id recibe DM (solo si severity_threshold lo permite)

VIERNES (digest de WATCH acumulados)
─────────────────────────────────────────────────────────────────────
T+96h        pg_cron 'oew-digest-weekly'   → POST oew-digest-weekly {trigger:'cron'}
(=Viernes    (Viernes 23:00 UTC = 18:00 CO)
 23:00 UTC)  · SELECT signal_events de los ultimos 7 dias WHERE incident severity='WATCH'
              · Agrupa por brand, llama al LLM para resumen ejecutivo
              · Encola 1 row por brand en notifications_outbox (dedupe_key='oew:digest:<iso_week>:<brand>')
              · Outbox worker entrega
```

## Tiempos esperados totales

| Hito | Tiempo |
|---|---|
| Cron hub-gsc-weekly dispara | Lunes 06:00 UTC |
| Hub completa ingesta semanal (3 ingestors) | Lunes 06:00 - 06:50 UTC |
| Cron hub-ahrefs-monthly dispara (1x mes) | Dia 28 06:00 UTC |
| Cron oew-orchestrator dispara | Martes 13:00 UTC |
| Orchestrator termina (baseline + eval + cluster + detective + dispatch) | Martes 13:00 - 13:13 UTC |
| Primer mensaje Slack entregado | Martes 13:13 - 13:14 UTC (siguiente tick del outbox-worker) |
| Reintentos transitorios de Slack (2+4+8 min) | hasta Martes 13:30 UTC |
| Digest semanal WATCH | Viernes 23:00 - 23:05 UTC |

**Gap intencional Lunes -> Martes (~24h):** se eligio para garantizar que el hub haya terminado y para amortiguar fallos transitorios del hub. Si el hub falla el Lunes, el watchdog del hub tiene horas para re-correr antes de que oew lo necesite.

## Como identificar la corrida del hub mas reciente

```sql
-- Todas las corridas del hub de esta semana, agrupadas por source
SELECT source, status, period_start, period_end, started_at, completed_at,
       rows_inserted, error_message
FROM seo_data_hub.ingestion_runs
WHERE started_at > date_trunc('week', NOW())
ORDER BY started_at DESC;

-- Confirma que GSC + GA4 + CWV completaron esta semana
SELECT source,
       COUNT(*) FILTER (WHERE status='completed') AS completed,
       COUNT(*) FILTER (WHERE status='failed')    AS failed,
       MAX(completed_at)                          AS last_success
FROM seo_data_hub.ingestion_runs
WHERE source IN ('gsc','ga4','cwv')
  AND started_at > NOW() - INTERVAL '7 days'
GROUP BY source;

-- Ultima corrida mensual de Ahrefs
SELECT id, status, period_start, period_end, started_at, completed_at,
       rows_inserted, error_message
FROM seo_data_hub.ingestion_runs
WHERE source = 'ahrefs'
ORDER BY started_at DESC
LIMIT 3;
```

## Como seguir un run de oew especifico

Una vez disparado el orchestrator, el `run_id` (UUID) se propaga por todo el pipeline. Para ver el estado:

```sql
-- Estado general del run
SELECT id, trigger_source, started_at, completed_at, status,
       brands_total, brands_processed, brands_failed, error_message
FROM organic_early_warning.analysis_runs
WHERE id = '<RUN_ID>';

-- Timeline detallada (orden cronologico de todos los componentes)
SELECT occurred_at, event_source, event_type, brand_id, payload, error_message
FROM organic_early_warning.run_events
WHERE run_id = '<RUN_ID>'
ORDER BY occurred_at ASC;

-- Signal events generadas en este run
SELECT se.id, se.brand_id, sd.code AS signal_code, se.segment_hash,
       se.metric_actual, se.metric_expected, se.deviation_score,
       se.severity, se.incident_id, se.created_at
FROM organic_early_warning.signal_events se
JOIN organic_early_warning.signal_definitions sd ON sd.id = se.signal_id
WHERE se.run_id = '<RUN_ID>'
ORDER BY se.brand_id, se.deviation_score DESC;

-- Incidents clusterizados de este run
SELECT id AS incident_id, brand_id, severity, signal_event_ids,
       url_overlap_pct, window_start, window_end, created_at
FROM organic_early_warning.incidents
WHERE run_id = '<RUN_ID>'
ORDER BY severity DESC, brand_id;

-- Diagnosticos generados por el detective
SELECT id AS diagnostic_id, incident_id, thematic_cluster,
       LENGTH(executive_summary) AS summary_len,
       diagnosis_saved, model_used, created_at
FROM organic_early_warning.incident_diagnostics
WHERE run_id = '<RUN_ID>'
ORDER BY incident_id;

-- Log inmutable de incidents dispatcheados
SELECT incident_id, dispatched_at, slack_channel_id, slack_user_id,
       executive_summary, dedupe_key
FROM organic_early_warning.incident_log
WHERE run_id = '<RUN_ID>'
ORDER BY dispatched_at;

-- Notificaciones encoladas y su estado de entrega (no por run_id directo; via dedupe_key)
SELECT n.target_type, n.channel_id, n.status, n.retry_count,
       n.sent_at, n.error_message, n.next_retry_at, n.dedupe_key
FROM public.notifications_outbox n
WHERE n.source = 'oew_alert'
  AND n.dedupe_key LIKE 'oew:%'
  AND n.created_at > NOW() - INTERVAL '2 hours'
ORDER BY n.created_at DESC;
```

## Como identificar runs recientes de oew

```sql
SELECT id, trigger_source, status, started_at, completed_at,
       (completed_at - started_at) AS duration,
       brands_total, brands_processed, brands_failed
FROM organic_early_warning.analysis_runs
ORDER BY started_at DESC
LIMIT 10;
```

## Lectura de severidad

La severidad final de un incident se decide en `oew-incident-clusterer` segun la combinacion de signal_events que agrupa. Cada signal_event trae una severidad provisional (basada en su propio `deviation_score`), pero el incident la consolida.

| Tier | Condicion exacta de disparo | Destino |
|---|---|---|
| **WATCH** | El incident contiene >=1 signal_event de tipo `leading` (S1-S7) y 0 signal_events `lagging` (S11/S12) confirmando en el mismo brand/segmento dentro de la ventana de 14 dias. | NO se envia Slack inmediato. Se acumula y entra al digest del Viernes. |
| **YELLOW** | El incident contiene >=1 `leading` + >=1 `lagging` confirmando (mismo brand/segmento), **O** contiene 1 `lagging` "soft" (S11 con clicks fuera de banda pero deviation entre 20-30%). | Slack inmediato en `#alerts-operaciones` y DM al `team_lead_user_id` si su `severity_threshold` <= YELLOW. |
| **RED** | El incident contiene >=1 `lagging` "hard" (S11 con clicks -30%+ vs baseline, o S12 con conversiones -30%+), **O** >=3 signal_events correlacionados (mismos URLs/keywords/segmento), **O** >=1 S1 sobre una URL del top-traffic de la brand. | Slack inmediato + mention al `team_lead_user_id` siempre (independiente del threshold). |

**Signals tipo `mixed` (S8/S9/S10):** cuentan como `leading` para gatillar WATCH cuando aparecen solas; cuentan como confirmacion `lagging` para elevar a YELLOW cuando acompanian a otra leading dentro del mismo cluster.

**Query para ver la matriz de severidades del run:**

```sql
SELECT i.severity,
       COUNT(*)                                    AS incidents,
       SUM(array_length(i.signal_event_ids, 1))    AS total_signals,
       array_agg(DISTINCT b.name)                  AS brands
FROM organic_early_warning.incidents i
JOIN organic_early_warning.brand_routing br ON br.brand_id = i.brand_id
JOIN seo_data_hub.brands_registry b         ON b.id = i.brand_id
WHERE i.run_id = '<RUN_ID>'
GROUP BY i.severity
ORDER BY CASE i.severity WHEN 'RED' THEN 1 WHEN 'YELLOW' THEN 2 ELSE 3 END;
```
