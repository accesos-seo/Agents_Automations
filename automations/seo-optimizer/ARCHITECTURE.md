# Architecture — seo-optimizer

Documento canónico de diseño. Léelo completo antes de modificar cualquier parte del sistema. Si encuentras una discrepancia entre este documento y el código, **este documento es la verdad** — actualiza el código.

---

## 1. Background y goal

### Problema

El cliente tiene un sistema (`seo_sentinel`, en `position-watch/`) que detecta **caídas** de tráfico SEO (defensivo). Pero no tiene un sistema **ofensivo** que identifique y proponga mejoras proactivas: qué artículos están en posición 8 podrían estar en posición 3, qué artículo recibe impresiones por keywords que no están optimizadas en el contenido, etc.

### Goal

Cada mes, para cada cliente activo de la agencia:
1. Identificar **automáticamente** las 10 mejores oportunidades de optimización de contenido SEO.
2. Presentárselas al especialista SEO para decisión (approve/reject).
3. Al aprobar, generar la **propuesta de reescritura en HTML** lista para que un redactor humano la implemente en el CMS.
4. A los 45 días post-implementación, **medir el impacto** automáticamente.

### No-goals (explícitos)

- ❌ Auto-publicación en el CMS sin intervención humana.
- ❌ Análisis de backlinks o autoridad de dominio (eso es Ahrefs, separado).
- ❌ Análisis de Core Web Vitals / performance (es infra, no contenido).
- ❌ Análisis de competidores en SERP (potencial v2).
- ❌ Re-extracción de data que ya está en `seo_sentinel.position_snapshots` — son sistemas independientes con cadencias distintas.

---

## 2. Glossary

| Término | Definición |
|---|---|
| **Cliente** / **Marca** | Unidad de propiedad en Orbit (`public.clientes`). Cada cliente tiene 0..N artículos en `content_items` y 1 propiedad GSC. |
| **Artículo** | Una row en `public.content_items` con `final_published_url` no-nulo (publicado). |
| **Run** | Una ejecución completa del pipeline mensual. Identificada por `seo_optimizer.runs.id`. |
| **Opportunity** | Una propuesta de optimización detectada por el Analista. Tiene categoría, score, status (pending/approved/etc.) y evidencia. |
| **Rewrite** | El HTML reescrito que produce el Agente Redactor cuando una opportunity es aprobada. |
| **Especialista SEO** | El humano que aprueba/rechaza opportunities. Es el único aprobador. Importante: el usuario dicta por voz y a veces dice "CEO" cuando quiere decir "SEO" — siempre interpretar como el especialista SEO. |
| **Redactor** | El humano que implementa el rewrite en el CMS. No aprueba — ejecuta. |
| **Striking Distance** | Queries en posiciones 5-15 de Google. Concepto de la industria SEO: subir de #8 a #3 multiplica el CTR ~5x. |
| **YoY** | Year-over-year. Comparación contra el mismo período del año anterior (para neutralizar estacionalidad). |
| **WoW** | Week-over-week. Comparación contra los 7 días anteriores (usado por `seo_sentinel`, no por nosotros). |

---

## 3. Inputs y outputs del sistema

### Inputs (lo que el sistema lee)

| Fuente | Datos | Frecuencia |
|---|---|---|
| **Google Search Console API** | clicks, impresiones, CTR, posición — por URL × query × date × country × device | Cada run mensual: 90 días + 90 días YoY |
| **`public.clientes`** | Identidad y configuración del cliente | Cada run |
| **`public.content_items`** | `id`, `title`, `slug`, `language`, `country`, `main_keyword`, `secondary_keywords`, `final_published_url`, `staging_url`, `article_content`, `version`, `is_latest_version`, `client_id`, `publication_date`, `published_at`, `meta_description` | Cada run |
| **`public.article_analysis_index`** | `search_intent`, `customer_journey_stage`, `cluster_id`, `cluster_key`, `main_entities`, `summary_150_words`, `semantic_fingerprint`, `content_role`, `recommended_cta_type` | Cada run (JOIN) |
| **Live URL fetch** | HTML renderizado del artículo en producción | Cada run (con fallback) |
| **`seo_optimizer.rejection_log`** | Memoria de rechazos previos | Cada run (para no re-proponer) |

### Outputs (lo que el sistema produce)

| Destino | Datos |
|---|---|
| **`seo_optimizer.opportunities`** | Top 10 propuestas por cliente, con score, evidencia y recomendación |
| **`seo_optimizer.opportunity_rewrites`** | HTML reescrito (post-aprobación) |
| **`seo_optimizer.reeval_results`** | Outcome a +45 días |
| **`public.notifications_outbox`** | Mensajes Slack (al especialista SEO y al redactor) |
| **Front-end de Orbit** (TBD) | Vista de oportunidades pendientes, vista de redactor |

---

## 4. Las 6 categorías de oportunidad — lógica detallada

Cada categoría es un módulo Python en `02-agents/analyst/categories/`. Reciben un `ClientAnalysisContext` (con `gsc_data`, `article_snapshot`, `analysis_index_row`) y devuelven `list[Opportunity]`.

### Categoría A: `decay.py` — Decaimiento

**Pregunta SEO**: ¿qué artículos están perdiendo clicks comparado contra el mismo período del año pasado?

**Detección**:
```
For each url in gsc_data:
    clicks_current = sum(clicks for that url in current period)
    clicks_yoy     = sum(clicks for that url in YoY period)
    if clicks_yoy >= 50 AND (clicks_yoy - clicks_current) / clicks_yoy >= 0.20:
        emit Opportunity(category='decay')
```

**Score**: `clicks_lost × 1.5` (peso alto: rescatar lo que funcionaba).

**Evidence**:
```json
{
  "clicks_current": 245,
  "clicks_yoy": 890,
  "drop_pct": 0.725,
  "top_queries_lost": [
    {"query":"...", "clicks_yoy":120, "clicks_current":15, "position_yoy":3.2, "position_current":8.4},
    ...
  ]
}
```

**Recommendation pattern**: identificar qué queries específicas cayeron y proponer refrescar el contenido relacionado con esas queries.

**Confidence**: high.

**Effort**: medium (refresh de secciones).

---

### Categoría B: `striking_distance.py` — Posiciones 5-15

**Pregunta SEO**: ¿qué queries están "cerca de la primera página" o "cerca del top 3"?

**Detección**:
```
For each (url, query) in gsc_data:
    if 5 <= position_avg <= 15 AND impressions_current >= 500:
        emit Opportunity(category='striking_distance')
```

**Score**:
```python
ctr_target = ctr_benchmark_for_position(3)   # ~28% típico
ctr_current = ctr_actual
projected_clicks = impressions * (ctr_target - ctr_current)
score = projected_clicks * 2.0   # peso alto: ROI claro
```

**Benchmarks de CTR por posición** (curva tipo Sistrix, ajustable):
| Posición | CTR esperado |
|---|---|
| 1 | 0.40 |
| 2 | 0.20 |
| 3 | 0.13 |
| 4 | 0.09 |
| 5 | 0.07 |
| 6 | 0.05 |
| 7 | 0.04 |
| 8 | 0.03 |
| 9 | 0.025 |
| 10 | 0.02 |
| 11-20 | 0.01 |

**Recommendation pattern**: identificar qué queries están cerca y proponer refuerzo específico (mejor cobertura semántica, H2 que mencione la query, FAQ section).

**Confidence**: high.

**Effort**: low-medium.

---

### Categoría C: `low_ctr.py` — CTR anómalo

**Pregunta SEO**: ¿qué artículos tienen buena posición pero la gente no clickea?

**Detección**:
```
For each (url, query) in gsc_data:
    if 1 <= position_avg <= 10 AND impressions_current >= 1000:
        ctr_expected = ctr_benchmark_for_position(round(position_avg))
        if ctr_current < ctr_expected * 0.5:
            emit Opportunity(category='low_ctr')
```

**Score**: `impressions × (ctr_expected - ctr_actual)` — clicks que se están dejando sobre la mesa.

**Recommendation pattern**: revisar y reescribir **title tag + meta description**. NO requiere editar el cuerpo. Es la categoría con mayor ROI vs esfuerzo.

**Confidence**: high.

**Effort**: low (solo metadata).

---

### Categoría D: `semantic_coverage.py` — Cobertura semántica faltante

**Pregunta SEO**: ¿qué keywords está rankeando este artículo a pesar de no mencionarlas claramente?

**Detección**:
```
For each url with article_snapshot:
    queries_for_url = gsc_data.filter(url=url, impressions >= 100)
    article_text = extract_searchable_text(article_snapshot)
       # incluye: title_tag, meta_description, h1, headings, primer párrafo, alt-text

    for query in queries_for_url:
        if not query_appears_in(query, article_text, language=article.language):
            # "appears" = lema o variante stemmed
            missing.append(query)

    if len(missing) >= 3:
        emit Opportunity(category='semantic_coverage')
```

**Stemming/lematización** por idioma:
- ES: snowball.SnowballStemmer('spanish')
- EN: nltk PorterStemmer
- PT-BR: snowball.SnowballStemmer('portuguese')

**Score**: `sum(impressions for missing queries) × position_factor` (más alto si las posiciones son mejorables).

**Recommendation pattern**: lista de keywords huérfanas + sección sugerida donde integrarlas (H2 nuevo, FAQ, expansión de párrafo existente).

**Confidence**: medium-high.

**Effort**: medium (editar cuerpo).

**LLM usage**: opcional. Para casos ambiguos (ej. sinónimos), el Analista hace una pasada LLM corta para confirmar que la keyword realmente no está cubierta.

---

### Categoría E: `cannibalization.py` — Canibalización interna

**Pregunta SEO**: ¿hay dos artículos del mismo cliente compitiendo por la misma query?

**Detección**:
```
For each query in gsc_data:
    urls_ranking = list of distinct urls of same client_id with position <= 30
    if len(urls_ranking) >= 2:
        # Verificar que hay competencia real, no solo 2 URLs lejanas
        top_2 = sorted by position, take 2
        if abs(top_2[0].position - top_2[1].position) < 10:
            emit Opportunity(category='cannibalization', primary_url=top_2[0].url)
```

**Score**: `combined_clicks × 0.7` (penalizado por incertidumbre del fix).

**Recommendation pattern**:
- Opción A: consolidar (redirect del más débil al más fuerte)
- Opción B: diferenciar intención (uno para informacional, otro para transaccional)
- Opción C: ajustar internal linking

Cada opportunity de canibalización referencia **una URL primaria** pero documenta en `evidence` las URLs competidoras.

**Confidence**: medium.

**Effort**: high (decisión estratégica).

---

### Categoría F: `intent_mismatch.py` — Desajuste de intención

**Pregunta SEO**: ¿el artículo está rankeando para queries con intención distinta a la que el artículo cubre?

**Detección**:
```
declared_intent = article_analysis_index.search_intent
                  # ej. 'informational' / 'commercial' / 'transactional' / 'navigational'

queries = gsc_data.filter(url=article.url, impressions >= 200)
classified = classify_intent_batch(queries, language)   # LLM-based o regex
intent_dist = Counter(classified)
dominant_query_intent = intent_dist.most_common(1)[0][0]

if declared_intent != dominant_query_intent AND intent_dist[dominant_query_intent] / len(queries) >= 0.7:
    emit Opportunity(category='intent_mismatch')
```

**Heurísticas regex (rápidas, antes de llamar LLM)**:
- Transaccional ES: `comprar`, `precio`, `cuánto cuesta`, `descuento`, `oferta`, `barato`
- Transaccional EN: `buy`, `price`, `cheap`, `discount`, `deal`, `for sale`
- Transaccional PT-BR: `comprar`, `preço`, `quanto custa`, `desconto`, `oferta`
- Informacional: `qué es`, `cómo`, `por qué`, `guía`, `tutorial`, `what is`, `how to`, `o que é`, `como`
- Comercial: `mejor`, `vs`, `comparar`, `review`, `best`, `comparison`

**Score**: `total_impressions × 0.7`.

**Recommendation pattern**: opciones — reescribir para alinear con intención dominante, o crear artículo separado.

**Confidence**: low-medium (interpretativo).

**Effort**: high.

---

## 5. Selección Top 10 — `02-agents/analyst/topn_selector.py`

Después de que las 6 categorías emiten todas sus oportunidades, el selector aplica:

```python
def select_top10(opportunities: list[Opportunity], client_id: str) -> list[Opportunity]:
    # 1. Filtrar memoria de rechazos
    rejected_keys = fetch_rejection_log_keys(client_id)
    candidates = [o for o in opportunities if o.dedupe_key not in rejected_keys]

    # 2. Filtrar artículos en ventana de observación post-implementación
    recently_implemented = fetch_implemented_within_days(client_id, days=45)
    candidates = [o for o in candidates if o.content_item_id not in recently_implemented]

    # 3. Computar score final
    for o in candidates:
        base = o.traffic_potential_estimate * confidence_weight[o.confidence]
        effort = {'low': 1.0, 'medium': 0.7, 'high': 0.4}[o.effort_level]
        o.score = base * effort

    # 4. Ordenar y seleccionar Top 10, con regla: max 2 oportunidades por artículo
    candidates.sort(key=lambda o: o.score, reverse=True)
    top10 = []
    per_article_count = defaultdict(int)
    for o in candidates:
        if len(top10) >= 10: break
        if per_article_count[o.content_item_id] >= 2: continue
        top10.append(o)
        per_article_count[o.content_item_id] += 1

    # 5. Asignar rank_within_client
    for i, o in enumerate(top10): o.rank_within_client = i + 1

    return top10
```

**`confidence_weight`** = `{'high': 1.0, 'medium': 0.7, 'low': 0.4}`.

**`dedupe_key`** formula: `f"{client_id}:{content_item_id}:{category}:{key_hash}"` donde `key_hash` es un hash estable de la evidencia principal (ej. para `striking_distance` es la query principal; para `decay` es el rango de fechas; etc.). Garantiza que rechazos persistan correctamente entre runs.

---

## 6. Pipeline architecture — 8 agentes Python

Cada agente es un endpoint HTTP en una sola FastAPI app desplegada en Railway. Todos verifican header `x-internal-secret`.

### 6.1 `/orchestrator`

**Trigger**: `pg_cron seo-optimizer-monthly` (día 1 mes, 09:00 CO) o manual.

**Input**: `{"trigger": "cron"|"manual", "client_ids": [...] | null, "period_days": 90}`.

**Steps**:
1. Crea `runs(status='running', period_start, period_end, period_prev_*)`.
2. Lista clientes activos: `SELECT * FROM public.clientes WHERE estado='activo'` (TBD: confirmar columna `estado`).
3. Para cada cliente, en **paralelo controlado** (max 3 concurrent para no exceder rate limits GSC):
   - POST a `/gsc_ingestor` con `{run_id, client_id, period_start, period_end}`.
   - Al completar, POST a `/article_ingestor` con `{run_id, client_id}`.
4. Una vez todos los clientes completados (polling `run_events`), POST a `/analyst` con `{run_id}`.
5. Una vez `/analyst` completo, POST a `/dispatcher` con `{run_id}`.
6. UPDATE `runs(status='completed', completed_at)`.

**Error handling**: si un cliente falla, lo marca `clients_failed++` y continúa con los demás. Si falla más del 50% → `status='partial'` o `failed`.

**Idempotencia**: si se llama con un `run_id` ya existente y `status='completed'`, retorna sin reprocesar.

---

### 6.2 `/gsc_ingestor`

**Trigger**: orchestrator.

**Input**: `{run_id, client_id, period_start, period_end}`.

**Steps**:
1. Carga `public.clientes` para obtener `gsc_property_url` (TBD: confirmar columna o si está en otra tabla).
2. Autentica con `GSC_SERVICE_ACCOUNT_JSON` (Service Account compartido con `seo_sentinel`).
3. Query GSC API `searchanalytics.query`:
   - Periodo actual: `[period_start, period_end]`
   - Periodo YoY: `[period_start - 365 days, period_end - 365 days]`
   - Dimensions: `['page', 'query']` (sin date para reducir volumen — agregado de los 90 días)
   - rowLimit: 25000 (paginar si necesario)
4. UPSERT en `gsc_url_query_metrics` con `ON CONFLICT (run_id, client_id, url, query, country, device)`.
5. Emite `run_events(event_type='agent_completed', payload={rows_inserted})`.

**Rate limit**: 1200 query/min por GSC API. Mitigación: 250ms entre queries, retry exponencial 1s/2s/4s en 429/503.

**Output**: `{rows_inserted}`.

---

### 6.3 `/article_ingestor`

**Trigger**: orchestrator (después de gsc_ingestor para el mismo cliente).

**Input**: `{run_id, client_id}`.

**Steps**:
1. Lista URLs únicas para este `(run_id, client_id)` en `gsc_url_query_metrics`.
2. Para cada URL:
   - Intenta `requests.get(url, headers={'User-Agent': '...'}, timeout=10)`.
   - Si HTTP 200 y `len(html) >= 500`: parsea con BeautifulSoup → extract `title_tag`, `meta_description`, `h1`, `headings[]`, body text. `source='live'`.
   - Si falla: busca en `public.content_items WHERE final_published_url = url AND is_latest_version = true`. Si existe → `source='content_items'`, html = `article_content`. Si no → `source='fallback_failed'`, html = ''.
   - INSERT en `article_snapshots`. Captura `content_item_version` si vino de `content_items`.
3. Emite `run_events(event_type='agent_completed', payload={snapshots_inserted, live_count, fallback_count})`.

**Output**: `{snapshots_inserted, live, fallback, failed}`.

---

### 6.4 `/analyst`

**Trigger**: orchestrator (cuando todos los ingestores completaron).

**Input**: `{run_id}`.

**Steps**:
1. Para cada cliente del run:
   - Carga datos: `gsc_url_query_metrics`, `article_snapshots`, `public.content_items`, `public.article_analysis_index` (JOIN por `content_item_id`).
   - Construye `ClientAnalysisContext` por URL.
   - Ejecuta las 6 categorías → recolecta `list[Opportunity]`.
   - Ejecuta `topn_selector.select_top10()`.
   - INSERT cada uno en `opportunities(status='pending')`.
   - Emite `run_events(event_type='opportunity_detected')` por cada uno.
2. UPDATE `runs.clients_processed`.

**LLM usage**:
- Categoría D (semantic_coverage): solo si ambigüedad detectada (~30% de los casos), usando prompt cacheado.
- Categoría F (intent_mismatch): primero regex, luego LLM solo si regex no decide.

**Output**: `{opportunities_inserted, by_category: {...}}`.

---

### 6.5 `/dispatcher`

**Trigger**: orchestrator (después de `/analyst`).

**Input**: `{run_id}`.

**Steps**:
1. Para cada cliente con ≥1 opportunity en este run:
   - Lookup del especialista SEO de ese cliente (TBD: tabla con asignación SEO ↔ cliente; si no existe, fallback a `SLACK_FALLBACK_CHANNEL`).
   - Build Block Kit con resumen: "10 oportunidades nuevas para [Cliente] — link a [front Orbit]/seo-optimizer/run/{run_id}".
   - Enqueue en `public.notifications_outbox`:
     - 1 DM al especialista SEO
     - 1 mensaje al canal de marca (si configurado)
   - `dedupe_key = "seo_optimizer:{run_id}:{client_id}:notification"`.

**Idempotencia**: dedupe_key UNIQUE en outbox evita duplicados.

**Output**: `{enqueued_count}`.

---

### 6.6 `/writer`

**Trigger**: DB trigger `opportunities_approved` (al cambiar status de 'pending' → 'approved').

**Input**: `{opportunity_id}`.

**Steps**:
1. Carga la opportunity completa + article_snapshot + article_analysis_index (JOIN).
2. Construye prompt LLM dependiendo de `category`:
   - `decay`, `striking_distance`, `semantic_coverage`, `intent_mismatch`: prompt `rewrite_body.txt` — pide HTML reescrito de las secciones afectadas + opcionalmente title/meta.
   - `low_ctr`: prompt `rewrite_meta.txt` — solo title_tag + meta_description.
   - `cannibalization`: prompt especial — pide recomendación textual + opcionalmente reescritura de UNO de los artículos para diferenciar.
3. Llama LLM (Claude Sonnet 4.5 con prompt caching del system prompt).
4. Genera `diff_html` comparando `original_html` vs `proposed_html` (usando librería `difflib` + render HTML resaltado).
5. INSERT en `opportunity_rewrites(status='draft')`.
6. UPDATE `opportunity.status='ready_for_writer'`.
7. POST a `/dispatcher` con `{opportunity_id, recipient='redactor'}` para notificar al redactor.

**Output**: `{rewrite_id, model_used, tokens_used}`.

**Costo control**: cap de tokens por rewrite (max 8k output). Si el artículo es muy largo, el prompt instruye a entregar solo secciones afectadas, no todo el body.

---

### 6.7 `/outbox_worker`

**Trigger**: `pg_cron seo-optimizer-outbox-worker` cada 30s.

**Input**: `{}`.

**Steps**:
1. SELECT FOR UPDATE SKIP LOCKED: hasta 10 rows de `public.notifications_outbox` con `source='seo_optimizer'`, `status='pending'`, `next_retry_at <= NOW()`.
2. Para cada row:
   - POST a Slack `chat.postMessage`.
   - Si 200: UPDATE `status='sent', sent_at=NOW()`.
   - Si error: `retry_count++`, `next_retry_at = NOW() + (2^retry_count minutes)`. Max 3 retries → `status='failed'`.
3. Si max retries alcanzados y dedupe_key prefijo contiene `:fallback`, no re-encola; si no, encola en `SLACK_FALLBACK_CHANNEL`.

**Output**: `{processed, sent, failed, fallback}`.

---

### 6.8 `/reeval` y `/reeval/batch`

**Trigger**: `pg_cron seo-optimizer-reeval-daily` invoca `/reeval/batch` que busca opportunities `WHERE status='implemented' AND reeval_due_at <= today` y por cada una llama a `/reeval`.

**Input `/reeval`**: `{opportunity_id}`.

**Steps**:
1. Carga opportunity + article_snapshot (versión antes del implement) + content_item actual.
2. Query GSC API para esa URL específica:
   - Período "after": últimos 30 días.
   - Período "before": 30 días antes de `implemented_at`.
3. Compara métricas:
   - `clicks_delta_pct`, `position_delta`, `impressions_delta`.
   - `outcome`:
     - `improved`: clicks +20% o position -2 puntos (mejor) o ambos.
     - `worsened`: clicks -20% o position +2 puntos.
     - `unchanged`: dentro de ±10% y ±1 punto.
     - `inconclusive`: data insuficiente (<100 clicks total).
4. (Opcional) LLM corto con métricas para generar `notes` textuales.
5. INSERT `reeval_results`.
6. UPDATE `opportunity.status`:
   - `improved` → `closed` (éxito)
   - `unchanged` → `observing` (extender 30 días más, max 2 reevals)
   - `worsened` → `observing` + enqueue alerta al SEO en outbox
7. Emite `run_events(event_type='reeval_completed')`.

**Output**: `{outcome, deltas}`.

---

## 7. DB schema — overview

Ver `01-database-migrations/001_seo_optimizer_schema.sql` para SQL completo. Tablas:

| Tabla | Propósito | Cardinalidad esperada (anual, 7 clientes) |
|---|---|---|
| `runs` | Una row por ejecución mensual | ~12-15 rows |
| `run_events` | Append-only events | ~10k-50k rows |
| `gsc_url_query_metrics` | Data GSC granular por run | ~400k rows |
| `article_snapshots` | HTML analizado por run | ~5k rows |
| `opportunities` | Top 10 × cliente × mes | ~840 rows (10×7×12) |
| `opportunity_rewrites` | Rewrites generados | ~30% de opps aprobadas, ~250 rows |
| `rejection_log` | Memoria de rechazos | ~500 rows |
| `reeval_results` | Outcomes a 45 días | ~250 rows |

**FKs cruzados**:
- `seo_optimizer.runs.id` → referenciado por casi todas las tablas locales.
- `seo_optimizer.opportunities.client_id` → `public.clientes.id`.
- `seo_optimizer.opportunities.content_item_id` → `public.content_items.id` (nullable, ON DELETE SET NULL).
- `seo_optimizer.article_snapshots.content_item_id` → `public.content_items.id`.

---

## 8. State machine de `opportunities.status`

```
       ┌─────────────┐
       │  pending    │  ← Analista insertó
       └──────┬──────┘
              │
       ┌──────┴──────┐
       ▼             ▼
  ┌─────────┐  ┌──────────┐
  │approved │  │ rejected │ ─▶ copia a rejection_log
  └────┬────┘  └──────────┘
       │ (trigger DB)
       ▼
  ┌─────────┐
  │ writing │  ← /writer en ejecución
  └────┬────┘
       │
       ▼
  ┌──────────────────┐
  │ready_for_writer  │  ← rewrite generado, redactor notificado
  └────────┬─────────┘
           │ (manual: redactor marca)
           ▼
     ┌─────────────┐
     │ implemented │  ← trigger DB setea reeval_due_at = NOW()+45d
     └──────┬──────┘
            │ (cron /reeval cuando reeval_due_at <= today)
            ▼
     ┌────────────┐
     │ observing  │  ← reeval inconcluso o se mantiene
     └─────┬──────┘
           │ (siguiente reeval)
           ▼
       ┌────────┐
       │ closed │
       └────────┘
```

Transiciones que NO están permitidas (enforced por trigger):
- pending → implemented (debe pasar por approved → ready_for_writer)
- closed → cualquier cosa (estado final)
- rejected → cualquier cosa (estado final, salvo reopen explícito que crea otra opp)

---

## 9. Cron jobs — calendario completo

| Cron name | Schedule (UTC) | Schedule (CO) | Endpoint llamado | Propósito |
|---|---|---|---|---|
| `seo-optimizer-monthly` | `0 14 1 * *` | día 1 09:00 | `/orchestrator` | Run mensual completo |
| `seo-optimizer-reeval-daily` | `0 15 * * *` | 10:00 daily | `/reeval/batch` | Procesa opportunities con reeval_due_at vencido |
| `seo-optimizer-outbox-worker` | `*/30 * * * * *` | cada 30s | `/outbox_worker` | Procesa cola de notificaciones |
| `seo-optimizer-watchdog` | `*/5 * * * *` | cada 5 min | SQL func `seo_optimizer.watchdog_check()` | Detecta runs colgados, locks stale, rewrites pendientes >30d |

---

## 10. Error handling y retries

| Falla | Detección | Respuesta |
|---|---|---|
| GSC API 429 | Status code | Retry exponencial 1s/2s/4s, max 5 |
| GSC API 403 (cliente sin permiso) | Status code | Skip cliente, log warning, continuar |
| Live HTML fetch timeout | requests.Timeout | Fallback a `content_items.article_content` |
| LLM rate limit | OpenRouter 429 | Retry exponencial 2s/4s/8s, max 3 |
| LLM tokens excedidos | Anthropic error | Reducir contexto (truncar HTML), retry una vez |
| Slack 429 | API response | Honra `Retry-After`, marca next_retry_at |
| Slack channel_not_found | API response | Fallback channel, log warning |
| Run colgado (running > 1h) | Watchdog | Mark failed + alert admin |
| Outbox lock stale (>10 min) | Watchdog | Reset lock, próximo worker lo procesa |

Todos los errores se emiten como `run_events(event_type='warning'|'agent_failed', error_message)` para trazabilidad.

---

## 11. Reuso del ecosistema Orbit — detalle

### `public.clientes`

- **Uso**: identidad del cliente, FK target para `opportunities.client_id`.
- **TBD**: confirmar columnas `gsc_property_url` y `estado` (o equivalentes). Si están en otra tabla relacionada (ej. `client_services_config`), ajustar queries.

### `public.content_items`

- **Uso**: cuerpo del artículo (fallback), versionado, metadata SEO existente.
- **Columnas clave usadas**:
  - Identidad: `id`, `client_id`, `title`, `slug`, `language`, `country`
  - Contenido: `article_content`, `meta_description`, `og_image_url`
  - SEO: `main_keyword`, `secondary_keywords`, `search_volume`, `keyword_difficulty`, `traffic_potential`
  - Estado: `status`, `client_approval_status`, `final_published_url`, `is_latest_version`, `version`
  - Análisis previo: `seo_audit_report`, `internal_linking_suggestions`, `strategic_analysis`, `seo_checklist`
- **NO escribimos en `content_items`**. Solo lectura. Si el redactor implementa cambios, lo hace en el CMS y luego (manualmente o vía agente Orbit) se actualiza `content_items` para que la próxima version tenga el cuerpo correcto.

### `public.article_analysis_index`

- **Uso**: enriquecimiento LLM ya hecho. JOIN en el Analista.
- **Columnas clave usadas**:
  - Clasificación: `search_intent`, `customer_journey_stage`, `content_role`
  - Cluster: `cluster_id`, `cluster_key`
  - Semántica: `main_entities` (jsonb), `summary_150_words`, `semantic_fingerprint`
  - Recomendaciones: `recommended_cta_type`
- **JOIN**: `content_items.id = article_analysis_index.content_item_id`.

### `public.notifications_outbox`

- **Uso**: cola de notificaciones Slack reusada.
- **`source='seo_optimizer'`** para distinguir de las del sentinela u otros sistemas.
- **Migración 004** verifica que existe y agrega índice específico si falta.

### `public.clientes`, `public.workspace_brands`, `public.brand_identities`

- TBD: explorar para confirmar el modelo de identidad de cliente vs workspace vs brand. Para v1, asumir `clientes.id` es la unidad principal.

---

## 12. Decisiones clave y rationale

| Decisión | Por qué |
|---|---|
| Schema `seo_optimizer` separado de `seo_sentinel` | Distintos dominios (defensivo vs ofensivo), distintas cadencias (diario vs mensual), distintos consumidores. Acoplarlos genera fragilidad. |
| Python (FastAPI) en Railway, no Deno edge functions | Sentinel usa Deno; el usuario pidió Python explícitamente. Railway tiene timeouts ilimitados y soporta los webhooks de aprobación. |
| Una sola FastAPI app con 8 endpoints (no microservices) | Más simple desplegar, debuggear y mantener. La separación lógica está en los módulos handler/. Si en futuro algún agente necesita escalar aparte, se extrae. |
| Reuso de `article_analysis_index` | Orbit ya invirtió en enriquecimiento LLM (intent, cluster, entities). Re-hacerlo sería caro y crearía inconsistencia. |
| Live HTML fetch + fallback a `content_items` | Google rankea el live, no la DB. Si el live no es accesible, mejor data desactualizada que ningún análisis. Loguear la fuente para auditoría. |
| Snapshot del HTML analizado en `article_snapshots` | Provenance: cuando el SEO pregunta "¿basado en qué versión propusiste esto?", tenemos la respuesta. También permite diff inter-runs para detectar implementación. |
| `dedupe_key` por opportunity | Memoria de rechazos persistente sin re-proponer lo mismo. Distinto de `id` porque sobrevive entre runs. |
| 45 días de re-evaluación | Decisión del usuario. Google tarda 2-8 semanas en re-rankear; 45 días balancea espera vs feedback. |
| Top 10 por cliente, max 2 oportunidades por artículo | 10 = cap manejable para el SEO. Max 2 por artículo evita que un artículo bloqueado domine el Top. |
| Trigger DB para disparar `/writer` al aprobar | Aprobación viene del frontend (UPDATE simple), no del agente. Trigger DB → `net.http_post` garantiza que se dispare incluso si el frontend olvida llamar al webhook. |
| `notifications_outbox` reusado, no nueva tabla | Patrón Lighthouse establecido. Un solo worker para Slack reduce ops. `source` columna distingue. |
| Re-eval automática a 45 días | Sin esto, el sistema pierde credibilidad — propone cambios sin demostrar impacto. |
| Tope output LLM 8k tokens | Costo + latencia. Si el artículo es enorme, el rewrite es por secciones (instrucción en prompt). |

---

## 13. Open questions / TBD (a resolver durante implementación)

1. **¿Qué columna identifica el `gsc_property_url` por cliente?** Posiblemente `public.clientes.gsc_property_url` (no confirmado), o en `client_services_config`. Verificar al construir `/gsc_ingestor`.

2. **¿Hay tabla de asignación SEO ↔ cliente?** Para mandar la notificación al especialista correcto. Si no existe, v1 manda al canal de marca (sin DM) y se documenta como TODO para v2.

3. **¿Cómo identifica el cliente "activo"?** Posible columna `estado` en `public.clientes` o `status` en otra tabla. Verificar al construir `/orchestrator`.

4. **¿WordPress de los clientes — todos? ¿O hay CMSs distintos?** El fetch del live HTML funciona con cualquier CMS (es HTML público), pero saber esto ayuda a v2 (API integrations).

5. **¿El redactor confirma implementación en Orbit o lo hacemos nosotros?** Por ahora, asumir que un agente Orbit existente o el front nuestro permite marcar `opportunity.status='implemented'`.

6. **`workspace_brands` vs `clientes` vs `brand_identities`** — confirmar cuál es la fuente de verdad de la identidad del cliente.

Todos los TBDs van a `handoff/03-runbook.md` con su workaround temporal.

---

## 14. Referencias

- Patrón arquitectónico: `ahrefs_web_analysis` schema en Light_House (40+ tablas, 77 runs reales)
- Patrón de outbox: `public.notifications_outbox` (heredado de Lighthouse)
- Patrón de event-sourcing: `seo_sentinel.run_events`
- GSC API docs: <https://developers.google.com/webmaster-tools/v1/searchanalytics/query>
- Anthropic SDK prompt caching: <https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching>
