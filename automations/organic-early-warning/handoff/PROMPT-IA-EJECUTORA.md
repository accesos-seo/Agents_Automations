# Prompt para la IA Ejecutora — Organic Early Warning V2

> **Cómo usar este archivo:** copiá TODO el bloque de abajo (desde "Hola Claude" hasta la última línea) y pegalo como **primer mensaje** en una nueva sesión de Claude Code abierta en `C:/Users/ceoel/temp/agents-automations-seo/` (o donde claudees el repo `accesos-seo/Agents_Automations`). No agregues nada antes ni después — el prompt es autosuficiente.

---

```
Hola Claude.

Voy a delegarte la construcción end-to-end del sistema "Organic Early Warning" (V2 de seo_sentinel). Toda la planeación, arquitectura, contratos y handoff ya están escritos. Vos sos el **orquestador y constructor**. Vas a desplegar tu propio equipo de sub-agentes y construir el sistema completo sin interrupciones, igual que se hizo con la V1.

═══════════════════════════════════════════════════════════════════
PASO 0 — CONFIRMACIÓN ANTES DE ARRANCAR (única pausa al inicio)
═══════════════════════════════════════════════════════════════════

Antes de hacer cualquier otra cosa, decime exactamente este mensaje y esperá mi respuesta:

  "Voy a operar en modo autónomo: construir las 9 migraciones SQL +
   12 edge functions + deploy + backtesting + PR end-to-end sin
   consultarte hasta haber terminado y subido todo a GitHub.

   Sugerencia: activá 'auto-accept edits' (Shift+Tab en Claude Code
   hasta ver 'auto-accept edits ON') para que no tengas que aprobar
   cada Write/Edit individualmente.

   ¿Confirmás que arranco así? [Sí / No]"

Si digo "Sí" → ejecutás todo desde Fase 0 hasta Fase D + commits + push + PR
                actualizado, SIN parar a preguntarme nada. Cuando termines,
                ahí sí me preguntás qué sigue.

Si digo "No"  → modo conservador: me consultás cada decisión grande.

Esa es la única pausa al inicio. A partir de ahí, ejecutás.

═══════════════════════════════════════════════════════════════════
CONTEXTO DEL PROYECTO
═══════════════════════════════════════════════════════════════════

PROYECTO: Organic Early Warning (V2)
REPO: accesos-seo/Agents_Automations
BRANCH: feature/organic-early-warning-v2  ← YA EXISTE, contiene los handoff docs
PR DRAFT: #17 — https://github.com/accesos-seo/Agents_Automations/pull/17
LOCAL CLONE: C:/Users/ceoel/temp/agents-automations-seo/

QUÉ ES: sistema agéntico que detecta semanas antes de que el tráfico caiga,
usando 13 señales multi-fuente sobre data centralizada en un "data hub"
(GSC + GA4 + Ahrefs + CrUX/PSI + crawls). Reemplaza al detector reactivo
V1 (seo-sentinel-position-watch) que solo monitoreaba clicks WoW.

═══════════════════════════════════════════════════════════════════
DOCUMENTACIÓN OBLIGATORIA (leé EN ESTE ORDEN antes de escribir código)
═══════════════════════════════════════════════════════════════════

Todos los paths son relativos al repo clonado en
C:/Users/ceoel/temp/agents-automations-seo/

1. CONVENTIONS.md (root del repo)
   ↑ Las 16 reglas canónicas de la agencia. SAGRADAS. Cero excepciones.
   ↑ Espejo local: C:\Users\ceoel\.claude\conventions\agentic-automations.md

2. automations/organic-early-warning/README.md
   ↑ Overview + diff vs V1 + estructura del proyecto

3. automations/organic-early-warning/ARCHITECTURE.md
   ↑ Diagrama completo + 13 señales + motor estadístico + 2 schemas

4. automations/organic-early-warning/handoff/04-task-list-tecnico.md
   ↑ Tu plan paso a paso (5 fases: 0, A, B, C, D, E)

5. automations/organic-early-warning/handoff/01-edge-functions-contracts.md
   ↑ Contratos HTTP EXACTOS de las 12 fns (request/response/errors/curl)
   ↑ ESTE ES TU CONTRATO. Si construís algo que no matchea esto, está mal.

6. automations/organic-early-warning/SECRETS.md
   ↑ 12 secretos a cargar en Supabase Vault

7. automations/organic-early-warning/handoff/00-data-flow.md
   ↑ Diagrama temporal end-to-end + queries SQL para seguir un run

8. automations/organic-early-warning/handoff/02-validation-checklist.md
   ↑ Cómo validás cuando termines (14 pasos)

9. automations/organic-early-warning/handoff/03-runbook.md
   ↑ Qué hacer cuando algo falle (10 escenarios documentados)

10. automations/organic-early-warning/handoff/05-backtesting-guide.md
    ↑ Cómo calibrar el motor estadístico antes de prod

═══════════════════════════════════════════════════════════════════
ACCESOS Y HERRAMIENTAS QUE YA TENÉS
═══════════════════════════════════════════════════════════════════

[1] SUPABASE — proyecto Light_House (ref stjugsrkrweakvzmizpq):
    - MCP de Supabase está conectado a tu sesión
    - Podés usar: apply_migration, execute_sql, list_tables,
      generate_typescript_types, list_projects, etc.
    - Dashboard: https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq
    - SQL Editor: https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/sql/new
    - Vault: https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/settings/vault/secrets
    - Functions: https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/functions
    - Logs: https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/logs/edge-functions
    - Functions URL base: https://stjugsrkrweakvzmizpq.functions.supabase.co

[2] GITHUB:
    - gh CLI está autenticado como 'accesos-seo'
    - Podés usar: gh pr edit, gh pr comment, gh api repos/...,
      git clone/commit/push (sin --no-verify, sin --amend, sin force-push)
    - Repo: https://github.com/accesos-seo/Agents_Automations
    - PR draft #17 (este): https://github.com/accesos-seo/Agents_Automations/pull/17

[3] SLACK (no cargues nada todavía, solo info de referencia):
    - Workspace: SeoLab Agency
    - Bot a REUSAR: Orbit SeoLab (App ID D0A4NMACLPP)
    - NO crear app nueva, NO duplicar token
    - Canal principal: #alerts-operaciones (ID C0B1B3V4ZB5)
    - Cuando llegues al paso de Slack: pedile al usuario que confirme
      el SLACK_BOT_TOKEN del bot existente (si V1 ya lo cargó en Vault,
      reusá ese valor con execute_sql sobre vault.decrypted_secrets)

[4] LOCAL FILESYSTEM:
    - Source de verdad: C:/Users/ceoel/OneDrive/Escritorio/scaffold/organic-early-warning/
      (los docs que vas a leer están acá Y también copiados en el repo clonado)
    - Repo clonado: C:/Users/ceoel/temp/agents-automations-seo/
      (trabajá ACÁ para evitar timeouts de OneDrive en git)
    - Plan estratégico: C:/Users/ceoel/.claude/plans/resilient-humming-clock.md
    - Conventions local: C:/Users/ceoel/.claude/conventions/agentic-automations.md

[5] TERMINAL: bash disponible. NO corrás 'supabase functions deploy'
    en background — timeoutea en paths OneDrive (memoria del entorno).

═══════════════════════════════════════════════════════════════════
QUÉ TENÉS QUE CONSTRUIR (high-level)
═══════════════════════════════════════════════════════════════════

≈50 archivos nuevos en C:/Users/ceoel/temp/agents-automations-seo/automations/organic-early-warning/:

FASE 0 — Data Hub (schema seo_data_hub en Light_House)
  • 4 migraciones SQL (schema, partitioning, watchdog, cron)
  • 7 módulos _shared/ TypeScript (supabase, secret, run-events,
    gsc-api, ga4-api, cwv-api, ahrefs-api)
  • 5 edge functions: hub-gsc-weekly, hub-ga4-weekly, hub-cwv-weekly,
    hub-ahrefs-monthly, hub-crawl-loader
  • seed_brands_registry.sql

FASE A — Organic Early Warning quick wins (schema organic_early_warning)
  • 5 migraciones SQL (schema, seed 13 signal_definitions con solo
    S8/S9/S11/S12/S13 enabled=true, views, watchdog, cron)
  • 6 módulos _shared/ TS (supabase, secret, run-events, openrouter,
    slack-blockkit-v2, statistics)
  • 7 edge functions: oew-orchestrator, oew-baseline-builder,
    oew-signal-evaluator (con evaluators de 5 señales), oew-incident-clusterer,
    oew-detective, oew-dispatcher, oew-digest-weekly
  • scripts/backtest_runner.py

FASE B — Activar S1 (URL fuera índice), S2 (errores cobertura), S5 (CWV)
  • Implementar 3 evaluators más + UPDATE signal_definitions

FASE C — Activar S3, S4 (crawl diff)
  • Documentar workflow de Screaming Frog → hub-crawl-loader

FASE D — Activar S6, S7, S10 (Ahrefs)
  • Implementar 3 evaluators + esperar día 28

Más:
  • deploy.py (Python, análogo al de V1)
  • Migraciones aplicadas vía MCP a Light_House
  • 12 edge functions deployed
  • Backtest corrido + report.json
  • PR #17 actualizado con todo el código

═══════════════════════════════════════════════════════════════════
PRINCIPIO IRRENUNCIABLE: DATA HUB ES EL CENTRO
═══════════════════════════════════════════════════════════════════

ESTO NO LO NEGOCIES. Está en CONVENTIONS.md §15-bis.

Toda data externa que tu sistema (o cualquier sistema futuro) necesite
DEBE entrar PRIMERO al schema seo_data_hub. Los consumidores leen del
hub vía cross-schema SELECT, NUNCA pegan directo a APIs externas.

Si en algún momento te tienta hacer `fetch('https://api.X.com/...')`
dentro de un consumer (cualquier oew-* o futuro sistema): PARÁ.
Esa data va al hub primero (nuevo hub-X-ingestor), y recién después
el consumer la lee.

Excepción única: webhooks entrantes (como hub-crawl-loader que
recibe el export de Screaming Frog) — eso es un endpoint receptor,
no un consumer pulleando.

═══════════════════════════════════════════════════════════════════
LIBERTAD DE MODIFICACIÓN
═══════════════════════════════════════════════════════════════════

Tenés autoridad para:

✓ Agregar columnas/tablas/índices que ARCHITECTURE no enumera
  pero que el código necesita (documentá en commit)
✓ Modificar nombres de columnas si los docs handoff son ambiguos
  (los sub-agentes de la planeación tomaron decisiones; podés
  revisarlas si encontrás algo mejor)
✓ Cambiar la estructura interna de cualquier edge function
  siempre que respetes el CONTRATO HTTP de 01-edge-functions-contracts.md
✓ Decidir entre _shared/ o duplicar código (preferí _shared/)
✓ Crear más sub-agentes paralelos si te conviene
✓ Editar los docs handoff si encontrás errores u oportunidades
  de aclaración (commit aparte llamado "docs(oew): clarify ...")

NO tenés autoridad para:

✗ Romper los contratos HTTP de 01-edge-functions-contracts.md sin
  documentar la justificación en el PR
✗ Pegar directo a APIs desde un consumer (regla del data hub)
✗ Crear tablas operativas en public (salvo notifications_outbox)
✗ Crear nueva app Slack (reusá Orbit SeoLab)
✗ Usar --no-verify, --amend, ni force-push en git
✗ Migrar/dropear data de V1 (V1 sigue corriendo intacto)

═══════════════════════════════════════════════════════════════════
EQUIPO DE SUB-AGENTES SUGERIDO
═══════════════════════════════════════════════════════════════════

Para acelerar la ejecución, podés desplegar en paralelo:

Equipo SQL (1 sub-agente, secuencial):
  → escribe las 9 migraciones SQL respetando convenciones canónicas

Equipo Edge Functions Hub (1 sub-agente):
  → escribe las 5 hub-* + sus 7 módulos _shared/ específicos del hub

Equipo Edge Functions OEW (2 sub-agentes en paralelo):
  → A: orchestrator + baseline-builder + signal-evaluator (motor + lógica)
  → B: detective + dispatcher + digest-weekly + incident-clusterer

Equipo Tooling (1 sub-agente):
  → deploy.py + seed_brands_registry.sql + backtest_runner.py

Vos como orquestador integrás, revisás cross-archivo, aplicás migraciones
vía MCP, deployás (o dejás comandos al usuario) y abrís el PR.

═══════════════════════════════════════════════════════════════════
EXECUTION FLOW (ejecutá sin parar hasta el final)
═══════════════════════════════════════════════════════════════════

1. Leer los 10 docs (en el orden listado arriba)
2. Verificar acceso MCP Supabase (list_projects debe mostrar Light_House)
3. Verificar acceso gh CLI (gh auth status)
4. Hacer git pull en C:/Users/ceoel/temp/agents-automations-seo/
   en branch feature/organic-early-warning-v2 para tener lo último
5. Marcar un chapter "V2 build: data hub + OEW"
6. Crear TaskList con las 5 fases + tareas internas
7. Desplegar sub-agentes en paralelo donde aplique
8. Aplicar migraciones vía MCP (apply_migration en orden)
9. Cuando los sub-agentes terminen: revisar consistencia, integrar
10. Generar TypeScript types vía MCP
11. Escribir deploy.py + backtest_runner.py
12. Commit + push periódicos a la branch feature/organic-early-warning-v2
    (NO crear branch nueva — usá la existente)
13. NO ejecutar `supabase functions deploy` en background (timeoutea
    en OneDrive). Cuando llegues a deploy, dejá los comandos para
    el usuario en una sección "Comandos para correr manualmente"
    al final, y seguí adelante con lo que sí podés (backtest dryrun, etc.)
14. Actualizar el PR #17 con un comentario que resuma lo construido
15. Actualizar la memoria local en
    C:/Users/ceoel/.claude/projects/.../memory/project_organic_early_warning.md
    con el resumen del build (no del handoff)

═══════════════════════════════════════════════════════════════════
ÚNICO PUNTO DE PAUSA: CUANDO TERMINES TODO
═══════════════════════════════════════════════════════════════════

Cuando hayas:
  ✓ Construido los ≈50 archivos
  ✓ Aplicado las 9 migraciones a Light_House
  ✓ Hecho commit + push a feature/organic-early-warning-v2
  ✓ Comentado el PR #17 con el resumen
  ✓ Dejado los comandos de deploy en un archivo para el usuario
  ✓ Actualizado la memoria local

AHÍ sí parás y me preguntás EXACTAMENTE:

  "Listo. Terminé la construcción end-to-end y todo está en el
   PR #17 actualizado. Resumen:
   - <N> archivos creados/modificados
   - <N> migraciones aplicadas a Light_House
   - <N> edge functions escritas
   - Backtest: <pendiente / hecho / no aplicable porque no hay histórico>
   - Comandos para que el técnico deploye en .../DEPLOY-COMMANDS.md

   ¿Por qué seguimos?
   a) Cargar los 12 secretos en Vault juntos
   b) Deployar las 12 edge functions
   c) Forzar primera corrida del hub y validar
   d) Iniciar backtest contra histórico de V1
   e) Otro — decime vos"

Ahí esperás mi respuesta para el siguiente paso.

═══════════════════════════════════════════════════════════════════
INFO QUE PROBABLEMENTE TE FALTE (pedímela solo si la necesitás YA)
═══════════════════════════════════════════════════════════════════

Si en algún punto necesitás algo crítico que no está en los docs,
podés interrumpir, pero solo para esto:

- Brands a seedear (nombre + gsc_property_url + ga4_property_id +
  ahrefs_domain + team_lead_user_id Slack ID). Si nadie te lo da
  durante la construcción, hardcodeá el seed con PENDING_CONFIG
  y seguí — el usuario lo poblará después.

- Valor de AHREFS_CREDIT_BUDGET_MONTH (default razonable: 500)
- Si V1 ya tiene SLACK_BOT_TOKEN / OPENROUTER_API_KEY en Vault
  (verificá con execute_sql sobre vault.decrypted_secrets)

Para todo lo demás: TOMÁ DECISIONES TÉCNICAS Y AVANZÁ. La libertad
es real.

═══════════════════════════════════════════════════════════════════
FIN DEL PROMPT — esperá mi confirmación del PASO 0 y arrancá
═══════════════════════════════════════════════════════════════════
```

---

## Notas para el usuario (NO copies esto al prompt — es para vos)

### Cómo activar el modo auto-aprobado de Claude Code

En Claude Code, presionar **Shift+Tab** alterna entre 3 modos:
1. **default mode** (te pregunta cada acción)
2. **auto-accept edits ON** (acepta Write/Edit sin preguntar, sigue preguntando para Bash)
3. **plan mode** (no ejecuta nada, solo planifica)

Para una ejecución autónoma larga, el modo recomendado es **auto-accept edits ON**. La IA va a escribir muchos archivos sin tener que aprobarlos uno por uno.

### Si querés ir todavía más libre

Hay un cuarto modo: **bypass permissions mode** (también activable con Shift+Tab en algunas versiones, o vía flag `--dangerously-skip-permissions` al iniciar). Acepta TODO sin preguntar nunca, incluyendo Bash. **Solo usalo si confiás 100% en este prompt** porque la IA podría correr comandos destructivos que normalmente te pediría confirmación.

### Cómo saber que arrancó bien

Después de que pegues el prompt, la primera respuesta de la IA debería ser literalmente la pregunta:

> "Voy a operar en modo autónomo... ¿Confirmás que arranco así? [Sí / No]"

Si responde otra cosa (empieza a leer docs sin preguntar, o pide info que ya tiene), tu prompt no llegó completo. Revisalo.

### Cuándo te va a interrumpir

**SOLO** te debería interrumpir en estos 2 momentos:

1. **Al inicio**: la pregunta de confirmación (Paso 0)
2. **Al final**: el resumen + opciones a/b/c/d/e del siguiente paso

Si te interrumpe en el medio (digamos a las 2h de ejecución), revisá qué necesita. Probablemente es un dato crítico que no le di en este prompt.

### Cuánto tiempo va a tardar

Estimación: **2-5 horas** dependiendo de la velocidad de la IA, paralelización de sub-agentes, y si hay errores de migración que requieran reintentos. La parte más lenta es escribir los 12 edge functions (cada uno ~200-400 líneas TS).

### Después de que termine

La IA te va a preguntar qué seguimos. Las opciones a/b/c/d cubren las tareas que necesitan TU input (secrets, deploy commands, validación). Elegí una o respondé con tu propia idea.
