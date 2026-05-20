# Arquitectura — `seo_sentinel`

> Sistema agéntico de detección de pérdida de tráfico y posiciones SEO via Google Search Console. Schema `seo_sentinel` en el proyecto Supabase `Light_House` (project ref `stjugsrkrweakvzmizpq`).

## Principios

1. **Event-driven**: nada en polling; todo se dispara por `pg_cron` (08:00 CO daily) o llamada HTTP entre agentes.
2. **Orchestrator-worker**: el orchestrator clasifica y despacha; los agentes ejecutan lógica.
3. **Fail-safe**: cada error se registra en `run_events` y notifica al watchdog; ningún fallo se silencia.
4. **Trazabilidad total**: cada ejecución tiene un `run_id` (UUID) que se propaga por todo el pipeline.
5. **Idempotencia**: `ON CONFLICT` en todos los UPSERT, `dedupe_key` en el outbox, `force` flag en re-ejecuciones.
6. **Schema dedicado**: NUNCA en `public`. Todas las tablas operativas viven en `seo_sentinel.*`. Solo `public.notifications_outbox` se reusa (compartida con otros sistemas).

## Pipeline

```
pg_cron (08:00 CO = 13:00 UTC daily)
    │
    ▼ POST + header x-internal-secret
[seo-sentinel-orchestrator]
    │  · INSERT en seo_sentinel.analysis_runs (asigna run_id UUID)
    │  · Lee brands WHERE status='active'
    │  · Para cada brand, POST en paralelo a seo-sentinel-gsc-ingestor
    │  · Polling de run_events hasta que todos los ingestors completen (o timeout 5min)
    │  · POST seo-sentinel-analyst con {run_id}
    │
    ├─▶ [seo-sentinel-gsc-ingestor]  (1 por brand)
    │     · Auth: Service Account (GSC_SERVICE_ACCOUNT_JSON)
    │     · Query 1 (agregada): dimensions=['date'], rango D-3 a D-1
    │     · Query 2 (granular): dimensions=['date','page','query'], rango D-3 a D-1, rowLimit=25000
    │     · Paginación: startRow += 25000 hasta totalRows < 25000
    │     · Rate limit: respeta 429 con backoff exponencial (1s/2s/4s, max 3 retries)
    │     · UPSERT batch en seo_sentinel.traffic_daily (1 row por date)
    │     · UPSERT batch en seo_sentinel.position_snapshots (1 row por date+page+query)
    │     · emit event 'agent_completed' con counts
    │
    ├─▶ [seo-sentinel-ga4-ingestor]  (best-effort, paralelo con gsc-ingestor)
    │     · Si la brand no tiene ga4_property_id, skip silencioso (emit warning event)
    │     · GA4 Data API: sessions, users, conversions por organic
    │     · UPDATE traffic_daily SET ga4_* WHERE run_id+brand+date matches
    │     · Si falla, emit 'agent_failed' pero NO aborta el pipeline (best-effort)
    │
    ▼
[seo-sentinel-analyst]
    │  Para cada brand del run:
    │    A) Clicks WoW:
    │       · Sumar clicks D-1 vs D-8 (mismo día semana atrás)
    │       · WoW% = (current - previous) / previous * 100
    │       · Si |WoW%| >= alert_threshold_clicks_pct y WoW < 0:
    │           - Aplicar false-positive filter (holiday_calendar, weekend, seasonality)
    │           - Si genuino: INSERT clicks_anomalies con anomaly_type clasificado
    │       · Classification de anomaly_type:
    │           - tracking_issue: GA4 cae pero GSC no (delta < threshold/2)
    │           - algorithm_update: si fp_filter detecta patrón
    │           - seo_drop: por defecto
    │    B) Position WoW por (url, query):
    │       · LEFT JOIN position_snapshots actual vs hace 7 días
    │       · position_delta = current_position - prev_position (positivo = empeoró)
    │       · Severity:
    │           - RED si position_delta >= 20 O lost_top10=true con position_delta >= 10
    │           - YELLOW si position_delta >= alert_threshold_position_delta (default 10)
    │       · INSERT position_anomalies con prev/current/delta/lost_top10
    │
    │  Para cada anomaly insertada:
    │    · emit event 'anomaly_detected'
    │    · POST seo-sentinel-detective con {anomaly_id, anomaly_kind, brand_id}
    │
    ▼
[seo-sentinel-detective]   (1 por anomaly)
    │  Idempotencia: si existe incident_diagnostics para (brand_id, anomaly_date, anomaly_kind), skip.
    │
    │  Si anomaly_kind = 'clicks_drop':
    │    · Lee position_snapshots del brand+date para identificar top URLs por clicks_lost
    │    · Top 5 URLs con sus top 5 keywords perdidas (calcula clicks_lost por keyword)
    │  Si anomaly_kind = 'position_drop':
    │    · Lee position_anomalies del brand+date para top 10 keywords con position_delta más alto
    │    · Agrupa por URL
    │
    │  LLM (OpenRouter Claude Sonnet) → thematic_cluster (max 5 palabras)
    │  INSERT seo_sentinel.incident_diagnostics
    │  POST seo-sentinel-dispatcher con {incident_id}
    │
    ▼
[seo-sentinel-dispatcher]
    │  Idempotencia: si existe incident_log con incident_id, skip a menos que force=true
    │  
    │  LLM (OpenRouter Claude Sonnet) → executive_summary (3 oraciones, tono técnico, sin emojis)
    │  UPDATE incident_diagnostics SET executive_summary
    │
    │  Severity calc:
    │    · RED si dropPct >= 30 OR (position_drop con severity='RED')
    │    · YELLOW caso contrario
    │
    │  Build Block Kit (header + section fields + section summary + context)
    │
    │  Lookup destinatarios:
    │    · CEO: Deno.env.get("CEO_SLACK_USER_ID") — DM en TODA alerta
    │    · Brand team: SELECT FROM brand_team_routing WHERE brand_id
    │    · Fallback: Deno.env.get("SLACK_FALLBACK_CHANNEL") si no hay routing
    │
    │  INSERT en public.notifications_outbox una row por target:
    │    · {source: 'seo_sentinel_alert', target_type: 'slack_dm', channel_id: CEO_ID, payload: blocks, dedupe_key: 'seo_sentinel:<incident_id>:v1:ceo_dm'}
    │    · {source: 'seo_sentinel_alert', target_type: 'slack_channel', channel_id: brand_channel, payload: blocks, dedupe_key: 'seo_sentinel:<incident_id>:v1:channel:<channel_id>'}
    │    · (Si team_lead_user_id existe, mention en el bloque "section" con <@USER_ID>)
    │  ON CONFLICT (dedupe_key) DO NOTHING
    │
    │  emit event 'alert_enqueued'
    │
    ▼  (pg_cron cada 30 segundos)
[seo-sentinel-outbox-worker]
    │  Claim pessimista:
    │    UPDATE public.notifications_outbox
    │    SET locked_at=NOW(), locked_by=<worker_uuid>
    │    WHERE source='seo_sentinel_alert' AND status='pending'
    │      AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '5 min')
    │      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    │    RETURNING * LIMIT 10
    │
    │  Para cada row:
    │    · POST a https://slack.com/api/chat.postMessage con Authorization Bearer SLACK_BOT_TOKEN
    │    · Si ok: UPDATE status='sent', sent_at=NOW(), locked_at=NULL
    │             INSERT en seo_sentinel.incident_log (si no existe)
    │             emit event 'alert_sent'
    │    · Si error:
    │       - retry_count < 3: UPDATE retry_count++, next_retry_at = NOW() + 2^retry_count minutos, locked_at=NULL
    │       - retry_count >= 3: UPDATE status='failed', error_message
    │                            emit event 'agent_failed'
```

## Watchdog `pg_cron` cada 2 min

Función SQL `seo_sentinel.watchdog_pipeline()`:

1. **Runs huérfanos**: `analysis_runs` con `status='running'` y `started_at < NOW() - 30 min`
   → UPDATE status='failed', error_message='watchdog: timeout'
   → POST SLACK_ADMIN_CHANNEL con resumen
2. **Diagnostics no despachados**: `incident_diagnostics` con `diagnosis_saved=true` sin entry en `incident_log` últimas 24h
   → POST dispatcher con `{incident_id, force:true}`
3. **Outbox stale locks**: `notifications_outbox` con `status='pending'` y `locked_at < NOW() - 5 min`
   → UPDATE locked_at=NULL, locked_by=NULL (libera para reclaim)

## Contratos HTTP entre agentes

Todas las edge functions requieren:
- Header `x-internal-secret: <SEO_SENTINEL_INTERNAL_SECRET>` (rechazo 401 si falta)
- `Content-Type: application/json`

### Inputs por función

| Función | Input JSON |
|---|---|
| seo-sentinel-orchestrator | `{trigger:'cron'\|'manual'\|'watchdog_retry', brand_id?:string}` |
| seo-sentinel-gsc-ingestor | `{run_id:string, brand_id:string, date_from:string, date_to:string}` |
| seo-sentinel-ga4-ingestor | `{run_id:string, brand_id:string, date_from:string, date_to:string}` |
| seo-sentinel-analyst | `{run_id:string}` |
| seo-sentinel-detective | `{run_id:string, brand_id:string, anomaly_kind:'clicks_drop'\|'position_drop', anomaly_id:string}` |
| seo-sentinel-dispatcher | `{incident_id:string, force?:boolean}` |
| seo-sentinel-outbox-worker | `{}` (called by cron) |

### Outputs

Todas devuelven `{ok:boolean, ...detalles}`. Status HTTP:
- 200: ok
- 400: input inválido
- 401: x-internal-secret incorrecto
- 404: recurso (run/brand/incident) no encontrado
- 409: idempotencia (ya procesado)
- 500: error interno (siempre se loguea en run_events con event_type='agent_failed')

## Schema `seo_sentinel` — tablas

Ver `01-database-migrations/001_seo_sentinel_schema.sql` para el DDL exacto. Resumen:

| Tabla | PK | Propósito | Notas |
|---|---|---|---|
| `brands` | id (uuid) | Catálogo marcas | `status`, `gsc_property_url`, `ga4_property_id`, `alert_threshold_clicks_pct` (default 20), `alert_threshold_position_delta` (default 10), `seasonality_type` |
| `brand_team_routing` | id | Slack routing por marca | `brand_id` FK, `slack_channel_id`, `team_lead_user_id`, `fallback_channel_id` |
| `holiday_calendar` | id | Festivos | `date`, `country_code`, `expected_traffic_reduction_pct` |
| `analysis_runs` | id (run_id) | 1 row por ejecución | `trigger_source`, `started_at`, `completed_at`, `status`, `brands_total/processed/failed`, `error_message` |
| `run_events` | id | Append-only trace | `run_id` FK, `brand_id`, `event_source`, `event_type`, `occurred_at`, `payload` (jsonb), `error_message` |
| `traffic_daily` | id | Agregado date-level | UNIQUE (`brand_id`, `date`); columnas GSC + GA4 + estado pipeline |
| `position_snapshots` | id | Granular date+page+query | UNIQUE (`brand_id`,`date`,`url`,`query`); `position`, `clicks`, `impressions`, `ctr` |
| `clicks_anomalies` | id | Detectadas | `wow_drop_pct`, `anomaly_type`, `false_positive`, `severity` |
| `position_anomalies` | id | Detectadas | `url`, `query`, `prev_position`, `current_position`, `position_delta`, `lost_top10`, `severity` |
| `incident_diagnostics` | id (incident_id) | LLM-enriched | `anomaly_kind`, `top_affected_urls` (jsonb), `top_lost_keywords` (jsonb), `thematic_cluster`, `executive_summary`, `diagnosis_saved`, `dispatch_status` |
| `incident_log` | id | Log inmutable | UNIQUE `incident_id`, `alert_sent_to` (text[]), `time_to_detect_minutes`, `final_status`, `resolved_at` |

Vistas (en `002_seo_sentinel_views.sql`):
- `v_pipeline_health`: counts de huérfanos, pendientes, enviados 24h
- `v_recent_anomalies`: snapshot últimas 7 días para debugging

## Stack de runtime

- **Edge functions**: Deno (runtime de Supabase Edge Functions), TypeScript estricto
- **Imports**: `https://deno.land/std@0.224.0/http/server.ts` (serve), `https://esm.sh/@supabase/supabase-js@2` (createClient)
- **Service Account**: GSC y GA4 con la misma SA (o distintas si así lo decide el usuario en SECRETS.md)
- **LLM**: OpenRouter (`https://openrouter.ai/api/v1/chat/completions`), modelo default `anthropic/claude-sonnet-4`
- **Slack**: chat.postMessage con Bot Token (`xoxb-...`), scopes `chat:write` + `chat:write.public`
- **Supabase client**: service role key (acceso total). Cliente singleton en `_shared/supabase.ts`

## Convenciones de código

- TypeScript estricto, sin `any` salvo cuando interfaceamos con APIs externas
- Funciones puras donde sea posible
- Errores se lanzan con `Error` (string como mensaje), se capturan en el handler principal y se logean en `run_events`
- Logs a `console.log` para Supabase logs (visibles en Dashboard)
- Cero magic numbers: thresholds vienen de `brands` table o defaults explícitos en constantes
- Comentarios solo donde hay un WHY no obvio (no documentar lo evidente)
