# Áreas de trabajo — Minuta de reuniones de cliente

El proyecto está dividido en áreas separables para que múltiples agentes puedan trabajar en paralelo sin pisarse. Cada área = un agente activo a la vez. Coordina vía `WORK_IN_PROGRESS.md`.

## A. Setup externo — tl;dv + secrets

**Responsabilidad:** suscripción al plan Business de tl;dv, generación de la API key, configuración del webhook en tl;dv, captura del signing secret, y carga de todos los secrets en `vault.secrets` de Supabase Light_House.

**Archivos / componentes que tocas:**
- Cuenta tl;dv (workspace de `accesos@seolabagency.com`)
- Supabase Light_House → Edge Functions → Secrets
- `configuracion/guia-tldv-webhooks.md` (mantener al día)

**Decisiones tomadas que aplican aquí:** D-005 (ambos eventos habilitados).

**Estado:** ⚪ pendiente — bloqueante para todas las demás áreas.

**Pendientes en esta área:**
- Contratar plan Business de tl;dv.
- Generar API key en `tldv.io/app/settings/personal-settings/api-keys`.
- Crear webhook en tl;dv apuntando a `https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/tldv-webhook-receiver`.
- Capturar signing secret y cargarlo como `TLDV_WEBHOOK_SIGNING_SECRET`.
- Cargar `TLDV_API_KEY` y verificar `ANTHROPIC_API_KEY`.

**Áreas con las que choca:** B (los secrets se leen desde edge functions), C (webhook receiver necesita signing secret).

## B. Schema y migraciones

**Responsabilidad:** crear el schema `meetings_intelligence` con todas sus tablas, enums, triggers, RLS y grants. Aplicar las migraciones en una branch de Supabase primero, luego merge a main.

**Archivos / componentes que tocas:**
- Schema `meetings_intelligence` (a crear)
- Migraciones: `meetings_intelligence_create_schema_and_enums`, `..._create_core_tables`, `..._create_ops_tables`, `..._triggers_and_functions`, `..._rls_policies`, `..._cron_jobs`, `..._seed_provider_tldv`
- DDL listo en `Documentacion_Reuniones_Inteligentes_tldv_Supabase.docx` Anexo A

**Decisiones tomadas que aplican aquí:** D-001 (schema aislado), D-002 (raw events append-only).

**Estado:** ⚪ por crear.

**Pendientes en esta área:**
- Crear una branch de Supabase para probar el DDL sin afectar producción.
- Aplicar las 7 migraciones en orden.
- Verificar grants para `authenticated`, `anon`, `service_role`.
- Smoke test: INSERT en `providers` con secret de vault, INSERT en `webhook_events_raw`.
- Merge de la branch a main cuando esté validado.

**Áreas con las que choca:** A (necesita secrets cargados para seed de `providers`), C/D/E/F (todas dependen del schema).

## C. Webhook receiver

**Responsabilidad:** edge function pública `tldv-webhook-receiver` que recibe los webhooks de tl;dv, valida HMAC, persiste en `webhook_events_raw` y dispara el orquestador.

**Archivos / componentes que tocas:**
- `codigo/edge-functions/tldv-webhook-receiver/index.ts` (a crear)
- Supabase Edge Function `tldv-webhook-receiver` (verify_jwt=false)
- Tabla `meetings_intelligence.webhook_events_raw`

**Decisiones tomadas que aplican aquí:** D-002 (raw first), D-005 (acepta ambos eventos).

**Estado:** ⚪ por construir.

**Pendientes en esta área:**
- Implementar verificación HMAC-SHA256 timing-safe.
- Implementar idempotencia por UNIQUE `(provider_id, event_id_external)`.
- Responder 200 OK en <500 ms incluso si el orquestador tarda.
- Disparar `meetings-pipeline-orchestrator` async vía `net.http_post`.
- Validar con 5 webhooks reales de prueba.

**Áreas con las que choca:** A (necesita signing secret), B (necesita la tabla `webhook_events_raw`), D (el orquestador llama enrich).

## D. Enrichment + orquestador

**Responsabilidad:** `tldv-meeting-enrich` consulta la API de tl;dv y popula `meeting_transcripts`, `meeting_highlights`, `meeting_participants`. Aplica matching de proyecto. Y `meetings-pipeline-orchestrator` encadena las etapas con manejo de estado.

**Archivos / componentes que tocas:**
- `codigo/edge-functions/tldv-meeting-enrich/index.ts`
- `codigo/edge-functions/meetings-pipeline-orchestrator/index.ts`
- `codigo/edge-functions/tldv-poll-meetings/index.ts` (cron de respaldo)
- Tablas `meetings`, `meeting_participants`, `meeting_transcripts`, `meeting_highlights`, `sync_runs`, `sync_run_events`

**Estado:** ⚪ por construir.

**Pendientes en esta área:**
- Implementar enrich (4 endpoints de tl;dv).
- Implementar matching de proyecto (4 estrategias: organizer → invitee → calendar → manual).
- Implementar el orquestador idempotente y reanudable.
- Cron de polling cada 15 min como red de seguridad.
- Validación: 10 reuniones reales, match_confidence ≥ 0.8 en ≥ 80% de los casos.

**Áreas con las que choca:** A (secrets), B (todas las tablas), C (el receiver lo invoca), E (le pasa el control al summarizer).

## E. IA summarizer

**Responsabilidad:** `meetings-ai-summarizer` llama al LLM, valida el JSON canónico y persiste `meeting_summaries` + `action_items`.

**Archivos / componentes que tocas:**
- `codigo/edge-functions/meetings-ai-summarizer/index.ts`
- Tablas `ai_summary_runs`, `meeting_summaries`, `action_items`
- Prompt v1.0 (en `Documentacion_Reuniones_Inteligentes_tldv_Supabase.docx` Anexo C)

**Estado:** ⚪ por construir.

**Pendientes en esta área:**
- Implementar llamada al LLM con `response_format=json_object`.
- Retry x2 con temperatura escalonada si JSON inválido.
- Persistir `ai_summary_runs` con tokens, costo y latencia.
- Descomponer JSON: cabeceras a `meeting_summaries`, acuerdos/próximos pasos con asignación → `action_items`.
- Iterar prompt v1.0 → v1.1 → v1.2 contra muestra de 30 reuniones reales hasta lograr ≥ 80% de auto-aprobación.

**Áreas con las que choca:** A (`ANTHROPIC_API_KEY`), B (tablas), D (le entrega los datos enriquecidos), F (el render consume `meeting_summaries`).

## F. Render + entrega

**Responsabilidad:** generar Google Doc con plantilla de marca, generar HTML del correo, encolar en `notifications_outbox`.

**Archivos / componentes que tocas:**
- `codigo/edge-functions/meetings-html-builder/index.ts`
- `codigo/edge-functions/meetings-email-dispatcher/index.ts`
- Edge function existente `cms-create-google-doc` (parametrizar por `meeting_kind`)
- Tablas `deliverables`, `dispatch_jobs`
- `public.notifications_outbox` (no modificar)
- 3 plantillas Google Doc (operativa, estratégica, automation) — a crear con equipo de diseño

**Estado:** ⚪ por construir.

**Pendientes en esta área:**
- Adaptar `cms-create-google-doc` para aceptar `meeting_id` y resolver plantilla por `meeting_kind`.
- Implementar `meetings-html-builder` con la plantilla del Anexo D.
- Implementar `meetings-email-dispatcher`: resolver destinatarios, encolar con `source='meetings_intelligence'`.
- Trigger SQL que actualice `meetings.state='delivered'` cuando el outbox confirma envío.

**Áreas con las que choca:** B (tablas), E (consume `meeting_summaries`), G (la UI muestra los `deliverables`).

## G. Frontend de revisión

**Responsabilidad:** UI en Light_House (o donde corresponda) para que un especialista vea las reuniones en `ready_for_review`, las apruebe, las rechace o ajuste el destinatario.

**Archivos / componentes que tocas:**
- Front-end (fuera de este repo)
- Vistas `meetings_intelligence.v_meetings_in_flight`, `v_open_actions_by_project`
- Endpoint de aprobación (a definir)

**Estado:** ⚪ planeado.

**Pendientes en esta área:**
- Pantalla de bandeja: reuniones en `ready_for_review` con preview del JSON y link al Google Doc.
- Botón "Aprobar y enviar" → llama a un endpoint que actualiza `meetings.state='ready_to_send'` + `approved_by` + `approved_at`.
- Botón "Rechazar" → `state='failed'` con razón.
- Pantalla de "Action items por proyecto" sobre la vista `v_open_actions_by_project`.

**Áreas con las que choca:** B (vistas SQL), F (los deliverables son lo que se muestra).

## H. Migración del histórico legacy

**Responsabilidad:** importar las reuniones pasadas almacenadas en `public.meeting_reports.notes` (jsonb con shape canónico ya estructurado) hacia `meetings_intelligence.meeting_summaries` y `action_items`. One-shot script.

**Archivos / componentes que tocas:**
- Tabla `public.meeting_reports` (lectura)
- Tablas `meetings_intelligence.meetings`, `meeting_summaries`, `action_items`
- Script SQL de migración (a crear)

**Estado:** ⚪ planeado (post Fase 4).

**Pendientes en esta área:**
- Inspección de los shapes históricos (variabilidad entre fechas).
- Script que itere reuniones, cree `meetings` con `source='legacy'` y `raw_event_id=NULL`, descomponga `notes` jsonb.
- Validación: 100% de reuniones legacy aparecen en las vistas operativas.

**Áreas con las que choca:** B (tablas), F (puede afectar dashboards si rompe shape).

## I. RLS / Seguridad

**Responsabilidad:** revisar y endurecer las políticas RLS de `meetings_intelligence` antes del lanzamiento general. Especialmente sensible: `meeting_transcripts` puede contener datos confidenciales del cliente.

**Archivos / componentes que tocas:**
- Políticas RLS de las 13 tablas del schema
- Migración `meetings_intelligence_rls_policies` (refinar)

**Estado:** 🟡 esqueleto en la migración inicial; refinamiento pendiente.

**Pendientes en esta área:**
- Validar que `meeting_transcripts` y `meeting_highlights` solo sean accesibles para roles del proyecto correspondiente.
- Política específica para `webhook_events_raw` (solo admin).
- Plan de retención + bucket de Storage cifrado para transcripciones > 180 días.
- Auditoría: `action_items` no debe exponer transcript a roles sin permiso.

**Áreas con las que choca:** B (es la fundación), G (las vistas para el front dependen de RLS).

## Tabla resumen — choque entre áreas

| | A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|---|
| **A. Setup** | — | 🟡 | 🔴 | 🟡 | 🟡 | | | | |
| **B. Schema** | 🟡 | — | 🟡 | 🔴 | 🔴 | 🔴 | 🟡 | 🔴 | 🔴 |
| **C. Webhook receiver** | 🔴 | 🟡 | — | 🟡 | | | | | |
| **D. Enrich+Orquestador** | 🟡 | 🔴 | 🟡 | — | 🟡 | | | | |
| **E. IA** | 🟡 | 🔴 | | 🟡 | — | 🟡 | | | |
| **F. Render+Entrega** | | 🔴 | | | 🟡 | — | 🟡 | | |
| **G. Frontend** | | 🟡 | | | | 🟡 | — | | 🟡 |
| **H. Legacy** | | 🔴 | | | | | | — | |
| **I. RLS** | | 🔴 | | | | | 🟡 | | — |

🔴 alto riesgo de choque (no trabajar en paralelo) · 🟡 riesgo medio (coordinar antes de tocar) · vacío = compatibles en paralelo

## Cómo elegir tu área

Si el usuario te dice qué hacer, ya tienes área. Si no:

- ¿Estamos arrancando y necesitamos desbloquear todo? → **A (Setup)**.
- ¿Tenemos secrets y queremos avanzar la base? → **B (Schema)**.
- ¿Schema listo, queremos validar end-to-end del webhook? → **C (Receiver)**.
- ¿Receiver activo, queremos enriquecer? → **D (Enrich)**.
- ¿Datos enriquecidos, queremos resumen automático? → **E (IA)**.
- ¿IA validada, queremos enviar al cliente? → **F (Render+Entrega)**.
- ¿Auto-envío activo, especialistas necesitan revisar? → **G (Frontend)**.
- ¿Todo funcionando, traer histórico? → **H (Legacy)**.
- ¿Lanzamiento próximo, endurecer? → **I (RLS)**.
