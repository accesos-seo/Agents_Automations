# seo-optimizer

**Optimización ofensiva mensual de artículos basada en Google Search Console + LLM, con loop de aprobación humana del especialista SEO.**

Hermano de `position-watch/` (sentinela defensivo de anomalías). Este módulo es **ofensivo**: identifica oportunidades de crecimiento, genera propuestas de mejora, y entrega HTML reescrito al redactor humano para implementación en el CMS.

---

## Qué hace

Cada **día 1 del mes**, para cada cliente activo en Orbit:

1. Extrae 90 días de data de Google Search Console (clicks, impresiones, CTR, posición) por URL × query.
2. Toma snapshot del HTML del artículo en vivo (con fallback a `public.content_items.article_content`).
3. Aplica **6 categorías de oportunidad** sobre cada artículo:
   - **Decay** — caída year-over-year de clicks
   - **Striking Distance** — queries en posiciones 5-15 con alto volumen
   - **Low CTR** — posición top-10 con CTR muy bajo (problema de title/meta)
   - **Semantic Coverage** — queries que rankean pero no están en H1/H2/H3/alt-text
   - **Cannibalization** — múltiples URLs del cliente compitiendo entre sí
   - **Intent Mismatch** — artículo informacional rankeando para queries transaccionales (o viceversa)
4. Computa score por oportunidad, filtra rechazos previos y artículos implementados en los últimos 45 días, y selecciona **Top 10 por cliente**.
5. Notifica al especialista SEO del cliente vía Slack + bandeja en el front de Orbit.

**Especialista SEO aprueba o rechaza.** Al aprobar, se dispara un segundo agente que produce el **HTML reescrito** + diff. Va al redactor, que implementa en el CMS.

**A los 45 días post-implementación**, el sistema re-evalúa automáticamente: ¿subió la posición? ¿cayó? ¿se mantuvo?

---

## Arquitectura — diagrama de alto nivel

```
pg_cron mensual ─▶ /orchestrator
                       ├─▶ /gsc_ingestor (fan-out por cliente)
                       └─▶ /article_ingestor (fan-out por URL)
                              │
                              ▼
                       /analyst (6 categorías + scoring + Top 10)
                              │
                              ▼
                       /dispatcher → notifications_outbox → Slack
                              │
                              ▼
              ══ HUMAN: SEO aprueba/rechaza ══
                              │ approve
                              ▼
                       /writer (HTML reescrito + diff)
                              │
                              ▼
              ══ HUMAN: Redactor implementa en CMS ══
                              │ marca implemented
                              ▼
                       [45 días de observación]
                              │
                              ▼
                       /reeval (mide impacto)
```

Detalle completo en [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Stack

- **Backend agentes**: Python 3.12 + FastAPI, desplegado en **Railway** (containers siempre encendidos)
- **Base de datos**: Supabase (proyecto `Light_House`, schema `seo_optimizer`)
- **Cron + watchdog**: `pg_cron` + `net.http_post` dentro de Supabase
- **LLM**: Anthropic Claude Sonnet 4.5 vía OpenRouter, con prompt caching
- **Notificaciones**: Slack (DM al especialista + canal de marca), reusando `public.notifications_outbox`
- **Fuente data**: Google Search Console API (Service Account)
- **Fuente contenido**: live HTML del artículo (con fallback a `public.content_items`)

---

## Reuso del ecosistema Orbit

Este módulo **no duplica datos** que ya viven en Orbit:

| Recurso reutilizado | Uso |
|---|---|
| `public.clientes` | Identidad del cliente/marca (FK desde nuestras tablas) |
| `public.content_items` | Cuerpo del artículo (fallback), versionado, metadata |
| `public.article_analysis_index` | Intención, customer journey, cluster, entidades, fingerprint semántico — JOIN para el Analista |
| `public.notifications_outbox` | Cola de notificaciones Slack |
| `seo_sentinel.*` | Independiente — no se toca |
| `ahrefs_web_analysis.*` | Solo referencia de patrón arquitectónico |

---

## Folder layout

```
seo-optimizer/
├── README.md                                ← este archivo
├── ARCHITECTURE.md                          ← diseño completo + decisiones
├── SECRETS.md                               ← Vault entries necesarios
├── pyproject.toml                           ← deps Python
├── Dockerfile
├── railway.toml
├── .env.example
├── 01-database-migrations/
│   ├── 001_seo_optimizer_schema.sql
│   ├── 002_seo_optimizer_views.sql
│   ├── 003_seo_optimizer_cron.sql
│   └── 004_seo_optimizer_outbox_reuse.sql
├── 02-agents/                                ← FastAPI app + handlers
│   ├── app.py
│   ├── _shared/                              ← supabase_client, gsc_api, llm_client, run_events, slack, html_utils, scoring
│   ├── orchestrator/
│   ├── gsc_ingestor/
│   ├── article_ingestor/
│   ├── analyst/                              ← incluye categories/*.py + prompts/
│   ├── writer/                               ← prompts/ con plantillas de rewrite
│   ├── dispatcher/
│   ├── outbox_worker/
│   └── reeval/
├── 03-tests/
└── handoff/
    ├── 00-data-flow.md
    ├── 01-agent-contracts.md
    ├── 02-validation-checklist.md
    ├── 03-runbook.md
    └── 04-frontend-superprompt.md            ← prompt final para el técnico de frontend
```

---

## Estado actual

| Fase | Descripción | Estado |
|---|---|---|
| 0 | Plan estructurado y validado | ✅ |
| 1 | Scaffold local + docs raíz | 🔄 (este commit) |
| 2 | Migración SQL 001 (schema + triggers) | ⏳ |
| 3 | Migraciones 002 / 003 / 004 (views, cron, outbox) | ⏳ |
| 4 | Agentes Python (8 handlers + _shared) | ⏳ |
| 5 | Aplicar migraciones a Light_House + verificación | ⏳ |
| 6 | Handoff docs + super-prompt frontend | ⏳ |
| 7 | Deploy a Railway + smoke test (a cargo del usuario) | ⏳ |

---

## Deploy (cuando esté listo)

Ver [`handoff/03-runbook.md`](./handoff/03-runbook.md) para el procedimiento completo. Resumen:

1. Setear secrets en Supabase Vault (lista en [`SECRETS.md`](./SECRETS.md)).
2. Aplicar las 4 migraciones SQL en orden contra `Light_House`.
3. Crear proyecto Railway, conectar al repo, setear env vars.
4. Cron jobs ya quedan habilitados al aplicar `003_seo_optimizer_cron.sql`.
5. Smoke test: `curl -X POST <railway-url>/orchestrator -H 'x-internal-secret: ...' -d '{"trigger":"manual"}'`.

---

## Restricciones operativas (heredadas del entorno del usuario)

- **PowerShell + OneDrive timeouts**: comandos `git`, `supabase functions deploy`, etc. se entregan al usuario para que los corra manualmente. No corro deploys en background.
- **Supabase MCP scope**: el MCP solo ve `Light_House` y `Swarm Agentes MD`. Las migraciones se aplican vía `mcp__apply_migration` al primero.

---

## Contacto / ownership

- **Producto / decisiones de SEO**: Christian (CEO de la agencia, dictador de voz frecuente — confunde "SEO" con "CEO" al dictar; en este repo siempre se refiere al **especialista SEO** como aprobador humano).
- **Implementación técnica**: Claude Code (autónomo, con review en hitos).
