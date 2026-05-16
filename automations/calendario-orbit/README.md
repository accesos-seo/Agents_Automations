# Sincronía — Calendario y reuniones de Orbit

**Automation key:** `calendario-orbit`
**Versión actual:** 1.0 (backend operativo; front-end pendiente)
**Estado:** `active` / `backend_ready_frontend_pending`
**Activada:** 2026-05-16
**Owner producto:** _por definir_
**Owner técnico:** _por definir_

Segunda automatización del repositorio bajo gobierno explícito. El código vive **dentro del proyecto Supabase `Light_House`** (`stjugsrkrweakvzmizpq`) — no hay repo de implementación externo. Este directorio es el **plano de control** y **bitácora viva** de la automatización.

---

## 1. Qué hace

Convierte la app interna **Orbit** en la **fuente de la verdad del calendario de la agencia**. Cuando se agenda, reagenda o cancela una reunión en Orbit, el sistema sincroniza solo con Google Calendar (crea/actualiza/borra el evento), genera el enlace de Google Meet y envía el correo de invitación vía Mailjet. El front-end **solo escribe en dos tablas** (`orbit_meetings`, `orbit_meeting_attendees`) — el resto lo hacen triggers de la base de datos.

**Invierte la relación con Google:** Orbit manda, Google Calendar es un espejo. El día que se desactive Google Calendar, la agenda sigue siendo la de Orbit; los eventos externos son un accesorio.

> Para el detalle técnico del flujo, ver [`arquitectura.md`](arquitectura.md). Para el contrato del front-end, ver [`../../handovers/2026-05-16-sincronia-handoff-frontend.md`](../../handovers/2026-05-16-sincronia-handoff-frontend.md).

---

## 2. Configuración

| Config | Valor |
|---|---|
| Runtime Supabase | `stjugsrkrweakvzmizpq` (`Light_House`) |
| Cuenta de Google dueña | `accesos@seolabagency.com` |
| Calendario destino | `primary` (de la cuenta dueña) |
| App OAuth | `orbit-calendar-client` en proyecto Google Cloud `seolab-orbit-calendar`, estado **In production** |
| Scope OAuth | `https://www.googleapis.com/auth/calendar.events` |
| Proveedor de correo | Mailjet |
| Worker auxiliar | `boti-whatsapp-outbox-worker` (v18, listo para integración futura con WhatsApp) |

**Secrets requeridos (en Supabase `Light_House` → Edge Functions → Secrets):**

| Secret | Estado |
|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` | 🟢 cargado |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | 🟢 cargado |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` (scope `calendar.events`) | 🟢 cargado y verificado end-to-end |
| `GOOGLE_CALENDAR_ID` | no usado — default `primary` |
| `MAILJET_API_KEY`, `MAILJET_SECRET_KEY` | 🟢 cargados (reutilizados de otros proyectos) |
| `ORBIT_SYNC_SECRET` | 🟡 opcional — hoy se usa el valor de respaldo (`orbit-sync-2026`) |

---

## 3. Componentes (inventario)

### 3.1 Tablas (en `Light_House`)

| Tabla | Rol |
|---|---|
| `orbit_meetings` | Reunión: `starts_at`, `ends_at`, `title`, `agenda`, `status`, `external_video_url`, `google_calendar_event_id`. |
| `orbit_meeting_attendees` | Asistentes: `user_id`, `attendee_role`, `response` (RSVP). |
| `users` | Resuelve `email` / `phone` / `slack_id` de cada asistente. |
| `proyectos_seo` | Marca del proyecto (`nombremarca`) y contactos. |
| `meeting_reports` | Reportes post-reunión (esquema listo, sin flujo aún). |

### 3.2 Edge Functions (en `Light_House`)

| Slug | Versión | Rol |
|---|---|---|
| `orbit-meeting-sync` | v1 | **Sincroniza con Google Calendar:** `create` (POST + Meet), `update` (PATCH = reagendar), `cancel` (DELETE). Guarda `google_calendar_event_id` y `external_video_url`. Envía el correo. |
| `orbit-meeting-notify` | v8 | Función previa para invocación manual desde Orbit. Útil hoy para "reenviar invitaciones" desde el front. |
| `boti-whatsapp-outbox-worker` | v18 | Worker WhatsApp (saneado en mayo). Listo para conectarse con Orbit cuando se active esa fase. |

### 3.3 Funciones SQL y Triggers

| Tipo | Nombre | Disparo |
|---|---|---|
| Función trigger | `orbit_meeting_sync_dispatch()` | Lógica que decide `create`/`update`/`cancel` y llama a `orbit-meeting-sync` vía `net.http_post`. Guarda anti-bucle. |
| Trigger | `trg_orbit_meeting_sync` | AFTER INSERT OR UPDATE sobre `orbit_meetings`. |
| Función | `claim_due_notifications(worker_id, limit, now, target_types)` | Outbox: reclama mensajes filtrando por canal. Corregida en mayo. |
| Función | `reset_stuck_outbox_notifications()` | Reaper del outbox. |
| Cron | `outbox-stuck-reaper` | Cada 10 min. |

### 3.4 Migraciones aplicadas

- `orbit_meetings_add_google_calendar_event_id` — columna nueva para guardar el ID del evento.
- `orbit_meetings_google_sync_trigger` — función `orbit_meeting_sync_dispatch` + trigger `trg_orbit_meeting_sync`.
- `fix_claim_due_notifications_channel_aware` — corrección del bug de routing del outbox.
- `add_outbox_stuck_reaper` — función + cron del reaper.
- `drop_legacy_claim_due_notifications_overload` — eliminación de la versión vieja.

---

## 4. Estado actual (datos reales 2026-05-16)

| Indicador | Valor |
|---|---|
| Backend (DB + edge functions + triggers) | 🟢 cerrado y verificado |
| Credenciales de Google + Mailjet | 🟢 configurado y verificado |
| Pipeline automático (trigger → sync → Google) | 🟢 verificado end-to-end (`create` y `cancel`) |
| Front-end | ⚪ por construir (handoff listo en `handovers/`) |
| Reuniones en `orbit_meetings` (test data) | 4 |
| Asistentes en `orbit_meeting_attendees` | 8 (todos rol `team`, todos `pending`) |
| Eventos creados en Google Calendar (test E2E) | 1 creado y cancelado correctamente |
| Tiempo medido del flujo `create` | 1.2 s |
| Tiempo medido del flujo `cancel` | 0.8 s |

---

## 5. Decisiones pendientes del dueño del producto

| Decisión | Opciones | Estado |
|---|---|---|
| ¿Un solo sistema o dos para reuniones? | Consolidar todo en Orbit / mantener `project_meetings` como sistema viejo de recurrentes / migrar gradual | Pendiente — recomendación: consolidar en Orbit |
| Contacto del cliente para invitaciones | `users.email` / campo en `proyectos_seo` / `cliente_users` | Pendiente |
| Canales por tipo de evento | Solo email / email + Slack / email + Slack + WhatsApp | Pendiente |
| Recordatorios automáticos | 60+30+15 min / solo 30 min / sin recordatorios | Pendiente |
| Plan de RLS para `orbit_meetings` y `users` | Hoy deshabilitado — `users` tiene email/phone/slack expuestos | Pendiente (importante antes del lanzamiento) |

---

## 6. Optimizaciones priorizadas

### Quick wins (1-2 días)
1. Front-end: implementar las 7 pantallas del handoff (agenda, agendar, detalle, reagendar, cancelar, asistentes, RSVP).
2. Endurecer `ORBIT_SYNC_SECRET` (hoy con valor de respaldo).

### Medianas (3-5 días)
3. Trigger en `orbit_meeting_attendees` ("al agregar asistente") + acción `add_attendee` en `orbit-meeting-sync`.
4. Recordatorios automáticos por cron (60/30/15 min antes) conectando Orbit al `notifications_outbox`.
5. Email/WhatsApp al **cliente** (resolver de dónde sale su contacto).
6. RSVP funcional con botones en el correo.

### Estratégicas (1-2 semanas)
7. Worker genérico de Slack para el outbox (Orbit + cualquier otra automatización).
8. Consolidar `project_meetings` (sistema viejo de recurrentes) dentro de Orbit.
9. Plan de RLS tabla por tabla para las tablas del calendario y `users`.

---

## 7. Links y referencias

- **Supabase runtime:** proyecto `Light_House` (ref `stjugsrkrweakvzmizpq`)
- **Edge Function principal:** `orbit-meeting-sync` (v1)
- **Trigger principal:** `trg_orbit_meeting_sync` sobre `orbit_meetings`
- **Handoff al front-end:** [`../../handovers/2026-05-16-sincronia-handoff-frontend.md`](../../handovers/2026-05-16-sincronia-handoff-frontend.md)
- **Prompts para IA del front:** [`../../handovers/2026-05-16-sincronia-prompts-frontend-ia.md`](../../handovers/2026-05-16-sincronia-prompts-frontend-ia.md)
- **Análisis del ecosistema:** [`../../referencias/analisis-ecosistema-calendario.md`](../../referencias/analisis-ecosistema-calendario.md)
- **Diagnóstico inicial (Lighthouse):** [`../../referencias/diagnostico-automatizaciones-lighthouse.md`](../../referencias/diagnostico-automatizaciones-lighthouse.md)
- **Guía de configuración Google Calendar:** [`configuracion/guia-google-calendar-api.md`](configuracion/guia-google-calendar-api.md)
- **Arquitectura técnica detallada:** [`arquitectura.md`](arquitectura.md)
- **Runbook operativo:** [`runbook.md`](runbook.md)
- **Inventario exacto de componentes:** [`componentes.md`](componentes.md)
- **Código del edge function `orbit-meeting-sync`:** [`codigo/edge-functions/orbit-meeting-sync/index.ts`](codigo/edge-functions/orbit-meeting-sync/index.ts)

---

## 7.5. Decisiones tomadas

| ID | Fecha | Decisión | Detalle |
|---|---|---|---|
| D-001 | 2026-05-15 | **Corrección del bug de routing del outbox** | `claim_due_notifications` se hizo consciente del canal (parámetro `p_target_types`). Se eliminó la versión antigua. 8 mensajes atascados desde el 6-may marcados como `cancelled`. Se agregó la función `reset_stuck_outbox_notifications` y el cron `outbox-stuck-reaper` (cada 10 min). El worker `boti-whatsapp-outbox-worker` se reescribió (v18): solo reclama tipos WhatsApp, libera lo que no le corresponde, resuelve el fan-out de destinatarios. |
| D-002 | 2026-05-15 | **Fase 1: cierre del círculo con Google Calendar** | Migración `orbit_meetings_add_google_calendar_event_id`. Despliegue del edge function `orbit-meeting-sync` (v1) con acciones `create`/`update`/`cancel`. Migración `orbit_meetings_google_sync_trigger` con la función `orbit_meeting_sync_dispatch` y el trigger `trg_orbit_meeting_sync`. Validado: trigger dispara y `orbit-meeting-sync` responde HTTP 200. Detectado que el `refresh_token` no tenía el scope `calendar.events` (acción externa pendiente). |
| D-003 | 2026-05-16 | **Activación de credenciales y verificación end-to-end** | El equipo de configuración regeneró el `GOOGLE_CALENDAR_REFRESH_TOKEN` con el scope `calendar.events` (cuenta `accesos@seolabagency.com`, app OAuth "In production"). Decisión: se usa el calendario `primary` — no se configura `GOOGLE_CALENDAR_ID`. Verificación E2E del pipeline construido: `create` (HTTP 200, evento + Meet generados y guardados, 1.2 s) y `cancel` (HTTP 200, evento eliminado en Google, 0.8 s). **El backend del calendario queda totalmente operativo.** |
| D-004 | 2026-05-16 | **Decisión arquitectónica: front-end por puro CRUD, sin llamar a edge functions** | El front-end de Orbit hace solo `INSERT`/`UPDATE`/`DELETE` sobre `orbit_meetings` y `orbit_meeting_attendees`. El trigger se encarga de la sincronización con Google. Esto simplifica el front-end significativamente. Documentado en el handoff y en los prompts de la IA. |

---

## 8. Bitácora

| Fecha | Evento |
|---|---|
| 2026-05-15 | Diagnóstico inicial de las 6 automatizaciones de `Light_House` (ver [`referencias/diagnostico-automatizaciones-lighthouse.md`](../../referencias/diagnostico-automatizaciones-lighthouse.md)). |
| 2026-05-15 | Análisis del ecosistema de calendario; identificación de los dos sistemas paralelos (`project_meetings` y `orbit_meetings`). |
| 2026-05-15 | D-001 — Saneamiento del outbox y worker WhatsApp. Bug de routing cerrado de raíz. |
| 2026-05-15 | D-002 — Fase 1 construida: columna + edge function + trigger. Verificación parcial (el token no tenía scope). |
| 2026-05-15 | Documento de handoff para el front-end + prompts para su herramienta de IA. |
| 2026-05-16 | D-003 — Credenciales de Google regeneradas con scope correcto. Verificación E2E exitosa de `create` y `cancel`. |
| 2026-05-16 | D-004 — Arquitectura del front-end simplificada: puro CRUD. |
| 2026-05-16 | Documentación migrada al repo `Agents_Automations` siguiendo la convención existente (este directorio). |
