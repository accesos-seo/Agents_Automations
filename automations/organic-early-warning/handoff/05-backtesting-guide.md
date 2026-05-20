# 05 — Guía de Backtesting del motor estadístico

> Antes de leer esto: convenciones canónicas en `~/.claude/conventions/agentic-automations.md` y arquitectura del motor en `ARCHITECTURE.md` sección "El motor estadístico".

## Por qué backtesting

El motor estadístico de Organic Early Warning combina tres componentes con parámetros configurables:

1. **MAD (Median Absolute Deviation)** con factor `k` (default `3.5`) para definir bandas de normalidad por `(brand, signal, segment, iso_week_of_year)`
2. **Decay exponencial** sobre la ventana histórica de 8-12 semanas (más peso a semanas recientes)
3. **Auto-calibración por varianza** que ajusta `k` por brand (sitios con tráfico ruidoso → `k` más alto, menos sensible)

Estos parámetros tienen **defaults razonables pero no óptimos**. Sin backtesting:

- **Falsos positivos** pueden inundar `#alerts-operaciones` la primera semana de producción y forzar al equipo a silenciar el canal (peor outcome posible)
- **Falsos negativos** dejan pasar caídas reales y rompen el value-prop del sistema ("avisa antes")
- Los **pesos por señal** (`signal_definitions.weight`) están calibrados a ojo de buen cubero; el cluster severity depende fuerte de esto
- El tier **WATCH** puede explotar si la confianza umbral está mal seteada → el digest del Viernes se vuelve ilegible

Backtesting permite **medir precision, recall y F1 por señal** contra ground truth conocido antes de exponerse al usuario real.

---

## Workflow propuesto

### Paso 1 — Preparar dataset histórico

El evaluator necesita 8-12 semanas de data raw en el hub para que las baselines tengan `n_samples >= 8`. Tres opciones:

#### Opción A — Importar histórico de V1 (`seo_sentinel`)

V1 lleva semanas/meses corriendo y tiene `seo_sentinel.traffic_daily` y `seo_sentinel.position_snapshots` con data útil. Migrarla al hub:

```sql
-- Export CSV de traffic_daily de V1 → mapear a gsc_search_analytics_weekly del hub
-- (V1 es daily, hub es weekly → agregar)

INSERT INTO seo_data_hub.gsc_search_analytics_weekly
  (brand_id, iso_week, dimensions_hash, dimensions, clicks, impressions,
   ctr, position, ingested_at)
SELECT
  -- mapear V1 brand_id → hub brands_registry.id por dominio
  (SELECT id FROM seo_data_hub.brands_registry
     WHERE domain = (SELECT domain FROM seo_sentinel.brands WHERE id = td.brand_id)) AS brand_id,
  TO_CHAR(td.date, 'IYYY-IW') AS iso_week,
  md5('aggregated_v1_backfill') AS dimensions_hash,
  '{"source":"v1_backfill"}'::jsonb AS dimensions,
  SUM(td.clicks),
  SUM(td.impressions),
  CASE WHEN SUM(td.impressions) > 0 THEN SUM(td.clicks)::float / SUM(td.impressions) ELSE 0 END,
  AVG(td.position),
  NOW()
FROM seo_sentinel.traffic_daily td
WHERE td.integrity_status = 'approved'
  AND td.date >= NOW() - INTERVAL '12 weeks'
GROUP BY td.brand_id, TO_CHAR(td.date, 'IYYY-IW')
ON CONFLICT (brand_id, iso_week, dimensions_hash) DO UPDATE
  SET clicks = EXCLUDED.clicks,
      impressions = EXCLUDED.impressions,
      ingested_at = NOW();
```

**Limitación:** V1 agrupa por brand-day, no por dimensiones (device/country/page_type). El backfill produce baselines a nivel brand global, no segmentadas. Las señales S8 (CTR vs posición) y S9 (feature SERP perdido) **no se pueden backtestear** con este dataset porque requieren granularidad fina. Documentar en el report.

#### Opción B — Esperar warmup natural del hub

Apagar producción 8 semanas. **Inviable.** Saltar.

#### Opción C — Backfill manual desde GSC API

Script Python (fuera del scope de este doc, mencionar):

- Usar la misma Service Account
- Iterar `startDate` retrocediendo semana por semana
- POST `searchanalytics.query` con `rowLimit=25000`
- UPSERT directamente en `seo_data_hub.gsc_search_analytics_weekly`

Limitación: GSC solo retorna 16 meses de histórico. Para Ahrefs el backfill mensual también es posible pero **cuesta créditos por brand × mes** — confirmar presupuesto antes.

- [ ] Decidir opción (A recomendada si V1 tiene >=8 semanas útiles)
- [ ] Ejecutar y validar con: `SELECT brand_id, COUNT(DISTINCT iso_week) FROM seo_data_hub.gsc_search_analytics_weekly GROUP BY brand_id;`. Esperar `COUNT >= 8` para al menos 1 brand de prueba.

---

### Paso 2 — Marcar ground truth

Sin ground truth no hay forma de medir precision/recall. Necesitamos que un especialista marque manualmente las **anomalías reales conocidas** del período del histórico.

Crear tabla auxiliar:

```sql
CREATE TABLE IF NOT EXISTS organic_early_warning.backtest_ground_truth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  anomaly_date DATE NOT NULL,
  iso_week TEXT NOT NULL,
  signal_kind TEXT NOT NULL CHECK (signal_kind IN (
    'S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12','S13'
  )),
  confirmed_real BOOLEAN NOT NULL,
  severity_observed TEXT CHECK (severity_observed IN ('WATCH','YELLOW','RED')),
  root_cause TEXT,
  notes TEXT,
  marked_by TEXT NOT NULL,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON organic_early_warning.backtest_ground_truth (brand_id, iso_week);
```

Carga típica (lo hace el especialista a mano consultando GSC/GA4/tickets de soporte de esas semanas):

```sql
INSERT INTO organic_early_warning.backtest_ground_truth
  (brand_id, anomaly_date, iso_week, signal_kind, confirmed_real, severity_observed, root_cause, notes, marked_by)
VALUES
  ('<BRAND_UUID>', '2026-03-15', '2026-11', 'S11', true,  'RED',    'Migración a nuevo CMS rompió 200 URLs',  'Detectado por queja de cliente día 18', 'pedro@seolab'),
  ('<BRAND_UUID>', '2026-03-22', '2026-12', 'S5',  true,  'YELLOW', 'Lazy-load mal implementado',             'Vimos LCP saltó a 4.2s',                'pedro@seolab'),
  ('<BRAND_UUID>', '2026-04-05', '2026-14', 'S11', false, NULL,     'Caída estacional Semana Santa',          'No es anomalía, es feriado',             'pedro@seolab');
```

Reglas para el especialista:

- Marcar **todas** las anomalías que recuerda, incluyendo falsos positivos observados en V1 (con `confirmed_real=false`)
- Una anomalía puede involucrar múltiples signals (insertar 1 row por signal_kind)
- Si una caída es estacional/conocida (Semana Santa, Black Friday, etc.) marcarla con `confirmed_real=false` — el sistema NO debería dispararla

- [ ] Tabla creada
- [ ] Al menos 10 entries marcadas (sino el F1 va a tener varianza enorme)

**Sin ground truth marcada → saltar al final ("Limitaciones del backtest").**

---

### Paso 3 — Correr el evaluator en modo backtest

Script `scripts/backtest_runner.py` invocación:

```bash
python scripts/backtest_runner.py \
  --brand <BRAND_UUID> \
  --weeks 8 \
  --start-iso-week 2026-10 \
  --output report.json
```

Qué hace el script (lectura, sin escribir):

1. **Snapshot del estado actual** de `signal_definitions` y `baselines` (lo guarda en memoria para restaurar si rompe algo)
2. **Por cada (brand, week, signal)** en el rango:
   - Llama al evaluator vía HTTP local (no toca producción) con `period_start` / `period_end` históricos
   - El evaluator construye baseline considerando solo data **anterior** a `period_start` (evita data leakage)
   - Captura los `signal_events` que el evaluator hubiera generado
3. **Cruza con `backtest_ground_truth`** por (brand, iso_week, signal_kind):
   - TP (true positive): evaluator detectó + ground_truth `confirmed_real=true`
   - FP (false positive): evaluator detectó + ground_truth `confirmed_real=false` (o sin entry)
   - FN (false negative): ground_truth `confirmed_real=true` sin detección del evaluator
   - TN (true negative): no detectó + sin ground truth de esa semana
4. **Computa precision, recall, F1** por signal_id y agregado
5. **Genera `report.json`** con confusion matrix, top falsos positivos y top anomalías perdidas
6. **NO escribe nada en `signal_events`, `incidents`, ni `outbox`** (modo dry-run obligatorio)

Argumentos importantes:

| Flag | Default | Descripción |
|---|---|---|
| `--brand` | requerido | UUID de brand de `brands_registry` |
| `--weeks` | `8` | Cuántas semanas evaluar hacia atrás desde `--start-iso-week` |
| `--start-iso-week` | semana actual | Punto de partida |
| `--output` | `report.json` | Path del report |
| `--k` | `3.5` | Override del factor MAD para esta corrida |
| `--signals` | `all` | Lista comma-separated para filtrar señales (ej. `S5,S8,S11`) |
| `--dry-run` | `true` | Si `false` permite escribir baselines (no usar en producción) |

- [ ] Script corrido sin errores
- [ ] `report.json` generado en disco

---

### Paso 4 — Calibración por métrica

Leer el report y ajustar parámetros según esta tabla:

| Síntoma en report | Causa probable | Ajuste sugerido |
|---|---|---|
| `precision < 0.6` en signal X (muchos FP) | Banda muy ajustada → dispara con ruido normal | Subir `k` global (a 4.0 o 4.5) **o** subir `signal_definitions.threshold_k` solo para X |
| `recall < 0.5` en signal X (pierde anomalías) | Banda muy laxa o peso muy bajo | Bajar `k` (a 3.0) **o** subir `signal_definitions.weight` |
| Tier `WATCH` explota (>30 items por digest) | `confidence_threshold` para escalar a YELLOW es muy alto | Bajar `signal_definitions.confidence_to_escalate` de 0.7 a 0.5 |
| Muchos FP en weeks con `expected_traffic_reduction_pct > 0` (feriados) | El holiday adjuster no aplica al signal X | Verificar que el evaluator multiplica la banda por `1 + expected_traffic_reduction_pct` para S11/S12 |
| Recall alto pero precision baja en S6/S7 (Ahrefs) | Variación normal de backlinks mes a mes | Subir `warmup_min_samples` a 6 para señales monthly |
| F1 alto en S11/S12 pero RED nunca se dispara | El threshold de severity_hint='RED' está mal definido | Revisar la regla "lagging hard = drop ≥ 30% vs baseline" en `oew-signal-evaluator` |

Aplicación de cambios (todos los UPDATE son sobre `signal_definitions`, ningún cambio toca código):

```sql
-- Ejemplo: subir k de S11 a 4.0
UPDATE organic_early_warning.signal_definitions
SET config = jsonb_set(config, '{threshold_k}', '4.0'::jsonb)
WHERE kind_code = 'S11';

-- Ejemplo: bajar peso de S5 (CWV) de 10 a 7
UPDATE organic_early_warning.signal_definitions
SET weight = 7
WHERE kind_code = 'S5';
```

- [ ] Anotar cada cambio con timestamp y razón en un changelog local

---

### Paso 5 — Iteración

Re-correr el Paso 3 con los nuevos parámetros y comparar reports.

Criterio de aceptación para promover a producción:

- [ ] **F1 > 0.7** en al menos **8 de las 13 señales**
- [ ] **Precision > 0.6** global (más del 60% de las alertas son reales)
- [ ] **Recall > 0.6** global (capturamos más del 60% de las anomalías reales)
- [ ] Total de alertas YELLOW+RED por semana ≤ 5 por brand (techo anti-spam)
- [ ] Tier WATCH ≤ 15 items por digest semanal por brand

Si después de 3-4 iteraciones no se llega a estos números: probable que el dataset histórico sea insuficiente, o que la señal X no aplique a este tipo de sitio (deshabilitar con `UPDATE signal_definitions SET enabled=false WHERE kind_code='X'`).

---

### Paso 6 — Aprobación final (promote a producción)

```sql
-- 1. Confirmar el set final de signal_definitions
SELECT id, kind_code, kind, weight, enabled, warmup_min_samples,
       config->>'threshold_k' AS k,
       config->>'confidence_to_escalate' AS escalate
FROM organic_early_warning.signal_definitions
ORDER BY kind_code;

-- 2. Snapshot de la config aprobada (para rollback)
INSERT INTO organic_early_warning.signal_definitions_snapshots
  (snapshot_at, config_json, approved_by, notes)
SELECT
  NOW(),
  jsonb_agg(row_to_json(s.*)),
  'pedro@seolab',
  'Backtest aprobado — F1 promedio 0.78 sobre 8 semanas, dataset V1 backfill'
FROM organic_early_warning.signal_definitions s;

-- 3. Por brand: confirmar brand_routing
SELECT brand_id, channel_id, team_lead_user_id, severity_threshold, seasonality_type
FROM organic_early_warning.brand_routing
ORDER BY brand_id;

-- 4. Activar cron weekly definitivo (si estaba pausado durante backtest)
UPDATE cron.job SET active = true WHERE jobname IN ('oew-orchestrator', 'oew-digest-weekly');
```

- [ ] Snapshot guardado
- [ ] Cron jobs activos

**Si no existe la tabla `signal_definitions_snapshots`, crearla:**

```sql
CREATE TABLE organic_early_warning.signal_definitions_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  config_json JSONB NOT NULL,
  approved_by TEXT NOT NULL,
  notes TEXT
);
```

---

## Output esperado del `backtest_runner.py`

Ejemplo de `report.json`:

```json
{
  "metadata": {
    "brand_id": "11111111-2222-3333-4444-555555555555",
    "brand_name": "ejemplo-cliente.com",
    "weeks_evaluated": 8,
    "start_iso_week": "2026-10",
    "end_iso_week": "2026-17",
    "global_k": 3.5,
    "signals_evaluated": ["S1","S2","S5","S8","S11","S12","S13"],
    "signals_skipped": ["S3","S4","S6","S7","S9","S10"],
    "skipped_reason": "S3/S4 require crawl_snapshots not in backfill; S6/S7/S10 monthly Ahrefs without history",
    "run_at": "2026-05-20T15:30:00Z",
    "dry_run": true
  },
  "summary": {
    "total_evaluations": 56,
    "true_positives": 12,
    "false_positives": 4,
    "false_negatives": 3,
    "true_negatives": 37,
    "precision_global": 0.75,
    "recall_global": 0.80,
    "f1_global": 0.77
  },
  "by_signal": [
    {
      "signal": "S1",
      "tp": 2, "fp": 0, "fn": 1, "tn": 5,
      "precision": 1.00, "recall": 0.67, "f1": 0.80,
      "suggestion": "Bajar warmup_min_samples de 4 a 3 — perdiendo anomalías de semanas iniciales"
    },
    {
      "signal": "S5",
      "tp": 3, "fp": 1, "fn": 0, "tn": 4,
      "precision": 0.75, "recall": 1.00, "f1": 0.86,
      "suggestion": "OK — mantener config actual"
    },
    {
      "signal": "S11",
      "tp": 4, "fp": 2, "fn": 1, "tn": 1,
      "precision": 0.67, "recall": 0.80, "f1": 0.73,
      "suggestion": "Precision baja por FP en weeks con eventos estacionales no marcados — subir k a 4.0 o agregar entries holiday_calendar"
    },
    {
      "signal": "S13",
      "tp": 1, "fp": 1, "fn": 0, "tn": 6,
      "precision": 0.50, "recall": 1.00, "f1": 0.67,
      "suggestion": "S13 muy sensible. Subir confidence_threshold de 0.4 a 0.6"
    }
  ],
  "top_false_positives": [
    {
      "iso_week": "2026-14",
      "signal": "S11",
      "deviation_sigma": 2.8,
      "metric_actual": 1850,
      "metric_expected": 2400,
      "ground_truth_marked": true,
      "ground_truth_real": false,
      "ground_truth_notes": "Semana Santa — caída estacional conocida"
    },
    {
      "iso_week": "2026-12",
      "signal": "S5",
      "deviation_sigma": 3.1,
      "metric_actual": 3200,
      "metric_expected": 2100,
      "ground_truth_marked": false,
      "note": "Sin entry en ground_truth — pedir al especialista que clasifique"
    }
  ],
  "top_missed_anomalies": [
    {
      "iso_week": "2026-11",
      "signal": "S1",
      "ground_truth_severity": "RED",
      "ground_truth_root_cause": "Migración CMS rompió 200 URLs",
      "evaluator_metric_actual": 0.92,
      "evaluator_metric_expected": 0.95,
      "evaluator_deviation_sigma": 1.8,
      "reason_missed": "Banda 3.5*MAD = 0.06 → no se disparó. Bajar k a 2.5 lo hubiera capturado"
    }
  ],
  "calibration_suggestions": [
    "Global: precision 0.75 / recall 0.80 / F1 0.77 — por encima del threshold de 0.7. APROBADO para producción.",
    "S11: considerar agregar Semana Santa al holiday_calendar para esta brand (país='CO', dates=['2026-03-29','2026-04-04'])",
    "S13: subir confidence_threshold a 0.6 evita 1 FP sin afectar TPs",
    "S3/S4/S6/S7/S9/S10: NO se backtestearon por falta de data — correr backtest de nuevo cuando el hub tenga 3 meses de Ahrefs + crawl"
  ]
}
```

Campos clave:

- `by_signal[].suggestion`: texto humano-legible de qué ajustar (input para Paso 4)
- `top_false_positives`: las 10 alertas que el sistema dispara y que el especialista NO quería ver
- `top_missed_anomalies`: las 10 caídas reales que el sistema NO capturó (más graves que los FP)
- `calibration_suggestions`: agregado final tipo "go / no-go" con lista de tweaks recomendados

---

## Limitaciones del backtest

1. **No detecta concept drift**: la baseline cambia con el tiempo (sitios que crecen, cambian de estacionalidad, agregan/quitan productos). El backtest mide performance en un período fijo; en producción los parámetros pueden necesitar re-calibración cada 3-6 meses. **Mitigación:** re-correr el backtest cada quarter con data reciente.

2. **No predice tier de severidad real**: el evaluator marca `severity_hint` por signal, pero el tier final (WATCH/YELLOW/RED) lo decide el `oew-incident-clusterer` combinando varias signals. El backtest solo mide si la señal individual dispara o no — el clustering completo requiere otro nivel de validación (ver "backtest del clusterer", fuera del scope inicial).

3. **Sin ground truth → ciego**: si el especialista no marcó las 10+ anomalías reales del histórico, el F1 no significa nada. Sin ground truth, el report solo puede comparar contra V1 (`seo_sentinel.clicks_anomalies` y `position_anomalies`), pero V1 también puede equivocarse — esto NO es ground truth, es comparación lado a lado.

4. **Backfill V1 → hub pierde granularidad**: V1 es daily a nivel brand global, el hub es weekly segmentado. Señales que dependen de segmentos finos (S8 CTR vs posición, S9 feature SERP) **no son backtesteables** con backfill V1. Hay que esperar 8 semanas de hub real para esas.

5. **Ahrefs cuesta créditos**: backfill mensual hacia atrás de S6/S7/S10 consume del presupuesto. Confirmar con `AHREFS_CREDIT_BUDGET_MONTH` antes de pedir histórico de >2 meses.

6. **Dataset chico → varianza alta**: con menos de 5 entries en `backtest_ground_truth`, un solo FP cambia la precision en 20%. Asegurar dataset >= 10 antes de tomar decisiones de calibración basadas en el report.

7. **El backtest valida lógica, no infraestructura**: aunque el F1 sea perfecto, en producción puede romperse por límites de API, cron mal configurado, secrets caducados. El backtest **NO reemplaza** la `02-validation-checklist.md`.
