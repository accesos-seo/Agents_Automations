# 01 — Contratos de Edge Functions

Documento de referencia con el contrato HTTP exacto de cada edge function de seo_sentinel. Todas viven bajo:

```
https://stjugsrkrweakvzmizpq.functions.supabase.co/<nombre>
```

Y **todas** requieren el header `x-internal-secret: <SEO_SENTINEL_INTERNAL_SECRET>`. Sin él, devuelven 401.

## Tabla resumen

| Edge function | Quién invoca | Frecuencia | Bloqueante? |
|---|---|---|---|
| `seo-sentinel-orchestrator` | pg_cron daily / manual | 1/día (o on-demand) | Sí (espera ingesta + análisis) |
| `seo-sentinel-gsc-ingestor` | orchestrator (paralelo) | 1 por brand/run | Sí (orchestrator awaits) |
| `seo-sentinel-ga4-ingestor` | orchestrator (fire&forget) | 1 por brand/run | No (best-effort) |
| `seo-sentinel-analyst` | orchestrator | 1 por run | Sí |
| `seo-sentinel-detective` | analyst (fan-out) | 1 por anomaly | Sí (analyst awaits) |
| `seo-sentinel-dispatcher` | detective / watchdog retry | 1 por incident | Sí (detective awaits) |
| `seo-sentinel-outbox-worker` | pg_cron cada 30s | Continuo | N/A (cron) |

---

## 1. `seo-sentinel-orchestrator`

Entry point del pipeline. Disparado por `pg_cron` o manualmente.

### Request

```http
POST /seo-sentinel-orchestrator
Headers:
  x-internal-secret: <SECRET>
  Content-Type: application/json
Body:
  {
    "trigger": "cron" | "manual" | "watchdog_retry",
    "brand_id": "<UUID opcional>"   // si presente, procesa solo esa brand
  }
```

### Response 200

```json
{
  "ok": true,
  "run_id": "uuid",
  "brands_processed": 5,
  "brands_failed": 0
}
```

### Errors

| Status | Mensaje | Causa |
|---|---|---|
| 400 | `missing_trigger` | El body no incluye `trigger` |
| 400 | `invalid_json` | Body no es JSON válido |
| 500 | `analyst_failed: ...` | El analyst lanzó error (ver run_events) |
| 500 | `run_insert_failed: ...` | No se pudo crear la fila en analysis_runs (BD caída?) |

---

## 2. `seo-sentinel-gsc-ingestor`

Extrae datos de GSC para 1 brand y los persiste en `traffic_daily` + `position_snapshots`.

### Request

```http
POST /seo-sentinel-gsc-ingestor
Body:
  {
    "run_id": "uuid",
    "brand_id": "uuid",
    "date_from": "2026-05-17",     // típicamente D-3
    "date_to": "2026-05-19"        // típicamente D-1
  }
```

### Response 200

```json
{
  "ok": true,
  "run_id": "uuid",
  "brand_id": "uuid",
  "records_inserted": 3,            // 3 días en traffic_daily
  "snapshots_inserted": 12450       // 3 días × N páginas × N queries
}
```

### Errors

| Status | Mensaje | Causa |
|---|---|---|
| 400 | `missing_fields` | Falta run_id / brand_id / date_from / date_to |
| 404 | `brand_not_found` | El brand_id no existe en `seo_sentinel.brands` |
| 404 | `no_gsc_property_url` | La brand no tiene `gsc_property_url` configurado |
| 500 | `traffic_daily upsert failed: ...` | Error de schema (columna desconocida, FK violation) |
| 500 | `GSC API ...` | Rate limit, auth, o GSC caído |

### Comportamiento de paginación

GSC devuelve max 25000 filas por query. El ingestor pagina con `startRow += 25000` hasta `totalRows < 25000`. En la práctica:
- Sitios pequeños (~100 URLs): 1 página de cada query (agregada + granular)
- Sitios grandes (5000+ URLs): hasta 10+ páginas en query granular

Rate-limit GSC: 1200 query/min por usuario, 30000/día por property. El módulo `gsc-api.ts` respeta `Retry-After` y hace retry exponencial 1s/2s/4s.

---

## 3. `seo-sentinel-ga4-ingestor`

Best-effort: actualiza `traffic_daily` con métricas de GA4 (sessions, users, conversions). Si falla, NO aborta el pipeline.

### Request

Idéntico al gsc-ingestor.

### Response 200 (success)

```json
{
  "ok": true,
  "run_id": "uuid",
  "brand_id": "uuid",
  "records_received": 3,
  "rows_updated": 3
}
```

### Response 200 (skipped)

```json
{
  "ok": true,
  "skipped": true,
  "reason": "no_ga4_property"        // o "brand_lookup_failed"
}
```

### Response 200 (best-effort failed)

```json
{
  "ok": true,
  "best_effort_failed": true,
  "error": "..."
}
```

NUNCA retorna 500 — siempre 200 para no abortar el pipeline.

---

## 4. `seo-sentinel-analyst`

Calcula anomalías de clicks (WoW) y posiciones por (url, query) para un run.

### Request

```http
POST /seo-sentinel-analyst
Body:
  { "run_id": "uuid" }
```

### Response 200

```json
{
  "ok": true,
  "anomalies_detected": 7,            // suma de clicks + position
  "clicks_anomalies": 2,
  "position_anomalies": 5,
  "processed": 15                     // brand+date pairs analizados
}
```

### Errors

| Status | Mensaje | Causa |
|---|---|---|
| 400 | `run_id is required` | Body sin run_id |
| 500 | `traffic_daily fetch: ...` | Error leyendo data del run |

Si una brand individual falla, se loguea en run_events y se continúa con las demás. El analyst NUNCA aborta por una sola brand.

---

## 5. `seo-sentinel-detective`

Enriquece una anomaly con top URLs/keywords + thematic_cluster (LLM) y persiste como `incident_diagnostics`. Llama al dispatcher al terminar.

### Request

```http
POST /seo-sentinel-detective
Body:
  {
    "run_id": "uuid",
    "brand_id": "uuid",
    "anomaly_kind": "clicks_drop" | "position_drop",
    "anomaly_id": "uuid"              // ID en clicks_anomalies o position_anomalies
  }
```

### Response 200

```json
{
  "ok": true,
  "incident_id": "uuid",
  "diagnosis_saved": true,
  "thematic_cluster": "servicios odontológicos",
  "top_urls_count": 5,
  "cluster_drop_total_clicks": 890
}
```

### Response 409 (idempotente)

```json
{
  "ok": true,
  "status": "already_diagnosed",
  "incident_id": "uuid"
}
```

### Errors

| Status | Mensaje | Causa |
|---|---|---|
| 400 | `run_id, brand_id, anomaly_kind, anomaly_id required` | Body incompleto |
| 400 | `invalid anomaly_kind` | No es 'clicks_drop' ni 'position_drop' |
| 404 | `clicks anomaly not found` / `position anomaly not found` | anomaly_id no existe |
| 500 | `incident_diagnostics insert failed: ...` | Error de schema o LLM mal configurado |

---

## 6. `seo-sentinel-dispatcher`

Genera executive_summary (LLM) y encola alertas en `notifications_outbox` para CEO + canal de marca.

### Request

```http
POST /seo-sentinel-dispatcher
Body:
  {
    "incident_id": "uuid",
    "force": false                    // si true, re-encola aunque ya esté en incident_log
  }
```

### Response 200

```json
{
  "ok": true,
  "incident_id": "uuid",
  "enqueued_count": 3,
  "severity": "RED",
  "channel_id": "C0B1B3V4ZB5",
  "ceo_user_id": "U05CEO",
  "specialist_user_id": "U05LEAD"
}
```

`enqueued_count` será **2** si la marca no tiene `team_lead_user_id` en `brand_team_routing` (solo CEO DM + canal). Será **3** si tiene especialista configurado (CEO DM + canal + DM al especialista).

### Response 409 (idempotente)

```json
{
  "ok": true,
  "status": "already_dispatched",
  "incident_id": "uuid"
}
```

### Errors

| Status | Mensaje | Causa |
|---|---|---|
| 400 | `missing_incident_id` | Body sin incident_id |
| 404 | `incident_not_found` | incident_id no existe en incident_diagnostics |
| 500 | `CEO_SLACK_USER_ID not configured` | Vault entry faltante |
| 500 | `no brand channel and SLACK_FALLBACK_CHANNEL not configured` | Brand sin routing y sin fallback env var |

El dispatcher genera el `executive_summary` con LLM. Si OpenRouter falla, usa un fallback degradado y emite warning event — la alerta SÍ se envía.

---

## 7. `seo-sentinel-outbox-worker`

Disparado por pg_cron cada 30s. Procesa hasta 10 rows pending del outbox.

### Request

```http
POST /seo-sentinel-outbox-worker
Body: { "trigger": "cron" }           // body opcional, ignorado
```

### Response 200

```json
{
  "ok": true,
  "worker_id": "uuid",
  "processed": 4,
  "sent": 3,
  "retried": 1,
  "failed": 0,
  "errored": 0
}
```

| Outcome | Significa |
|---|---|
| `sent` | Slack respondió ok, marcado status='sent', insertado incident_log |
| `retried` | Slack error, próximo intento programado (next_retry_at = NOW() + 2^n min) |
| `failed` | retry_count alcanzó 3, marcado status='failed' permanentemente |
| `errored` | Promise.allSettled rejected (red caída, lock liberado para próximo tick) |

### Errors

| Status | Mensaje | Causa |
|---|---|---|
| 401 | `Unauthorized` | x-internal-secret incorrecto |
| 500 | `claim failed: ...` | UPDATE/SELECT del outbox falló (BD caída?) |

---

## Diagrama de invocaciones

```
pg_cron daily          orchestrator         gsc/ga4 ingestors       analyst
     │                       │                       │                  │
     │── POST (cron) ───────▶│                       │                  │
     │                       │── POST (parallel) ───▶│                  │
     │                       │   (await GSC, FF GA4) │── GSC API ──▶    │
     │                       │                       │── UPSERT BD ──▶  │
     │                       │   200 ok              │                  │
     │                       │◀──────────────────────│                  │
     │                       │── POST {run_id} ──────────────────────▶  │
     │                       │                                          │── per anomaly:
     │                       │                                          │   POST detective
     │                       │   200 ok                                 │
     │                       │◀─────────────────────────────────────────│
     │   200 ok              │
     ◀───────────────────────│
                                                                 detective ──┐
                                                                             │── LLM
                                                                             │── INSERT incident_diagnostics
                                                                             │── POST dispatcher
                                                                             ▼
                                                                       dispatcher ──┐
                                                                                    │── LLM (summary)
                                                                                    │── UPSERT notifications_outbox
                                                                                    │── 200 ok

(pg_cron */30s ─▶ outbox-worker ─▶ Slack chat.postMessage)
```

## Pruebas con curl

```bash
# Trigger manual del orchestrator:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/seo-sentinel-orchestrator \
  -H "x-internal-secret: <SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'

# Trigger manual de gsc-ingestor para 1 brand específica:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/seo-sentinel-gsc-ingestor \
  -H "x-internal-secret: <SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"run_id":"<UUID>","brand_id":"<UUID>","date_from":"2026-05-17","date_to":"2026-05-19"}'

# Re-dispatch forzado de un incident:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/seo-sentinel-dispatcher \
  -H "x-internal-secret: <SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"incident_id":"<UUID>","force":true}'
```

```powershell
# PowerShell equivalente del orchestrator:
curl.exe -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/seo-sentinel-orchestrator `
  -H "x-internal-secret: <SECRET>" `
  -H "Content-Type: application/json" `
  -d "{\"trigger\":\"manual\"}"
```
