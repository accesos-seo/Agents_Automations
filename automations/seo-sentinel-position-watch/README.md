# seo_sentinel — Position Watch

Sistema agéntico de detección de pérdida de tráfico orgánico y posiciones en Google Search Console. Pipeline diario que extrae, analiza, diagnostica y notifica a Slack (canal `#alerts-operaciones` + DM al especialista responsable de cada marca) sin intervención humana.

## ¿Qué hace?

1. **Extrae** clicks/impressions/CTR y posiciones por (URL, query) desde Google Search Console todos los días a las 08:00 CO
2. **Analiza** dos tipos de anomalías independientes:
   - Caída WoW de clicks agregados (umbral configurable por marca, default 20%)
   - Pérdida de posiciones por keyword (delta ≥ 10 posiciones o salida del top 10)
3. **Diagnostica** con LLM: identifica clúster temático afectado y top URLs/keywords perdidas
4. **Notifica** a Slack con Block Kit:
   - Mensaje al canal de la marca (de `brand_team_routing.slack_channel_id`; en SeoLab: `#alerts-operaciones` ID `C0B1B3V4ZB5`)
   - DM al especialista responsable de la marca (`brand_team_routing.team_lead_user_id`) si está configurado
   - Fallback channel (`SLACK_FALLBACK_CHANNEL` env var) si la marca no tiene routing

## Arquitectura

Ver [ARCHITECTURE.md](./ARCHITECTURE.md) para el diagrama detallado, contratos HTTP y lista de tablas.

Pipeline simplificado:

```
pg_cron 08:00 CO
    └─▶ orchestrator
          ├─▶ gsc-ingestor (1 por brand)   ─┐
          └─▶ ga4-ingestor (best-effort)   ─┴─▶ analyst
                                                  └─▶ detective (por anomaly)
                                                        └─▶ dispatcher
                                                              └─▶ notifications_outbox
                                                                    └─▶ outbox-worker (cada 30s)
                                                                          └─▶ Slack
```

Componentes resilientes:
- **Watchdog** pg_cron cada 2 min cierra runs huérfanos y libera locks vencidos
- **Outbox pattern** con lock pessimista y dedupe_key garantiza entrega exactly-once
- **Append-only `run_events`** da traceability total con `run_id` propagado

## Estructura del proyecto

```
position-watch/
├── README.md                                    ← este archivo
├── ARCHITECTURE.md                              ← diseño técnico detallado
├── SECRETS.md                                   ← Vault entries requeridos
├── .env.example                                 ← variables de deploy local
├── deploy.py                                    ← deploy de las 7 edge functions
├── 01-database-migrations/
│   ├── 001_seo_sentinel_schema.sql              ← schema + 11 tablas + seed festivos
│   ├── 002_seo_sentinel_views.sql               ← v_pipeline_health + v_recent_anomalies
│   ├── 003_seo_sentinel_watchdog.sql            ← watchdog_pipeline() + 2 cron jobs
│   └── 004_seo_sentinel_outbox.sql              ← public.notifications_outbox + cron worker
├── 02-edge-functions/
│   ├── _shared/                                 ← módulos compartidos (supabase, secret, gsc-api, etc.)
│   ├── seo-sentinel-orchestrator/
│   ├── seo-sentinel-gsc-ingestor/
│   ├── seo-sentinel-ga4-ingestor/
│   ├── seo-sentinel-analyst/
│   ├── seo-sentinel-detective/
│   ├── seo-sentinel-dispatcher/
│   └── seo-sentinel-outbox-worker/
├── handoff/
│   ├── 00-data-flow.md                          ← cómo fluye un evento end-to-end
│   ├── 01-edge-functions-contracts.md           ← contratos HTTP exactos
│   ├── 02-validation-checklist.md               ← checklist E2E post-deploy
│   └── 03-runbook.md                            ← cómo investigar / desatascar
└── scripts/
    └── seed_brands.sql                          ← brands + routing de ejemplo
```

## Setup rápido

### 1. Aplicar migraciones a Light_House

```bash
# Desde el dashboard Supabase SQL Editor, ejecutar en orden:
# 1. 001_seo_sentinel_schema.sql
# 2. 002_seo_sentinel_views.sql
# 3. 003_seo_sentinel_watchdog.sql
# 4. 004_seo_sentinel_outbox.sql
```

O, si tenés MCP de Supabase conectado a Claude Code, las migraciones se aplican automáticamente con `mcp__2b07c2b1__apply_migration`.

### 2. Configurar secrets en Vault

Ver [SECRETS.md](./SECRETS.md) para la lista completa de 10 secretos.

### 3. Desplegar edge functions

```bash
python deploy.py
```

(Requiere Supabase CLI y Deno instalados; ver `.env.example` para variables locales necesarias.)

### 4. Poblar brands + routing

```bash
# Editar scripts/seed_brands.sql con datos reales y ejecutar en SQL Editor
```

### 5. Validar end-to-end

Seguir [handoff/02-validation-checklist.md](./handoff/02-validation-checklist.md).

## Datos del proyecto Supabase

| Item | Valor |
|---|---|
| Project URL | `https://stjugsrkrweakvzmizpq.supabase.co` |
| Project ref | `stjugsrkrweakvzmizpq` (Light_House) |
| Schema operativo | `seo_sentinel` |
| Tabla compartida | `public.notifications_outbox` |
| Cron timezone | UTC (08:00 CO = `0 13 * * *`) |
| Edge functions URL | `https://stjugsrkrweakvzmizpq.functions.supabase.co` |

## Diferencia con el scaffold viejo

Este módulo `position-watch/` es una reimplementación del scaffold viejo en `../supabase/` siguiendo el patrón **Lighthouse** (HTTP entre agentes, watchdog, outbox, schema dedicado). El scaffold viejo queda intacto como referencia conceptual.

Cambios principales:
- Schema dedicado `seo_sentinel` en vez de `public`
- Orquestación por HTTP en vez de DB webhooks (no requiere config manual en Dashboard)
- Logging unificado en `run_events` (append-only) en vez de 4 tablas dispersas
- Outbox pattern con worker dedicado en vez de envío síncrono inline
- Detección **dual**: clicks + posiciones (el viejo solo tenía clicks)
- DM al especialista responsable de cada marca (via `brand_team_routing.team_lead_user_id`)

## Estado

- [x] Schema + 4 migraciones SQL
- [x] 7 edge functions + 7 módulos compartidos
- [x] Deploy script
- [x] Docs (README, ARCHITECTURE, SECRETS, 4 handoff)
- [ ] Secrets configurados en Vault (manual via Dashboard)
- [ ] Brands + routing poblados (via `scripts/seed_brands.sql` ajustado)
- [ ] Service Account de GSC con acceso a las propiedades
- [ ] Validación E2E completada (ver `handoff/02-validation-checklist.md`)
