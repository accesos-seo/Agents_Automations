# Arquitectura - Minuta de reuniones de cliente

Detalle tecnico de la automatizacion. Para la version en lenguaje claro, ver README.md.

## 1. Contexto: ecosistema actual de reuniones

Light_House ya tiene calendario (orbit_meetings), reportes (meeting_reports con notes jsonb estructurado), recordatorios (automation_orkesta), entrega (notifications_outbox + worker), y generacion de docs (cms-create-google-doc). El unico paso manual es copiar el resumen de tl;dv al frontend. Esta automatizacion lo elimina sin reemplazar nada existente.

## 2. Modelo de datos

proyectos_seo --< meetings --< meeting_participants >-- users  
clientes ------/ |  
                 |--< meeting_transcripts (segmentos por orador)  
                 |--< meeting_highlights  
                 |--< meeting_summaries (is_current=true)  
                 |--< action_items  
                 |--< deliverables (google_doc | html_email | pdf)  
                 \--< dispatch_jobs --> notifications_outbox  

webhook_events_raw (append-only) -> raw_event_id en meetings (auditoria)  
ai_summary_runs -> run_id en meeting_summaries (version historica del LLM)  
sync_runs + sync_run_events (bitacora del cron de polling)  
providers (cuentas tl;dv con secrets en vault)

Decisiones de modelado:
- meetings.tldv_meeting_id es UNIQUE por provider_id (1<->1 con la fuente).
- meeting_summaries.is_current es booleano + indice unico parcial. Permite reprocesar sin romper la version vigente.
- action_items duplica el JSON pero como tabla relacional. Habilita dashboards de "acciones abiertas".
- dispatch_jobs.outbox_id reutiliza el motor de entrega; no duplicamos retry/backoff/dedupe.

## 3. Estados del lifecycle

received -> enriching -> enriched -> summarizing -> summary_ready -> rendering -> [ready_to_send | ready_for_review] -> queued -> delivered -> archived. Estado failed alcanzable desde cualquiera; reaper lo retoma. Transiciones invalidas son rechazadas por trigger.

## 4. Flujo end-to-end

1. tl;dv termina la grabacion y procesa transcript/highlights.
2. tl;dv dispara webhooks MeetingReady + TranscriptReady -> POST a tldv-webhook-receiver.
3. tldv-webhook-receiver valida HMAC, persiste payload crudo en webhook_events_raw, responde 200 en <500 ms, dispara meetings-pipeline-orchestrator async.
4. tldv-meeting-enrich llama 4 endpoints de tl;dv (/meetings/{id}, /transcript, /highlights, /notes), persiste y aplica matching de proyecto en cascada (organizer_email -> invitee_email -> calendar_event_id -> manual). state='enriched'.
5. meetings-ai-summarizer llama LLM con response_format=json_object, retry x2 si invalido, descompone JSON en meeting_summaries + action_items. state='summary_ready'.
6. cms-create-google-doc + meetings-html-builder generan los artefactos en deliverables. state='ready_to_send' (auto_send) o 'ready_for_review' (human_approval).
7. meetings-email-dispatcher resuelve destinatarios y encola en notifications_outbox con source='meetings_intelligence'. dispatch_jobs registra outbox_id. state='queued'.
8. Worker existente envia via Mailjet. Trigger actualiza state='delivered'. Opcional: sync_meeting_to_legacy() materializa fila en public.meeting_reports para compatibilidad con frontend antiguo.

Tiempos esperados: webhook->raw 0.5 s, enrich 3-8 s, summarizer 5-15 s, render 5-10 s, dispatch <1 s. Total reunion->cliente <=30 s en auto_send, <=4 h en human_approval.

## 5. Plantilla HTML del correo

Ver Anexo D del documento tecnico (Documentacion_Reuniones_Inteligentes_tldv_Supabase.docx). Estructura: cabecera con logo, tipo de reunion, titulo, fecha y proyecto, resumen ejecutivo, tabla de acuerdos, lista de proximos pasos, bloque de blockers (solo si hay), CTA al Google Doc, footer.

## 6. Huecos arquitectonicos

Pendiente: suscripcion tl;dv Business, API key y signing secret en vault, schema meetings_intelligence aplicado, 7 edge functions desplegadas, 3 plantillas Google Doc, iteracion del prompt v1.0->v1.2.

Resuelto en diseno: DDL completo (Anexo A), prompt v1.0 (Anexo C), plantilla HTML (Anexo D), idempotencia via UNIQUE, recuperacion via cron + reaper, matching de proyecto con 4 estrategias, retry x2 del LLM con fallback a notes, regla inmutable: match_confidence < 0.85 fuerza human_approval.

## 7. Plan de implementacion por fases

Fase 1 - Cimientos: schema + tldv-webhook-receiver. Validacion: 100% webhooks aparecen en raw firmados.  
Fase 2 - Enriquecimiento: tldv-meeting-enrich + orquestador + cron de respaldo. Validacion: match >=0.8 en >=80% de 10 reuniones.  
Fase 3 - Resumen IA: summarizer + iteracion del prompt. Validacion: >=80% pasan revision humana sin cambios sustantivos.  
Fase 4 - Render + entrega: deliverables + dispatch + plantillas. Validacion: 10 reuniones entregadas auto con feedback positivo.  
Fase 5 - Hardening: retencion, alerting, migracion legacy, RLS refinada, runbook completo.

Inventario exacto: componentes.md. Operacion: runbook.md. Configuracion tl;dv paso a paso: configuracion/guia-tldv-webhooks.md.
