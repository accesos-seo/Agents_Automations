# Arquitectura — Organic Early Warning + Data Hub

> Antes de leer este doc, asegurate de tener claras las convenciones canónicas: `CONVENTIONS.md` (root del repo, también espejado en `C:\Users\ceoel\.claude\conventions\agentic-automations.md`).

## Visión global

```
┌──────────────────────────────────────────────────────────────────┐
│  DATA HUB — schema seo_data_hub (Light_House)                    │
│  Capa "bronze": ingesta cruda, sin lógica de negocio             │
│                                                                  │
│  pg_cron:                                                        │
│   ├── Lunes 06:00 UTC → hub-gsc-weekly                           │
│   ├── Lunes 06:15 UTC → hub-ga4-weekly                           │
│   ├── Lunes 06:30 UTC → hub-cwv-weekly                           │
│   ├── Día 28 06:00 UTC → hub-ahrefs-monthly                      │
│   └── */5 * * * * → hub-watchdog                                 │
│                                                                  │
│  Tablas raw (UPSERT idempotente por brand_id+iso_week/month):    │
│   ├── gsc_search_analytics_weekly  (clicks/impr/pos por dim)     │
│   ├── gsc_url_inspection_weekly    (estado de indexación)        │
│   ├── gsc_coverage_weekly          (errores 404/5xx/etc)         │
│   ├── ga4_organic_weekly           (sessions/users/convers.)     │
│   ├── cwv_weekly                   (LCP/INP/CLS p75 por device)  │
│   ├── ahrefs_backlinks_monthly                                   │
│   ├── ahrefs_serp_monthly                                        │
│   ├── ahrefs_toxic_links_monthly                                 │
│   └── crawl_snapshots              (Screaming Frog exports)      │
│                                                                  │
│  Catálogo:                                                       │
│   ├── brands_registry              (fuente de verdad de brands)  │
│   ├── ingestion_runs               (audit de cada corrida)       │
│   └── run_events                   (append-only trace)           │
└──────────────────────────────────────────────────────────────────┘
                            │
                            │  cross-schema SELECT (service-role)
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  ORGANIC EARLY WARNING — schema organic_early_warning            │
│  Capa "silver/gold": lógica de detección + alertas               │
│                                                                  │
│  pg_cron:                                                        │
│   ├── Martes 13:00 UTC (=08:00 CO) → oew-orchestrator            │
│   ├── Viernes 23:00 UTC (=18:00 CO) → oew-digest-weekly          │
│   ├── */2 * * * * → oew-watchdog                                 │
│   └── 30 seconds → oew-outbox-worker (compartido con V1)         │
│                                                                  │
│  Flujo del orchestrator:                                         │
│   1. Verifica que hub terminó (ingestion_runs.status='completed' │
│      con period_end >= esta semana)                              │
│   2. INSERT analysis_runs (status='running')                     │
│   3. POST oew-baseline-builder (actualiza baselines)             │
│   4. POST oew-signal-evaluator (evalúa 13 señales sobre el hub)  │
│   5. POST oew-incident-clusterer (agrupa signal_events)          │
│   6. Por cada incident con severity >= YELLOW: POST oew-detective│
│   7. POST oew-dispatcher por cada incident diagnosticado         │
│   8. UPDATE analysis_runs (status='completed')                   │
│                                                                  │
│  Tablas:                                                         │
│   ├── brand_routing                (por marca: canal + lead +    │
│   │                                 severity_threshold)          │
│   ├── signal_definitions           (catálogo 13 señales,         │
│   │                                 pluggable, enabled flag)     │
│   ├── baselines                    (mean/median/MAD por          │
│   │                                 brand×signal×segment×week)   │
│   ├── signal_events                (UNIFICADA — reemplaza V1     │
│   │                                 clicks_anomalies +           │
│   │                                 position_anomalies)          │
│   ├── incidents                    (cluster de signal_events)    │
│   ├── incident_diagnostics         (LLM + thematic_cluster)      │
│   ├── incident_log                 (auditoría inmutable)         │
│   ├── analysis_runs                                              │
│   └── run_events                   (extendido con event_types    │
│                                     nuevos: baseline_recomputed, │
│                                     incident_clustered, etc.)    │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼  vía public.notifications_outbox
┌──────────────────────────────────────────────────────────────────┐
│  Slack (bot Orbit SeoLab D0A4NMACLPP)                            │
│   ├── Canal #alerts-operaciones (C0B1B3V4ZB5) — SIEMPRE          │
│   └── DM al especialista (organic_early_warning.brand_routing.   │
│       team_lead_user_id) — si severity >= severity_threshold     │
└──────────────────────────────────────────────────────────────────┘
```

## Por qué dividir en HUB + OEW

| Razón | Beneficio |
|---|---|
| Separar ingesta de lógica | Lighthouse, V1, V2, futuros sistemas leen el mismo hub. Una sola llamada a GSC sirve para todos |
| Costo de Ahrefs | 1 corrida mensual al hub vs N corridas mensuales en N consumidores |
| Failure isolation | Si el evaluator de V2 tiene bug, el hub sigue funcionando y guardando data. Cuando el bug se arregla, V2 reprocesa el histórico |
| Time-travel | Backtesting es trivial: re-correr el evaluator sobre datos del hub históricos |
| Consistencia | Lighthouse y V2 nunca van a ver clicks distintos para la misma URL/fecha |

## Convenciones de naming (este proyecto)

- Schema hub: `seo_data_hub`
- Schema V2: `organic_early_warning`
- Prefijo edge fns hub: `hub-*` (ej. `hub-gsc-weekly`)
- Prefijo edge fns V2: `oew-*` (ej. `oew-orchestrator`)
- Tablas raw del hub: sufijo `_weekly` o `_monthly` (cadencia explícita en el nombre)
- Tablas V2: snake_case plural (`signal_events`, `incidents`)
- Variable secreta interna hub: `HUB_INTERNAL_SECRET`
- Variable secreta interna oew: `OEW_INTERNAL_SECRET`

## El motor estadístico (corazón de V2)

`oew-baseline-builder` calcula y persiste en `baselines`, para cada combinación `(brand_id, signal_id, segment_hash, iso_week_of_year)`:

- `median` y `mad` (Median Absolute Deviation) de las últimas 8-12 semanas
- `mean` y `std` (para compatibilidad y debugging)
- `trend_slope` (regresión Mann-Kendall sobre el rango)
- `n_samples`
- `last_recomputed`

`oew-signal-evaluator` compara `metric_actual` contra `baseline.median ± k * baseline.mad`. El factor `k` arranca en 3.5 (~99% para distribución normal) y se auto-calibra por brand (sitios pequeños → k más grande, menos sensible).

Anti-falsos-positivos:
- **Warm-up**: brands con `n_samples < 4` no disparan signals lagging (devuelven `severity=WATCH` con `confidence < 0.5`)
- **Holidays**: si `iso_week` contiene festivos del país de la brand, expansión de banda por `expected_traffic_reduction_pct`
- **YoY**: si `brand_routing.seasonality_type='strong'`, comparar también contra mismo `iso_week` del año pasado

## Severity / orquestación (anti-spam)

```
WATCH    = ≥1 leading triggered, 0 lagging confirming
           → no alerta inmediata, va al digest del Viernes

YELLOW   = ≥1 leading + ≥1 lagging confirmando (mismo brand/segment)
           OR 1 lagging "soft" (e.g. clicks fuera de banda pero <30%)
           → Slack inmediato

RED      = ≥1 lagging "hard" (clicks -30%+ vs baseline)
           OR ≥3 signals correlacionados (mismas URLs/keywords/segmento)
           OR ≥1 S1 sobre URL del top-tráfico
           → Slack inmediato + escalado en mention
```

`oew-incident-clusterer` agrupa signal_events relacionados en un único `incident` ANTES de dispatch. Heurística de cluster:

- Mismo `brand_id`
- Ventana temporal de 14 días
- Solape ≥50% en URLs/keywords/segmentos del payload

Esto evita "5 alertas, misma causa raíz". El dedupe_key del outbox usa `incident_id`, no `signal_event_id`.

## Catálogo de señales y mapeo a tablas del hub

| ID | Lee de | Cadencia |
|---|---|---|
| S1 (URL fuera índice) | `gsc_url_inspection_weekly` | weekly |
| S2 (errores cobertura) | `gsc_coverage_weekly` | weekly |
| S3 (cambios on-page) | `crawl_snapshots` | weekly (depende del crawl) |
| S4 (links rotos) | `crawl_snapshots` | weekly |
| S5 (CWV regresión) | `cwv_weekly` | weekly |
| S6 (caída ref domains) | `ahrefs_backlinks_monthly` | monthly |
| S7 (pico tóxicos) | `ahrefs_toxic_links_monthly` | monthly |
| S8 (CTR vs posición) | `gsc_search_analytics_weekly` | weekly |
| S9 (feature SERP perdido) | `gsc_search_analytics_weekly` | weekly |
| S10 (competidor nuevo) | `ahrefs_serp_monthly` | monthly |
| S11 (clicks/pos out-of-band) | `gsc_search_analytics_weekly` | weekly |
| S12 (conversiones) | `ga4_organic_weekly` | weekly |
| S13 (divergencia GSC↔GA4) | `gsc_search_analytics_weekly` + `ga4_organic_weekly` | weekly |

Las señales `monthly` solo se evalúan cuando el orchestrator detecta que hubo una corrida `hub-ahrefs-monthly` desde la última evaluación (consulta `seo_data_hub.ingestion_runs`).

## Segmentación

Cada signal de GSC se evalúa por **segmento** además de a nivel marca. Dimensiones nativas de la Search Analytics API:

- `branded` (regex sobre query — configurable por brand)
- `device` (`mobile`/`desktop`)
- `country` (top 5 países por tráfico de la brand)
- `page_type` (`/blog/`, `/producto/`, etc. — regex configurable)

El `oew-signal-evaluator` itera signals × brands × segmentos. La detección es a nivel segmento; el **alerting se consolida a nivel brand** (el incident agrupa segments en un único mensaje).

## Reglas del data hub

1. **Idempotencia obligatoria**: todas las INSERT son UPSERT con `ON CONFLICT (brand_id, iso_week, dimensions_hash) DO UPDATE`. Re-correr una ingesta no duplica.
2. **Cero lógica de negocio**: el hub NO calcula deltas, NO detecta anomalías, NO compara. Solo persiste.
3. **Particionado por mes**: tablas `_weekly` y `_monthly` se particionan por `created_at`. Función `seo_data_hub.ensure_monthly_partitions()` auto-crea los próximos 3 meses; corre desde el watchdog.
4. **Retención 24 meses**: particiones >24 meses se DETACH y se pueden archivar/dropear. Política inicial: dropear (storage Supabase no es ilimitado).
5. **Audit completo**: cada corrida del hub registra en `ingestion_runs` (status, period, rows_inserted, error_message) + emite events en `run_events`.

## Cuotas y límites de API

| API | Límite | Mitigación |
|---|---|---|
| GSC Search Analytics | 1200 query/min, 30k/día por property | Pagina con `rowLimit=25000`, batch por brand, retry exponencial con `Retry-After` |
| GSC URL Inspection | ~2000 inspecciones/día/property | Solo top-100 URLs por tráfico; rotación si hay más |
| GA4 Data API | 50k requests/proyecto/día, 1250/h/property | Suficiente para weekly con margen |
| CrUX API | 1000 query/día por API key | Suficiente; fallback a PSI si CrUX no cubre la URL |
| PSI (Lab) | 25k queries/día con API key | Más caro, usar solo como fallback |
| Ahrefs API | Variable por plan; costo por crédito | Mensual día 28 amortiza el costo; presupuesto definido en SECRETS.md |

## Riesgos identificados

1. **Cross-schema queries Postgres pueden ser lentas sin índices**: cada tabla del hub tiene índice por `(brand_id, iso_week)` o `(brand_id, period_month)`. El `oew-signal-evaluator` SELECT del hub debe usar esos índices.
2. **Backtesting requiere histórico**: si V1 tiene <8 semanas de data útil, primeras 8 semanas del hub son "warm-up" sin alertas adversariales (solo digest WATCH). Documentado en `handoff/03-runbook.md`.
3. **Particionado puede romper INSERTs futuros**: la función `ensure_monthly_partitions()` debe ser absolutamente idempotente y correr ANTES de cualquier INSERT al mes nuevo. Test obligatorio antes de fin de mes.
4. **Conflictos de notificación con V1**: ambos sistemas pueden detectar la misma caída. Mitigación durante coexistencia: distintos `dedupe_key` prefix (`seo_sentinel:` vs `oew:`). Decisión de apagar V1 en `handoff/04-task-list-tecnico.md` Fase E.
5. **Watch tier puede ser ruidoso al inicio**: el digest semanal lo absorbe. Si después de 4 semanas el digest tiene >50 items, recalibrar pesos.
6. **Ahrefs créditos**: si la cuenta se queda sin créditos antes del día 28, el `hub-ahrefs-monthly` falla y señales S6/S7/S10 quedan sin evaluar. El watchdog detecta esto y envía aviso a `SLACK_ADMIN_CHANNEL`.

## Decisiones de diseño que NO son negociables

- **Schema dedicado para cada componente** (`seo_data_hub` y `organic_early_warning`). Cero tablas operativas en `public` excepto `notifications_outbox` heredada.
- **Outbox compartido**: `public.notifications_outbox` ya existe (creada por Lighthouse). El dispatcher filtra por `source='oew_alert'`.
- **`signal_events` UNIFICADA**: NO crear tablas separadas por tipo de señal. La pluggabilidad pasa por `signal_definitions`.
- **Bot Orbit SeoLab compartido**: NUNCA crear app Slack nueva.
- **Severidad WATCH va a digest**, no a alerta inmediata. Es la regla anti-spam más importante.
- **Cron weekly + monthly, NO daily**: el usuario explícitamente prefirió volumen reducido sobre frecuencia. Las señales leading siguen siendo leading a cadencia semanal.

## Decisiones que SÍ se pueden ajustar después de validación

- Factor `k` del motor estadístico (default 3.5)
- Pesos por señal en `signal_definitions.weight` (default 5/10)
- Umbral de severidad por brand en `brand_routing.severity_threshold` (default 'YELLOW')
- Tamaño de la ventana del baseline (default 8 semanas, hasta 12 si hay data)
- Heurística del clusterer (solape de URLs ≥50%)
