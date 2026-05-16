# Handoff al front-end — Calendario y reuniones (Orbit)

**Para:** la persona que construye el front-end de Orbit y va a cerrar esta área.
**De:** equipo de backend / automatizaciones.
**Fecha:** 15 de mayo de 2026.
**En una frase:** el backend del calendario ya está cerrado; ahora falta la interfaz. Tu trabajo es **puro CRUD** sobre dos tablas — el backend hace todo lo demás solo.

---

## 1. Lo que quedó cerrado en el backend (ya no es tu problema)

Cuando una reunión se crea, se reagenda o se cancela en Orbit, el backend **ya sincroniza solo** con Google Calendar y manda los correos. Tú no tienes que llamar a ninguna API de Google ni a ningún edge function para eso.

Concretamente, ya está construido y verificado:

- Columna `orbit_meetings.google_calendar_event_id` (para poder actualizar/borrar el evento de Google).
- Edge function `orbit-meeting-sync` — crea / reagenda / cancela el evento de Google Calendar (con Meet) y envía el correo.
- Trigger `trg_orbit_meeting_sync` sobre `orbit_meetings` — dispara la sincronización **automáticamente** ante cualquier INSERT o UPDATE relevante.

**Probado de punta a punta:** insertar una reunión dispara el trigger y llama al sync correctamente.

> **Una cosa pendiente del lado del backend** (NO te bloquea): el `GOOGLE_CALENDAR_REFRESH_TOKEN` cargado en Supabase aún no tiene el scope de Calendar, así que hoy los eventos no llegan a aparecer en Google (el sync responde con un `warning`). Eso lo resuelve otra persona regenerando el token. **Tu front-end funciona igual** — escribe en las tablas, y el día que se arregle el token, los eventos empiezan a crearse sin que toques nada.

---

## 2. El contrato — lo único que necesitas saber

### Tu trabajo es puro CRUD sobre dos tablas

| Acción del usuario en Orbit | Lo que hace el front-end | Lo que hace el backend solo |
|---|---|---|
| **Agendar** una reunión | `INSERT` en `orbit_meetings` + `INSERT` en `orbit_meeting_attendees` | Crea el evento en Google Calendar con Meet, guarda el enlace, manda correos |
| **Reagendar** | `UPDATE` de `starts_at` / `ends_at` / `title` / `agenda` en `orbit_meetings` | Actualiza (PATCH) el evento en Google y avisa |
| **Cancelar** | `UPDATE` de `status = 'cancelled'` en `orbit_meetings` (NO borrar la fila) | Borra (DELETE) el evento en Google y avisa |
| **Ver la agenda** | `SELECT` de `orbit_meetings` | — |
| **Gestionar asistentes** | `INSERT` / `DELETE` en `orbit_meeting_attendees` | (ver nota en la sección 4) |
| **Confirmar/rechazar** (RSVP) | `UPDATE` de `response` en `orbit_meeting_attendees` | — |

**No hay que llamar a ningún edge function para agendar, reagendar ni cancelar.** Solo escribes en la tabla y el trigger se encarga.

### Tabla `orbit_meetings`

| Columna | Tipo | Quién la escribe |
|---|---|---|
| `id` | uuid | auto |
| `proyecto_id` | uuid | front (FK a `proyectos_seo`) |
| `title` | text | front |
| `starts_at` | timestamptz | front |
| `ends_at` | timestamptz | front (opcional; si falta, el backend asume +30 min) |
| `meeting_kind` | text | front (opcional, default `custom`) |
| `agenda` | text | front (opcional) |
| `location_notes` | text | front (opcional) |
| `status` | text | front — `scheduled` (default) / `cancelled` / `completed` |
| `source` | text | front (default `orbit`) |
| `created_by` | uuid | front (id del usuario actual en `users`) |
| `external_video_url` | text | **backend** — enlace de Google Meet. El front solo lo LEE y lo muestra. |
| `google_calendar_event_id` | text | **backend** — el front no lo toca. |
| `created_at` / `updated_at` | timestamptz | auto |

### Tabla `orbit_meeting_attendees`

| Columna | Tipo | Quién la escribe |
|---|---|---|
| `meeting_id` | uuid | front (FK a `orbit_meetings`) |
| `user_id` | uuid | front (FK a `users`) |
| `attendee_role` | text | front — `team` (default) / `lead` / `client` |
| `response` | text | front — `pending` (default) / `accepted` / `declined` |

### Tablas de apoyo (solo lectura)

- `users` — personas (equipo y clientes): `id`, `full_name`, `email`, `phone`, `slack_id`.
- `proyectos_seo` — proyectos/marcas: `id`, `nombremarca`.

### Reglas que no se rompen

1. El front **nunca** escribe `external_video_url` ni `google_calendar_event_id` — esos los llena el backend.
2. El front **nunca** habla con Google, Slack, WhatsApp o correo. Solo escribe en las tablas de Supabase.
3. "Borrar" una reunión = `UPDATE status = 'cancelled'`. **Nunca** se hace `DELETE` de la fila.
4. Las fechas se guardan en `timestamptz` (UTC en la base). Al usuario se le muestra en zona `America/Bogota`.
5. No inventes nombres de tablas ni columnas. Lo que está aquí es todo lo que hay.

---

## 3. Qué tienes que construir para cerrar el área

| # | Pantalla / función | Qué hace |
|---|---|---|
| 1 | **Agenda / calendario** | Lista las reuniones (`status <> 'cancelled'`), ordenadas por `starts_at`. Muestra título, fecha/hora (en Bogotá), marca y asistentes. Botón "Unirse" si hay `external_video_url`. |
| 2 | **Agendar reunión** | Formulario → `INSERT` en `orbit_meetings` + `INSERT` de asistentes. Nada más. |
| 3 | **Detalle de reunión** | Ver toda la info; mostrar el enlace de Meet y el `status`. |
| 4 | **Reagendar** | Editar `starts_at`/`ends_at`/`title`/`agenda` → `UPDATE`. |
| 5 | **Cancelar** | Botón con confirmación → `UPDATE status = 'cancelled'`. |
| 6 | **Gestión de asistentes** | Agregar/quitar filas de `orbit_meeting_attendees`. |
| 7 | **RSVP** | Botones confirmar/rechazar → `UPDATE response`. |

Los **prompts listos para copiar y pegar** en tu herramienta de IA están en [`prompts-frontend-ia.md`](prompts-frontend-ia.md) — uno por cada pantalla. Empieza siempre pegando el "Prompt 0 — Contexto maestro".

---

## 4. Lo que NO es tu responsabilidad

- La integración con Google Calendar / Meet / correo / Slack / WhatsApp — todo eso es backend.
- Configurar las credenciales de Google (el `refresh_token`) — eso lo hace otra persona; ver [`configuracion/guia-google-calendar-api.md`](configuracion/guia-google-calendar-api.md).
- **Agregar un asistente *después* de crear la reunión:** hoy el backend aún NO lo sincroniza solo con Google (falta un trigger en `orbit_meeting_attendees`, es el próximo incremento). Mientras tanto, en la pantalla de asistentes deja un botón **"Reenviar invitaciones"** que invoque el edge function `orbit-meeting-notify` con `{ meeting_id, create_google_meet: false, send_email: true, caller_id }`. El Prompt 3 ya lo contempla.

---

## 5. Checklist para dar por cerrada el área

- [ ] Pantalla de agenda (lista + idealmente vista de calendario)
- [ ] Formulario de agendar (INSERT meeting + attendees)
- [ ] Detalle de reunión con enlace de Meet y estado
- [ ] Reagendar (UPDATE de fecha/título/agenda)
- [ ] Cancelar (UPDATE status, nunca DELETE)
- [ ] Gestión de asistentes + botón "Reenviar invitaciones"
- [ ] RSVP (UPDATE response)
- [ ] Probado: al agendar, la reunión aparece en la agenda y, en `orbit_meetings`, el backend llena `external_video_url` (esto último solo funcionará cuando se arregle el token de Google — coordina la prueba final con el backend)

---

## 6. A quién preguntar

- **Contrato del backend, tablas, triggers, edge functions:** el responsable del backend de automatizaciones.
- **Credenciales de Google / Mailjet:** quien tenga el acceso a Supabase Secrets y Google Cloud.
- **Si algo en este documento no coincide con la realidad:** gana el backend — repórtalo para corregir este archivo.

---

*Documento de handoff. Acompaña a [`README.md`](README.md) (qué es), [`arquitectura.md`](arquitectura.md) (cómo funciona por dentro), [`componentes.md`](componentes.md) (inventario exacto) y [`prompts-frontend-ia.md`](prompts-frontend-ia.md) (los prompts).*
