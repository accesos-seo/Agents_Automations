# Convenciones de Automatizaciones Agénticas — SeoLab Agency

> **Documento canónico.** Todo proyecto agéntico de la agencia (Lighthouse, seo_sentinel, Organic Early Warning, futuros) sigue estas convenciones. Si un proyecto se aparta, debe documentar el porqué en su propio README.
>
> **Cómo usar este doc:** todo handoff que se le entregue a una IA ejecutora debe arrancar con la línea: *"Antes de empezar, leé `C:\Users\ceoel\.claude\conventions\agentic-automations.md` — son las convenciones de la agencia que este proyecto sigue."*

---

## 1. Patrón arquitectónico canónico

```
[Trigger: pg_cron / HTTP manual]
        │
        ▼
[Orchestrator]            ← entry HTTP único, valida secret, crea analysis_run
        │
        ▼  paralelo
[Ingestors × N]           ← 1 por fuente externa (GSC, GA4, Ahrefs, CWV, etc.)
        │
        ▼
[Analyst / Evaluator]     ← lógica de negocio: detección, scoring, segmentación
        │
        ▼
[Detective]               ← LLM enriquece anomalías con contexto/clustering
        │
        ▼
[Dispatcher]              ← arma payload de notificación, calcula severidad,
        │                    encola en public.notifications_outbox
        ▼
[Outbox-worker]           ← pg_cron cada 30s, claim pessimista, POST a Slack,
                            retry exponencial, idempotencia por dedupe_key
```

**Reglas no negociables del patrón:**
- El orchestrator nunca ejecuta lógica de negocio — solo despacha
- Comunicación entre fns: HTTP con `x-internal-secret` (NUNCA JWT de Supabase entre componentes internos)
- Cada fn es idempotente: re-correr no rompe ni duplica
- Cada fn emite events append-only en `<schema>.run_events` antes y después de su trabajo
- El dispatcher NUNCA envía a Slack directamente — encola en outbox y deja que el worker entregue (esto garantiza retries + dedupe globales)

---

## 2. Reglas de schema Supabase

| Regla | Detalle |
|---|---|
| Schema dedicado por automatización | NUNCA tablas operativas en `public`. Excepción documentada: `public.notifications_outbox` es compartida |
| Project Supabase por default | Light_House (`stjugsrkrweakvzmizpq`). Crear proyecto nuevo solo si: billing aislado requerido, residencia de datos distinta, equipo externo sin acceso al resto |
| RLS deshabilitada en schemas operativos | Servicios internos acceden con service-role key. RLS solo si el frontend va a leer directamente (no es el caso de estos sistemas) |
| Data hub centralizado | Toda fuente externa (GSC/GA4/Ahrefs/CWV/crawl) se ingiere UNA vez al schema `seo_data_hub`. Los consumers (sistemas agénticos) leen del hub, NO de las APIs |
| Naming | `snake_case` plural para tablas, `snake_case` para schemas y columnas, `kebab-case` para edge functions y módulos |
| Particionado | Tablas con cardinalidad alta (>1M rows/año) se particionan por mes con función `ensure_monthly_partitions()` invocada por watchdog |

---

## 3. Tabla `run_events` obligatoria

Cada automatización tiene su propia `<schema>.run_events`:

```sql
CREATE TABLE <schema>.run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES <schema>.analysis_runs(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES <schema>.brands(id) ON DELETE SET NULL,
  event_source TEXT NOT NULL,             -- 'orchestrator', 'gsc-ingestor', etc.
  event_type TEXT NOT NULL CHECK (event_type IN (
    'run_started', 'run_completed', 'run_failed',
    'agent_started', 'agent_completed', 'agent_failed',
    'anomaly_detected', 'diagnosis_saved',
    'alert_enqueued', 'alert_sent', 'alert_failed',
    'watchdog_triggered', 'warning'
  )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB,
  error_message TEXT
);
```

Extender el CHECK si el sistema necesita event types adicionales (ej. `'baseline_recomputed'`, `'incident_clustered'`).

---

## 4. Auth entre edge functions

```ts
// _shared/secret.ts
export function verifyInternalSecret(req: Request): Response | null {
  const got = req.headers.get("x-internal-secret");
  const want = Deno.env.get("<SISTEMA>_INTERNAL_SECRET");
  if (!got || !want || got !== want) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
```

Naming convention del env var: `<SISTEMA>_INTERNAL_SECRET` (ej. `SEO_SENTINEL_INTERNAL_SECRET`, `OEW_INTERNAL_SECRET`, `HUB_INTERNAL_SECRET`).

---

## 5. Idempotencia

| Mecanismo | Dónde aplicarlo |
|---|---|
| `INSERT ... ON CONFLICT (...) DO UPDATE SET` | Ingestors al escribir snapshots |
| `dedupe_key` UNIQUE en outbox | `<sistema>:<id_único>:v1:<target>` |
| `force` flag en endpoints | Detective, dispatcher para re-trigger manual |
| Lookup previo antes de insert | Incident_log con check de incident_id existente |

---

## 6. Watchdog

Cada sistema agéntico tiene función SQL `<schema>.watchdog_pipeline()` ejecutada por `pg_cron` cada 2-5 min. Mínimo 3 checks:

1. **Runs huérfanos**: `analysis_runs.status='running'` con `started_at < NOW() - 30 min` → UPDATE failed + INSERT run_events `watchdog_triggered` + POST opcional a `SLACK_ADMIN_CHANNEL`
2. **Diagnostics sin dispatchear**: rows con `diagnosis_saved=true` sin entry en `incident_log` últimas 24h → re-trigger dispatcher con `force:true`
3. **Outbox stale locks**: `public.notifications_outbox` con `status='pending'` y `locked_at < NOW() - 5 min` y `source='<sistema>_alert'` → UPDATE locked_at=NULL

---

## 7. Secretos en Vault

Convenciones:

| Tipo | Naming | Ejemplo |
|---|---|---|
| Secret interno | `<SISTEMA>_INTERNAL_SECRET` | `OEW_INTERNAL_SECRET` |
| API key externa | `<PROVEEDOR>_API_KEY` o `<PROVEEDOR>_<RECURSO>` | `OPENROUTER_API_KEY`, `AHREFS_API_TOKEN` |
| Service Account JSON | `<PROVEEDOR>_SERVICE_ACCOUNT_JSON` | `GSC_SERVICE_ACCOUNT_JSON` |
| Modelo LLM por sistema | `<SISTEMA>_MODEL` (override del default) | `OEW_MODEL` |
| URL de proyecto | `SUPABASE_FUNCTIONS_URL` | Compartido |

**Recursos Slack compartidos (NO duplicar):**

| Recurso | Valor |
|---|---|
| Bot Slack | **Orbit SeoLab** (App ID `D0A4NMACLPP`) — bot único de la agencia, todas las automatizaciones usan el mismo `SLACK_BOT_TOKEN` |
| Canal global de alertas | `#alerts-operaciones` (ID `C0B1B3V4ZB5`) |
| Variables Vault asociadas | `SLACK_BOT_TOKEN`, `SLACK_FALLBACK_CHANNEL=C0B1B3V4ZB5`, `SLACK_ADMIN_CHANNEL` |

**NUNCA crear Slack App nueva** — toda automatización reusa Orbit SeoLab.

---

## 8. Estructura de handoff obligatoria

Cada módulo tiene carpeta `handoff/` con **mínimo** estos 5 archivos:

| Archivo | Contenido | Audiencia |
|---|---|---|
| `00-data-flow.md` | Diagrama temporal de un evento end-to-end con tiempos esperados (T+0s, T+30s, ...) + queries SQL para seguir el evento por run_id | IA ejecutora + técnico de operaciones |
| `01-edge-functions-contracts.md` | HTTP contract de CADA edge function: input/output JSON, errores comunes con códigos, ejemplos curl | IA ejecutora |
| `02-validation-checklist.md` | Test E2E post-deploy: 8-12 pasos con SQL/curl exactos para validar que el sistema funciona | Técnico de operaciones |
| `03-runbook.md` | Tabla "síntoma → diagnóstico → fix" para los 5-10 errores más comunes; comandos de diagnóstico copy-paste | On-call / soporte |
| `04-task-list-tecnico.md` | Lista paso a paso para la IA ejecutora: starter prompt, fases, comandos exactos, datos a recolectar | IA ejecutora (este es el doc principal) |

Si el sistema usa motor estadístico o algo no obvio, agregar `05-backtesting-guide.md`.

---

## 9. Layout de módulo en el repo

```
automations/<nombre-modulo-kebab>/
├── README.md                       ← overview + link a este doc de convenciones
├── ARCHITECTURE.md                 ← diagrama + decisiones de diseño
├── SECRETS.md                      ← tabla de secretos Vault con cómo generarlos
├── .env.example                    ← env vars LOCALES para deploy (no secretos de runtime)
├── deploy.py                       ← script Python que deploya las edge functions
├── 01-migrations/                  ← (o 00-data-hub/, 01-<modulo>/ si hay sub-componentes)
│   └── 00X_<sistema>_<nombre>.sql  ← migraciones numeradas
├── 02-edge-functions/
│   ├── _shared/                    ← supabase.ts, secret.ts, run-events.ts, etc.
│   └── <prefijo>-<nombre>/index.ts ← una carpeta por función
├── handoff/                        ← obligatorio (sección 8)
└── scripts/                        ← seeds SQL, herramientas auxiliares
```

---

## 10. Starter prompt para la IA ejecutora

Todo handoff debe incluir en `04-task-list-tecnico.md` un bloque "Starter prompt para Claude Code" copy-paste. Estructura mínima del prompt:

```
Hola Claude. Voy a ejecutar el proyecto <NOMBRE>.

Antes de empezar, leé en este orden:
1. C:\Users\ceoel\.claude\conventions\agentic-automations.md (convenciones de la agencia)
2. automations/<modulo>/README.md (overview)
3. automations/<modulo>/ARCHITECTURE.md (diseño detallado)
4. automations/<modulo>/handoff/04-task-list-tecnico.md (mi plan paso a paso)
5. automations/<modulo>/handoff/01-edge-functions-contracts.md (qué construir)
6. automations/<modulo>/SECRETS.md (qué secretos cargar)

Contexto:
- Proyecto Supabase: Light_House (ref stjugsrkrweakvzmizpq)
- Schema(s): <listar>
- Mi rol: <ejecutor / técnico de config>
- Tu rol: <constructor / asistente>

Cuando termines de leer, decime "Listo, ¿por qué fase empezamos?" y ayudame a ejecutar.
Si te falta info en cualquier paso, pedímela explícitamente.
```

---

## 11. Convenciones de git/PR

| Práctica | Regla |
|---|---|
| Branch | `feature/<modulo-kebab>` (o `feature/<modulo>-v<N>` si es revisión mayor) desde `main` |
| Commit subject | `feat(<modulo>): <descripción acción>` o `fix(<modulo>): ...` o `docs(<modulo>): ...` |
| Co-author | `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` cuando Claude colabora |
| Amend / force-push | PROHIBIDO. Siempre commits nuevos |
| `--no-verify` | PROHIBIDO. Si un hook falla, arreglar la causa |
| PR | Siempre **draft** primero; el reviewer marca Ready cuando aprueba |
| Multi-componente | Un PR por módulo. Si un cambio toca 2 módulos, separar en 2 PRs si es posible |

---

## 12. Reglas operativas Windows + OneDrive

| Regla | Razón |
|---|---|
| NO correr `supabase functions deploy` en background | PowerShell + OneDrive paths timeoutean (memoria persistente del entorno) |
| NO correr `git push` en background sobre paths OneDrive | Mismo problema |
| Comandos de deploy/git van al técnico como instrucciones, no auto-ejecutados | El técnico los corre interactivamente en su terminal |
| Clones / repos temporales fuera de OneDrive | Usar `C:/Users/ceoel/temp/` para clonado de repos |

---

## 13. MCP Supabase scope

El MCP de Supabase configurado en este entorno tiene acceso SOLO a:
- ✅ `Light_House` (`stjugsrkrweakvzmizpq`)
- ✅ `Swarm Agentes MD` (`lwurzjrghzwzxbhrulyn`)
- ❌ Innovar CRM (`xdzbjptozeqcbnaqhtye`) — sin permisos

Para queries en Innovar usar el SQL Editor del dashboard directamente.

---

## 14. Memoria local

Cada sistema importante crea una entrada en `~/.claude/projects/<entorno>/memory/`:

- Archivo dedicado: `project_<sistema>.md` con paths, decisiones de diseño, gotchas
- Referencia desde `MEMORY.md` raíz: `- [<sistema> — descripción corta](project_<sistema>.md) — ...`

Actualizar la memoria al final de cada sesión donde se haga trabajo significativo.

---

## 15-bis. Data Hub centric (regla canónica desde 2026-05-20)

**Toda data externa que cualquier automatización futura necesite, DEBE entrar primero al schema `seo_data_hub`.** Los consumidores (sistemas agénticos) leen del hub vía cross-schema SELECT con service-role, NUNCA pegan directo a APIs externas.

Esta regla NO tiene excepciones. Implicaciones:

| Si necesitás… | Hacés esto |
|---|---|
| Una fuente nueva (ej. Bing Webmaster Tools, Semrush, etc.) | 1) Agregás tabla raw a `seo_data_hub` con cadencia apropiada (weekly/monthly/manual). 2) Construís el ingestor `hub-<fuente>-<cadencia>`. 3) Recién después construís el consumer que lee de esa tabla. |
| Una métrica nueva de una fuente existente | Extendés la tabla raw del hub para capturarla. NO agregás un consumer que hace un fetch lateral. |
| Datos en tiempo real / streaming | Diseñás un endpoint del hub que recibe webhooks de la fuente. NUNCA conexión directa fuente → consumer. |
| Backtesting o análisis ad-hoc | Leés del hub (los datos crudos viven ahí). Si no hay histórico suficiente, esperás o backfilleás al hub primero. |

**Beneficios que NO se negocian:**
- **Costo**: 1 sola llamada a Ahrefs/GSC/GA4 por período sirve a todos los sistemas. Sin esto, cada consumer paga su propia API.
- **Consistencia**: 2 sistemas mirando la misma URL nunca van a ver clicks distintos.
- **Failure isolation**: si el consumer X tiene bug, el hub sigue persistiendo data; cuando se arregla, el consumer reprocesa el histórico sin re-ingerir.
- **Time-travel**: backtesting es trivial — el evaluator corre sobre data histórica del hub.
- **Escalabilidad**: agregar el 5to consumer no agrega carga a las APIs externas.

**Anti-patrón explícitamente prohibido:** un sistema agéntico que dentro de su edge function llama a `fetch('https://www.googleapis.com/...')` o `fetch('https://api.ahrefs.com/...')` directamente. Si querés data, va al hub primero.

**Excepción única documentada:** webhooks entrantes (`hub-crawl-loader`, `hub-x-webhook`) reciben pushes desde el exterior y persisten al hub. No es lo mismo que un consumer pulleando de API.

**Cómo onboardear una nueva fuente externa al hub:**
1. Definir cadencia (cuán fresca necesitamos la data en términos de negocio)
2. Estimar costo por corrida (créditos/quota) y multiplicarlo por cadencia/mes
3. Diseñar schema de tabla raw (UNIQUE constraint para idempotencia, particionado por mes si volumen alto)
4. Implementar `hub-<fuente>-<cadencia>` siguiendo patrón de los hub-* existentes
5. Documentar en `automations/organic-early-warning/ARCHITECTURE.md` la nueva fuente (sección "Schema seo_data_hub")
6. Actualizar `automations/organic-early-warning/SECRETS.md` con la API key nueva si aplica

---

## 15. Reglas anti-spam para alertas

Sistemas que mandan alertas siguen un modelo de severidad de **3 niveles**:

| Tier | Cuándo | Destino |
|---|---|---|
| **WATCH** | Solo señales adelantadas (sin confirmación de impacto) | Digest semanal/programado, NO alerta inmediata |
| **YELLOW** | Adelantada + rezagada confirmando, O 1 rezagada soft | Slack inmediato, severidad media |
| **RED** | 1+ rezagada hard, O ≥3 señales correlacionadas, O criterio crítico específico | Slack inmediato, severidad alta |

El `dedupe_key` agrupa por incidente (no por señal individual) para evitar 5 alertas de la misma causa raíz. Solo se envía a destinatarios cuya `severity_threshold` en routing es ≤ severidad del evento.

---

## Apéndice: glosario

| Término | Significado en este contexto |
|---|---|
| **Bronze layer / Data hub** | Schema (`seo_data_hub`) con tablas raw de APIs externas, ingestadas una vez, consumidas por múltiples sistemas |
| **Signal (señal)** | Detección individual de una condición anómala (ej. CTR cayó). Granularidad mínima de evaluación |
| **Incident (incidente)** | Cluster de signal_events relacionados (mismo brand + ventana temporal + URLs solapadas). Granularidad de notificación |
| **Leading vs lagging** | Adelantada (avisa antes del impacto) vs Rezagada (confirma el impacto) |
| **Baseline** | Media + dispersión histórica contra la cual se compara una métrica para detectar anomalía |
| **MAD** | Median Absolute Deviation — alternativa robusta a la desviación estándar (un outlier no la infla) |
| **Outbox pattern** | Patrón de notificación asíncrono: encolar mensaje en BD, worker dedicado entrega con retry |
| **Watchdog** | Cron que monitorea y auto-corrige estados inconsistentes del sistema |
