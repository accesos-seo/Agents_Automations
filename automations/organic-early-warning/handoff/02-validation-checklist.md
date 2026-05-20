# 02 — Checklist de Validación End-to-End

Validación post-deploy del sistema completo (hub + oew). Ejecutar **después** de:

1. Aplicar las 4 migraciones del hub (`00-data-hub/01-migrations/`)
2. Aplicar las 5 migraciones del oew (`01-organic-early-warning/01-migrations/`)
3. Cargar los 12 secretos en Vault (ver `SECRETS.md`)
4. Desplegar las 12 edge functions (`python deploy.py`)
5. Poblar `seo_data_hub.brands_registry` con al menos 1 brand activa
6. Poblar `organic_early_warning.brand_routing` para esa brand
7. Confirmar que la Service Account está agregada a las propiedades GSC/GA4 de la brand

**Tiempo estimado:** 25-40 min (incluye esperas de baseline + propagación de digest).

**Convenciones:** ver `~/.claude/conventions/agentic-automations.md`. Toda la validación se hace contra el proyecto Light_House (`stjugsrkrweakvzmizpq`). SQL se puede correr vía Supabase MCP (`mcp__2b07c2b1...__execute_sql`) o desde el SQL Editor del dashboard.

---

## Pre-requisitos (chequeo inicial)

- [ ] Acceso SQL: https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/sql/new
- [ ] Acceso al canal `#alerts-operaciones` (`C0B1B3V4ZB5`) con el bot **Orbit SeoLab** (`D0A4NMACLPP`) invitado
- [ ] Slack User ID del especialista cargado en `organic_early_warning.brand_routing.team_lead_user_id` para al menos 1 brand
- [ ] `OEW_INTERNAL_SECRET` y `HUB_INTERNAL_SECRET` accesibles para los curl manuales

### Pre-chequeo SQL consolidado

```sql
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='seo_data_hub')         AS hub_tables,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='organic_early_warning') AS oew_tables,
  (SELECT COUNT(*) FROM vault.decrypted_secrets
     WHERE name IN (
       'SUPABASE_FUNCTIONS_URL','HUB_INTERNAL_SECRET','OEW_INTERNAL_SECRET',
       'GSC_SERVICE_ACCOUNT_JSON','PSI_API_KEY','AHREFS_API_TOKEN',
       'AHREFS_CREDIT_BUDGET_MONTH','OPENROUTER_API_KEY','OEW_MODEL',
       'SLACK_BOT_TOKEN','SLACK_FALLBACK_CHANNEL','SLACK_ADMIN_CHANNEL'
     )) AS vault_secrets,
  (SELECT COUNT(*) FROM cron.job WHERE jobname LIKE 'hub-%' OR jobname LIKE 'oew-%') AS cron_jobs,
  (SELECT COUNT(*) FROM seo_data_hub.brands_registry WHERE status='active')          AS active_brands,
  (SELECT COUNT(*) FROM organic_early_warning.brand_routing)                          AS routings,
  (SELECT COUNT(*) FROM organic_early_warning.signal_definitions WHERE enabled=true)  AS enabled_signals;
```

Esperado mínimo:

| Métrica | Valor |
|---|---|
| `hub_tables` | `>= 12` (9 tablas raw + brands_registry + ingestion_runs + run_events) |
| `oew_tables` | `>= 9` (brand_routing, signal_definitions, baselines, signal_events, incidents, incident_diagnostics, incident_log, analysis_runs, run_events) |
| `vault_secrets` | `12` |
| `cron_jobs` | `>= 5` (hub-gsc-weekly, hub-ga4-weekly, hub-cwv-weekly, hub-ahrefs-monthly, hub-watchdog, oew-orchestrator, oew-digest-weekly, oew-watchdog, oew-outbox-worker) |
| `active_brands` | `>= 1` |
| `routings` | `>= 1` |
| `enabled_signals` | `13` |

Si cualquiera está por debajo → completar el paso correspondiente del `04-task-list-tecnico.md` antes de continuar.

---

## Paso 1 — Forzar `hub-gsc-weekly` para una brand

Tomar un `brand_id` (UUID) de `seo_data_hub.brands_registry` y un `iso_week` de prueba (la semana actual o la previa, formato `YYYY-WW`, ej. `2026-20`).

```sql
SELECT id AS brand_id, name FROM seo_data_hub.brands_registry WHERE status='active' LIMIT 1;
```

Luego, forzar manual del ingestor:

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-gsc-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","brand_id":"<BRAND_UUID>","iso_week":"2026-20","force":true}'
```

- [ ] Devuelve `200` con `{"ok":true,"ingestion_run_id":"...","rows_inserted":N}`
- [ ] Anotar el `ingestion_run_id` para los siguientes pasos

**Si falla:**

| Síntoma | Acción |
|---|---|
| `401` | `HUB_INTERNAL_SECRET` mal cargado o no coincide entre Vault y el header |
| `500 GSC 403` | Service Account NO está agregada como Restricted user en la propiedad GSC. Ir a Search Console → Settings → Users del cliente y agregar el `client_email` de la SA |
| `500 invalid_grant` | JSON de Service Account corrupto o expirado en Vault — re-pegar contenido completo |
| `500 quota exceeded` | Esperar 60s y reintentar; ver `~/.claude/conventions/agentic-automations.md` §13 (límites API) |

---

## Paso 2 — Verificar `ingestion_runs` row completada

```sql
SELECT id, source, brand_id, iso_week, status, rows_inserted, started_at, completed_at, error_message
FROM seo_data_hub.ingestion_runs
WHERE id = '<INGESTION_RUN_ID>';
```

- [ ] `status = 'completed'`
- [ ] `rows_inserted > 0`
- [ ] `error_message IS NULL`
- [ ] `completed_at` poblado (delta vs `started_at` razonable, típicamente < 60s)

**Si falla:**

- `status='failed'` → leer `error_message`. Causas comunes: cuota API agotada, propiedad mal escrita en `brands_registry.gsc_property`, ventana iso_week en el futuro
- `status='running'` después de 5+ min → el watchdog (`*/5 * * * *`) lo va a marcar `failed`. Esperar 5 min y revisar de nuevo

---

## Paso 3 — Verificar rows en `gsc_search_analytics_weekly`

```sql
SELECT brand_id, iso_week, dimensions_hash,
       SUM(clicks) AS total_clicks, SUM(impressions) AS total_impr,
       COUNT(*) AS row_count
FROM seo_data_hub.gsc_search_analytics_weekly
WHERE brand_id = '<BRAND_UUID>' AND iso_week = '2026-20'
GROUP BY brand_id, iso_week, dimensions_hash
ORDER BY total_clicks DESC
LIMIT 10;
```

- [ ] Al menos 1 row (típicamente decenas o cientos según el tamaño del sitio)
- [ ] `total_clicks` y `total_impr` son números no-nulos y no-cero (a menos que la brand realmente no tenga tráfico)
- [ ] `dimensions_hash` distintos por combinación (query × page × device × country)

**Si vacío:**

- Confirmar que la ventana `iso_week` tiene data en GSC (GSC tiene delay de 2-3 días → semana actual puede estar incompleta)
- Re-correr con `iso_week` de hace 2 semanas

---

## Paso 4 — Repetir Pasos 1-3 para GA4 y CWV

### GA4

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-ga4-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","brand_id":"<BRAND_UUID>","iso_week":"2026-20","force":true}'
```

```sql
SELECT brand_id, iso_week, sessions, users, conversions, revenue
FROM seo_data_hub.ga4_organic_weekly
WHERE brand_id = '<BRAND_UUID>' AND iso_week = '2026-20';
```

- [ ] 1+ row con valores no-nulos. Si la brand no tiene GA4 configurado, el ingestor devuelve `{"ok":true,"skipped":true,"reason":"no_ga4_property"}` y este paso se considera N/A.

### CWV

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-cwv-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","brand_id":"<BRAND_UUID>","iso_week":"2026-20","force":true}'
```

```sql
SELECT brand_id, iso_week, url, device, lcp_p75, inp_p75, cls_p75, source
FROM seo_data_hub.cwv_weekly
WHERE brand_id = '<BRAND_UUID>' AND iso_week = '2026-20'
ORDER BY lcp_p75 DESC NULLS LAST
LIMIT 10;
```

- [ ] 1+ row. `source` puede ser `crux` o `psi` (fallback). Métricas en ms para LCP/INP, ratio para CLS.

- [ ] Los 3 ingestors completaron sin error y dejaron data en el hub.

**Nota Ahrefs:** `hub-ahrefs-monthly` se valida aparte. Si querés forzarlo manualmente, mismo patrón pero el body usa `period_month` en formato `YYYY-MM`. Cuidado con créditos: cada corrida consume del presupuesto.

---

## Paso 5 — Acumular ≥4 semanas de data (warmup) o reducir warmup para test

El motor estadístico no produce señales lagging hasta tener `n_samples >= 4` (ver `ARCHITECTURE.md` sección "Anti-falsos-positivos"). Dos caminos:

### Camino A — Ya tenés histórico (V1 corrió por semanas)

Backfill manual del hub desde V1. Si V1 tiene 8+ semanas en `seo_sentinel.traffic_daily`, exportarlas y reinyectarlas en el hub (ver `05-backtesting-guide.md` paso 1).

### Camino B — Aceptar warmup natural

Esperar 4 semanas reales. Durante ese tiempo, el `oew-orchestrator` sigue corriendo cada martes pero solo dispara `WATCH` con `confidence < 0.5`.

### Camino C — Reducir warmup temporalmente (solo para validation)

```sql
UPDATE organic_early_warning.signal_definitions
SET warmup_min_samples = 1
WHERE kind = 'lagging';
```

**IMPORTANTE:** revertir esto antes de promover a producción.

```sql
-- revertir
UPDATE organic_early_warning.signal_definitions
SET warmup_min_samples = 4
WHERE kind = 'lagging';
```

- [ ] Elegido un camino (A, B, o C) y aplicado.

---

## Paso 6 — Forzar `oew-baseline-builder`

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-baseline-builder \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","brand_id":"<BRAND_UUID>","force":true}'
```

- [ ] Devuelve `200` con `{"ok":true,"baselines_upserted":N}` con `N > 0`

```sql
SELECT brand_id, signal_id, segment_hash, iso_week_of_year,
       median, mad, mean, std, n_samples, trend_slope, last_recomputed
FROM organic_early_warning.baselines
WHERE brand_id = '<BRAND_UUID>'
ORDER BY last_recomputed DESC
LIMIT 20;
```

- [ ] Hay rows. `n_samples >= 1` (o `>= 4` si seguiste Camino A)
- [ ] `mad` no es NULL (si lo es: histórico insuficiente para esa combinación, normal en warmup)
- [ ] `last_recomputed` reciente (segundos atrás)

**Si vacío:** confirmar que el hub tiene data para el brand (Paso 3). Sin data en el hub, no hay baseline.

---

## Paso 7 — Forzar `oew-orchestrator`

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-orchestrator \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","brand_id":"<BRAND_UUID>","force":true}'
```

- [ ] Devuelve `200` con `{"ok":true,"run_id":"...","incidents_created":N,"alerts_enqueued":M}`. Anotar el `run_id`.

**Si falla:**

| Síntoma | Acción |
|---|---|
| `409` + `"hub_not_ready"` | El orchestrator chequea `seo_data_hub.ingestion_runs.status='completed'` para la semana. Forzar Pasos 1-4 antes |
| `500` + `"baseline_missing"` | Forzar Paso 6 primero |
| `200` con `incidents_created=0` | No hay anomalías — esto puede ser correcto. Validar trace en Paso 8 |

---

## Paso 8 — Verificar `analysis_runs` + `run_events` con trace completo

```sql
SELECT id, status, started_at, completed_at, brand_id, error_message
FROM organic_early_warning.analysis_runs
WHERE id = '<RUN_ID>';
```

- [ ] `status = 'completed'`
- [ ] `error_message IS NULL`
- [ ] `completed_at - started_at` razonable (típicamente < 2 min para una sola brand)

```sql
SELECT occurred_at, event_source, event_type, brand_id,
       payload->>'reason' AS reason,
       payload->>'signal_id' AS signal_id,
       payload->>'incidents_created' AS incidents,
       error_message
FROM organic_early_warning.run_events
WHERE run_id = '<RUN_ID>'
ORDER BY occurred_at ASC;
```

- [ ] Secuencia de eventos esperada (orden aproximado):
  1. `orchestrator` / `run_started`
  2. `baseline-builder` / `agent_started`
  3. `baseline-builder` / `baseline_recomputed` (1+)
  4. `baseline-builder` / `agent_completed`
  5. `signal-evaluator` / `agent_started`
  6. `signal-evaluator` / `anomaly_detected` (0+ — uno por signal_event)
  7. `signal-evaluator` / `agent_completed`
  8. `incident-clusterer` / `agent_started`
  9. `incident-clusterer` / `incident_clustered` (0+)
  10. `incident-clusterer` / `agent_completed`
  11. `detective` / `agent_started` + `diagnosis_saved` (solo si severity >= YELLOW)
  12. `dispatcher` / `alert_enqueued` (0+)
  13. `orchestrator` / `run_completed`

- [ ] **No hay eventos con `event_type='agent_failed'`**. Si los hay, leer `error_message` y consultar `03-runbook.md`.

---

## Paso 9 — Verificar `signal_events` insertados

```sql
SELECT id, brand_id, signal_id, segment_hash, period_start, period_end,
       metric_actual, metric_expected, deviation_sigma, severity_hint, confidence, created_at
FROM organic_early_warning.signal_events
WHERE created_at > NOW() - INTERVAL '15 min'
  AND brand_id = '<BRAND_UUID>'
ORDER BY created_at DESC
LIMIT 50;
```

- [ ] Si la corrida es "limpia" (sin anomalías): 0 rows — comportamiento esperado para sitio sano
- [ ] Si hay rows: cada signal_event tiene `signal_id` válido (FK a `signal_definitions`), `severity_hint` ∈ {WATCH, YELLOW, RED}, `confidence` ∈ [0, 1]
- [ ] `deviation_sigma` poblado para señales estadísticas (S5, S8, S11, S12); puede ser NULL para señales boolean (S1, S2, S3)

**Para forzar al menos 1 signal_event sintético (test de plumbing):**

```sql
-- INSERT manual de un signal_event WATCH para validar que el clusterer + dispatcher reaccionan
INSERT INTO organic_early_warning.signal_events
  (brand_id, signal_id, run_id, segment_hash, period_start, period_end,
   metric_actual, metric_expected, deviation_sigma, severity_hint, confidence, payload)
SELECT
  '<BRAND_UUID>',
  (SELECT id FROM organic_early_warning.signal_definitions WHERE kind='leading' AND enabled=true LIMIT 1),
  '<RUN_ID>',
  'test-segment',
  (NOW() - INTERVAL '7 days')::date,
  NOW()::date,
  0.5, 1.0, 2.5, 'WATCH', 0.4,
  '{"synthetic":true,"reason":"validation_test"}'::jsonb;
```

Re-correr Paso 7 con `force:true` para que el clusterer y dispatcher procesen el evento sintético.

---

## Paso 10 — Verificar `incidents` creados (o no, según signals)

```sql
SELECT i.id AS incident_id, i.brand_id, i.severity, i.signal_count,
       i.first_seen_at, i.last_updated_at,
       array_length(i.signal_event_ids, 1) AS events_in_cluster,
       i.dispatch_status
FROM organic_early_warning.incidents i
WHERE i.last_updated_at > NOW() - INTERVAL '15 min'
ORDER BY i.last_updated_at DESC;
```

- [ ] Si hubo signal_events de severidad WATCH solos → 1 incident con `severity='WATCH'`, `dispatch_status='deferred_to_digest'` (NO se dispatchea ahora, va al Viernes)
- [ ] Si hubo signal_events con confirmación leading+lagging → 1 incident con `severity='YELLOW'` o `RED`, `dispatch_status='pending'` o `dispatched'`
- [ ] `signal_count >= 1` y `array_length(signal_event_ids,1)` coincide con `signal_count`

```sql
-- Ver el diagnostics asociado (solo si severity >= YELLOW)
SELECT id, incident_id, thematic_cluster, LENGTH(executive_summary) AS summary_chars,
       LENGTH(recommended_actions) AS actions_chars, created_at
FROM organic_early_warning.incident_diagnostics
WHERE incident_id IN (
  SELECT id FROM organic_early_warning.incidents
  WHERE last_updated_at > NOW() - INTERVAL '15 min'
);
```

- [ ] Incidents YELLOW/RED tienen 1 diagnostic. `thematic_cluster` no NULL, `summary_chars > 80`, `actions_chars > 50`.

---

## Paso 11 — Outbox encolado para incidents YELLOW/RED

```sql
SELECT id, target_type, channel_id, status, retry_count, dedupe_key,
       created_at, sent_at, error_message
FROM public.notifications_outbox
WHERE source = 'oew_alert'
  AND created_at > NOW() - INTERVAL '15 min'
ORDER BY created_at DESC;
```

- [ ] Por cada incident YELLOW/RED: 1 row con `target_type='channel'` (canal `C0B1B3V4ZB5`) Y, si la brand tiene `team_lead_user_id`, 1 row adicional con `target_type='user'`
- [ ] `dedupe_key` con formato `oew:<incident_id>:v1:<channel|user_id>`
- [ ] `status` inicial: `pending`. Después del próximo tick del worker (cada 30s): `sent`

---

## Paso 12 — Verificar entrega Slack (30-60s)

Esperar 30-60s y re-correr la query del Paso 11.

- [ ] `status='sent'`
- [ ] `sent_at` poblado
- [ ] `error_message IS NULL`
- [ ] `retry_count = 0` (sin retries en happy path)

Confirmación visual:

- [ ] **Canal `#alerts-operaciones`**: mensaje visible con header tipo `ALERTA AMARILLA — <brand>` o `ALERTA ROJA — <brand>`, bloque de resumen ejecutivo (3 oraciones), bloque de signals involucrados, contexto con `Incidente: <UUID>`
- [ ] **DM al especialista**: mismo Block Kit recibido en mensajes directos del bot `Orbit SeoLab`
- [ ] Si la brand NO tiene `team_lead_user_id` → solo 1 mensaje (canal), comportamiento esperado

**Si `status='failed'`:**

| `error_message` | Acción |
|---|---|
| `not_in_channel` | Invitar al bot al canal: `/invite @orbit-seolab` |
| `channel_not_found` | Verificar que `SLACK_FALLBACK_CHANNEL=C0B1B3V4ZB5` está en Vault |
| `invalid_auth` | `SLACK_BOT_TOKEN` inválido o expirado. Regenerar desde https://api.slack.com/apps → Orbit SeoLab → OAuth |
| `user_not_found` | El `team_lead_user_id` en `brand_routing` es inválido. Verificar contra Slack workspace |
| `rate_limited` | El worker retryea con backoff exponencial. Esperar 1-2 min |

---

## Paso 13 — `incident_log` persistido (auditoría inmutable)

```sql
SELECT incident_id, brand_name, severity, signal_count, alert_sent_to,
       final_status, time_to_detect_minutes, logged_at
FROM organic_early_warning.incident_log
WHERE logged_at > NOW() - INTERVAL '15 min'
ORDER BY logged_at DESC;
```

- [ ] 1 row por incident dispatcheado del run
- [ ] `alert_sent_to` es un array con 1 o 2 entries (channel_id + opcional specialist_user_id)
- [ ] `final_status = 'alert_sent'`
- [ ] `time_to_detect_minutes` razonable (típicamente 1-5 min entre cron y entrega)

---

## Paso 14 — Forzar `oew-digest-weekly` y validar pipeline health

Independientemente del día, forzar manual para probar:

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-digest-weekly \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","force":true}'
```

- [ ] Devuelve `200` con `{"ok":true,"watch_items":N,"message_ts":"..."}`
- [ ] Esperar 30s, confirmar que en `#alerts-operaciones` apareció **un único mensaje** con título tipo `Digest semanal Organic Early Warning` y listado de items WATCH agrupados por brand

```sql
SELECT * FROM organic_early_warning.v_pipeline_health;
```

- [ ] `runs_stuck = 0`
- [ ] `diagnostics_pending_dispatch = 0`
- [ ] `outbox_stale_locks_oew = 0`
- [ ] `ingestion_runs_failed_24h = 0`
- [ ] `alerts_sent_24h >= 0` (mayor si hubo anomalías reales)

**Si algún counter > 0:**

| Counter | Diagnóstico |
|---|---|
| `runs_stuck > 0` | `analysis_runs` con `status='running'` más de 30 min. El watchdog los va a marcar `failed` en el próximo tick (`*/2 * * * *`). Si no, ver `03-runbook.md` |
| `diagnostics_pending_dispatch > 0` | Diagnostics sin entry correspondiente en `incident_log`. Forzar `oew-dispatcher` con `force:true` |
| `outbox_stale_locks_oew > 0` | Locks colgados en outbox. Watchdog los limpia automáticamente, pero si persiste hay un bug en el worker |
| `ingestion_runs_failed_24h > 0` | Algún ingestor del hub falló. Revisar `seo_data_hub.ingestion_runs WHERE status='failed'` y `error_message` |

---

## Definition of Done

- [ ] Los 14 pasos pasaron sin errores (excepto warmup esperado del Paso 5)
- [ ] El hub tiene data raw para al menos 1 brand × 1 iso_week en las 3 tablas weekly (GSC + GA4 + CWV)
- [ ] El motor estadístico construyó baselines y dejó `last_recomputed` reciente
- [ ] El orchestrator E2E corrió en menos de 2 min para 1 brand y dejó trace completo en `run_events`
- [ ] Al menos 1 incident sintético (o real) llegó hasta `incident_log` con `final_status='alert_sent'`
- [ ] Canal `#alerts-operaciones` recibió el mensaje del incident YELLOW/RED
- [ ] DM al especialista recibido (si la brand tiene `team_lead_user_id` configurado)
- [ ] El digest semanal forzado entregó un único mensaje agregado al canal
- [ ] `v_pipeline_health` muestra todos los counters en 0
- [ ] Si se aplicó el bypass de warmup del Paso 5 Camino C → **revertido** antes de marcar este DoD

Si algún ítem queda sin chequear → ver `handoff/03-runbook.md` para diagnóstico de síntomas comunes.
