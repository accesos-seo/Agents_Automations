# Arquitectura — Calendario y reuniones (Orbit)

Detalle técnico de la automatización. Para la versión en lenguaje claro, ver [`README.md`](README.md).

---

## 1. Los dos sistemas de reuniones (contexto importante)

En el proyecto conviven **dos** sistemas de reuniones. Entender esto es clave porque la estrategia es **consolidar en Orbit**.

### Sistema A — `project_meetings` (antiguo, recurrentes)

- Pensado para reuniones **recurrentes** definidas por proyecto.
- Se alimenta de columnas en `proyectos_seo`: `reunion_operativa_dia/hora/temas`, `reunion_estrategica_*`, `reunion_automation_*`.
- La función SQL `generate_meeting_reminders()` recorre los proyectos activos, calcula la próxima fecha con `get_next_meeting_date()` (respeta `business_calendar` y días hábiles de Bogotá), inserta en `project_meetings` y encola un recordatorio en `notifications_outbox`.
- El edge function `boti-meeting-generator` es un envoltorio seguro (con `dry_run`) de esa función.
- Tiene columnas `google_calendar_event_id` y `meet_url`, pero **siempre están vacías** — la integración con Google nunca se completó aquí.

### Sistema B — `orbit_meetings` + `orbit_meeting_attendees` (nuevo, "Orbit")

- Modelo más limpio: `starts_at` / `ends_at` como `timestamptz` reales, `meeting_kind`, `agenda`, `status`, `source`, `created_by`, `external_video_url`.
- El comentario de la tabla lo dice: *"Agenda canónica de reuniones en Órbita; videollamada externa es opcional."* — **fue diseñado para ser la fuente de la verdad.**
- `orbit_meeting_attendees` tiene modelo de invitados con `attendee_role` y `response` (pending/accepted/declined) — soporte de RSVP listo.
- El edge function `orbit-meeting-notify` conecta este sistema con Google Calendar y con el correo.

**Decisión estratégica:** consolidar todo en el Sistema B (Orbit). Mientras la "verdad" viva en dos tablas, no hay fuente única.

---

## 2. Modelo de datos

```
proyectos_seo ──< orbit_meetings ──< orbit_meeting_attendees >── users
                       │                                        (email, phone, slack_id)
                       └── external_video_url  (enlace Google Meet)
                       └── google_calendar_event_id  ◄── PENDIENTE: la columna aún no existe

users           = resolvedor universal de contactos (email + phone + slack_id en un solo lugar)
proyectos_seo   = contactos a nivel proyecto (slack_channel_id, whatsapp_contacto, whatsapp_group_id)
                  + roles del proyecto (lider_id, kam_id, director_id)
meeting_reports = reportes post-reunión (con google_docs_url) — tabla existe, vacía, sin flujo
```

### Tabla `orbit_meetings` — columnas relevantes

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `proyecto_id` | uuid | FK a `proyectos_seo` |
| `title` | text | |
| `starts_at` / `ends_at` | timestamptz | `ends_at` opcional (si falta, se asume +30 min) |
| `meeting_kind` | text | default `custom` |
| `agenda` | text | |
| `external_video_url` | text | aquí se guarda el enlace de Google Meet |
| `status` | text | default `scheduled` |
| `source` | text | default `orbit` |
| `created_by` | uuid | |
| **`google_calendar_event_id`** | — | **NO EXISTE AÚN. Hay que agregarla** para poder reagendar/cancelar. |

### Tabla `orbit_meeting_attendees`

| Columna | Tipo | Notas |
|---|---|---|
| `meeting_id` | uuid | FK a `orbit_meetings` |
| `user_id` | uuid | FK a `users` |
| `attendee_role` | text | default `team` |
| `response` | text | `pending` / `accepted` / `declined` — RSVP, hoy sin uso |

---

## 3. Flujo actual (lo que ya funciona)

```
   App Orbit
      │  (1) inserta la reunión + asistentes
      ▼
  orbit_meetings ─────────────────────────────┐
  orbit_meeting_attendees                     │
      │                                       │
      │  (2) la app llama manualmente          │
      ▼                                       │
  orbit-meeting-notify  (edge function)        │
      │                                       │
      ├─ (3) getGoogleAccessToken()  ──────────┤  usa GOOGLE_CALENDAR_* secrets
      ├─ (4) crea evento en Google Calendar    │  con conferenceData → Google Meet
      ├─ (5) guarda el meet link  ─────────────┘  en orbit_meetings.external_video_url
      └─ (6) envía correo vía Mailjet          →  a los users de orbit_meeting_attendees
```

**Características del edge function `orbit-meeting-notify`:**
- Acepta `meeting_id`, `create_google_meet` (bool), `send_email` (bool), `time_zone`, `caller_id`.
- Control de permisos: solo el `created_by` o un asistente puede dispararlo.
- Identidad: por JWT de Supabase Auth, o por `caller_id` (login propio de Orbit).
- Si ya hay un `external_video_url` manual, no crea un Meet nuevo (no pisa enlaces).

---

## 4. Estado de los huecos arquitectónicos

### ✅ Resuelto en la Fase 1 (15-may-2026)

| Hueco | Cómo se cerró |
|---|---|
| No se guardaba `google_calendar_event_id` | Columna agregada a `orbit_meetings`. La escribe `orbit-meeting-sync` al crear el evento. |
| Solo se podía CREAR el evento, no actualizarlo ni borrarlo | El nuevo edge function `orbit-meeting-sync` hace `create` (POST), `update` (PATCH = reagendar) y `cancel` (DELETE). |
| Cero triggers en Orbit | El trigger `trg_orbit_meeting_sync` sobre `orbit_meetings` dispara la sincronización con Google de forma automática. Ya es automatización, no "acción asistida". |

### ⏳ Pendiente

| Hueco | Detalle | Impacto |
|---|---|---|
| **Refresh token de Google sin scope** | Los secrets están cargados pero el token no tiene `calendar.events` (`403 ACCESS_TOKEN_SCOPE_INSUFFICIENT`) | Única tarea **externa** que bloquea el calendario. Regenerar el token (ver `configuracion/`). |
| **Sin trigger en `orbit_meeting_attendees`** | Agregar un asistente después no lo suma al evento de Google ni le envía correo | El front reenvía invitaciones manualmente mientras tanto |
| **Orbit no tiene recordatorios** | El sistema viejo sí; Orbit no | No hay avisos 60/30/15 min antes |
| **Orbit no escribe en `notifications_outbox`** | Por eso no usa los workers de Slack/WhatsApp existentes | No hay Slack ni WhatsApp para reuniones de Orbit |
| **El correo solo va a `users` internos** | Resuelve emails de `orbit_meeting_attendees → users` | El cliente no recibe nada si no es un `user` |
| **Sin sincronización inversa** | Si editan en Google Calendar, Orbit no se entera | Aceptable si Orbit es la fuente de la verdad, pero exige disciplina |

---

## 5. Arquitectura objetivo (hacia dónde vamos)

```
   App Orbit
      │  inserta / actualiza / borra la reunión
      ▼
  orbit_meetings  ──[ TRIGGER ]──►  orbit-meeting-sync (edge function)
      │                                  │
      │                                  ├─ INSERT  → crea evento Google + guarda event_id
      │                                  ├─ UPDATE  → PATCH evento Google (reagendar)
      │                                  └─ DELETE/cancelled → DELETE evento Google
      │
      └──[ TRIGGER al agregar asistente ]──►  encola invitación en notifications_outbox
                                                   │
   pg_cron (cada 10-15 min)                        ▼
      │  busca reuniones próximas           workers por canal:
      └──► encola recordatorios ──────────►  · email (Mailjet)
                                             · Slack (worker genérico)
                                             · WhatsApp (boti-whatsapp-outbox-worker)
```

La pieza nueva clave es un edge function de **sincronización** (crear/actualizar/borrar) disparado por trigger, más la conexión de Orbit al `notifications_outbox` para reusar los workers que ya existen y ya están sanos.

> **Estado (15-may-2026):** la parte de **sincronización con Google Calendar ya está construida** — `orbit-meeting-sync` + el trigger `trg_orbit_meeting_sync`. Lo que queda del diagrama objetivo es el trigger de asistentes, la conexión al `notifications_outbox` y los recordatorios por cron.

---

## 6. Plan de implementación por fases

| Fase | Alcance | Entregable |
|---|---|---|
| **Fase 1 — Cerrar el círculo de Google** | Secrets de Google + columna `google_calendar_event_id` + reagendar + cancelar | Agendar/reagendar/eliminar en Orbit se refleja en Google Calendar |
| **Fase 2 — Automatizar notificaciones** | Triggers "al agendar" y "al agregar asistente" + Orbit→outbox + worker de Slack + recordatorios por cron | Las notificaciones ocurren solas |
| **Fase 3 — Cliente y RSVP** | Resolver contacto del cliente + RSVP funcional + seguimiento de no-confirmados | El cliente recibe invitación y recordatorio; se sabe quién confirmó |
| **Fase 4 — Consolidación** | Migrar `project_meetings` (recurrentes) a Orbit y archivar el sistema viejo | Una sola fuente de la verdad |

---

*Inventario exacto de componentes con nombres y estado: [`componentes.md`](componentes.md). Operación: [`runbook.md`](runbook.md).*
