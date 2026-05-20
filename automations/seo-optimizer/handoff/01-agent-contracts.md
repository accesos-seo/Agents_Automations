# Agent contracts — input / output de cada endpoint

Todos los endpoints viven en `02-agents/app.py` (FastAPI). Todos requieren header `x-internal-secret`.

---

## `GET /health`

**No requiere auth.** Usado por Railway healthcheck y monitores externos.

**Response 200:**
```json
{
  "status": "ok" | "degraded",
  "version": "0.1.0",
  "missing_env": ["..."]
}
```

---

## `POST /orchestrator`

**Trigger**: `pg_cron seo-optimizer-monthly` o manual.

**Request:**
```json
{
  "trigger": "cron" | "manual" | "watchdog_retry",
  "client_ids": ["uuid", ...] | null,
  "period_days": 90
}
```

**Response 200:**
```json
{
  "run_id": "uuid",
  "status": "completed" | "partial" | "failed",
  "clients_total": 7,
  "clients_processed": 7,
  "clients_failed": 0,
  "analyst": { "status": "ok", "opportunities_inserted": 70, "by_category": {...} },
  "dispatch": { "status": "ok", "enqueued": 7, "skipped": 0 }
}
```

---

## `POST /gsc_ingestor`

**Trigger**: orchestrator (in-process) o manual.

**Request:**
```json
{
  "run_id": "uuid",
  "client_id": "uuid",
  "period_start": "2026-02-19" | null,
  "period_end": "2026-05-17" | null,
  "period_days": 90
}
```

**Response 200:**
```json
{
  "status": "ok" | "skipped" | "failed",
  "rows_inserted": 5234,
  "rows_current": 5234,
  "rows_prev": 4982,
  "reason": "no_gsc_property" | "client_not_found" | "gsc_current_failed"
}
```

---

## `POST /article_ingestor`

**Trigger**: orchestrator (in-process) o manual.

**Request:**
```json
{
  "run_id": "uuid",
  "client_id": "uuid",
  "max_urls": 200
}
```

**Response 200:**
```json
{
  "status": "ok" | "failed",
  "snapshots_inserted": 187,
  "live": 165,
  "fallback": 18,
  "failed": 4
}
```

---

## `POST /analyst`

**Trigger**: orchestrator (in-process) o re-run manual.

**Request:**
```json
{
  "run_id": "uuid",
  "client_ids": ["uuid", ...] | null
}
```

**Response 200:**
```json
{
  "status": "ok",
  "clients_analyzed": 7,
  "opportunities_inserted": 67,
  "by_category": {
    "decay": 14,
    "striking_distance": 21,
    "low_ctr": 12,
    "semantic_coverage": 9,
    "cannibalization": 5,
    "intent_mismatch": 6
  }
}
```

---

## `POST /writer`

**Trigger**: DB trigger `opportunities_approved_dispatch` (POST automático tras aprobar).

**Request:**
```json
{
  "opportunity_id": "uuid",
  "regenerate": false
}
```

**Response 200:**
```json
{
  "status": "ok" | "failed" | "skipped",
  "rewrite_id": "uuid",
  "tokens_used": {
    "input_tokens": 4500,
    "output_tokens": 2100,
    "cache_read_input_tokens": 4200
  },
  "category": "striking_distance",
  "reason": "..." // si status != ok
}
```

---

## `POST /dispatcher`

**Trigger**: orchestrator al final (notifica SEO) o writer al completar (notifica redactor).

**Request:**
```json
{
  "run_id": "uuid" | null,         // si presente: modo SEO summary
  "opportunity_id": "uuid" | null, // si presente: modo redactor notification
  "recipient": "seo" | "redactor"
}
```

**Response 200:**
```json
{
  "status": "ok",
  "enqueued": 7,
  "skipped": 0
}
```

---

## `POST /outbox_worker`

**Trigger**: `pg_cron seo-optimizer-outbox-worker` cada minuto.

**Request:** `{}` (vacío)

**Response 200:**
```json
{
  "status": "ok",
  "processed": 7,
  "sent": 6,
  "failed": 1
}
```

---

## `POST /reeval`

**Trigger**: `/reeval/batch` itera y llama esto por opportunity. También callable directo.

**Request:**
```json
{ "opportunity_id": "uuid" }
```

**Response 200:**
```json
{
  "status": "ok" | "failed" | "skipped",
  "outcome": "improved" | "unchanged" | "worsened" | "inconclusive",
  "confidence": "high" | "medium" | "low",
  "metrics": {
    "clicks_before": 120,
    "clicks_after": 180,
    "clicks_delta_pct": 50.0,
    "position_before": 8.2,
    "position_after": 4.5,
    "position_delta": -3.7
  }
}
```

---

## `POST /reeval/batch`

**Trigger**: `pg_cron seo-optimizer-reeval-daily` (10:00 CO).

**Request:** `{"max_per_batch": 50}` (opcional)

**Response 200:**
```json
{
  "status": "ok",
  "processed": 12,
  "outcomes": { "improved": 7, "unchanged": 3, "worsened": 1, "inconclusive": 1 }
}
```

---

## Errores comunes

| Status | Causa | Acción |
|---|---|---|
| 401 | `x-internal-secret` faltante o no coincide | Verificar Vault + Railway env vars |
| 500 | Env vars críticas no seteadas | `GET /health` muestra `missing_env` |
| 503 | Handler no pudo cargarse (import error) | Logs de Railway — probablemente dep faltante |
