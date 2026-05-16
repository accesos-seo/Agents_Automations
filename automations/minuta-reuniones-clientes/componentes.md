# Inventario de componentes - Minuta de reuniones de cliente

Lista exacta de todo lo que compondra esta automatizacion en Supabase Light_House. Sirve para trazabilidad: si tocas algo, esta aqui.

Estado: 🟢 OK · 🟡 Parcial/atencion · 🔴 Bloqueado/falta · ⚪ Planeado

## Schema (a crear)

| Schema | Rol | Estado |
|---|---|---|
| meetings_intelligence | Aislado del dominio public; replica el patron de ahrefs_web_analysis y automation_orkesta | ⚪ por crear |

## Tablas (todas en meetings_intelligence)

| Tabla | Rol | Estado |
|---|---|---|
| providers | Cuentas externas tl;dv. 1 fila por API key activa. Secrets via vault.secrets | ⚪ por crear |
| webhook_events_raw | Bitacora append-only de webhooks. UNIQUE (provider_id, event_id_external) | ⚪ por crear |
| meetings | Tabla canonica: 1 fila por reunion real. Estado en `state`, modo en `review_mode` | ⚪ por crear |
| meeting_participants | Organizer/invitee/speaker. Mapeo a users o cliente externo | ⚪ por crear |
| meeting_transcripts | Segmentos {speaker, text, start_seconds, end_seconds}. Indice GIN trigram | ⚪ por crear |
| meeting_highlights | Highlights/notes con timestamp (auto_ai/manual/question/decision/action) | ⚪ por crear |
| ai_summary_runs | Cada llamada al LLM: model, prompt_version, tokens, costo, latency_ms, status | ⚪ por crear |
| meeting_summaries | JSON canonico vigente (is_current=true) + columnas desnormalizadas para SQL | ⚪ por crear |
| action_items | Acciones extraidas con owner_email/user_id, owner_side, due_date, status, priority | ⚪ por crear |
| deliverables | Artefactos generados (google_doc, html_email, pdf, slack_canvas) | ⚪ por crear |
| dispatch_jobs | Trabajo de entrega; vincula con notifications_outbox.id; dedupe_key UNIQUE | ⚪ por crear |
| sync_runs | Bitacora del cron de polling (page_from/to, meetings_seen/new/updated/skipped) | ⚪ por crear |
| sync_run_events | Detalle por evento del cron | ⚪ por crear |

## Tablas externas que toca (sin modificarlas)

| Tabla | Uso |
|---|---|
| public.proyectos_seo | FK proyecto_id; matching + RLS por miembro |
| public.clientes | FK client_id; matching por emailcontacto |
| public.users | FK organizer/invitee/manual_override; resolvedor de identidad |
| public.notifications_outbox | Destino de los correos. source='meetings_intelligence' como discriminador |
| public.meeting_reports | Compat opcional: legacy_meeting_report_id materializa la fila legacy |
| public.project_meetings | Matching por google_calendar_event_id |
| public.project_meeting_recipients | Resolucion de destinatarios adicionales por meeting_type |

## Edge Functions (a crear en Light_House)

| Slug | verify_jwt | Rol | Estado |
|---|---|---|---|
| tldv-webhook-receiver | false | Recibe webhook tl;dv, valida HMAC, persiste raw, dispara orquestador | ⚪ por crear |
| tldv-meeting-enrich | true | Llama 4 endpoints de tl;dv, persiste transcript, matching de proyecto | ⚪ por crear |
| meetings-ai-summarizer | true | LLM -> JSON canonico -> meeting_summaries + action_items | ⚪ por crear |
| meetings-html-builder | true | Renderiza HTML del correo con plantilla de marca | ⚪ por crear |
| meetings-email-dispatcher | true | Resuelve destinatarios y encola en notifications_outbox | ⚪ por crear |
| meetings-pipeline-orchestrator | true | Director del pipeline; idempotente y reanudable por estado | ⚪ por crear |
| tldv-poll-meetings | false | Cron cada 15 min, red de seguridad por webhook perdido | ⚪ por crear |

## Edge Functions existentes que reutiliza (sin modificarlas, o con cambios menores)

| Slug | Como se reutiliza | Estado |
|---|---|---|
| cms-create-google-doc | Adaptar para aceptar meeting_id y plantilla por meeting_kind | 🟡 cambio menor |
| outbox worker (Mailjet) | Sin cambios. Lee notifications_outbox como hoy | 🟢 OK |
| boti-whatsapp-outbox-worker | Sin cambios. Listo para fase 2 (WhatsApp al cliente) | 🟢 OK |

## Tipos enum

| Enum | Valores |
|---|---|
| meeting_lifecycle_state | received, enriching, enriched, summarizing, summary_ready, rendering, ready_for_review, ready_to_send, queued, delivered, archived, failed |
| tldv_event_type | MeetingReady, TranscriptReady, Manual, Replay |
| summary_status | pending, running, succeeded, failed |
| dispatch_status | pending, queued, sent, failed, cancelled |
| action_item_status | open, in_progress, done, cancelled, deferred |

## Funciones SQL

| Funcion | Rol | Estado |
|---|---|---|
| meetings_intelligence.set_updated_at() | Trigger en todas las tablas con updated_at | ⚪ por crear |
| meetings_intelligence.reap_stuck_meetings() | Reaper: reuniones bloqueadas >30 min vuelven a estado anterior | ⚪ por crear |
| meetings_intelligence.sync_meeting_to_legacy(meeting_id) | Materializa fila en public.meeting_reports para compat | ⚪ por crear (opcional) |
| meetings_intelligence.validate_state_transition() | Trigger BEFORE UPDATE; rechaza transiciones invalidas | ⚪ por crear |

## Triggers

| Trigger | Tabla | Disparo | Estado |
|---|---|---|---|
| trg_meetings_validate_state | meetings_intelligence.meetings | BEFORE UPDATE: valida transiciones del enum | ⚪ por crear |
| trg_meetings_dispatch_on_state | meetings_intelligence.meetings | AFTER UPDATE: invoca orchestrator via net.http_post cuando state cambia | ⚪ por crear |
| trg_dispatch_jobs_sync_outbox | meetings_intelligence.dispatch_jobs | AFTER UPDATE: cuando outbox confirma envio, marca meetings.state='delivered' | ⚪ por crear |
| trg_set_updated_at en todas las tablas con updated_at | varias | BEFORE UPDATE: now() en updated_at | ⚪ por crear |

## Trabajos programados (pg_cron)

| Job | Frecuencia | Rol | Estado |
|---|---|---|---|
| tldv-poll-meetings | */15 * * * * | Red de seguridad: revisa tl;dv API por reuniones sin webhook | ⚪ por crear |
| meetings-stuck-reaper | */10 * * * * | Recupera reuniones atascadas en estados intermedios | ⚪ por crear |
| webhook-events-raw-prune | 0 3 * * * | Borra webhook_events_raw > 90 dias | ⚪ por crear |
| outbox-stuck-reaper (existente) | */10 * * * * | Ya activo. Sirve para reintentar correos atascados | 🟢 OK |

## Secrets necesarios

Se cargan en Supabase Light_House -> Edge Functions -> Secrets. Nunca en este repo.

| Secret | Para que | Estado |
|---|---|---|
| TLDV_API_KEY | Llamadas a https://pasta.tldv.io/v1alpha1 | ⚪ pendiente |
| TLDV_WEBHOOK_SIGNING_SECRET | Verificacion HMAC del webhook | ⚪ pendiente |
| ANTHROPIC_API_KEY | LLM (Claude) | 🟡 verificar si ya esta cargado |
| OPENAI_API_KEY | Alternativa al LLM | 🟡 verificar |
| MAILJET_API_KEY | Envio de correo via outbox | 🟢 ya cargado (calendario-orbit lo usa) |
| MAILJET_SECRET_KEY | idem | 🟢 ya cargado |
| INTERNAL_SECRET_MEETINGS_INTELLIGENCE | Auth interno entre trigger y edge functions | ⚪ pendiente |
| ORBIT_SYNC_SECRET / equivalente | Auth para invocar el orchestrator desde el receiver | 🟡 reutilizar o crear nuevo |

## Vistas SQL operativas (a crear)

| Vista | Rol |
|---|---|
| meetings_intelligence.v_meetings_in_flight | Conteo de reuniones por estado (excluye delivered/archived) |
| meetings_intelligence.v_open_actions_by_project | Acciones abiertas y vencidas por proyecto |
| meetings_intelligence.v_ai_cost_daily | Coste IA diario por modelo (tokens y USD) |

## Plantillas (artefactos externos)

| Artefacto | Donde vive | Estado |
|---|---|---|
| Plantilla Google Doc - Operativa | Google Drive de la agencia | ⚪ por disenar |
| Plantilla Google Doc - Estrategica | Google Drive de la agencia | ⚪ por disenar |
| Plantilla Google Doc - Automation | Google Drive de la agencia | ⚪ por disenar |
| Plantilla HTML email (Anexo D del docx) | Embebida en meetings-html-builder | 🟢 prototipo listo |
| Prompt v1.0 del summarizer (Anexo C) | Embebido en meetings-ai-summarizer | 🟢 listo, requiere iteracion |

Ultima revision del inventario: 16 de mayo de 2026.
