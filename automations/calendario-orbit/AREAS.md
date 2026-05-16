# Áreas de trabajo — Sincronía · Calendario y reuniones de Orbit

> El proyecto está dividido en áreas separables para que múltiples agentes puedan trabajar en paralelo sin pisarse.
> **Cada área = un agente activo a la vez.** Coordina vía [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).

---

## A. Backend — DB, edge functions y triggers

**Responsabilidad:** la columna `google_calendar_event_id`, el edge function `orbit-meeting-sync`, el trigger `trg_orbit_meeting_sync` y la función `orbit_meeting_sync_dispatch`. Cualquier cambio al contrato entre Orbit y Google.

**Archivos / componentes que tocas:**
- Tabla `orbit_meetings` (Light_House)
- Edge Function `orbit-meeting-sync` (v1)
- Función SQL `orbit_meeting_sync_dispatch()`
- Trigger `trg_orbit_meeting_sync`
- Migraciones nuevas si aplica

**Decisiones tomadas que aplican aquí:** D-001 (saneamiento outbox), D-002 (Fase 1), D-003 (verificación E2E).

**Estado:** 🟢 cerrado y verificado para `create` y `cancel`.

**Pendientes en esta área:**
- Verificar E2E el camino `update` (reagendar) con datos reales.
- Endurecer `ORBIT_SYNC_SECRET` (hoy con valor de respaldo).
- Acción `add_attendee` en `orbit-meeting-sync` (para el trigger en asistentes, ver área E).

**Áreas con las que choca:** B (Front-end depende del contrato), E (Recordatorios usa el outbox), F (Cliente externo cambia destinatarios).

---

## B. Front-end — UI de Orbit

**Responsabilidad:** las 7 pantallas/acciones de Orbit que tocan reuniones — agenda, agendar, detalle, reagendar, cancelar, asistentes, RSVP. El front es **puro CRUD** sobre `orbit_meetings` + `orbit_meeting_attendees`.

**Archivos / componentes que tocas:**
- Código del front-end de Orbit (fuera de este repo)
- Handoff: [`../../handovers/2026-05-16-sincronia-handoff-frontend.md`](../../handovers/2026-05-16-sincronia-handoff-frontend.md)
- Prompts para la IA del front: [`../../handovers/2026-05-16-sincronia-prompts-frontend-ia.md`](../../handovers/2026-05-16-sincronia-prompts-frontend-ia.md)

**Decisiones tomadas que aplican aquí:** D-004 (front por puro CRUD, sin llamar a edge functions para agendar/reagendar/cancelar).

**Estado:** ⚪ por construir.

**Pendientes en esta área:**
- Implementar las 7 pantallas siguiendo los prompts.
- Botón secundario "Reenviar invitaciones" (llama a `orbit-meeting-notify`) mientras no exista trigger en asistentes.
- Cuando esté listo, prueba E2E coordinada con backend.

**Áreas con las que choca:** A (depende del contrato del backend).

---

## C. Configuración — credenciales y secrets

**Responsabilidad:** los secrets de Google Calendar, Mailjet, WhatsApp y `ORBIT_SYNC_SECRET`. Gestión de la cuenta dueña del calendario (`accesos@seolabagency.com`) y de la app OAuth en Google Cloud Console.

**Archivos / componentes que tocas:**
- Supabase Edge Functions → Secrets
- Google Cloud Console (proyecto `seolab-orbit-calendar`)
- Mailjet
- Meta WhatsApp Business Platform
- Guía: [`configuracion/guia-google-calendar-api.md`](configuracion/guia-google-calendar-api.md)

**Decisiones tomadas que aplican aquí:** D-003 (credenciales Google verificadas).

**Estado:** 🟢 Google y Mailjet configurados. 🟡 WhatsApp en proceso de carga.

**Pendientes en esta área:**
- Confirmar carga de `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `BOTI_ALLOW_REAL_WHATSAPP_SENDS`.
- Plan de rotación de credenciales (especialmente las expuestas en chat).

**Áreas con las que choca:** A (los secrets son leídos por el edge function), E (WhatsApp para recordatorios).

---

## D. Documentación y gobierno

**Responsabilidad:** mantener este directorio coherente — README, AGENT_ONBOARDING, AREAS, WORK_IN_PROGRESS, runbook, componentes, arquitectura. Bitácora de decisiones.

**Archivos / componentes que tocas:**
- Todo este directorio (`automations/calendario-orbit/`)
- `handovers/2026-05-16-sincronia-*.md`
- `referencias/diagnostico-*.md`, `referencias/analisis-*.md`

**Estado:** 🟡 en formalización.

**Pendientes en esta área:**
- Definir owners (producto y técnico) y registrarlos en el README.
- Mantener actualizada la bitácora del README cada vez que se cierre una sesión.

**Áreas con las que choca:** ninguna directamente; los cambios meta afectan cómo se entienden las demás áreas.

---

## E. Recordatorios automáticos

**Responsabilidad:** avisos antes de cada reunión (60/30/15 min) por los canales que se decidan (correo, Slack, WhatsApp).

**Archivos / componentes que tocas:**
- Nuevo trigger en `orbit_meeting_attendees` ("al agregar asistente")
- Nueva acción `add_attendee` en `orbit-meeting-sync`
- Nuevo cron para encolar recordatorios en `notifications_outbox`
- `boti-whatsapp-outbox-worker` para entregar WhatsApp
- (Pendiente) worker genérico de Slack

**Estado:** ⚪ planeado.

**Pendientes en esta área:**
- Decidir canales por evento (agendar / recordar / cancelar).
- Implementar trigger en asistentes con acción `add_attendee`.
- Cron para encolar recordatorios desde `orbit_meetings`.
- Worker de Slack genérico.

**Áreas con las que choca:** A (extiende el edge function y agrega trigger), C (necesita secrets de WhatsApp y Slack), F (correo al cliente).

---

## F. Contacto del cliente externo

**Responsabilidad:** resolver de dónde sale el correo / WhatsApp del cliente para invitaciones automáticas.

**Archivos / componentes que tocas:**
- Tabla `users` o nueva relación
- Tabla `proyectos_seo` (campos `whatsapp_contacto`, etc.)
- Posible nueva tabla de contactos externos
- `orbit-meeting-sync` (lógica de destinatarios)

**Estado:** 🟡 sin decisión.

**Pendientes en esta área:**
- Decidir modelo de contactos: ¿`users` con rol `client`? ¿una tabla nueva `client_contacts`? ¿campo en `proyectos_seo`?
- Adaptar `orbit-meeting-sync` para incluir esos correos.

**Áreas con las que choca:** A (cambia el edge function), E (recordatorios al cliente).

---

## G. Slack — worker genérico para el outbox

**Responsabilidad:** un worker que entrega los mensajes de Slack desde `notifications_outbox`, equivalente al de WhatsApp. Beneficia a Sincronía y a otras automatizaciones futuras.

**Archivos / componentes que tocas:**
- Nuevo edge function (por crear)
- Tabla `notifications_outbox`
- `SLACK_BOT_TOKEN` en secrets
- Invitación del bot a los canales destino

**Estado:** ⚪ planeado.

**Pendientes en esta área:**
- Diseño + despliegue del worker.
- Invitación del bot a los canales requeridos.

**Áreas con las que choca:** E (recordatorios por Slack), A (extiende el ecosistema del outbox).

---

## H. Consolidación con el sistema viejo (`project_meetings`)

**Responsabilidad:** migrar las reuniones recurrentes del sistema antiguo (`project_meetings` + `generate_meeting_reminders` + `boti-meeting-generator`) a Orbit.

**Archivos / componentes que tocas:**
- Tabla `project_meetings` (lectura)
- Función SQL `generate_meeting_reminders()`
- Edge function `boti-meeting-generator`
- Migración de datos hacia `orbit_meetings`

**Estado:** ⚪ planeado.

**Pendientes en esta área:**
- Decisión: ¿migrar / archivar / mantener en paralelo?
- Si migrar: diseñar el script de import + cron de generación recurrente.

**Áreas con las que choca:** A (cambia el contrato), D (cambia el README).

---

## I. RLS / Seguridad

**Responsabilidad:** activar RLS en las tablas de Sincronía con políticas definidas (sin tumbar el front-end).

**Archivos / componentes que tocas:**
- `orbit_meetings`, `orbit_meeting_attendees`, `users` (la más sensible)
- Migraciones de políticas

**Estado:** 🔴 hoy deshabilitado.

**Pendientes en esta área:**
- Diseñar políticas para `orbit_meetings` (lectura: el front auth'd; escritura: el front auth'd + service_role).
- Diseñar políticas para `orbit_meeting_attendees` (igual).
- **`users` es la crítica** — tiene email + phone + slack_id de todo el mundo. Plan separado.
- Aplicar tabla por tabla, con prueba end-to-end del front después de cada una.

**Áreas con las que choca:** B (puede romper el front si las políticas son demasiado estrictas).

---

## Tabla resumen — choque entre áreas

| | A. Backend | B. Front | C. Config | D. Docs | E. Reminders | F. Cliente | G. Slack | H. Consol. | I. RLS |
|---|---|---|---|---|---|---|---|---|---|
| **A. Backend** | — | 🔴 | 🟡 | | 🔴 | 🟡 | 🟡 | 🟡 | |
| **B. Front-end** | 🔴 | — | | | | | | | 🔴 |
| **C. Config** | 🟡 | | — | | 🟡 | | 🟡 | | |
| **D. Docs** | | | | — | | | | | |
| **E. Reminders** | 🔴 | | 🟡 | | — | 🟡 | 🔴 | | |
| **F. Cliente** | 🟡 | | | | 🟡 | — | | | |
| **G. Slack** | 🟡 | | 🟡 | | 🔴 | | — | | |
| **H. Consol.** | 🟡 | | | | | | | — | |
| **I. RLS** | | 🔴 | | | | | | | — |

- 🔴 alto riesgo de choque (no trabajar en paralelo)
- 🟡 riesgo medio (coordinar antes de tocar)
- vacío = compatibles en paralelo

---

## Cómo elegir tu área

Si el usuario te dice qué hacer, ya tienes área. Si no:

1. ¿Quiere acelerar el lanzamiento? → **Front-end (B)** o **Cliente externo (F)**.
2. ¿Quiere extender capacidades? → **Recordatorios (E)** o **Slack (G)**.
3. ¿Quiere consolidar? → **Consolidación (H)** o **RLS (I)**.
4. ¿Quiere documentar/ordenar? → **Documentación (D)**.
