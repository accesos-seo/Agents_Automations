# seo-optimizer

**Optimización ofensiva mensual de artículos basada en Google Search Console + LLM, con loop de aprobación del especialista SEO.**

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

**Especialista SEO aprueba o rechaza.** Al aprobar, se dispara un segundo agente (`/seo-optimizer-writer`) que produce el **HTML reescrito** + diff. Va al redactor, que implementa en el CMS.

**A los 45 días post-implementación**, el sistema re-evalúa automáticamente: ¿subió la posición? ¿cayó? ¿se mantuvo?

---

## Stack

- **Backend agentes**: TypeScript / Deno en **Supabase Edge Functions** (sin costo adicional sobre Supabase)
- **Base de datos**: Supabase Postgres (proyecto `Light_House`, schema `seo_optimizer`)
- **Cron + watchdog**: `pg_cron` + `net.http_post` dentro de Supabase
- **LLM**: Anthropic Claude Sonnet 4.5 vía OpenRouter, con prompt caching
- **Notificaciones**: Slack (DM al especialista + canal de marca), reusando `public.notifications_outbox`
- **Fuente data**: Google Search Console API (Service Account)
- **Fuente contenido**: live HTML del artículo (con fallback a `public.content_items`)

**Todo en Supabase. Un solo proveedor. Sin servicios externos.**

---

## Folder layout

```
seo-optimizer/
├── README.md                                ← este archivo
├── ARCHITECTURE.md                          ← diseño completo + decisiones
├── SECRETS.md                               ← Vault entries + Function env vars
├── 01-database-migrations/                  ← SQL aplicadas vía MCP a Light_House
│   ├── 001_seo_optimizer_schema.sql
│   ├── 002_seo_optimizer_views.sql
│   ├── 003_seo_optimizer_cron.sql           (versión inicial, reemplazada por 006)
│   ├── 004_seo_optimizer_outbox_reuse.sql
│   ├── 005_seo_optimizer_client_config.sql
│   └── 006_seo_optimizer_migrate_to_edge_functions.sql
├── supabase/
│   ├── config.toml                          ← config para `supabase functions deploy`
│   └── functions/                           ← Edge Functions (TypeScript / Deno)
│       ├── _shared/                         ← módulos compartidos
│       │   ├── supabase.ts
│       │   ├── secret.ts
│       │   ├── run-events.ts
│       │   ├── scoring.ts
│       │   ├── slack-blockkit.ts
│       │   ├── orbit.ts
│       │   ├── html-utils.ts
│       │   ├── llm-client.ts
│       │   └── gsc-api.ts
│       ├── seo-optimizer-orchestrator/index.ts
│       ├── seo-optimizer-gsc-ingestor/index.ts
│       ├── seo-optimizer-article-ingestor/index.ts
│       ├── seo-optimizer-analyst/           (con categories/ + types + topn-selector)
│       ├── seo-optimizer-writer/            (con prompts/)
│       ├── seo-optimizer-dispatcher/
│       ├── seo-optimizer-outbox-worker/
│       ├── seo-optimizer-reeval/
│       └── seo-optimizer-reeval-batch/
└── handoff/
    ├── 00-data-flow.md
    ├── 01-agent-contracts.md
    ├── 02-validation-checklist.md
    ├── 03-runbook.md
    └── 04-frontend-superprompt.md
```

---

## Reuso del ecosistema Orbit

Este módulo **no duplica datos** que ya viven en Orbit:

| Recurso reutilizado | Uso |
|---|---|
| `public.clientes` | Identidad del cliente (FK desde nuestras tablas) |
| `public.content_items` | Cuerpo del artículo (fallback), versionado, metadata |
| `public.article_analysis_index` | Intención, customer journey, cluster, entidades, fingerprint semántico — JOIN para el Analista |
| `public.notifications_outbox` | Cola de notificaciones Slack |
| `seo_optimizer.client_config` | Per-cliente: gsc_property_url, is_active, Slack channel — NUESTRA tabla, no Orbit |
| `seo_sentinel.*` | Independiente — no se toca |

---

## Estado actual

| Fase | Descripción | Estado |
|---|---|---|
| 0 | Plan estructurado y validado | ✅ |
| 1 | Scaffold local + docs raíz | ✅ |
| 2-3 | Migraciones SQL 001-006 aplicadas a Light_House | ✅ |
| 4 | 9 Edge Functions TypeScript + 9 módulos _shared | ✅ |
| 5 | Verificación de schema y cron jobs | ✅ |
| 6 | Handoff docs + super-prompt frontend | ✅ |
| 7 | **Setear secrets en Supabase Vault** | ⏳ pendiente tú |
| 8 | **Crear Service Account GSC + dar acceso a propiedades de clientes** | ⏳ pendiente tú |
| 9 | **`supabase functions deploy` para las 9 funciones** | ⏳ pendiente tú |
| 10 | **Onboard del primer cliente vía SQL** | ⏳ pendiente tú |
| 11 | **Smoke test E2E** | ⏳ pendiente |
| 12 | **Frontend (las 2 pestañas)** | ⏳ con super-prompt listo |

---

## Deploy rápido (cuando tengas los secrets seteados)

```bash
cd seo-optimizer/supabase

# Despliega las 9 funciones de una vez:
supabase functions deploy seo-optimizer-orchestrator \
                          seo-optimizer-gsc-ingestor \
                          seo-optimizer-article-ingestor \
                          seo-optimizer-analyst \
                          seo-optimizer-writer \
                          seo-optimizer-dispatcher \
                          seo-optimizer-outbox-worker \
                          seo-optimizer-reeval \
                          seo-optimizer-reeval-batch \
  --project-ref stjugsrkrweakvzmizpq
```

Detalle paso a paso en `handoff/03-runbook.md`.

---

## Contacto / ownership

- **Producto / decisiones de SEO**: Christian (CEO de la agencia, dictador de voz frecuente — confunde "SEO" con "CEO" al dictar; en este repo siempre se refiere al **especialista SEO** como aprobador humano).
- **Implementación técnica**: Claude Code (autónomo, con review en hitos).
