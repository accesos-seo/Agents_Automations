# Data flow — end-to-end trace

Sigue una propuesta de optimización desde que el cron mensual la detecta hasta que se cierra a los 45 días con un veredicto.

---

## T0 — Día 1 del mes, 09:00 Colombia (14:00 UTC)

**Disparador**: `pg_cron 'seo-optimizer-monthly'` ejecuta `seo_optimizer.cron_post('/orchestrator', ...)`.

**Efecto**: `net.http_post` envía un POST a Railway con `x-internal-secret` header.

```
POST https://<railway>.railway.app/orchestrator
Body: {"trigger":"cron","period_days":90}
```

---

## T0+1s — Orchestrator arranca

`02-agents/orchestrator/handler.py:handle()` se ejecuta:

1. Verifica `x-internal-secret` (rechazo 401 si mal).
2. Calcula ventana: `period_end = today - 3d`, `period_start = period_end - 90d`, YoY = -365d.
3. `INSERT INTO seo_optimizer.runs (status='running', ...)` → genera `run_id`.
4. Emite evento `run_started` en `run_events`.
5. Carga clientes activos: `SELECT * FROM seo_optimizer.v_active_clients`.
   - Esta vista solo retorna clientes con `client_config.is_active=true` y un `gsc_property_url` configurado.
6. UPDATE `runs.clients_total = N`.

---

## T0+5s — Fan-out por cliente (concurrencia limitada a 3)

Para cada cliente, en paralelo (semáforo asyncio):

### 1. `gsc_ingestor.run(client_id, period_start, period_end)`
- Carga `client.gsc_property_url` desde `v_active_clients`.
- Autentica con Service Account (`GSC_SERVICE_ACCOUNT_JSON`).
- 2 queries a GSC Search Analytics API:
  - Periodo actual: 90 días
  - Periodo YoY: mismos 90 días, 365 días antes
- Para cada `(url, query, country, device)`: arma row con clicks/impressions/ctr/position actuales y `_prev` con YoY.
- UPSERT en `seo_optimizer.gsc_url_query_metrics` por chunks de 1000.
- Emite `agent_completed`.

### 2. `article_ingestor.run(client_id)`
- Lee URLs distintas con `impressions >= 50` desde `gsc_url_query_metrics` (max 200).
- Para cada URL: `httpx.get()` con timeout 10s.
  - Si HTTP 200 y `len(html) >= 500`: `source='live'`.
  - Si falla: busca `public.content_items.article_content` por URL.
  - Si tampoco: `source='fallback_failed'`.
- `html_utils.parse_html()` extrae `title_tag`, `meta_description`, `h1`, `headings[]`, `word_count`.
- UPSERT en `seo_optimizer.article_snapshots`.

---

## T0+~3min — Analyst ejecuta

`analyst.run(run_id)`:

Para cada cliente con data:
1. Carga `gsc_url_query_metrics` (con `_prev` columns).
2. Carga `article_snapshots` (parsea HTML → `ParsedArticle`).
3. Carga `content_items` joined con `article_analysis_index` (intent, cluster, entities).
4. Construye `ClientAnalysisContext`.
5. Corre las **6 categorías** en orden — cada una emite `list[OpportunityCandidate]`:
   - `decay.detect()` — caídas YoY ≥20% en URLs con baseline ≥50 clicks
   - `striking_distance.detect()` — queries en posiciones 5-15 con ≥500 impresiones
   - `low_ctr.detect()` — top-10 con CTR <50% del benchmark
   - `semantic_coverage.detect()` — queries con ≥100 impresiones no presentes en H1/H2/H3/intro/alt
   - `cannibalization.detect()` — ≥2 URLs del cliente compitiendo por la misma query
   - `intent_mismatch.detect()` — ≥70% de queries top en intención distinta a la declarada
6. `topn_selector.select_topn()`:
   - Computa `final_score = traffic_potential × confidence_weight × effort_discount`
   - Filtra: descarta `dedupe_key` en `rejection_log` activos
   - Filtra: descarta `content_item_id` implementados en últimos 45 días
   - Ordena por score, toma Top 10, max 2 por artículo
7. UPSERT en `seo_optimizer.opportunities` con `status='pending'`.

---

## T0+~5min — Dispatcher notifica al SEO

`dispatcher.run(run_id)`:
1. Agrupa oportunidades por `client_id`.
2. Por cada cliente: construye Slack Block Kit con resumen (10 oportunidades, breakdown por categoría, link a Orbit).
3. Resuelve canal: `client_config.slack_channel_id` o `SLACK_FALLBACK_CHANNEL`.
4. UPSERT en `public.notifications_outbox` con `dedupe_key="seo_optimizer:{run_id}:{client_id}:seo_summary:v1"`.

---

## T0+~6min — Outbox worker entrega

`pg_cron 'seo-optimizer-outbox-worker'` (cada minuto) ejecuta `outbox_worker.run()`:
1. Claim hasta 10 rows con `locked_at = NOW()`.
2. POST a Slack `chat.postMessage`.
3. UPDATE `status='sent', sent_at=NOW()` o reintento exponencial.

Resultado: El especialista SEO recibe en Slack:

> 🎯 10 oportunidades SEO para [Cliente X]
> Por categoría: striking_distance: 4 · decay: 3 · low_ctr: 2 · semantic_coverage: 1
> [Revisar en Orbit →]

---

## T+horas/días — SEO revisa en Orbit

En el front-end (a construir, ver `04-frontend-superprompt.md`):
- Lista `v_pending_decisions` ordenada por urgencia.
- SEO ve evidencia (queries, métricas, posiciones) por oportunidad.
- Aprueba: `UPDATE opportunities SET status='approved', decided_by=<user>, decided_at=NOW()`.
- Rechaza: `UPDATE ... status='rejected', decision_reason='...'` → trigger copia a `rejection_log` automáticamente.

---

## T+segundos tras aprobar — Writer reescribe

Trigger DB `opportunities_approved_dispatch`:
1. Lee `vault.decrypted_secrets`.
2. POST a Railway: `/writer` con `{opportunity_id}`.

`writer.run(opportunity_id)`:
1. `status='writing'` (idempotencia).
2. Carga opportunity + article_snapshot + content_item.
3. Elige prompt: `low_ctr` → `rewrite_meta.txt`; resto → `rewrite_body.txt`.
4. Llama Claude Sonnet 4.5 con prompt cacheado.
5. Parsea JSON (con fallback robusto a regex `\{...\}`).
6. Genera `diff_html` con `diff_match_patch`.
7. INSERT en `opportunity_rewrites` (status='draft').
8. UPDATE opportunity `status='ready_for_writer'`.
9. Llama `dispatcher.run(opportunity_id, recipient='redactor')` → notifica al redactor.

---

## T+horas — Redactor implementa

Redactor recibe Slack DM "✍️ Reescritura lista".
1. Abre `v_ready_for_writer` en Orbit.
2. Ve diff visual con `<ins>` verde y `<del>` rojo.
3. Copia HTML propuesto a WordPress (u otro CMS).
4. Publica en producción.
5. En Orbit marca como implementado: `UPDATE opportunities SET status='implemented', implemented_by=<user>`.

Trigger `opportunities_implemented_reeval` automáticamente:
- `implemented_at = NOW()` (si no se setea explícito)
- `reeval_due_at = implemented_at + 45 días`

---

## T+45 días — Re-evaluación automática

`pg_cron 'seo-optimizer-reeval-daily'` (10:00 CO):
1. Llama `reeval.run_batch()` que busca opportunities con `status='implemented' AND reeval_due_at <= today`.
2. Por cada una: `reeval.run(opportunity_id)`:
   - Pull GSC para esa URL: ventana "before" (30d antes del implement) vs "after" (últimos 30d).
   - Computa deltas: `clicks_delta_pct`, `position_delta`, `impressions_delta_pct`.
   - Clasifica outcome:
     - `improved`: clicks +20% o posición -2 puntos, y ningún signo opuesto.
     - `worsened`: clicks -20% o posición +2 puntos.
     - `unchanged`: dentro de ±10% / ±1 punto.
     - `inconclusive`: <100 clicks totales.
   - INSERT `reeval_results`.
   - UPDATE opportunity `status='closed'` (improved) o `'observing'` (resto).
3. Si outcome='worsened': enqueue alerta al SEO en outbox.

---

## Punto y final

A los 45 días del implement:
- `improved` → `closed`. Ganamos.
- `unchanged` o `worsened` → `observing`. Otra revisión a +30 días.
- 2 revisiones consecutivas sin mejora → `closed` con outcome final + alerta.

Toda la trazabilidad queda en `run_events` (append-only) para forensics.
