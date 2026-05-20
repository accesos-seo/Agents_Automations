# 01 — Contratos de Edge Functions (Data Hub + Organic Early Warning V2)

Documento de referencia con el contrato HTTP exacto de las **12 edge functions** del módulo. Todas viven bajo:

```
https://stjugsrkrweakvzmizpq.functions.supabase.co/<nombre>
```

Auth entre funciones internas (NUNCA JWT de Supabase):

| Prefijo | Header esperado | Env var del Vault |
|---|---|---|
| `hub-*` | `x-internal-secret: <HUB_INTERNAL_SECRET>` | `HUB_INTERNAL_SECRET` |
| `oew-*` | `x-internal-secret: <OEW_INTERNAL_SECRET>` | `OEW_INTERNAL_SECRET` |

Patrón de error uniforme (mismo que V1): `{ "ok": false, "error": "<codigo_snake_case>" }` + status HTTP semántico. Mensajes humanos van en `run_events.error_message`, no en la respuesta.

Convenciones aplicadas en todos los contratos:
- Todas las fns ingestoras del hub son **idempotentes** (UPSERT por clave determinística).
- Todas las fns del oew son **idempotentes** (skip si el efecto ya está aplicado; `force:true` para override).
- Las fns invocadas por orchestrator pueden ser **bloqueantes** (orchestrator hace `await`) o **fire-and-forget** (orchestrator NO espera).
- El campo `iso_week` usa formato ISO 8601 `YYYY-Www` (ej. `2026-W21`). El campo `period_month` usa `YYYY-MM`.

---

## Tabla resumen

| # | Edge function | Quién invoca | Frecuencia | Bloqueante? |
|---|---|---|---|---|
| 1 | `hub-gsc-weekly` | pg_cron lunes 06:00 UTC / manual | Semanal | N/A (cron, autónomo) |
| 2 | `hub-ga4-weekly` | pg_cron lunes 06:15 UTC / manual | Semanal | N/A (cron, autónomo) |
| 3 | `hub-cwv-weekly` | pg_cron lunes 06:30 UTC / manual | Semanal | N/A (cron, autónomo) |
| 4 | `hub-ahrefs-monthly` | pg_cron día 28 06:00 UTC / manual | Mensual | N/A (cron, autónomo) |
| 5 | `hub-crawl-loader` | manual / pipeline externo (Screaming Frog) | On-demand | N/A |
| 6 | `oew-orchestrator` | pg_cron martes 13:00 UTC / manual | Semanal | Sí (entry-point) |
| 7 | `oew-baseline-builder` | orchestrator | 1 por run | Sí (orchestrator awaits) |
| 8 | `oew-signal-evaluator` | orchestrator | 1 por run | Sí (orchestrator awaits) |
| 9 | `oew-incident-clusterer` | orchestrator | 1 por run | Sí (orchestrator awaits) |
| 10 | `oew-detective` | orchestrator (fan-out por incident) | 1 por incident YELLOW+ | Sí |
| 11 | `oew-dispatcher` | orchestrator / watchdog retry | 1 por incident diagnosticado | Sí |
| 12 | `oew-digest-weekly` | pg_cron viernes 23:00 UTC / manual | Semanal | N/A (cron, autónomo) |

---

# DATA HUB (5 funciones)

## 1. `hub-gsc-weekly`

Ingesta semanal de Google Search Console (Search Analytics API) para todas las brands activas. UPSERT idempotente en `seo_data_hub.gsc_search_analytics_weekly`. **No** ejecuta lógica de negocio — solo persiste data cruda.

### Request

```http
POST /hub-gsc-weekly
Headers:
  x-internal-secret: <HUB_INTERNAL_SECRET>
  Content-Type: application/json
Body:
  {
    "trigger": "cron" | "manual",
    "brand_id": "<UUID opcional>",        // si presente, procesa solo esa brand
    "iso_week": "2026-W20"                // opcional; default = ISO week previa completa
  }
```

### Response 200

```json
{
  "ok": true,
  "ingestion_run_id": "uuid",
  "iso_week": "2026-W20",
  "brands_processed": 7,
  "brands_failed": 0,
  "rows_inserted": 184230,
  "rows_updated": 412
}
```

### Errors

| Status | error code | Causa |
|---|---|---|
| 400 | `missing_trigger` | El body no incluye `trigger` |
| 400 | `invalid_json` | Body no es JSON válido |
| 400 | `invalid_iso_week` | Formato distinto a `YYYY-Www` |
| 401 | `unauthorized` | Header `x-internal-secret` ausente o no coincide |
| 404 | `brand_not_found` | `brand_id` enviado pero no existe en `brands_registry` |
| 500 | `gsc_auth_failed` | `GSC_SERVICE_ACCOUNT_JSON` mal cargado o SA sin acceso a la property |
| 500 | `gsc_rate_limit_exhausted` | 1200/min superado luego de 3 retries con backoff |
| 500 | `upsert_failed` | Error de schema (FK violation, columna nueva, etc.) |

### Comportamiento clave

- **Idempotencia**: UPSERT por `(brand_id, iso_week, dimensions_hash)`. Re-correr la misma `iso_week` reemplaza sin duplicar. `dimensions_hash = sha256(date|page|query|device|country|searchAppearance)`.
- **Paginación GSC**: `rowLimit=25000`, `startRow += 25000` hasta `rows.length < 25000`. Sitios grandes pueden requerir 5-20 páginas por brand.
- **Dimensiones extraídas**: `['date','page','query','device','country','searchAppearance']` — esto habilita S8 (CTR vs posición), S9 (feature SERP), S11 (out-of-band) sin re-ingerir.
- **Rate limit**: respeta `Retry-After`. Backoff exponencial 1s/2s/4s en errores 429/503.
- **Ventana**: por default ingiere la ISO week previa COMPLETA (lunes a domingo). Si `iso_week` es explícito, ingiere esa semana.
- **Audit**: crea fila en `ingestion_runs` con `status='running'` al inicio, `status='completed'|'failed'` al cerrar. Emite `run_events` (`run_started`, `agent_completed`, `agent_failed`).
- **Por brand**: si una brand individual falla, se loguea y se sigue con las demás. La corrida global solo es `failed` si TODAS fallan.

### Test con curl

```bash
# Corrida manual de la semana previa, todas las brands:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-gsc-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'

# Re-ingesta forzada de una semana puntual para 1 brand:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-gsc-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","brand_id":"7f9c...","iso_week":"2026-W18"}'
```

---

## 2. `hub-ga4-weekly`

Ingesta semanal de Google Analytics 4 (Data API) para brands activas con `ga4_property_id` configurado. UPSERT en `seo_data_hub.ga4_organic_weekly`. **Best-effort por brand**: si una brand no tiene GA4, se skipea silenciosamente sin marcar failed.

### Request

```http
POST /hub-ga4-weekly
Headers:
  x-internal-secret: <HUB_INTERNAL_SECRET>
  Content-Type: application/json
Body:
  {
    "trigger": "cron" | "manual",
    "brand_id": "<UUID opcional>",
    "iso_week": "2026-W20"                // opcional
  }
```

### Response 200

```json
{
  "ok": true,
  "ingestion_run_id": "uuid",
  "iso_week": "2026-W20",
  "brands_processed": 5,
  "brands_skipped": 2,
  "brands_failed": 0,
  "rows_inserted": 32140
}
```

`brands_skipped` cuenta brands sin `ga4_property_id` (comportamiento esperado, no es error).

### Errors

| Status | error code | Causa |
|---|---|---|
| 400 | `missing_trigger` | Body sin `trigger` |
| 400 | `invalid_iso_week` | Formato inválido |
| 401 | `unauthorized` | Secret inválido |
| 404 | `brand_not_found` | `brand_id` enviado y no existe |
| 500 | `ga4_auth_failed` | `GA4_SERVICE_ACCOUNT_JSON` (o fallback `GSC_SERVICE_ACCOUNT_JSON`) mal cargado |
| 500 | `upsert_failed` | Error de schema |

### Comportamiento clave

- **Idempotencia**: UPSERT por `(brand_id, iso_week, dimensions_hash)` con dimensiones `[date, deviceCategory, country, landingPagePlusQueryString]`.
- **Métricas extraídas**: `sessions`, `totalUsers`, `engagedSessions`, `conversions`, `purchaseRevenue` (los nombres canónicos de GA4 Data API). Filtro fijo: `sessionDefaultChannelGrouping == 'Organic Search'`.
- **Skip silencioso**: si `brands_registry.ga4_property_id IS NULL`, se ignora la brand y se incrementa `brands_skipped`. NO se loguea como warning (es el estado esperado para brands sin GA4 configurado).
- **Fallback SA**: si `GA4_SERVICE_ACCOUNT_JSON` no está cargado, usa `GSC_SERVICE_ACCOUNT_JSON` (la misma SA suele tener acceso a ambos).
- **Cuota**: 50k requests/proyecto/día. Suficiente para ~50 brands con un solo request por brand (la API agrega multi-dimensional en una sola call).

### Test con curl

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-ga4-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'
```

---

## 3. `hub-cwv-weekly`

Ingesta semanal de Core Web Vitals para el **top-tráfico** de cada brand. Lee las top-N URLs de `gsc_search_analytics_weekly` (última `iso_week`), llama CrUX si la URL tiene field data, sino cae a PSI lab. UPSERT en `seo_data_hub.cwv_weekly`.

### Request

```http
POST /hub-cwv-weekly
Headers:
  x-internal-secret: <HUB_INTERNAL_SECRET>
  Content-Type: application/json
Body:
  {
    "trigger": "cron" | "manual",
    "brand_id": "<UUID opcional>",
    "iso_week": "2026-W20",               // opcional, default = previa completa
    "top_n_urls": 50                       // opcional, default 50, max 200
  }
```

### Response 200

```json
{
  "ok": true,
  "ingestion_run_id": "uuid",
  "iso_week": "2026-W20",
  "brands_processed": 7,
  "urls_evaluated": 312,
  "crux_hits": 198,
  "psi_fallbacks": 114,
  "rows_inserted": 312
}
```

### Errors

| Status | error code | Causa |
|---|---|---|
| 400 | `missing_trigger` | Body sin `trigger` |
| 400 | `top_n_urls_out_of_range` | `top_n_urls > 200` o `< 1` |
| 401 | `unauthorized` | Secret inválido |
| 404 | `brand_not_found` | `brand_id` no existe |
| 409 | `no_gsc_data_for_week` | No hay rows en `gsc_search_analytics_weekly` para la `iso_week` (correr `hub-gsc-weekly` primero) |
| 500 | `crux_api_failed` | CrUX 5xx después de retries |
| 500 | `psi_quota_exhausted` | 25k/día PSI superado |

### Comportamiento clave

- **Idempotencia**: UPSERT por `(brand_id, iso_week, url, device)`. Una URL genera 2 rows (mobile + desktop) en la mayoría de los casos.
- **Estrategia CrUX → PSI**: intenta CrUX primero (gratis, field data). Si CrUX responde 404 `chrome-ux-report-no-data`, cae a PSI lab (más caro pero siempre disponible). El flag `data_source ENUM('crux','psi_lab')` queda persistido para que el evaluator sepa cuál es.
- **Top-N**: ordena URLs por `SUM(clicks) DESC` en la `iso_week`. El default 50 es razonable para brands medianas; brands grandes pueden subir a 100-200 (cuidado con cuota PSI).
- **Métricas persistidas**: `lcp_p75_ms`, `inp_p75_ms`, `cls_p75`, `fcp_p75_ms`, `ttfb_p75_ms`, `data_source`, `sample_size` (CrUX) o `null` (PSI lab).
- **Dependencia**: requiere que `hub-gsc-weekly` haya corrido y poblado la `iso_week`. Si no, devuelve 409 `no_gsc_data_for_week`.

### Test con curl

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-cwv-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","top_n_urls":50}'
```

---

## 4. `hub-ahrefs-monthly`

Ingesta mensual de Ahrefs API: backlinks (overview + new/lost domains), SERP overview por keyword tracking, toxic links. UPSERT en las 3 tablas `ahrefs_*_monthly`. **Respeta `AHREFS_CREDIT_BUDGET_MONTH`** y aborta antes de excederlo.

### Request

```http
POST /hub-ahrefs-monthly
Headers:
  x-internal-secret: <HUB_INTERNAL_SECRET>
  Content-Type: application/json
Body:
  {
    "trigger": "cron" | "manual",
    "brand_id": "<UUID opcional>",
    "period_month": "2026-05"             // opcional, default = mes previo completo
  }
```

### Response 200

```json
{
  "ok": true,
  "ingestion_run_id": "uuid",
  "period_month": "2026-05",
  "brands_processed": 6,
  "brands_skipped_budget": 1,
  "backlinks_rows": 6,
  "serp_rows": 312,
  "toxic_rows": 47,
  "credits_used_this_run": 380,
  "credits_used_month_total": 462,
  "credits_budget": 500
}
```

### Errors

| Status | error code | Causa |
|---|---|---|
| 400 | `missing_trigger` | Body sin `trigger` |
| 400 | `invalid_period_month` | Formato distinto a `YYYY-MM` |
| 401 | `unauthorized` | Secret inválido |
| 402 | `credit_budget_exhausted` | Esta corrida excedería `AHREFS_CREDIT_BUDGET_MONTH`; aborta antes de gastar |
| 404 | `brand_not_found` | `brand_id` no existe |
| 500 | `ahrefs_auth_failed` | `AHREFS_API_TOKEN` inválido o expirado |
| 500 | `ahrefs_rate_limit` | 429 persistente después de 3 retries |
| 500 | `upsert_failed` | Error de schema |

### Comportamiento clave

- **Idempotencia**: UPSERT por `(brand_id, period_month)` en `ahrefs_backlinks_monthly` y `ahrefs_serp_monthly` (1 row por brand×mes); en `ahrefs_toxic_links_monthly` UPSERT por `(brand_id, period_month, link_url_hash)`.
- **Presupuesto**: antes de cada brand consulta cuántos créditos lleva gastados el mes (`SELECT SUM(credits_used) FROM ingestion_runs WHERE provider='ahrefs' AND period_month = X AND status='completed'`). Si el próximo brand excedería `AHREFS_CREDIT_BUDGET_MONTH`, se skipea y se loguea `brands_skipped_budget`. El watchdog detecta esto y notifica a `SLACK_ADMIN_CHANNEL`.
- **Endpoints consumidos**: `/site-explorer/domain-rating`, `/site-explorer/refdomains-new-lost`, `/site-explorer/backlinks-broken`, `/rank-tracker/serp-overview`. La lista exacta y créditos por endpoint queda en `_shared/ahrefs-api.ts`.
- **Ventana**: por default ingiere el mes calendario previo completo. Si `period_month` explícito, ingiere ese.
- **Audit**: `ingestion_runs.payload.credits_used` queda persistido para el cómputo de presupuesto.

### Test con curl

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-ahrefs-monthly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","period_month":"2026-04"}'
```

---

## 5. `hub-crawl-loader`

Recibe un export YA generado de Screaming Frog (o equivalente) y lo persiste en `seo_data_hub.crawl_snapshots`. **NO ejecuta Screaming Frog** — la herramienta es local del operador y este endpoint solo carga el output. No tiene cron asociado; es on-demand.

### Request

```http
POST /hub-crawl-loader
Headers:
  x-internal-secret: <HUB_INTERNAL_SECRET>
  Content-Type: application/json
Body:
  {
    "brand_id": "uuid",
    "crawl_date": "2026-05-19",
    "format": "csv" | "xml",
    "export_url_or_base64": "https://...|base64:..."
  }
```

`export_url_or_base64` admite:
- URL `https://...` (signed URL temporal a S3, Drive, etc.): la fn hace `fetch()` y procesa el contenido.
- Prefijo `base64:` + payload base64 (para exports <5MB): se decodifica inline.

### Response 200

```json
{
  "ok": true,
  "snapshot_id": "uuid",
  "brand_id": "uuid",
  "crawl_date": "2026-05-19",
  "urls_parsed": 4820,
  "rows_inserted": 4820,
  "rows_updated": 0
}
```

### Errors

| Status | error code | Causa |
|---|---|---|
| 400 | `missing_fields` | Falta `brand_id`, `crawl_date`, `format` o `export_url_or_base64` |
| 400 | `invalid_format` | `format` no es `csv` ni `xml` |
| 400 | `invalid_crawl_date` | Formato distinto a `YYYY-MM-DD` |
| 400 | `payload_too_large` | base64 decodificado > 50MB (usar URL en su lugar) |
| 401 | `unauthorized` | Secret inválido |
| 404 | `brand_not_found` | `brand_id` no existe |
| 422 | `parse_failed` | El contenido no parsea como `format` declarado |
| 500 | `fetch_failed` | URL inválida o devolvió 4xx/5xx |
| 500 | `upsert_failed` | Error de schema |

### Comportamiento clave

- **Idempotencia**: UPSERT por `(brand_id, crawl_date, url)`. Re-cargar el mismo crawl reemplaza sin duplicar.
- **Columnas extraídas por URL**: `url`, `status_code`, `content_type`, `meta_robots`, `canonical_url`, `is_indexable`, `internal_links_in`, `internal_links_out`, `is_orphan`, `redirect_chain_depth`, `h1_count`, `title`, `meta_description`. Solo lo necesario para S3 (cambios técnicos) y S4 (links rotos/huérfanos).
- **Sin cron**: el operador lo invoca después de cada crawl manual. La frecuencia recomendada por brand es semanal (alineada con el evaluator), pero el sistema tolera gaps — el evaluator skipea S3/S4 si no hay snapshot fresco.
- **Particionado**: `crawl_snapshots` se particiona por mes de `crawl_date`.

### Test con curl

```bash
# Con URL:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-crawl-loader \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"brand_id":"7f9c...","crawl_date":"2026-05-19","format":"csv","export_url_or_base64":"https://storage.example.com/crawls/brand7-2026-05-19.csv"}'

# Con base64 (para exports pequeños):
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-crawl-loader \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"brand_id":"7f9c...","crawl_date":"2026-05-19","format":"csv","export_url_or_base64":"base64:dXJsLHN0YXR1c19jb2RlLC4uLg=="}'
```

---

# ORGANIC EARLY WARNING (7 funciones)

## 6. `oew-orchestrator`

Entry-point del pipeline semanal de detección. Disparado por pg_cron martes 13:00 UTC (= 08:00 CO) o manualmente. Valida que el hub tiene corridas frescas, crea el `analysis_run`, encadena baseline → evaluator → clusterer → detective (fan-out por incident) → dispatcher.

### Request

```http
POST /oew-orchestrator
Headers:
  x-internal-secret: <OEW_INTERNAL_SECRET>
  Content-Type: application/json
Body:
  {
    "trigger": "cron" | "manual",
    "brand_id": "<UUID opcional>"         // si presente, procesa solo esa brand
  }
```

### Response 200 (éxito normal)

```json
{
  "ok": true,
  "run_id": "uuid",
  "brands_processed": 7,
  "incidents_opened": 3,
  "incidents_dispatched": 2,
  "incidents_watch_tier": 5
}
```

### Response 200 (warning, hub no fresco)

```json
{
  "ok": true,
  "run_id": "uuid",
  "warning": "hub_data_stale",
  "details": {
    "expected_iso_week": "2026-W20",
    "latest_hub_completion": "2026-W18",
    "components_stale": ["gsc", "ga4"]
  },
  "brands_processed": 0
}
```

El orchestrator devuelve `ok:true` con `warning` y emite `run_events` de tipo `warning` — NO falla. El watchdog vigila estos warnings y avisa a `SLACK_ADMIN_CHANNEL` si se repiten.

### Errors

| Status | error code | Causa |
|---|---|---|
| 400 | `missing_trigger` | Body sin `trigger` |
| 400 | `invalid_json` | Body no es JSON válido |
| 401 | `unauthorized` | Secret inválido |
| 404 | `brand_not_found` | `brand_id` enviado y no existe en `brands_registry` |
| 500 | `run_insert_failed` | UPSERT a `analysis_runs` falló (BD caída?) |
| 500 | `baseline_builder_failed` | Sub-call al baseline-builder devolvió error |
| 500 | `signal_evaluator_failed` | Sub-call al signal-evaluator devolvió error |
| 500 | `incident_clusterer_failed` | Sub-call al incident-clusterer devolvió error |

### Comportamiento clave

- **Validación de freshness del hub**: antes de procesar, consulta `seo_data_hub.ingestion_runs` y verifica:
  - Weekly: existe row con `provider IN ('gsc','ga4','cwv')`, `status='completed'`, `period_end >= último lunes`.
  - Monthly: para evaluar S6/S7/S10, existe row `provider='ahrefs'`, `status='completed'`, `period_month = mes previo completo`. Si no, omite señales monthly y emite warning (sigue procesando weekly).
- **Idempotencia**: si ya hay un `analysis_run` de la misma `iso_week` con `status='completed'`, devuelve 200 con `status: 'already_processed', run_id: <prev_id>` (no crea uno nuevo). `trigger:'manual'` con flag `force:true` permite forzar nueva corrida.
- **Flujo bloqueante**: `await baseline-builder → await signal-evaluator → await incident-clusterer → await detective × N → await dispatcher × M`. Detective y dispatcher son fan-out con `Promise.allSettled` (un incident fallido no rompe los demás).
- **Detective solo para incidents >= YELLOW**: incidents WATCH no llaman detective (LLM caro, no es accionable inmediato — va al digest).
- **UPDATE final**: cierra `analysis_runs` con `status='completed'` y `metrics` JSON con conteos. Emite `run_completed`.

### Test con curl

```bash
# Corrida manual completa:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-orchestrator \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'

# Procesar solo 1 brand:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-orchestrator \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","brand_id":"7f9c..."}'
```

---

## 7. `oew-baseline-builder`

Recomputa el motor estadístico: para cada `(brand_id, signal_id, segment_hash, iso_week_of_year)` calcula median, MAD, mean, std, trend_slope (Mann-Kendall) sobre las últimas 8-12 semanas del hub. UPSERT en `organic_early_warning.baselines`.

### Request

```http
POST /oew-baseline-builder
Headers:
  x-internal-secret: <OEW_INTERNAL_SECRET>
  Content-Type: application/json
Body:
  {
    "run_id": "uuid",
    "brand_id": "<UUID opcional>",
    "signal_ids": ["S1","S5","S11"]       // opcional; si vacío, recomputa todas las habilitadas
  }
```

### Response 200

```json
{
  "ok": true,
  "run_id": "uuid",
  "baselines_updated": 412,
  "baselines_warm_up": 38,
  "signals_processed": 13,
  "brands_processed": 7
}
```

`baselines_warm_up` = baselines con `n_samples < 4` (no se usan para lagging, solo para WATCH con confidence baja).

### Errors

| Status | error code | Causa |
|---|---|---|
| 400 | `missing_run_id` | Body sin `run_id` |
| 401 | `unauthorized` | Secret inválido |
| 404 | `run_not_found` | `run_id` no existe en `analysis_runs` |
| 404 | `signal_id_not_found` | Algún `signal_id` no existe en `signal_definitions` |
| 500 | `hub_query_failed` | Cross-schema SELECT al hub falló (verificar índices) |
| 500 | `baseline_upsert_failed` | Error al persistir en `baselines` |

### Comportamiento clave

- **Idempotencia**: UPSERT por `(brand_id, signal_id, segment_hash, iso_week_of_year)`. `iso_week_of_year` es el número 1-53 (no la fecha) — esto permite comparar "misma semana 21 históricamente" para detectar estacionalidad.
- **Ventana**: 8-12 semanas. Default 8; si el brand tiene >12 semanas en el hub, usa 12 (más estable).
- **MAD vs std**: persiste ambos para debugging. El evaluator usa MAD (robusto a outliers) salvo override por signal.
- **Mann-Kendall**: `trend_slope` ∈ [-1, 1] indica dirección de tendencia. Se persiste para que las alertas digan "viene cayendo desde hace 4 semanas" vs "caída súbita".
- **Segmentos**: por cada brand × signal, itera segmentos derivados de `gsc_search_analytics_weekly` (branded/non-branded × device × top-5 country × page_type). `segment_hash = sha256(branded|device|country|page_type)`.
- **Cross-schema**: lee de `seo_data_hub.*` con service-role. Performance crítica: cada tabla del hub tiene índice por `(brand_id, iso_week)` o `(brand_id, period_month)`.
- **Warm-up**: si `n_samples < 4` para una combinación, persiste el baseline con flag `is_warm_up=true`. El evaluator NO dispara signals lagging contra baselines warm-up (devuelve severity=WATCH con confidence<0.5).

### Test con curl

```bash
# Recomputar baselines de todas las brands para el run actual:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-baseline-builder \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"run_id":"<UUID>"}'

# Recomputar solo 2 signals para 1 brand (re-tuning):
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-baseline-builder \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"run_id":"<UUID>","brand_id":"7f9c...","signal_ids":["S8","S11"]}'
```

---

## 8. `oew-signal-evaluator`

Itera `signal_definitions` WHERE `enabled=true`. Por cada `(signal, brand, segment)`, lee data fresca del hub, compara contra `baselines`, INSERT en `signal_events` si supera umbral. Aplica filtros holiday/weekend/warm-up.

### Request

```http
POST /oew-signal-evaluator
Headers:
  x-internal-secret: <OEW_INTERNAL_SECRET>
  Content-Type: application/json
Body:
  {
    "run_id": "uuid",
    "brand_id": "<UUID opcional>",
    "signal_ids": ["S1","S11"]            // opcional
  }
```

### Response 200

```json
{
  "ok": true,
  "run_id": "uuid",
  "signals_evaluated": 91,
  "events_created": 14,
  "events_filtered_holiday": 3,
  "events_filtered_warm_up": 2,
  "brands_processed": 7
}
```

`signals_evaluated` = brand × signal × segment combinations evaluadas.

### Errors

| Status | error code | Causa |
|---|---|---|
| 400 | `missing_run_id` | Body sin `run_id` |
| 401 | `unauthorized` | Secret inválido |
| 404 | `run_not_found` | `run_id` no existe |
| 404 | `signal_definition_disabled` | `signal_ids` explícitos incluye uno con `enabled=false` |
| 500 | `hub_query_failed` | Cross-schema SELECT al hub falló |
| 500 | `baseline_lookup_failed` | No hay baseline para la combinación (correr baseline-builder primero) |
| 500 | `signal_event_insert_failed` | Error al persistir |

### Comportamiento clave

- **Append-only**: cada evaluación que supera umbral inserta una NUEVA row en `signal_events` (no UPSERT). El `(run_id, signal_id, brand_id, segment_hash)` actúa como agrupación natural.
- **Umbral**: `|metric_actual - baseline.median| > k * baseline.mad` con `k=3.5` por default (auto-calibrable por brand vía `brand_routing.k_factor`).
- **Filtros pre-evaluación**:
  - **Holiday**: si la `iso_week` contiene festivos del `brand_routing.country_iso`, expande la banda por `expected_traffic_reduction_pct` (configurado por brand, default 25%).
  - **Warm-up**: si `baselines.is_warm_up=true` y `signal.kind='lagging'`, NO inserta evento (skipea silenciosamente, incrementa `events_filtered_warm_up`).
  - **Weekend bias**: para signals que comparan WoW intra-semana, ignora rows con `day_of_week IN (6,7)` si el brand tiene `weekend_traffic_anomaly=true`.
- **YoY opcional**: si `brand_routing.seasonality_type='strong'`, compara también contra el baseline del mismo `iso_week_of_year` del año pasado. El campo `signal_events.payload.yoy_check` queda persistido.
- **Pluggable**: el evaluator delega a `_shared/signals/<signal_id>.ts` la lógica específica de cada señal (cómo extraer `metric_actual` del hub). El loop principal es agnóstico.
- **Severity inicial**: cada `signal_event` arranca con `tier ENUM('WATCH','YELLOW','RED')` calculado por la regla de la sección §15 de las convenciones. El clusterer puede escalarlo después si correlaciona con otros.

### Test con curl

```bash
# Evaluar todas las signals para el run:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-signal-evaluator \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"run_id":"<UUID>"}'

# Evaluar solo S11 (clicks out-of-band) para 1 brand (debug):
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-signal-evaluator \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"run_id":"<UUID>","brand_id":"7f9c...","signal_ids":["S11"]}'
```

---

## 9. `oew-incident-clusterer`

Agrupa `signal_events` del run actual + últimos 14 días en `incidents`. Heurística: mismo brand + ventana temporal de 14 días + solape ≥50% de URLs/keywords/segmento. También cierra incidents resueltos (sin signal_events nuevos en 14 días).

### Request

```http
POST /oew-incident-clusterer
Headers:
  x-internal-secret: <OEW_INTERNAL_SECRET>
  Content-Type: application/json
Body:
  {
    "run_id": "uuid"
  }
```

### Response 200

```json
{
  "ok": true,
  "run_id": "uuid",
  "incidents_opened": 3,
  "incidents_updated": 2,
  "incidents_closed": 1,
  "signal_events_clustered": 14,
  "signal_events_orphaned": 0
}
```

`incidents_updated` = incidents existentes a los que se les agregaron signal_events nuevos del run. `signal_events_orphaned` = eventos que no cuajaron en ningún cluster (raro; si >0, el clusterer los logueará en `run_events` para análisis).

### Errors

| Status | error code | Causa |
|---|---|---|
| 400 | `missing_run_id` | Body sin `run_id` |
| 401 | `unauthorized` | Secret inválido |
| 404 | `run_not_found` | `run_id` no existe |
| 500 | `clustering_failed` | Error en el algoritmo (overlap, hashing) |
| 500 | `incident_upsert_failed` | Error al persistir |

### Comportamiento clave

- **Idempotencia**: re-correr sobre el mismo `run_id` no crea incidents nuevos para signal_events ya clusterizados. Se identifica el `signal_event.incident_id` y se actualiza si el cluster cambió, sin duplicar.
- **Algoritmo de cluster**:
  1. Lee `signal_events` del `run_id` + los últimos 14 días con `incident_id IS NOT NULL` (para mergear con incidents abiertos).
  2. Agrupa preliminarmente por `brand_id`.
  3. Dentro de cada brand, agrupa por solape de URLs/keywords/segmento (calculado del JSON `payload.affected_urls` y `payload.affected_keywords`). Solape ≥50% → mismo cluster.
  4. Si un cluster matchea con un incident abierto existente (mismo `brand_id`, ventana 14 días, solape ≥50%), UPDATE ese incident; sino INSERT nuevo.
- **Severity del incident**: max(severity de signal_events del cluster) + escalado si correlaciona ≥3 signals (sube a RED automáticamente, regla §15 de las convenciones).
- **Cierre automático**: incidents con `status='open'` y sin signal_events nuevos en los últimos 14 días pasan a `status='resolved'`. El dispatcher no los re-encola.
- **Watch-only incidents**: si todos los signal_events del cluster son tier WATCH, el incident queda con `severity='WATCH'` y NO se le llama detective (va al digest semanal).

### Test con curl

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-incident-clusterer \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"run_id":"<UUID>"}'
```

---

## 10. `oew-detective`

Enriquece un incident con análisis LLM: thematic_cluster (max 60 tokens) + executive_summary (max 200 tokens). Idempotente: skipea si ya tiene entry en `incident_diagnostics`.

### Request

```http
POST /oew-detective
Headers:
  x-internal-secret: <OEW_INTERNAL_SECRET>
  Content-Type: application/json
Body:
  {
    "incident_id": "uuid",
    "force": false                         // si true, regenera el diagnostic
  }
```

### Response 200

```json
{
  "ok": true,
  "incident_id": "uuid",
  "diagnosis_saved": true,
  "thematic_cluster": "URLs de servicios odontológicos en mobile",
  "executive_summary_chars": 423,
  "top_urls_count": 5,
  "top_keywords_count": 12,
  "llm_model": "anthropic/claude-sonnet-4",
  "llm_tokens_in": 1842,
  "llm_tokens_out": 318
}
```

### Response 200 (skipped por idempotencia)

```json
{
  "ok": true,
  "incident_id": "uuid",
  "status": "already_diagnosed",
  "thematic_cluster": "URLs de servicios odontológicos en mobile"
}
```

### Errors

| Status | error code | Causa |
|---|---|---|
| 400 | `missing_incident_id` | Body sin `incident_id` |
| 401 | `unauthorized` | Secret inválido |
| 404 | `incident_not_found` | `incident_id` no existe |
| 409 | `incident_status_invalid` | Incident en `status='resolved'`; usar `force:true` para forzar |
| 500 | `llm_call_failed` | OpenRouter 5xx después de retries. Fallback degradado: persiste `thematic_cluster='unknown'` + `executive_summary='LLM unavailable; ver payload'` y devuelve 200 con `degraded:true` |
| 500 | `incident_diagnostics_insert_failed` | Error al persistir |

### Comportamiento clave

- **Idempotencia**: lookup previo a `incident_diagnostics WHERE incident_id = X`. Si existe y `force=false`, skipea. Con `force:true`, hace UPDATE.
- **Input al LLM**: top-10 URLs del incident (por clicks agregados del payload), top-15 keywords, lista de signals disparadas con sus métricas. Prompt agrega contexto de la brand (vertical, país).
- **Output del LLM**:
  - `thematic_cluster` (≤60 tokens): frase corta tipo "Caída de tráfico en URLs de blog/odontología en mobile-MX".
  - `executive_summary` (≤200 tokens): 2-3 oraciones describiendo qué pasó, qué señales correlacionan, próxima acción sugerida.
- **Modelo**: `OEW_MODEL` del Vault (default `anthropic/claude-sonnet-4`).
- **Costos**: ~$0.01 por incident típico. Con presupuesto $20/mes alcanza para ~2000 incidents/mes (muy por encima de lo esperado).
- **Fallback degradado**: si OpenRouter falla 3 veces, persiste un diagnostic mínimo (`thematic_cluster='unknown_llm_failed'`) y emite `warning` en `run_events`. El dispatcher continúa con summary placeholder.

### Test con curl

```bash
# Diagnóstico normal:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-detective \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"incident_id":"<UUID>"}'

# Regenerar diagnóstico (re-prompt LLM):
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-detective \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"incident_id":"<UUID>","force":true}'
```

---

## 11. `oew-dispatcher`

Lee incident + `brand_routing`, calcula severidad final, y solo dispatcha si `severity >= brand_routing.severity_threshold`. Encola en `public.notifications_outbox` con `source='oew_alert'`. Idempotente vía `dedupe_key` UNIQUE.

### Request

```http
POST /oew-dispatcher
Headers:
  x-internal-secret: <OEW_INTERNAL_SECRET>
  Content-Type: application/json
Body:
  {
    "incident_id": "uuid",
    "force": false                         // si true, re-encola aunque ya esté en incident_log
  }
```

### Response 200

```json
{
  "ok": true,
  "incident_id": "uuid",
  "severity": "RED",
  "enqueued_count": 2,
  "channel_id": "C0B1B3V4ZB5",
  "specialist_user_id": "U05LEAD",
  "dedupe_keys": [
    "oew:incident-uuid:v1:C0B1B3V4ZB5",
    "oew:incident-uuid:v1:U05LEAD"
  ]
}
```

`enqueued_count`:
- **1** si la brand no tiene `team_lead_user_id` en `brand_routing` (solo canal).
- **2** si tiene especialista configurado (canal + DM al especialista).
- **0** si `severity < brand_routing.severity_threshold` (suprimido por umbral, NO es error).

### Response 200 (suprimido por threshold)

```json
{
  "ok": true,
  "incident_id": "uuid",
  "status": "suppressed_below_threshold",
  "severity": "WATCH",
  "brand_severity_threshold": "YELLOW",
  "enqueued_count": 0
}
```

### Response 200 (skipped por idempotencia)

```json
{
  "ok": true,
  "incident_id": "uuid",
  "status": "already_dispatched",
  "enqueued_count": 0
}
```

### Errors

| Status | error code | Causa |
|---|---|---|
| 400 | `missing_incident_id` | Body sin `incident_id` |
| 401 | `unauthorized` | Secret inválido |
| 404 | `incident_not_found` | `incident_id` no existe |
| 404 | `incident_diagnostics_not_found` | El incident no tiene `incident_diagnostics` (correr detective primero) |
| 409 | `incident_status_resolved` | Incident ya cerrado; usar `force:true` para overrideear |
| 500 | `brand_routing_missing_and_no_fallback` | Brand sin `brand_routing` y `SLACK_FALLBACK_CHANNEL` no configurado |
| 500 | `outbox_enqueue_failed` | Error al INSERT en `notifications_outbox` |

### Comportamiento clave

- **Idempotencia**: lookup previo a `incident_log WHERE incident_id = X`. Si existe y `force=false`, skipea con `status:'already_dispatched'`. Adicionalmente, el `dedupe_key` UNIQUE en `notifications_outbox` previene doble-encolado a nivel BD.
- **Dedupe key**: `oew:<incident_id>:v1:<target>` donde `<target>` es `channel_id` o `user_id`. El `:v1:` permite invalidar dedupe si en el futuro se cambia el formato del mensaje.
- **Anti-spam por threshold**: si `incident.severity < brand_routing.severity_threshold` (ej. incident=WATCH y threshold=YELLOW), NO se encola y se devuelve `status:'suppressed_below_threshold'`. Estos incidents siguen siendo elegibles para el digest semanal.
- **Payload Slack**: Block Kit con: header (severidad + brand), descripción (executive_summary del detective), lista compacta de signals disparadas, top-3 URLs afectadas con clicks_drop, link al incident en el dashboard interno.
- **Sin envío directo**: el dispatcher NUNCA hace POST a Slack. Solo encola en outbox. El `outbox-worker` compartido (heredado de V1 / Lighthouse) entrega con retry exponencial.
- **Incident log**: INSERT en `incident_log` antes del enqueue. Si el enqueue falla, la fila de log queda en `status='enqueue_failed'` y el watchdog la detecta.
- **Sin destinatario "global" (CEO)**: solo canal + especialista. Si querés escalado a CEO, agregalo al routing del brand.

### Test con curl

```bash
# Dispatch normal:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-dispatcher \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"incident_id":"<UUID>"}'

# Re-dispatch forzado (debug):
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-dispatcher \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"incident_id":"<UUID>","force":true}'
```

---

## 12. `oew-digest-weekly`

Cron viernes 23:00 UTC (= 18:00 CO). Consulta `signal_events` de la semana con `tier='WATCH'` que NO escalaron a incident (o cuyo incident quedó suprimido por threshold). Agrupa por brand, construye Block Kit digest y encola en outbox.

### Request

```http
POST /oew-digest-weekly
Headers:
  x-internal-secret: <OEW_INTERNAL_SECRET>
  Content-Type: application/json
Body:
  {
    "trigger": "cron" | "manual",
    "iso_week": "2026-W20"                // opcional, default = semana actual (lun-vie)
  }
```

### Response 200

```json
{
  "ok": true,
  "iso_week": "2026-W20",
  "brands_in_digest": 4,
  "signals_summarized": 23,
  "enqueued_count": 4,
  "dedupe_key": "oew:digest:2026-W20"
}
```

`enqueued_count` = 1 row de digest por brand con WATCH signals (al canal de cada brand_routing). Si una brand no tiene WATCH signals en la semana, no se enqueue para esa brand.

### Response 200 (digest vacío)

```json
{
  "ok": true,
  "iso_week": "2026-W20",
  "status": "no_watch_signals",
  "brands_in_digest": 0,
  "enqueued_count": 0
}
```

### Errors

| Status | error code | Causa |
|---|---|---|
| 400 | `missing_trigger` | Body sin `trigger` |
| 400 | `invalid_iso_week` | Formato distinto a `YYYY-Www` |
| 401 | `unauthorized` | Secret inválido |
| 500 | `signal_events_query_failed` | SELECT falló |
| 500 | `outbox_enqueue_failed` | INSERT al outbox falló |

### Comportamiento clave

- **Idempotencia**: `dedupe_key='oew:digest:<iso_week>'` UNIQUE en outbox. Re-correr el mismo viernes no envía duplicados. Para forzar regeneración tras un bug, borrar manualmente la fila del outbox.
- **Scope**: solo `signal_events` con `tier='WATCH'` de la `iso_week`. NO incluye signals que escalaron a YELLOW/RED (esos ya se notificaron en tiempo real).
- **Agregación por brand**: una fila de digest por brand. Cada digest agrupa internamente por signal_id ("S1 detectó 3 URLs", "S5 detectó regresión LCP en 2 URLs").
- **Payload Slack**: Block Kit con: header semanal por brand, lista compacta de signals con conteos, link al dashboard interno. Sin LLM (es agregación determinística — barato y veloz).
- **Sin envío directo**: encola en outbox con `source='oew_alert'`, el worker compartido entrega.
- **Cron timing**: viernes 23:00 UTC = 18:00 Colombia (UTC-5). El operador puede ajustar el cron si la agencia opera en otro huso.

### Test con curl

```bash
# Disparo manual del digest de la semana actual:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-digest-weekly \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'

# Digest de una semana específica (re-trigger por bug):
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-digest-weekly \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","iso_week":"2026-W19"}'
```

---

# Diagrama de invocaciones

```
                                     DATA HUB (autonomous, cron-driven)
                                     ──────────────────────────────────
  pg_cron lunes 06:00 UTC ─────▶ hub-gsc-weekly ────────────▶ seo_data_hub.gsc_*
  pg_cron lunes 06:15 UTC ─────▶ hub-ga4-weekly ────────────▶ seo_data_hub.ga4_organic_weekly
  pg_cron lunes 06:30 UTC ─────▶ hub-cwv-weekly ────────────▶ seo_data_hub.cwv_weekly
  pg_cron día 28  06:00 UTC ───▶ hub-ahrefs-monthly ────────▶ seo_data_hub.ahrefs_*
  operador (on-demand) ────────▶ hub-crawl-loader ──────────▶ seo_data_hub.crawl_snapshots

                                     ORGANIC EARLY WARNING (martes-driven)
                                     ─────────────────────────────────────
  pg_cron martes 13:00 UTC
        │
        ▼
  oew-orchestrator
        │   1) valida ingestion_runs del hub frescos
        │   2) INSERT analysis_runs (status=running)
        │
        ├──▶ POST oew-baseline-builder  (await)
        │       └──▶ UPSERT organic_early_warning.baselines
        │
        ├──▶ POST oew-signal-evaluator  (await)
        │       └──▶ INSERT organic_early_warning.signal_events
        │
        ├──▶ POST oew-incident-clusterer  (await)
        │       └──▶ UPSERT organic_early_warning.incidents
        │
        ├──▶ fan-out por incident WHERE severity >= YELLOW:
        │       POST oew-detective  (Promise.allSettled)
        │       └──▶ UPSERT organic_early_warning.incident_diagnostics
        │            └──▶ LLM (OpenRouter)
        │
        ├──▶ fan-out por incident con diagnostic:
        │       POST oew-dispatcher  (Promise.allSettled)
        │       └──▶ INSERT public.notifications_outbox (source='oew_alert')
        │            └──▶ INSERT organic_early_warning.incident_log
        │
        └──▶ UPDATE analysis_runs (status=completed)

  pg_cron viernes 23:00 UTC ───▶ oew-digest-weekly ─────────▶ public.notifications_outbox
  pg_cron */30s (heredado V1) ─▶ outbox-worker (compartido) ─▶ Slack chat.postMessage
  pg_cron */2 min ─────────────▶ oew-watchdog (no listada acá; ver §6 convenciones)
```

---

# Pruebas con curl desde terminal

## Cron manual (smoke-test de cada cron)

```bash
# Forzar ingesta del hub (cada componente individual):
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-gsc-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" -d '{"trigger":"manual"}'

curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-ga4-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" -d '{"trigger":"manual"}'

curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-cwv-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" -d '{"trigger":"manual"}'

curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-ahrefs-monthly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" -d '{"trigger":"manual"}'

# Forzar corrida del orchestrator (después de tener hub fresco):
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-orchestrator \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" -d '{"trigger":"manual"}'

# Forzar digest semanal (cualquier día):
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-digest-weekly \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" -d '{"trigger":"manual"}'
```

## Evento sintético (cargar crawl manual para testear S3/S4)

```bash
# Cargar un crawl CSV para una brand (Screaming Frog export):
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-crawl-loader \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "brand_id": "7f9c1234-...",
    "crawl_date": "2026-05-19",
    "format": "csv",
    "export_url_or_base64": "https://storage.example.com/sf-export-brand7.csv"
  }'
```

## Forzar dispatch (debug)

```bash
# Re-llamar detective sobre un incident ya diagnosticado:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-detective \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"incident_id":"<UUID>","force":true}'

# Re-dispatch a Slack forzado:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-dispatcher \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"incident_id":"<UUID>","force":true}'
```

## PowerShell equivalente (Windows)

```powershell
# El backtick es line continuation; los " internos van escapados con \".
curl.exe -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-orchestrator `
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" `
  -H "Content-Type: application/json" `
  -d "{\"trigger\":\"manual\"}"
```

---

# Apéndice — tipos TypeScript de referencia

Las firmas exactas de los handlers viven en `02-edge-functions/_shared/types.ts` y se duplican acá para la IA ejecutora. Sin `any` libre.

```ts
// Tipos comunes
export type IsoWeek = `${number}-W${number}`;          // ej. "2026-W20"
export type PeriodMonth = `${number}-${number}`;       // ej. "2026-05"
export type Severity = "WATCH" | "YELLOW" | "RED";
export type SignalKind = "leading" | "lagging" | "mixed";

export interface ErrorBody {
  ok: false;
  error: string;
}

// Hub
export interface HubWeeklyRequest {
  trigger: "cron" | "manual";
  brand_id?: string;
  iso_week?: IsoWeek;
}

export interface HubMonthlyRequest {
  trigger: "cron" | "manual";
  brand_id?: string;
  period_month?: PeriodMonth;
}

export interface HubWeeklyResponse {
  ok: true;
  ingestion_run_id: string;
  iso_week: IsoWeek;
  brands_processed: number;
  brands_failed: number;
  rows_inserted: number;
  rows_updated?: number;
  brands_skipped?: number;
}

// OEW
export interface OewOrchestratorRequest {
  trigger: "cron" | "manual";
  brand_id?: string;
}

export interface OewOrchestratorResponse {
  ok: true;
  run_id: string;
  brands_processed: number;
  incidents_opened: number;
  incidents_dispatched: number;
  incidents_watch_tier: number;
  warning?: "hub_data_stale";
  details?: Record<string, unknown>;
}

export interface OewDispatcherRequest {
  incident_id: string;
  force?: boolean;
}

export interface OewDispatcherResponse {
  ok: true;
  incident_id: string;
  severity: Severity;
  enqueued_count: number;
  channel_id?: string;
  specialist_user_id?: string | null;
  dedupe_keys?: string[];
  status?: "already_dispatched" | "suppressed_below_threshold";
  brand_severity_threshold?: Severity;
}
```
