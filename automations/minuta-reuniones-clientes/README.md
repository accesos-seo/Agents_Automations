# Minuta de reuniones de cliente — automatización tl;dv → Supabase → IA → correo

**Automation key:** `minuta-reuniones-clientes`
**Versión actual:** 0.1 (diseño aprobado; implementación pendiente)
**Estado:** `planned / design_ready_implementation_pending`
**Activada:** —
**Owner producto:** por definir
**Owner técnico:** por definir

Tercera automatización del repositorio bajo gobierno explícito. Vivirá dentro del proyecto Supabase Light_House (`stjugsrkrweakvzmizpq`) — no hay repo de implementación externo. Este directorio es el plano de control y bitácora viva de la automatización.

## 1. Qué hace

Reemplaza el último eslabón manual del ciclo de reuniones de cliente: el copy-paste del resumen de tl;dv.io al frontend para generar la minuta de marca y enviarla por correo. Hoy ese paso consume 20–40 minutos de un especialista senior por reunión y queda expuesto a errores de copia. La automatización lo elimina convirtiendo el ecosistema en un pipeline event-driven:

1. **tl;dv graba** la reunión normalmente (se une vía Google Calendar; el especialista no hace nada).
2. **Webhook** de tl;dv (`MeetingReady` + `TranscriptReady`) llega a un edge function que persiste el evento crudo en `meetings_intelligence.webhook_events_raw`.
3. **Enriquecimiento** vía API de tl;dv (`https://pasta.tldv.io/v1alpha1`): descarga metadatos, transcripción segmentada (`{speaker, text, startTime, endTime}`), highlights y notes.
4. **Matching automático** del proyecto por organizer/invitee emails contra `proyectos_seo` y `clientes`; fallback al `google_calendar_event_id` de `project_meetings`. Si el match falla, la reunión queda en `ready_for_review`.
5. **Resumen IA** (Claude/GPT) produce el JSON canónico ya en uso por la agencia (mismo shape que `meeting_reports.notes`): `resumen_ejecutivo`, `acuerdos`, `proximos_pasos`, `blockers`, `metricas_relevantes`, `participantes_cliente`, `participantes_agencia`.
6. **Render** vía la edge function existente `cms-create-google-doc` + plantilla HTML con marca SeoLab.
7. **Entrega** encolando el correo en `notifications_outbox` (el worker existente lo envía con su retry/backoff).
8. **Modo revisión** opcional por proyecto: en `human_approval` se detiene en `ready_for_review` y avisa al especialista por Slack; en `auto_send` envía directo al cliente.

Invierte el flujo: en vez de que el especialista empuje contenido al sistema, es tl;dv quien notifica y un pipeline serverless toma el control. El especialista pasa de redactor a revisor (o ni eso cuando el proyecto está maduro).

Para el detalle técnico, ver `arquitectura.md`. Para la operación día a día, ver `runbook.md`. Para el inventario exacto, `componentes.md`.

## 2. Configuración

| Config | Valor |
|---|---|
| Runtime | Supabase `stjugsrkrweakvzmizpq` (Light_House) |
| Schema | `meetings_intelligence` (aislado, no en `public`) |
| Plataforma de grabación | tl;dv.io (Business Plan — requiere API y webhooks) |
| API base de tl;dv | `https://pasta.tldv.io/v1alpha1` |
| Cuenta dueña del workspace tl;dv | `accesos@seolabagency.com` |
| Eventos de webhook habilitados | `MeetingReady` + `TranscriptReady` |
| LLM por defecto | Claude Sonnet 4.6 (configurable por proyecto en `providers.default_language` + flag) |
| Proveedor de correo | reutiliza el motor del outbox (Mailjet hoy) |
| Worker WhatsApp | `boti-whatsapp-outbox-worker` (opcional, fase posterior) |
| Zona horaria operativa | America/Bogota |

**Secrets requeridos** (Supabase Light_House → Edge Functions → Secrets):

| Secret | Estado |
|---|---|
| `TLDV_API_KEY` | ⚪ pendiente — generar en `tldv.io/app/settings/personal-settings/api-keys` |
| `TLDV_WEBHOOK_SIGNING_SECRET` | ⚪ pendiente — capturar al crear el webhook |
| `ANTHROPIC_API_KEY` (o `OPENAI_API_KEY`) | 🟡 verificar si ya está cargado para otras automatizaciones |
| `MAILJET_API_KEY`, `MAILJET_SECRET_KEY` | 🟢 cargados (reutilizados de `calendario-orbit`) |
| `INTERNAL_SECRET_MEETINGS_INTELLIGENCE` | ⚪ pendiente — auth interno entre triggers y edge functions |

## 3. Componentes (inventario)

### 3.1 Tablas (todas en el schema `meetings_intelligence`)

| Tabla | Rol |
|---|---|
| `providers` | Cuentas externas (tl;dv y futuros). 1 fila por API key activa. |
| `webhook_events_raw` | Bitácora append-only de webhooks (idempotencia + auditoría). |
| `meetings` | Tabla canónica: 1 fila por reunión real, acumula el estado del lifecycle. |
| `meeting_participants` | Organizer/invitees/speakers, mapeo a `users` o cliente externo. |
| `meeting_transcripts` | Segmentos `{speaker, text, start_seconds, end_seconds}`. |
| `meeting_highlights` | Highlights/notes con timestamp (auto IA o manuales). |
| `ai_summary_runs` | Cada llamada al LLM: modelo, prompt_version, tokens, costo, latencia. |
| `meeting_summaries` | JSON canónico vigente; `is_current=true` marca la versión activa. |
| `action_items` | Acciones extraídas con owner, due_date, status, priority. |
| `deliverables` | Artefactos generados (Google Doc, HTML email, PDF, slack canvas). |
| `dispatch_jobs` | Trabajo de entrega; vincula con `notifications_outbox.id`. |
| `sync_runs` / `sync_run_events` | Bitácora del cron de polling de respaldo. |

### 3.2 Edge Functions (a crear en Light_House)

| Slug | Rol |
|---|---|
| `tldv-webhook-receiver` | **Pública** (verify_jwt=false). Recibe webhooks de tl;dv, valida HMAC, persiste en `webhook_events_raw`, responde 200 en <500 ms. |
| `tldv-meeting-enrich` | Privada. Llama `/meetings/{id}`, `/transcript`, `/highlights`, `/notes`; persiste transcripción y aplica matching de proyecto. |
| `meetings-ai-summarizer` | Privada. Llama al LLM, valida JSON, persiste `meeting_summaries` + `action_items`. |
| `meetings-html-builder` | Privada. Renderiza el HTML del correo con la plantilla de marca. |
| `meetings-email-dispatcher` | Privada. Resuelve destinatarios, encola en `notifications_outbox`, crea `dispatch_jobs`. |
| `meetings-pipeline-orchestrator` | Privada. Director del pipeline; idempotente y reanudable por estado. |
| `tldv-poll-meetings` | Cron. Red de seguridad: cada 15 min revisa si hay reuniones en tl;dv sin webhook. |

### 3.3 Funciones SQL y triggers

| Tipo | Nombre | Disparo |
|---|---|---|
| Función | `meetings_intelligence.set_updated_at()` | Trigger en todas las tablas con `updated_at` |
| Función | `meetings_intelligence.reap_stuck_meetings()` | Reaper de reuniones atascadas (cron */10 min) |
| Trigger | `trg_meetings_dispatch_summary_ready` | `AFTER UPDATE` en `meetings` cuando `state` pasa a `summary_ready` → llama al orquestador |

### 3.4 Migraciones a aplicar

| Migración | Estado |
|---|---|
| `meetings_intelligence_create_schema_and_enums` | ⚪ pendiente |
| `meetings_intelligence_create_core_tables` | ⚪ pendiente |
| `meetings_intelligence_create_ops_tables` | ⚪ pendiente |
| `meetings_intelligence_triggers_and_functions` | ⚪ pendiente |
| `meetings_intelligence_rls_policies` | ⚪ pendiente |
| `meetings_intelligence_cron_jobs` | ⚪ pendiente |
| `meetings_intelligence_seed_provider_tldv` | ⚪ pendiente |

DDL completo listo para `apply_migration` en la documentación técnica que acompaña este diseño (Documentacion_Reuniones_Inteligentes_tldv_Supabase.docx, Anexo A).

## 4. Estado actual (2026-05-16)

| Indicador | Valor |
|---|---|
| Diseño técnico + DDL | 🟢 cerrado y documentado |
| Suscripción tl;dv Business | ⚪ pendiente — bloqueante para API/webhooks |
| Schema `meetings_intelligence` | ⚪ por crear |
| Edge functions | ⚪ ninguna creada |
| Plantillas Google Doc por `meeting_kind` | ⚪ por diseñar (operativa, estratégica, automation) |
| Plantilla HTML del correo | 🟢 prototipo definido (ver `arquitectura.md` §HTML email) |
| Prompt v1.0 del summarizer | 🟢 listo (ver Anexo C del docx) |
| Validación E2E | ⚪ requiere todo lo anterior + 10 reuniones reales de prueba |

## 5. Decisiones pendientes del dueño del producto

| Decisión | Opciones | Estado |
|---|---|---|
| ¿Modo `auto_send` global o por proyecto? | Todos arrancan en `human_approval` y se promueven uno a uno / Auto global desde día 1 | Pendiente — recomendación: por proyecto, arrancar todos en revisión humana |
| Umbral de `match_confidence` para auto-enviar | 0.70 / 0.85 / 0.95 | Pendiente — recomendación: 0.85 |
| ¿Sincronizar con `meeting_reports` legacy? | Sí, materializar fila por compatibilidad / No, solo nuevo schema | Pendiente — recomendación: sí, durante 60 días para no romper dashboards |
| Política de retención de transcripciones | 90 / 180 / 365 días en DB; resto a Storage | Pendiente |
| ¿Notificar al cliente que su reunión se procesa con IA? | Sí, actualizar consentimiento / Solo cláusula en contrato | Pendiente — recomendación: actualizar el documento de consentimiento antes del primer despliegue |
| Presupuesto mensual del LLM | USD 50 / 100 / 200 | Pendiente — recomendación: USD 50/mes para empezar |

## 6. Optimizaciones priorizadas

**Quick wins (1-2 días)**
- Generar la API key de tl;dv y cargarla en `vault.secrets`.
- Aplicar el DDL del schema en una branch de Supabase.
- Definir las 3 plantillas Google Doc (operativa / estratégica / automation).

**Medianas (3-5 días)**
- Desplegar `tldv-webhook-receiver` y validar end-to-end con 5 reuniones reales.
- Desplegar `tldv-meeting-enrich` + cron de polling de respaldo.
- Migración one-shot de `meeting_reports.notes` histórico a `meeting_summaries`.

**Estratégicas (1-2 semanas)**
- Iterar prompt v1.0 → v1.2 contra muestra de 30 reuniones reales hasta lograr ≥85% de auto-aprobación.
- Build de dashboard interno (vista SQL en Studio) para comparar IA vs especialista.
- Activar `auto_send` por proyecto cuando ese proyecto pasa 2 semanas sin correcciones humanas.

## 7. Links y referencias

- Supabase runtime: proyecto Light_House (ref `stjugsrkrweakvzmizpq`)
- Schema propuesto: `meetings_intelligence`
- Webhook receiver (URL futura): `https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/tldv-webhook-receiver`
- API de tl;dv: `https://pasta.tldv.io/v1alpha1` · panel: `https://tldv.io/app`
- Generación de API key: `https://tldv.io/app/settings/personal-settings/api-keys`
- Documentación técnica extensa (Word): `Documentacion_Reuniones_Inteligentes_tldv_Supabase.docx` (Anexos A-D)
- Automatización hermana: `../calendario-orbit/` (mismo stack: triggers + edge functions + outbox)
- Arquitectura técnica detallada: `arquitectura.md`
- Inventario exacto: `componentes.md`
- Runbook operativo: `runbook.md`
- Guía de configuración tl;dv: `configuracion/guia-tldv-webhooks.md`

### 7.5 Decisiones tomadas

| ID | Fecha | Decisión | Detalle |
|---|---|---|---|
| D-001 | 2026-05-16 | Schema aislado `meetings_intelligence` (no `public`) | Replica el patrón de `ahrefs_web_analysis` y `automation_orkesta`. Aislamiento por dominio; convenciones idénticas (PK UUID, `set_updated_at`, enums tipados, RLS desde día 1). |
| D-002 | 2026-05-16 | Persistir el payload crudo del webhook antes de procesar | Tabla `webhook_events_raw` append-only con UNIQUE `(provider_id, event_id_external)`. Permite re-procesar y depurar sin reconsultar tl;dv. |
| D-003 | 2026-05-16 | Reutilizar `notifications_outbox` como motor de entrega | No duplicar lógica de retry/backoff/dedupe. `source='meetings_intelligence'` como discriminador. |
| D-004 | 2026-05-16 | Modo `human_approval` por defecto en Fase 4 | Confianza progresiva: cada proyecto arranca con aprobación humana; se promueve a `auto_send` cuando 2 semanas seguidas pasan sin correcciones sustantivas. |
| D-005 | 2026-05-16 | Habilitar `MeetingReady` y `TranscriptReady` (ambos) | Redundancia: `MeetingReady` da la ficha (organizer/invitees), `TranscriptReady` da el contenido. El orquestador espera a tener ambos antes de `summarizing`. |

## 8. Bitácora

| Fecha | Evento |
|---|---|
| 2026-05-16 | Diagnóstico del flujo actual: 6 piezas existentes mapeadas (`orbit_meetings`, `project_meetings`, `meeting_reports`, `automation_orkesta.*`, edge functions `boti-meeting-generator`, `orbit-meeting-sync`, `orbit-meeting-notify`, `cms-create-google-doc`, motor `notifications_outbox`). |
| 2026-05-16 | Investigación de la API de tl;dv (v1alpha1) y de los eventos de webhook (`MeetingReady` + `TranscriptReady`). |
| 2026-05-16 | Diseño del schema `meetings_intelligence` (13 tablas + 5 enums + triggers + RLS) replicando el patrón de `ahrefs_web_analysis`/`automation_orkesta`. |
| 2026-05-16 | Documentación técnica extensa entregada (Word, 44 páginas, Anexos A-D con DDL ejecutable, payloads de ejemplo, prompt v1.0 y plantilla HTML). |
| 2026-05-16 | Esta tercera automatización publicada en `Agents_Automations` siguiendo la convención de gobierno (`calendario-orbit` como modelo). |
