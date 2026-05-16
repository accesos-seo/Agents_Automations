# Onboarding — Sincronía · Calendario y reuniones de Orbit

> Lee este documento antes de tomar cualquier acción. Reemplaza la necesidad de revisar la conversación anterior.
> Tiempo de lectura: 5 minutos.

---

## 1. Identidad del proyecto

| | |
|---|---|
| **Nombre** | Sincronía — Calendario y reuniones de Orbit |
| **automation_key** | `calendario-orbit` |
| **Versión actual en producción** | 1.0 (backend operativo; front-end pendiente) |
| **Estado** | `active` / `backend_ready_frontend_pending` |
| **Activado** | 2026-05-16 |
| **Owner producto** | _por definir_ |
| **Owner técnico** | _por definir_ |

**Qué hace:** convierte la app interna **Orbit** en la **fuente de la verdad del calendario de la agencia**. Cuando alguien agenda, reagenda o cancela una reunión en Orbit, el sistema sincroniza solo con Google Calendar (crea/actualiza/borra el evento), genera el enlace de Google Meet y envía el correo de invitación. El front-end **solo escribe en dos tablas** — el resto lo hacen triggers de la base de datos.

**Tabla de operación:** una reunión, una fila en `orbit_meetings` + N filas en `orbit_meeting_attendees`. No hay sistema externo "dueño" — Orbit manda, Google Calendar es un espejo.

---

## 2. Dónde vive cada cosa (rutas exactas)

### 2.1. En Supabase

**Runtime productivo** — proyecto `Light_House` (`stjugsrkrweakvzmizpq`):

| Tabla | Rol | Filas hoy |
|---|---|---|
| `orbit_meetings` | Reunión: `starts_at`, `ends_at`, `title`, `agenda`, `status`, `external_video_url`, `google_calendar_event_id`. | 4 (test) |
| `orbit_meeting_attendees` | Asistentes: `user_id`, `attendee_role`, `response` (RSVP). | 8 |
| `users` | Resolvedor universal: `email`, `phone`, `slack_id`. RLS deshabilitado ⚠️ | n/a |
| `proyectos_seo` | Marca del proyecto (`nombremarca`) y contactos. | 23 |
| `meeting_reports` | Reportes post-reunión (esquema listo, sin flujo aún). | 0 |
| `notifications_outbox` | Outbox para Slack/WhatsApp/email — no usado aún por Sincronía. | n/a |
| `project_meetings` | **Sistema viejo** de reuniones recurrentes. A consolidar. | 3 |
| `project_meeting_recipients` | Destinatarios WhatsApp con opt-in (3 QA internos). | 3 |
| `business_calendar` | Calendario laboral Bogotá. | 365 |

### 2.2. Edge Functions (en Light_House)

| Slug | Versión | Rol |
|---|---|---|
| `orbit-meeting-sync` | v1 | **Sincroniza con Google Calendar:** `create` (POST + Meet), `update` (PATCH = reagendar), `cancel` (DELETE). Auth por `x-internal-secret`. |
| `orbit-meeting-notify` | v8 | Función previa para invocación manual desde Orbit. Útil para "reenviar invitaciones" mientras no exista trigger en asistentes. |
| `boti-whatsapp-outbox-worker` | v18 | Worker WhatsApp saneado en mayo. Listo para integrarse cuando se active esa fase. |

### 2.3. Triggers SQL críticos

| Trigger | Tabla | Disparo |
|---|---|---|
| `trg_orbit_meeting_sync` | `orbit_meetings` | AFTER INSERT/UPDATE → llama a `orbit-meeting-sync` vía `net.http_post`. Anti-bucle incorporado. |
| `outbox-stuck-reaper` (cron, cada 10 min) | — | Recupera mensajes atascados en `processing`. |

### 2.4. Migraciones aplicadas

- `orbit_meetings_add_google_calendar_event_id` — columna nueva.
- `orbit_meetings_google_sync_trigger` — función `orbit_meeting_sync_dispatch` + trigger.
- `fix_claim_due_notifications_channel_aware` — corrección del bug de routing del outbox.
- `add_outbox_stuck_reaper` — función + cron.
- `drop_legacy_claim_due_notifications_overload` — limpieza de la versión vieja.

### 2.5. En este repo (gobierno)

```
Agents_Automations/
├── automations/calendario-orbit/
│   ├── README.md            ← Plano de control
│   ├── AGENT_ONBOARDING.md  ← Este documento
│   ├── AREAS.md             ← Áreas separables
│   ├── WORK_IN_PROGRESS.md  ← Sesiones activas
│   ├── arquitectura.md      ← Detalle técnico del modelo de datos y flujo
│   ├── runbook.md           ← Operación día a día
│   ├── componentes.md       ← Inventario exacto
│   ├── codigo/edge-functions/orbit-meeting-sync/index.ts
│   └── configuracion/guia-google-calendar-api.md
├── handovers/
│   ├── 2026-05-16-sincronia-handoff-frontend.md
│   └── 2026-05-16-sincronia-prompts-frontend-ia.md
└── referencias/
    ├── diagnostico-automatizaciones-lighthouse.md
    └── analisis-ecosistema-calendario.md
```

---

## 3. Flujo end-to-end (cómo funciona)

```
1. INTAKE: el front-end de Orbit inserta una reunión en orbit_meetings (+ asistentes en orbit_meeting_attendees)
   ↓
2. TRIGGER trg_orbit_meeting_sync (AFTER INSERT)
   Decide action = 'create' y llama a orbit-meeting-sync vía net.http_post (async)
   ↓
3. EDGE FUNCTION orbit-meeting-sync
   3.1 Carga la reunión y los asistentes (resuelve emails desde users)
   3.2 Obtiene access_token de Google (OAuth refresh token con scope calendar.events)
   3.3 POST a Google Calendar v3 → crea evento con conferenceData (Meet)
   3.4 Guarda google_calendar_event_id + external_video_url en orbit_meetings
   3.5 Envía correo vía Mailjet a los asistentes
   ↓
4. UI: front-end refresca y muestra el enlace de Meet (cuando external_video_url se llena)

REAGENDAR: UPDATE de starts_at/ends_at/title/agenda → trigger → action='update' → PATCH en Google
CANCELAR:  UPDATE status='cancelled' → trigger → action='cancel' → DELETE en Google
```

**Tiempo medido:** `create` 1.2 s · `cancel` 0.8 s.

---

## 4. Estado actual con datos reales (2026-05-16)

| Indicador | Valor |
|---|---|
| Backend (DB + edge functions + triggers) | 🟢 cerrado y verificado |
| Credenciales de Google + Mailjet | 🟢 configurado y verificado end-to-end |
| Pipeline automático `create` | 🟢 verificado |
| Pipeline automático `cancel` | 🟢 verificado |
| Pipeline automático `update` (reagendar) | 🟡 mismo código que `create`, no probado aún en E2E |
| Front-end | ⚪ por construir (handoff listo) |
| Trigger en `orbit_meeting_attendees` | ⚪ planeado (`add_attendee` aún sin implementar) |

---

## 5. Decisiones tomadas (historia reciente)

| ID | Fecha | Decisión | Estado |
|---|---|---|---|
| D-001 | 2026-05-15 | Bug de routing del outbox + reaper + worker WhatsApp v18 | ✅ Productivo |
| D-002 | 2026-05-15 | Fase 1: columna + `orbit-meeting-sync` + trigger | ✅ Productivo |
| D-003 | 2026-05-16 | Credenciales de Google con scope correcto + verificación E2E | ✅ Productivo |
| D-004 | 2026-05-16 | Front-end por puro CRUD (sin llamar a edge functions) | ✅ Decidido y documentado |

Detalle completo en [`README.md`](README.md) sección 7.5.

---

## 6. Reglas no negociables específicas

1. **Orbit es la fuente de la verdad.** Si Orbit dice algo, eso es lo correcto. Google Calendar es un espejo.
2. **El front-end nunca escribe en `external_video_url` ni `google_calendar_event_id`.** Esos los llena el backend.
3. **Cancelar = `UPDATE status = 'cancelled'`.** Nunca `DELETE` la fila.
4. **El front-end no habla con Google, Slack, WhatsApp ni correo directamente.** Solo Supabase.
5. **Las fechas viajan en `timestamptz` (UTC).** Se muestran al usuario en zona `America/Bogota`.
6. **`users` tiene email + phone + slack_id de todo el mundo** y está sin RLS — tratar con cuidado.

---

## 7. Lo que está pendiente (por área)

Para evitar elegir trabajo que ya está siendo hecho, revisa primero [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md) y luego [`AREAS.md`](AREAS.md). Resumen:

- **Front-end (B):** 7 pantallas pendientes — agenda, agendar, detalle, reagendar, cancelar, asistentes, RSVP. Prompts listos en `handovers/`.
- **Recordatorios (E):** trigger en `orbit_meeting_attendees` + cron 60/30/15 min antes + conexión a `notifications_outbox`.
- **Cliente externo (F):** resolver de dónde sale el contacto del cliente para invitaciones por correo/WhatsApp.
- **Slack (G):** worker genérico de Slack para el outbox.
- **Consolidación (H):** migrar `project_meetings` (sistema viejo de recurrentes) dentro de Orbit.
- **RLS (I):** plan de políticas tabla por tabla, especialmente `users`.

---

## 8. Cómo empezar tu sesión (los 4 pasos)

1. Identifica tu **área de trabajo** en [`AREAS.md`](AREAS.md).
2. Verifica que el área **no esté tomada** en [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).
3. **Registra tu sesión** añadiendo una fila en `WORK_IN_PROGRESS.md` con tu área, fecha, descripción. Commit y push antes de empezar.
4. **Trabaja.** Cuando termines, mueve la sesión a "cerradas" y actualiza la bitácora del README de la automatización.

Si tu área tiene dueño activo y no puedes esperar: habla con el usuario antes de tomar. Coordinación humana, no overwrite silencioso.
