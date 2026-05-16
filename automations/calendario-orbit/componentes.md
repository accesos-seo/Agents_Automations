# Inventario de componentes — Calendario y reuniones (Orbit)

Lista exacta de todo lo que compone esta automatización en Supabase (`Light_House`). Sirve para **trazabilidad**: si tocas algo, está aquí.

Estado: 🟢 OK · 🟡 Parcial / atención · 🔴 Bloqueado / falta · ⚪ Planeado

---

## Tablas

| Tabla | Rol | Estado |
|---|---|---|
| `orbit_meetings` | La reunión: título, `starts_at`/`ends_at`, agenda, `external_video_url`, `status`, `proyecto_id` | 🟢 |
| `orbit_meeting_attendees` | Asistentes: `user_id`, `attendee_role`, `response` (RSVP) | 🟢 |
| `meeting_reports` | Reportes post-reunión (con `google_docs_url`) | 🟡 existe, vacía, sin flujo |
| `users` | Resolvedor de contactos: `email`, `phone`, `slack_id` | 🟢 (RLS deshabilitado ⚠️) |
| `proyectos_seo` | Marca y contactos del proyecto; roles `lider_id`/`kam_id`/`director_id` | 🟢 |
| `notifications_outbox` | Bandeja de salida para Slack/WhatsApp/email | 🟢 (Orbit aún no la usa) |
| `project_meetings` | Sistema **antiguo** de reuniones recurrentes | 🟡 a consolidar en Orbit |
| `project_meeting_recipients` | Destinatarios WhatsApp con opt-in (3 registros QA) | 🟡 |
| `business_calendar` | Calendario laboral de la agencia (días hábiles, Bogotá) | 🟢 |

### Columna `google_calendar_event_id`

| Tabla | Columna | Estado |
|---|---|---|
| `orbit_meetings` | `google_calendar_event_id` (text) | 🟢 Creada (15-may-2026, migración `orbit_meetings_add_google_calendar_event_id`). La escribe `orbit-meeting-sync` al crear el evento; se usa para reagendar (PATCH) y cancelar (DELETE). `NULL` = el evento aún no se creó en Google. |

---

## Edge Functions

| Función | Rol | Estado |
|---|---|---|
| `orbit-meeting-sync` | **Sincroniza con Google Calendar:** crea (POST), reagenda (PATCH) y cancela (DELETE) el evento; guarda `google_calendar_event_id` y `external_video_url`; envía el correo. Auth por `x-internal-secret`. | 🟢 desplegada (v1, 15-may-2026). Código en [`codigo/edge-functions/orbit-meeting-sync/`](codigo/edge-functions/orbit-meeting-sync/) |
| `orbit-meeting-notify` | Crea el evento + correo. Invocación manual desde el front (con `caller_id`). | 🟡 superada por el flujo por trigger; se mantiene para reenvíos manuales de invitación |
| `boti-whatsapp-outbox-worker` | Worker que entrega los mensajes de WhatsApp del outbox | 🟢 corregido (v18, mayo 2026); listo para usarse desde Orbit |
| `boti-meeting-generator` | Envoltorio del sistema **antiguo** (`generate_meeting_reminders`) | 🟡 sistema antiguo, a consolidar |
| _worker de Slack genérico_ | Para entregar mensajes de Slack del outbox | ⚪ planeado (Fase 2) |

---

## Funciones SQL

| Función | Rol | Estado |
|---|---|---|
| `orbit_meeting_sync_dispatch()` | Función del trigger: decide la acción (`create`/`update`/`cancel`) e invoca `orbit-meeting-sync` vía `net.http_post`. Anti-bucle incorporado. | 🟢 nueva (15-may-2026) |
| `claim_due_notifications(worker_id, limit, now, target_types)` | Reclama mensajes del outbox, filtrando por canal | 🟢 corregida (mayo 2026) |
| `reset_stuck_outbox_notifications(stuck_minutes, max_attempts)` | "Reaper": recupera mensajes atascados en `processing` | 🟢 nueva (mayo 2026) |
| `generate_meeting_reminders()` | Genera reuniones recurrentes del sistema **antiguo** | 🟡 sistema antiguo |
| `get_next_meeting_date(dia, from, biweekly)` | Calcula la próxima fecha hábil de reunión | 🟢 (usada por el sistema antiguo) |
| `set_meeting_reports_updated_at()` | Trigger de timestamp para `meeting_reports` | 🟢 |

---

## Triggers

| Trigger | Tabla | Estado |
|---|---|---|
| `trg_orbit_meeting_sync` | `orbit_meetings` | 🟢 nuevo (15-may-2026). AFTER INSERT/UPDATE → dispara `orbit-meeting-sync` (create/update/cancel) |
| `trg_meeting_reports_updated_at` | `meeting_reports` | 🟢 (solo timestamp) |
| _trigger "al agregar asistente"_ | `orbit_meeting_attendees` | ⚪ planeado (siguiente incremento) |

> **Estado:** `orbit_meetings` ya tiene su trigger de sincronización con Google — agendar/reagendar/cancelar se propaga solo. Falta el trigger de `orbit_meeting_attendees` ("al agregar asistente"); mientras tanto el front reenvía invitaciones manualmente.

---

## Trabajos programados (`pg_cron`)

| Job | Frecuencia | Rol | Estado |
|---|---|---|---|
| `outbox-stuck-reaper` | cada 10 min | Ejecuta `reset_stuck_outbox_notifications()` | 🟢 activo |
| _recordatorios de reuniones Orbit_ | cada 10-15 min | Encolar avisos 60/30/15 min antes | ⚪ planeado (Fase 2) |

---

## Secrets necesarios

Se cargan en Supabase → Edge Functions → Secrets. **Nunca** en este repo.

| Secret | Para qué | Estado |
|---|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` | OAuth de Google Calendar | 🟢 configurado |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | OAuth de Google Calendar | 🟢 configurado |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | Permiso permanente con scope `calendar.events` | 🟢 configurado y verificado end-to-end (16-may-2026) |
| `GOOGLE_CALENDAR_ID` | Calendario a usar (opcional, default `primary`) | ⚪ no se configura — se usa el `primary` de `accesos@seolabagency.com` (decisión registrada) |
| `ORBIT_SYNC_SECRET` | Auth interno entre el trigger y `orbit-meeting-sync` | 🟡 opcional — hay un valor de respaldo (`orbit-sync-2026`); si se define, actualizar también el trigger |
| `MAILJET_API_KEY` | Envío de correo | 🟡 probablemente ya configurado — verificar |
| `MAILJET_SECRET_KEY` | Envío de correo | 🟡 probablemente ya configurado — verificar |
| `META_WHATSAPP_TOKEN` | WhatsApp (fase posterior) | ⚪ fase 2 |
| `META_WHATSAPP_PHONE_NUMBER_ID` | WhatsApp (fase posterior) | ⚪ fase 2 |
| `SLACK_BOT_TOKEN` | Slack (fase posterior) | ⚪ fase 2 |

> **Verificado 16-may-2026:** el `GOOGLE_CALENDAR_REFRESH_TOKEN` fue regenerado con el scope `calendar.events` (cuenta `accesos@seolabagency.com`, app OAuth "In production"). Pruebas end-to-end ejecutadas con éxito sobre el pipeline trigger → `orbit-meeting-sync`: **create** (HTTP 200, evento + Meet generados y guardados en `external_video_url` y `google_calendar_event_id`) y **cancel** (HTTP 200, evento eliminado en Google). La automatización está operativa.

---

*Última revisión del inventario: 15 de mayo de 2026.*
