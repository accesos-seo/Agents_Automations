# 02 — Checklist de Validación End-to-End

Ejecutar después de:
1. Aplicar las 4 migraciones SQL al proyecto Light_House
2. Cargar los 10 secretos en Vault (ver SECRETS.md)
3. Desplegar las 7 edge functions (`python deploy.py`)
4. Poblar `seo_sentinel.brands` con al menos 1 brand de testing
5. Configurar `brand_team_routing` para esa brand
6. Asegurar Service Account agregada a la propiedad GSC

**Tiempo estimado:** 10-15 min (incluyendo esperas del cron).

---

## Pre-requisitos

- [ ] Acceso SQL Editor: https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/sql/new
- [ ] Acceso al canal Slack del routing (`SELECT slack_channel_id FROM seo_sentinel.brand_team_routing`)
- [ ] DM del bot abierto con el CEO (Slack)

Pegar y ejecutar este SQL para confirmar setup mínimo:

```sql
SELECT
  (SELECT COUNT(*) FROM seo_sentinel.brands WHERE status='active') AS active_brands,
  (SELECT COUNT(*) FROM seo_sentinel.brand_team_routing) AS routings,
  (SELECT COUNT(*) FROM cron.job WHERE jobname LIKE 'seo-sentinel-%') AS cron_jobs,
  (SELECT COUNT(*) FROM seo_sentinel.holiday_calendar) AS holidays;
```

Esperado: `active_brands >= 1`, `routings >= 1`, `cron_jobs = 3`, `holidays >= 5`.

---

## Paso 1 — Tablas y schema correctos

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='seo_sentinel' ORDER BY table_name;
```

- [ ] Devuelve exactamente las 11 tablas: `analysis_runs`, `brand_team_routing`, `brands`, `clicks_anomalies`, `holiday_calendar`, `incident_diagnostics`, `incident_log`, `position_anomalies`, `position_snapshots`, `run_events`, `traffic_daily`

```sql
SELECT table_name FROM information_schema.views
WHERE table_schema='seo_sentinel';
```

- [ ] Devuelve: `v_pipeline_health`, `v_recent_anomalies`

---

## Paso 2 — Cron jobs activos

```sql
SELECT jobname, schedule, command, active FROM cron.job WHERE jobname LIKE 'seo-sentinel-%';
```

- [ ] 3 jobs: `seo-sentinel-watchdog` (`*/2 * * * *`), `seo-sentinel-daily` (`0 13 * * *`), `seo-sentinel-outbox-worker` (`*/30 * * * * *`)
- [ ] Todos con `active = true`

---

## Paso 3 — Edge functions deployed

Desde terminal con `curl` (o desde Supabase Dashboard → Edge Functions):

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/seo-sentinel-orchestrator \
  -H "x-internal-secret: WRONG" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'
```

- [ ] Devuelve `401` (la función está deployed y valida el secret)

Repetir con el secret correcto:

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/seo-sentinel-orchestrator \
  -H "x-internal-secret: <SEO_SENTINEL_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'
```

- [ ] Devuelve `200` con `{"ok":true, "run_id":"...", ...}`. Anotar el `run_id`.

---

## Paso 4 — Pipeline events trace

Inmediatamente después del POST:

```sql
SELECT occurred_at, event_source, event_type, brand_id, payload->>'reason' AS reason,
       payload->>'records_inserted' AS records, payload->>'snapshots_inserted' AS snapshots
FROM seo_sentinel.run_events
WHERE run_id = '<RUN_ID>'
ORDER BY occurred_at;
```

- [ ] Eventos esperados (orden aproximado):
  1. `orchestrator` / `agent_started`
  2. `gsc-ingestor` / `agent_started` (1 por brand activa)
  3. `gsc-ingestor` / `agent_completed`
  4. `ga4-ingestor` / `agent_started` (1 por brand)
  5. `ga4-ingestor` / `agent_completed` (puede tener `skipped:true` si no hay GA4)
  6. `analyst` / `agent_started`
  7. `analyst` / `anomaly_detected` (0+)
  8. `analyst` / `agent_completed`
  9. `orchestrator` / `agent_completed`

- [ ] No hay eventos con `event_type = 'agent_failed'`. Si los hay, leer `error_message` para diagnosticar.

---

## Paso 5 — Data extraída de GSC

```sql
SELECT brand_id, date, clicks, impressions, position, integrity_status
FROM seo_sentinel.traffic_daily
WHERE run_id = '<RUN_ID>'
ORDER BY brand_id, date;
```

- [ ] Hay rows (1 por brand × 3 días si el rango es D-3 a D-1)
- [ ] `integrity_status = 'approved'`
- [ ] `clicks` y `impressions` son números razonables (no todos NULL ni 0)

```sql
SELECT brand_id, date, COUNT(*) AS snapshot_count
FROM seo_sentinel.position_snapshots
WHERE run_id = '<RUN_ID>'
GROUP BY brand_id, date
ORDER BY brand_id, date;
```

- [ ] Snapshot count > 0 (típicamente 100-5000 por brand+date dependiendo del tamaño del sitio)

---

## Paso 6 — Anomalías detectadas (si las hay)

Para que aparezcan anomalías necesitás **al menos 8 días de datos previos** (para WoW). Si el sistema es nuevo, este paso puede estar vacío hasta la segunda semana.

```sql
SELECT 'clicks' AS kind, brand_id, anomaly_date, wow_drop_pct AS metric, severity, false_positive
FROM seo_sentinel.clicks_anomalies WHERE run_id = '<RUN_ID>'
UNION ALL
SELECT 'position', brand_id, anomaly_date,
       position_delta::TEXT, severity, false
FROM seo_sentinel.position_anomalies WHERE run_id = '<RUN_ID>'
ORDER BY metric DESC;
```

- [ ] Si hay anomalías: cada una tiene `severity` válido (RED/YELLOW)
- [ ] Si no hay: confirmá ejecutando `SELECT * FROM seo_sentinel.v_recent_anomalies LIMIT 5;` para ver si hay de runs anteriores.

---

## Paso 7 — Incidents diagnosticados

```sql
SELECT id AS incident_id, brand_id, anomaly_kind, anomaly_date,
       thematic_cluster, LENGTH(executive_summary) AS summary_chars, dispatch_status
FROM seo_sentinel.incident_diagnostics
WHERE run_id = '<RUN_ID>'
ORDER BY created_at DESC;
```

- [ ] Si hubo anomalías: 1 incident_diagnostics por cada (brand, anomaly_date, anomaly_kind)
- [ ] `thematic_cluster` no es NULL (LLM funcionó). Puede ser "clúster no identificado" si OpenRouter falló (revisar `run_events.event_type='warning'`)
- [ ] `executive_summary` con `LENGTH > 50` (LLM generó algo)
- [ ] `dispatch_status = 'pending'`

---

## Paso 8 — Outbox encolado

```sql
SELECT target_type, channel_id, status, retry_count, sent_at, error_message
FROM public.notifications_outbox
WHERE source = 'seo_sentinel_alert'
  AND created_at > NOW() - INTERVAL '15 min'
ORDER BY created_at DESC;
```

- [ ] Por cada incident: al menos 2 rows (CEO_DM + brand_channel)
- [ ] Status inicial: `pending`, después del próximo tick del worker (cada 30s): `sent`

Esperar hasta 1 minuto, re-ejecutar. Esperado: `status='sent'`, `sent_at` poblado, `error_message=NULL`.

Si `status='failed'`: leer `error_message`. Errores típicos:
- `not_in_channel` → invitar al bot al canal con `/invite @seo-sentinel`
- `channel_not_found` → channel_id incorrecto
- `invalid_auth` → SLACK_BOT_TOKEN inválido

---

## Paso 9 — Slack recibido (3 destinatarios)

- [ ] **DM al CEO**: abrir Slack, buscar el bot `seo-sentinel`, debería haber 1 mensaje por incident del run con header `🚨 ALERTA ROJA — <brand>` o `⚠️ ALERTA AMARILLA — <brand>`
- [ ] **Canal `#alerts-operaciones`** (`C0B1B3V4ZB5`): mismo mensaje visible
- [ ] **DM al especialista** (`brand_team_routing.team_lead_user_id`): mismo mensaje recibido como DM por el lead de la marca
- [ ] El bloque "Resumen" tiene 3 oraciones en español
- [ ] El bloque "context" tiene `Incidente: <UUID>` + timestamp ISO

Si la marca NO tiene `team_lead_user_id` configurado, solo se reciben 2 mensajes (CEO DM + canal) — eso es esperado.

---

## Paso 10 — Incident log persistido

```sql
SELECT incident_id, brand_name, anomaly_kind, alert_sent_to, final_status,
       time_to_detect_minutes, logged_at
FROM seo_sentinel.incident_log
WHERE logged_at > NOW() - INTERVAL '15 min'
ORDER BY logged_at DESC;
```

- [ ] 1 row por incident del run
- [ ] `alert_sent_to` es un array con 2 entries (CEO_ID + channel_ID)
- [ ] `final_status = 'alert_sent'`
- [ ] `time_to_detect_minutes` razonable (típicamente 1-3 min entre cron y entrega)

---

## Paso 11 — Pipeline health

```sql
SELECT * FROM seo_sentinel.v_pipeline_health;
```

- [ ] `runs_stuck = 0`
- [ ] `diagnostics_pending_dispatch = 0`
- [ ] `outbox_stale_locks = 0`
- [ ] `alerts_sent_24h >= 0` (mayor si hubo anomalías)

---

## Definition of Done

- ✅ Los 11 pasos pasaron sin errores
- ✅ El CEO recibió DMs en Slack
- ✅ Los canales recibieron mensajes
- ✅ `v_pipeline_health` está en ceros

Si algún paso falla → ver `handoff/03-runbook.md` para diagnóstico.
