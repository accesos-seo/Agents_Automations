# 04 — Task List para la IA Ejecutora

> **Quién lee esto:** vos sos una IA (Claude Code u otra) o un técnico trabajando con una IA. Tu tarea es **construir** el sistema `organic-early-warning` end-to-end siguiendo este plan.
>
> **El plan estratégico ya está hecho.** El usuario aprobó la arquitectura, las decisiones de diseño y las convenciones. Vos NO planificás, vos construís.
>
> **El usuario te delega libertad de implementación** dentro de las convenciones y contratos. Si encontrás ambigüedades en código (nombres de columnas no explícitos, decisiones internas pequeñas), tomá la mejor decisión técnica y documentala en el commit.

---

## 0. Starter prompt para tu primera sesión

Copiá y pegá este bloque como **primer mensaje** cuando arranques tu sesión de Claude Code:

```
Hola Claude. Voy a construir el sistema Organic Early Warning (V2 de seo_sentinel).

Antes de empezar, leé EN ESTE ORDEN:

1. CONVENTIONS.md (en el ROOT del repo accesos-seo/Agents_Automations)
   (convenciones canónicas de la agencia — todo proyecto las sigue al pie de la letra.
    Si trabajás en la máquina de SeoLab, también hay copia local en
    C:\Users\ceoel\.claude\conventions\agentic-automations.md)

2. automations/organic-early-warning/README.md
   (overview general)

3. automations/organic-early-warning/ARCHITECTURE.md
   (diseño completo con diagramas, decisiones de diseño, las 13 señales)

4. automations/organic-early-warning/handoff/04-task-list-tecnico.md
   (este archivo — tu plan paso a paso)

5. automations/organic-early-warning/handoff/01-edge-functions-contracts.md
   (contratos HTTP exactos de las 12 edge functions a construir)

6. automations/organic-early-warning/SECRETS.md
   (12 secretos a configurar en Supabase Vault)

7. automations/organic-early-warning/handoff/00-data-flow.md
   (cómo fluye un evento end-to-end)

8. automations/organic-early-warning/handoff/02-validation-checklist.md
   (cómo validás cuando termines)

9. automations/organic-early-warning/handoff/03-runbook.md
   (qué hacer cuando algo falle)

10. automations/organic-early-warning/handoff/05-backtesting-guide.md
    (cómo calibrar el motor estadístico antes de prod)

Contexto del proyecto:
- Proyecto Supabase: Light_House (ref stjugsrkrweakvzmizpq) — MCP de Supabase está conectado
- Schemas a crear: seo_data_hub + organic_early_warning
- Edge functions a construir: 5 del hub (hub-*) + 7 del oew (oew-*)
- Branch git: feature/organic-early-warning-v2 (desde main de accesos-seo/Agents_Automations)
- Slack bot: REUSAR Orbit SeoLab (D0A4NMACLPP), NO crear app nueva
- Canal de alertas: #alerts-operaciones (C0B1B3V4ZB5)
- V1 (seo-sentinel-position-watch) sigue corriendo en su schema seo_sentinel — NO TOCAR

Mi rol: técnico de configuración (cargo secrets, valido en producción).
Tu rol: constructor (escribís SQL, TS, deploys, abrís PR).

Cuando termines de leer los 10 docs, decime:
"Listo, mapeé el proyecto. ¿Por qué fase arrancamos: Fase 0 (data hub) o repaso algo primero?"

Y ayudame a ejecutar paso a paso. Si en cualquier momento te falta info
(un secret, un brand, un User ID Slack), pedímela explícitamente.

Reglas no negociables:
- NUNCA --no-verify, --amend, ni force-push
- Schema dedicado, NO tablas en public salvo notifications_outbox
- Idempotencia en toda INSERT (ON CONFLICT)
- run_events append-only desde el primer commit
- Si el dispatcher decide WATCH, va al digest semanal, NO alerta inmediata
```

---

## 1. Mapa del proyecto

### Sistemas a construir

| Sistema | Schema BD | Carpeta repo | Cuándo |
|---|---|---|---|
| **Data Hub** (capa bronze) | `seo_data_hub` | `00-data-hub/` | Fase 0 — primero, los consumidores dependen de él |
| **Organic Early Warning** (V2) | `organic_early_warning` | `01-organic-early-warning/` | Fases A-D — consume del hub |

### URLs críticas

| Recurso | URL |
|---|---|
| Repo | https://github.com/accesos-seo/Agents_Automations |
| Branch | `feature/organic-early-warning-v2` |
| Supabase Dashboard | https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq |
| Vault | https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/settings/vault/secrets |
| SQL Editor | https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/sql/new |
| Edge Functions | https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/functions |
| Logs edge fns | https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/logs/edge-functions |
| Slack App | https://api.slack.com/apps → seleccionar "Orbit SeoLab" |

---

## 2. Información ya confirmada (NO la preguntes)

| Item | Valor |
|---|---|
| Project Supabase | Light_House (`stjugsrkrweakvzmizpq`) |
| Schemas | `seo_data_hub`, `organic_early_warning` |
| Cadencia hub GSC/GA4/CWV | Semanal Lunes 06:00 UTC |
| Cadencia hub Ahrefs | Mensual día 28 06:00 UTC |
| Cadencia evaluación V2 | Martes 13:00 UTC (08:00 CO) |
| Cadencia digest V2 | Viernes 23:00 UTC (18:00 CO) |
| Bot Slack | Orbit SeoLab (`D0A4NMACLPP`) — REUSAR, NO crear app nueva |
| Canal alertas | `#alerts-operaciones` (`C0B1B3V4ZB5`) |
| Modelo LLM | `anthropic/claude-sonnet-4` vía OpenRouter |
| Auth GSC/GA4 | Service Account (NO OAuth2) |
| Auth entre fns hub | header `x-internal-secret` con `HUB_INTERNAL_SECRET` |
| Auth entre fns oew | header `x-internal-secret` con `OEW_INTERNAL_SECRET` |
| Severidad tiers | WATCH (digest) / YELLOW / RED |
| Tabla anomalías | UNIFICADA `signal_events` + `signal_definitions` pluggable |
| Outbox compartido | `public.notifications_outbox` con `source='oew_alert'` |
| Severidad min default | YELLOW (configurable por brand en `brand_routing.severity_threshold`) |
| Warm-up baseline | 4 semanas mínimo, 8-12 recomendado |
| Factor k motor estadístico | 3.5 default, auto-calibrado por varianza de brand |

---

## 3. Información a recolectar del usuario (preguntas explícitas)

Antes de arrancar Fase 0, asegurate de tener esto. Si no, pedíselo al usuario:

### A. Cuentas externas

| Item | Quién lo provee | Formato esperado |
|---|---|---|
| `GSC_SERVICE_ACCOUNT_JSON` | Técnico (genera en GCP Console) | JSON completo con `private_key`, `client_email` |
| `PSI_API_KEY` | Técnico (GCP API key con PageSpeed Insights API) | string |
| `CRUX_API_KEY` | Técnico (puede ser misma key de PSI) | string opcional |
| `AHREFS_API_TOKEN` | Técnico (https://app.ahrefs.com/api-settings) | string |
| `AHREFS_CREDIT_BUDGET_MONTH` | Usuario (decide límite) | integer (ej. 500) |
| `OPENROUTER_API_KEY` | Técnico (si V1 ya tiene, reusar) | `sk-or-...` |
| `SLACK_BOT_TOKEN` | Técnico (de la app Orbit SeoLab existente) | `xoxb-...` |
| `HUB_INTERNAL_SECRET` | Generás vos: `openssl rand -hex 32` | hex 64 chars |
| `OEW_INTERNAL_SECRET` | Generás vos: `openssl rand -hex 32` | hex 64 chars |
| `SUPABASE_FUNCTIONS_URL` | Fijo: `https://stjugsrkrweakvzmizpq.functions.supabase.co` | URL |

### B. Brands a monitorear

Por **cada marca** que vamos a monitorear (mínimo 1 para empezar):

| Campo | Pregunta |
|---|---|
| `internal_name` | ¿Cómo se llama internamente? (ej. "Clínica Dental Bogotá") |
| `gsc_property_url` | URL exacta de la propiedad en GSC (`sc-domain:cliente.com` o `https://cliente.com/`) |
| `ga4_property_id` | ID numérico GA4 (Admin → Property Settings). Si no tiene GA4, NULL |
| `ahrefs_domain` | Dominio raíz para Ahrefs (ej. `cliente.com`, sin https) |
| `team_lead_user_id` | Slack User ID del especialista responsable (formato `U05...`) |
| `seasonality_type` | `'b2b_weekday'` / `'strong_yoy'` / NULL |
| `severity_threshold` | `'WATCH'` (recibe todo) / `'YELLOW'` (default) / `'RED'` (solo crisis) |

### C. Permisos de Service Account

Por cada brand, después de crear la SA:
- [ ] Agregar el `client_email` de la SA como **Restricted user** en GSC de esa property
- [ ] Agregar el `client_email` como **Viewer** en GA4 de esa property

Sin estos pasos, GSC/GA4 devuelven 403 y todo el sistema queda sin data.

---

## 4. Fase 0 — Data Hub (días 1-3)

**Objetivo:** que las 5 hub-ingestors corran, ingiesen data del Lunes que viene, y cargen las tablas raw del `seo_data_hub`.

### Tarea 0.1 — Setup local

- [ ] Clonar el repo en `C:/Users/ceoel/temp/` (fuera de OneDrive para evitar timeouts de Git):
  ```
  git clone https://github.com/accesos-seo/Agents_Automations.git
  cd Agents_Automations
  git checkout -b feature/organic-early-warning-v2
  cp -r /path/al/scaffold/organic-early-warning automations/
  ```
- [ ] Verificar estructura: `ls automations/organic-early-warning/` muestra README, ARCHITECTURE, SECRETS, 00-data-hub/, 01-organic-early-warning/, handoff/, scripts/
- [ ] Copiar `.env.example` a `.env` y rellenar `SUPABASE_ACCESS_TOKEN`

### Tarea 0.2 — Escribir y aplicar migraciones del hub

Mirá `01-edge-functions-contracts.md` para los nombres de tabla y `ARCHITECTURE.md` sección "Schema seo_data_hub" para columnas críticas.

Migrations en `00-data-hub/01-migrations/`:
- [ ] `001_seo_data_hub_schema.sql` — CREATE SCHEMA + 12 tablas raw + brands_registry + ingestion_runs + run_events (event_types extendidos con `'partition_created'`, `'rotation_executed'`)
- [ ] `002_seo_data_hub_partitioning.sql` — función `ensure_monthly_partitions()` + particiones iniciales (próximos 3 meses) + función `rotate_old_partitions(retention_months INT)` (default 24)
- [ ] `003_seo_data_hub_watchdog.sql` — función `seo_data_hub.watchdog()` con check de runs huérfanos + libera locks + crea particiones nuevas si faltan + alert al `SLACK_ADMIN_CHANNEL` si Ahrefs queda sin créditos
- [ ] `004_seo_data_hub_cron.sql` — 5 cron jobs: `hub-gsc-weekly`, `hub-ga4-weekly`, `hub-cwv-weekly`, `hub-ahrefs-monthly`, `hub-watchdog`

Aplicalas vía MCP:
- [ ] `mcp__2b07c2b1...__apply_migration` con `project_id=stjugsrkrweakvzmizpq` y el SQL de cada archivo
- [ ] Verificar: `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='seo_data_hub';` → 12+
- [ ] Verificar cron: `SELECT jobname FROM cron.job WHERE jobname LIKE 'hub-%';` → 5 filas

### Tarea 0.3 — Escribir 5 edge functions del hub

Estructura en `00-data-hub/02-edge-functions/`:

- [ ] `_shared/supabase.ts` — singletons con `db: { schema: 'seo_data_hub' }`
- [ ] `_shared/secret.ts` — verifyInternalSecret usando `HUB_INTERNAL_SECRET`
- [ ] `_shared/run-events.ts` — emitEvent helper
- [ ] `_shared/gsc-api.ts` — wrapper Search Analytics + URL Inspection + paginación + retry expo
- [ ] `_shared/ga4-api.ts` — wrapper Data API
- [ ] `_shared/cwv-api.ts` — wrapper CrUX + PSI fallback
- [ ] `_shared/ahrefs-api.ts` — wrapper Ahrefs API (3 endpoints) + budget tracker
- [ ] `hub-gsc-weekly/index.ts` — contrato en `handoff/01-edge-functions-contracts.md` §1
- [ ] `hub-ga4-weekly/index.ts` — contrato en §2
- [ ] `hub-cwv-weekly/index.ts` — contrato en §3
- [ ] `hub-ahrefs-monthly/index.ts` — contrato en §4
- [ ] `hub-crawl-loader/index.ts` — contrato en §5

Reglas estrictas:
- TypeScript estricto, evitar `any` salvo respuestas de APIs externas
- Cada fn al inicio: `verifyInternalSecret(req)` → si null devuelve 401
- Cada fn al inicio: `emitEvent agent_started`, al final `agent_completed`, en catch `agent_failed`
- INSERTs con `.upsert({...}, { onConflict: '...' })`
- Sin comentarios decorativos

### Tarea 0.4 — Cargar 10 secretos del hub en Vault

Lista completa en `SECRETS.md`. Para Fase 0 necesitás los del hub:
- [ ] `SUPABASE_FUNCTIONS_URL`
- [ ] `HUB_INTERNAL_SECRET` (generar)
- [ ] `GSC_SERVICE_ACCOUNT_JSON` (técnico provee)
- [ ] `GA4_SERVICE_ACCOUNT_JSON` (opcional, sino reusa GSC)
- [ ] `PSI_API_KEY`
- [ ] `CRUX_API_KEY` (opcional)
- [ ] `AHREFS_API_TOKEN`
- [ ] `AHREFS_CREDIT_BUDGET_MONTH`
- [ ] `SLACK_BOT_TOKEN` (de Orbit SeoLab existente — si V1 ya lo cargó, NO duplicar)
- [ ] `SLACK_ADMIN_CHANNEL`

Verificar:
```sql
SELECT name FROM vault.decrypted_secrets WHERE name IN (
  'SUPABASE_FUNCTIONS_URL','HUB_INTERNAL_SECRET','GSC_SERVICE_ACCOUNT_JSON',
  'GA4_SERVICE_ACCOUNT_JSON','PSI_API_KEY','CRUX_API_KEY','AHREFS_API_TOKEN',
  'AHREFS_CREDIT_BUDGET_MONTH','SLACK_BOT_TOKEN','SLACK_ADMIN_CHANNEL'
) ORDER BY name;
```

### Tarea 0.5 — Poblar `brands_registry`

- [ ] Ejecutar `scripts/seed_brands_registry.sql` (lo escribís vos como parte del proyecto). Mínimo 1 brand de testing + brands reales que el usuario te dé.
- [ ] Verificar permisos SA en cada GSC property + GA4 property (sin esto las ingestas fallan con 403)

### Tarea 0.6 — Deploy del hub

- [ ] Escribir `deploy.py` (análogo al de V1, ajustado para 12 funciones, soporta `--target hub` y `--target oew`)
- [ ] Correr `python deploy.py --target hub` → deploya las 5 hub-*
- [ ] Verificar en Dashboard → Functions que las 5 aparecen Active

### Tarea 0.7 — Validación Fase 0

- [ ] Forzar manual: `curl -X POST .../hub-gsc-weekly -H 'x-internal-secret: <HUB_SECRET>' -d '{"trigger":"manual"}'`
- [ ] `SELECT * FROM seo_data_hub.ingestion_runs ORDER BY started_at DESC LIMIT 5;` → última `status='completed'`
- [ ] `SELECT COUNT(*) FROM seo_data_hub.gsc_search_analytics_weekly WHERE iso_week >= to_char(NOW() - INTERVAL '14 days', 'IYYY-IW');` → ≥1 fila por brand activa

Pasar a Fase A solo cuando el hub corra limpio.

---

## 5. Fase A — Quick wins V2 (días 4-7)

**Objetivo:** sistema V2 detectando con señales basadas SOLO en GSC + GA4 (S8, S9, S11, S12, S13). Las otras 8 quedan deshabilitadas hasta sus respectivas fases.

### Tarea A.1 — Migraciones del schema oew

En `01-organic-early-warning/01-migrations/`:

- [ ] `001_oew_schema.sql` — CREATE SCHEMA + 9 tablas (brand_routing, signal_definitions, baselines, signal_events, incidents, incident_diagnostics, incident_log, analysis_runs, run_events) con todos los CHECK constraints
- [ ] `002_oew_signal_definitions_seed.sql` — INSERT las 13 definiciones (catálogo completo en ARCHITECTURE.md). Arrancar con `enabled=true` SOLO para S8, S9, S11, S12, S13. El resto `enabled=false`.
- [ ] `003_oew_views.sql` — `v_pipeline_health` (counts de stuck/pending/sent) + `v_open_incidents` (incidents abiertos con resumen) + `v_signal_summary` (signal_events últimos 7d agrupados por signal)
- [ ] `004_oew_watchdog.sql` — función watchdog con los 3 checks canónicos + chequeo extra "data del hub fresca" (alerta si última ingestion_run >7 días)
- [ ] `005_oew_cron.sql` — `oew-orchestrator` (Martes 13:00 UTC) + `oew-digest-weekly` (Viernes 23:00 UTC) + `oew-watchdog` (*/2 min) + `oew-outbox-worker` (cada 30s — reusa el de V1 con `source='oew_alert'` o crea uno propio si preferís aislar)

Aplicar vía MCP.

### Tarea A.2 — Escribir 7 edge functions oew

En `01-organic-early-warning/02-edge-functions/`:

- [ ] `_shared/supabase.ts` — singletons con `db: { schema: 'organic_early_warning' }` + cliente para cross-schema queries al hub
- [ ] `_shared/secret.ts` — verifyInternalSecret usando `OEW_INTERNAL_SECRET`
- [ ] `_shared/run-events.ts`
- [ ] `_shared/openrouter.ts`
- [ ] `_shared/slack-blockkit-v2.ts` — templates Block Kit para WATCH/YELLOW/RED + digest semanal
- [ ] `_shared/statistics.ts` — funciones puras: `median(arr)`, `mad(arr)`, `mannKendall(arr)`, `zScoreRobust(value, baseline)`, etc.
- [ ] `oew-orchestrator/index.ts` — contrato en §6
- [ ] `oew-baseline-builder/index.ts` — contrato en §7. Lee últimas 8-12 semanas del hub, computa median+MAD+trend, UPSERT en `baselines`
- [ ] `oew-signal-evaluator/index.ts` — contrato en §8. Itera `signal_definitions WHERE enabled=true`. Por cada señal, implementa evaluator específico (5 evaluators para Fase A: S8/S9/S11/S12/S13). Las 8 evaluators restantes pueden quedar como stubs que devuelven array vacío.
- [ ] `oew-incident-clusterer/index.ts` — contrato en §9
- [ ] `oew-detective/index.ts` — contrato en §10
- [ ] `oew-dispatcher/index.ts` — contrato en §11. Encola en outbox con `source='oew_alert'`. Filtra por `severity >= brand_routing.severity_threshold`.
- [ ] `oew-digest-weekly/index.ts` — contrato en §12

### Tarea A.3 — Cargar secretos oew faltantes

- [ ] `OEW_INTERNAL_SECRET` (generar)
- [ ] `OPENROUTER_API_KEY` (reusar si V1 lo tiene)
- [ ] `OEW_MODEL` (`anthropic/claude-sonnet-4`)
- [ ] `SLACK_FALLBACK_CHANNEL` (`C0B1B3V4ZB5` — si V1 lo cargó, NO duplicar)

### Tarea A.4 — Poblar `brand_routing`

```sql
INSERT INTO organic_early_warning.brand_routing (
  brand_id, slack_channel_id, team_lead_user_id, severity_threshold
)
SELECT
  br.id,
  'C0B1B3V4ZB5',                   -- canal alerts-operaciones
  'PENDING_CONFIG: U05...',         -- Slack User ID del especialista de esta brand
  'YELLOW'                          -- default
FROM seo_data_hub.brands_registry br
WHERE br.status = 'active';
```

### Tarea A.5 — Deploy oew

- [ ] `python deploy.py --target oew` → deploya las 7 oew-*
- [ ] Verificar en Dashboard

### Tarea A.6 — Backtesting (CRÍTICO antes de activar cron)

Seguí `handoff/05-backtesting-guide.md`. Mínimo:
- [ ] Escribir `scripts/backtest_runner.py` siguiendo la spec del backtesting guide
- [ ] Si V1 tiene 8+ semanas de data, migrar al hub (sección Opción A del backtesting guide)
- [ ] Marcar ground truth conocido en `backtest_ground_truth` (cooperación con el usuario)
- [ ] Correr `python scripts/backtest_runner.py --brand <UUID> --weeks 8 --output backtest-report.json`
- [ ] Iterar calibración hasta F1 > 0.7 en al menos 4 de las 5 señales activas

Si no hay data histórica suficiente:
- [ ] Documentar en runbook que las primeras 8 semanas son "warm-up" — todas las señales devuelven WATCH tier hasta que `baselines.n_samples >= 4`
- [ ] Activar cron con confianza reducida; calibración en 4 semanas

### Tarea A.7 — Activar cron + observar

- [ ] Confirmar `UPDATE cron.job SET active=true WHERE jobname IN ('oew-orchestrator', 'oew-digest-weekly', 'oew-watchdog', 'oew-outbox-worker');`
- [ ] Esperar al primer martes 13:00 UTC
- [ ] Validar con `handoff/02-validation-checklist.md` los pasos 7-14

---

## 6. Fase B — Capa técnica adelantada (días 8-11)

**Objetivo:** activar S1 (URL fuera del índice), S2 (errores de cobertura), S5 (CWV regresión).

- [ ] Implementar evaluators de S1/S2/S5 en `oew-signal-evaluator` (los stubs vacíos los reemplazás con lógica real)
- [ ] `UPDATE organic_early_warning.signal_definitions SET enabled=true WHERE id IN ('S1','S2','S5');`
- [ ] Esperar 4 semanas más de data CWV (CrUX requiere histórico)
- [ ] Re-correr backtest, calibrar pesos de S1/S2/S5

---

## 7. Fase C — Crawl diff (días 12-15)

**Objetivo:** activar S3 (cambios técnicos) y S4 (links rotos / huérfanas).

- [ ] Implementar `hub-crawl-loader` completamente (recibe export Screaming Frog vía POST)
- [ ] Documentar workflow para el SEO: correr Screaming Frog semanalmente con la CLI o programar la app, exportar CSV o XML, hacer `curl POST hub-crawl-loader` con el archivo
- [ ] Implementar evaluators de S3/S4 (lectura de `crawl_snapshots` y diff vs snapshot anterior)
- [ ] `UPDATE signal_definitions SET enabled=true WHERE id IN ('S3','S4');`

Nota: S3/S4 son los más útiles operativamente pero los más "manuales" — el SEO debe correr el crawl. Si el SEO no quiere automatizar Screaming Frog, ofrecé `hub-crawl-loader` como API que recibe el export.

---

## 8. Fase D — Off-page Ahrefs (días 16-20)

**Objetivo:** activar S6 (caída ref domains), S7 (pico tóxicos), S10 (competidor nuevo).

- [ ] El cron `hub-ahrefs-monthly` ya está activo desde Fase 0. Esperar al primer día 28 para la primera corrida.
- [ ] Implementar evaluators de S6/S7/S10 (lectura de `ahrefs_*_monthly`)
- [ ] `UPDATE signal_definitions SET enabled=true WHERE id IN ('S6','S7','S10');`

---

## 9. Fase E — Validación productiva + apagar V1 (días 21-30)

- [ ] Correr 4 semanas de producción supervisada con todas las 13 señales activas
- [ ] Recolectar falsos positivos del equipo, marcar `signal_events.false_positive=true` y notas en `false_positive_reason`
- [ ] Recalibrar `k`, pesos y warm-up basado en feedback real
- [ ] Cuando V2 cubra confiable lo que V1 cubría:
  - [ ] `UPDATE cron.job SET active=false WHERE jobname LIKE 'seo-sentinel-%';`
  - [ ] Documentar en commit la migración V1→V2
  - [ ] Mover docs de V1 a `archived/` o agregar nota README "deprecated, see organic-early-warning"

---

## 10. Definition of Done (checklist final)

Cuando termines, debería ser cierto:

- [ ] Los 12 secretos están en Vault y verificables con `SELECT name FROM vault.decrypted_secrets WHERE name IN (...)`
- [ ] 12 tablas en `seo_data_hub` + 9 tablas en `organic_early_warning` + 3 vistas
- [ ] 5 cron jobs `hub-*` + 4 cron jobs `oew-*` activos en `cron.job`
- [ ] Las 12 edge functions aparecen "Active" en el Dashboard
- [ ] `brands_registry` tiene al menos 1 brand con status=active
- [ ] `brand_routing` tiene una fila por brand activa con `team_lead_user_id` real
- [ ] Service Account agregada como Restricted user en CADA propiedad GSC + Viewer en cada GA4
- [ ] Bot Orbit SeoLab está invitado a `#alerts-operaciones`
- [ ] Backtest corrido al menos 1 vez, report en `backtest-report.json`, F1 > 0.7 en mayoría de señales activas
- [ ] Pipeline E2E validado siguiendo `handoff/02-validation-checklist.md`
- [ ] PR en `feature/organic-early-warning-v2` con todos los commits + descripción de lo construido
- [ ] Memoria local actualizada (`~/.claude/projects/.../memory/project_organic_early_warning.md`)

---

## 11. Cuándo escalar al usuario

| Situación | Cómo escalar |
|---|---|
| Una decisión arquitectónica grande que ARCHITECTURE.md no cubre | Pará, preguntá explícitamente |
| Falta una credencial (Slack User ID, GSC URL, etc.) | Pedila explícitamente con formato esperado |
| El SQL del MCP devuelve error inesperado | Compartí el error, pedí permiso antes de workaround |
| Conflict con V1 (cron, outbox row, etc.) | Pará, pedí confirmación antes de tocar V1 |
| Backtest F1 bajísimo (<0.4) en >50% de señales | Pará, replantear con el usuario antes de activar cron |
| Necesitás tirar/recrear una tabla con data | NUNCA hagas DROP sin permiso explícito |
| Necesitás force-push o amend | Está prohibido por convención; encontrá otra solución |

---

## 12. Apéndice: estructura final del módulo

```
automations/organic-early-warning/
├── README.md
├── ARCHITECTURE.md
├── SECRETS.md
├── .env.example
├── deploy.py                               ← te toca escribirlo (análogo al de V1)
├── 00-data-hub/
│   ├── 01-migrations/
│   │   ├── 001_seo_data_hub_schema.sql     ← te toca
│   │   ├── 002_seo_data_hub_partitioning.sql ← te toca
│   │   ├── 003_seo_data_hub_watchdog.sql   ← te toca
│   │   └── 004_seo_data_hub_cron.sql       ← te toca
│   └── 02-edge-functions/
│       ├── _shared/                         ← te toca (7 archivos)
│       ├── hub-gsc-weekly/index.ts          ← te toca
│       ├── hub-ga4-weekly/index.ts          ← te toca
│       ├── hub-cwv-weekly/index.ts          ← te toca
│       ├── hub-ahrefs-monthly/index.ts      ← te toca
│       └── hub-crawl-loader/index.ts        ← te toca
├── 01-organic-early-warning/
│   ├── 01-migrations/
│   │   ├── 001_oew_schema.sql               ← te toca
│   │   ├── 002_oew_signal_definitions_seed.sql ← te toca
│   │   ├── 003_oew_views.sql                ← te toca
│   │   ├── 004_oew_watchdog.sql             ← te toca
│   │   └── 005_oew_cron.sql                 ← te toca
│   └── 02-edge-functions/
│       ├── _shared/                         ← te toca (6 archivos)
│       ├── oew-orchestrator/index.ts        ← te toca
│       ├── oew-baseline-builder/index.ts    ← te toca
│       ├── oew-signal-evaluator/index.ts    ← te toca
│       ├── oew-incident-clusterer/index.ts  ← te toca
│       ├── oew-detective/index.ts           ← te toca
│       ├── oew-dispatcher/index.ts          ← te toca
│       └── oew-digest-weekly/index.ts       ← te toca
├── handoff/                                 ← YA ESTÁN ESCRITOS, son tu spec
│   ├── 00-data-flow.md
│   ├── 01-edge-functions-contracts.md       ← tu biblia para inputs/outputs
│   ├── 02-validation-checklist.md
│   ├── 03-runbook.md
│   ├── 04-task-list-tecnico.md              ← ESTE archivo
│   └── 05-backtesting-guide.md              ← tu guía para Tarea A.6
└── scripts/
    ├── seed_brands_registry.sql             ← te toca (plantilla con PENDING_CONFIG)
    └── backtest_runner.py                   ← te toca (spec en backtesting-guide.md)
```

**Total a construir:** 9 migraciones SQL + 12 edge functions + 13 módulos `_shared/` + deploy.py + 2 scripts. Aproximadamente 50 archivos nuevos.

---

## 13. Cómo arrancar tu próximo turno (después de leer todo)

Cuando termines de leer los 10 docs, decime exactamente:

> "Listo, mapeé el proyecto. Confirmá que tengo los siguientes inputs antes de arrancar Fase 0:
>
> 1. ¿Tenés el `GSC_SERVICE_ACCOUNT_JSON` listo o lo genero yo?
> 2. ¿Tenés `AHREFS_API_TOKEN` y cuál es el `AHREFS_CREDIT_BUDGET_MONTH` que quieras?
> 3. ¿Cuántas brands quieres seedear y cuáles son? (necesito name + gsc_property_url + team_lead_user_id Slack ID por cada una)
> 4. ¿Querés que reusemos `SLACK_BOT_TOKEN` y `OPENROUTER_API_KEY` de V1 si están cargados, o cargamos nuevos?
>
> Con esto arranco a escribir las 4 migraciones del hub y las paso por MCP."

Y a partir de ahí, ejecutá. Si en algún momento te bloquea algo que no aparece en estos 10 docs, escalá al usuario.

**Buena suerte. El plan está sólido — confiá en él y construilo paso a paso.**
