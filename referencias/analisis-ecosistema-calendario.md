# Análisis del ecosistema de calendario — Proyecto Light_House

**Agencia:** SeoLab Agency
**Proyecto Supabase:** Light_House (`stjugsrkrweakvzmizpq`)
**Fecha:** 15 de mayo de 2026
**Objetivo:** entender qué hay construido para el calendario, dónde está cada pieza, y mapear las oportunidades para convertir el calendario en la fuente de la verdad (hoy esa función la cumple Google Meet de forma informal).

---

## 1. Resumen ejecutivo

Sí, ya habías avanzado — y bastante. Hay **dos sistemas de reuniones** conviviendo en la base de datos, y uno de ellos (**"Orbit"**) está diseñado precisamente para ser la fuente de la verdad del calendario. Lo que falta no es empezar de cero, sino **conectar y cerrar el círculo**.

El estado real, en una frase: tienes la **mesa puesta** (las tablas bien diseñadas y un edge function que ya crea eventos de Google Meet y manda correos), pero **casi nada está conectado todavía** — no hay automatización a nivel de base de datos, no hay recordatorios para Orbit, no hay Slack ni WhatsApp para Orbit, y reagendar o eliminar una reunión **no se refleja en Google Calendar**.

| Capacidad que quieres | ¿Existe hoy? | Dónde está |
|---|---|---|
| Agendar reunión | 🟡 Parcial | Tabla `orbit_meetings` + edge function `orbit-meeting-notify` (crea evento Google Meet) |
| Crear el enlace de Google Meet | 🟢 Construido | `orbit-meeting-notify` — falta configurar los secrets de Google |
| Email al equipo/cliente | 🟢 Construido | `orbit-meeting-notify` vía Mailjet — solo llega a usuarios internos hoy |
| Reagendar (cambiar horario) | 🔴 No existe | Cambiar la hora en Orbit NO actualiza el evento de Google Calendar |
| Eliminar / cancelar reunión | 🔴 No existe | Borrar en Orbit NO cancela el evento de Google Calendar |
| Agregar al equipo / asistentes | 🟡 Parcial | Tabla `orbit_meeting_attendees` existe; pero agregar a alguien después no actualiza el evento de Google |
| Recordatorios automáticos | 🟡 Solo el sistema viejo | `project_meetings` tiene recordatorios; **Orbit no tiene ninguno** |
| Mensajes de Slack | 🔴 No existe para Orbit | Slack solo está cableado al sistema viejo y a otras automatizaciones |
| WhatsApp al cliente | 🔴 No existe para Orbit | El worker de WhatsApp está atado a `project_meetings`, no a Orbit |
| Confirmar asistencia (RSVP) | 🟡 Esquema listo, sin uso | `orbit_meeting_attendees.response` existe (pending/accepted/declined) pero nada lo usa |

**La decisión más importante antes de automatizar:** elegir **un solo sistema**. Hoy hay dos (`project_meetings` y `orbit_meetings`) y eso es exactamente lo que impide que el calendario sea "la fuente de la verdad" — si la verdad vive en dos tablas, no hay verdad. La recomendación es consolidar todo en **Orbit**.

---

## 2. Lo que ya tienes construido

### 2.1 Dos sistemas de reuniones en paralelo

**Sistema A — `project_meetings` (el más antiguo, orientado a reuniones recurrentes)**

- Se alimenta de la configuración por proyecto en `proyectos_seo`: `reunion_operativa_dia/hora/temas`, `reunion_estrategica_*`, `reunion_automation_*`. Es decir, cada proyecto tiene definido "los martes a las 10 hay operativa".
- La función SQL `generate_meeting_reminders()` recorre los proyectos activos, calcula la próxima fecha con `get_next_meeting_date()` (respetando `business_calendar` y días hábiles de Bogotá), crea la fila en `project_meetings` y encola un recordatorio en `notifications_outbox`.
- El edge function `boti-meeting-generator` es solo un envoltorio seguro de esa función SQL (con modo `dry_run`).
- Tiene columnas para Google (`google_calendar_event_id`, `meet_url`) pero **están todas vacías** — nunca se llegó a integrar.
- Datos actuales: 3 reuniones, todas de prueba, todas con `reminder_status = 'pending'`.

**Sistema B — `orbit_meetings` + `orbit_meeting_attendees` (el nuevo, "la app Orbit")**

- Diseño mucho más limpio: `starts_at` / `ends_at` como `timestamptz` reales (no fecha + hora de texto suelto), `meeting_kind`, `agenda`, `status`, `source`, `created_by`, y `external_video_url` para el enlace de video.
- El comentario de la tabla lo dice explícitamente: *"Agenda canónica de reuniones en Órbita; videollamada externa es opcional."* — es decir, **este sistema fue pensado para ser la fuente de la verdad**, donde el calendario manda y la videollamada es un accesorio.
- `orbit_meeting_attendees` tiene un modelo de invitados como debe ser: `attendee_role` y `response` (pending/accepted/declined) — soporte de RSVP listo.
- Datos actuales: 4 reuniones de prueba ("Example meet", etc.), 8 asistentes, todos rol `team`, todos en `response = 'pending'`.

### 2.2 El edge function `orbit-meeting-notify` — tu mayor activo

Este edge function (creado hoy mismo, está activo) ya hace **dos de las cosas más difíciles** que pediste:

1. **Crea un evento real en Google Calendar con videoconferencia de Google Meet** y guarda el enlace en `orbit_meetings.external_video_url`. Esto es justo lo que invierte la relación: en vez de que Meet sea la fuente, **Orbit crea el evento y Google Calendar pasa a ser un espejo**.
2. **Envía un correo con plantilla HTML branded ("ORBIT · SeoLab")** a los participantes vía Mailjet, con el botón de "Unirse a la videollamada".

Tiene control de permisos (solo el creador o un asistente puede dispararlo) y maneja identidad tanto por sesión de Supabase Auth como por `caller_id` (login propio de Orbit).

**Pero tiene límites importantes:**

- **Solo CREA, nunca ACTUALIZA ni BORRA.** No hay forma de reagendar ni cancelar el evento de Google.
- **Se invoca a mano.** No hay trigger ni cron — alguien tiene que llamarlo desde el front-end botón por botón. No es todavía una "automatización", es una "acción manual asistida".
- **El correo solo llega a `users` internos.** Resuelve los emails desde `orbit_meeting_attendees → users`. El cliente, si no está como asistente con un registro en `users`, no recibe nada.
- **Necesita secrets de Google que probablemente aún no están puestos:** `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN` (con scope `calendar.events`). El propio código los marca como "NUEVOS recomendados". Mailjet (`MAILJET_API_KEY`, `MAILJET_SECRET_KEY`) sí parece estar configurado porque ya se usa en otras partes del proyecto.

### 2.3 Lo que NO existe (los huecos)

- **Cero automatización a nivel de base de datos en Orbit.** Ni `orbit_meetings` ni `orbit_meeting_attendees` tienen un solo trigger. Todo es manual / desde el front-end.
- **Orbit no tiene recordatorios.** El sistema viejo (`project_meetings`) sí los tiene; Orbit no.
- **Orbit no toca Slack.** Slack está cableado a `client_requests`, `tickets` y al sistema viejo de keywords — pero no a las reuniones de Orbit.
- **Orbit no toca WhatsApp.** El worker de WhatsApp (`boti-whatsapp-outbox-worker`, que ya corregimos) lee del outbox poblado por el sistema **viejo**. Orbit no escribe en el outbox.
- **No hay sincronización inversa.** Si alguien edita el evento directamente en Google Calendar, Orbit no se entera. (Esto está bien si Orbit es la fuente de la verdad — pero hay que ser disciplinado y editar siempre en Orbit.)

---

## 3. El modelo de datos del calendario

Cómo se relacionan las piezas hoy:

```
proyectos_seo  ──< orbit_meetings ──< orbit_meeting_attendees >── users
   │                   │                                          (email, phone, slack_id)
   │                   │
   │                   └── external_video_url  (enlace Google Meet)
   │
   ├── lider_id, kam_id, director_id ──> users
   ├── slack_channel_id, whatsapp_contacto, whatsapp_group_id
   └── reunion_*_dia/hora/temas  ──> alimenta el sistema VIEJO (project_meetings)

notifications_outbox ──> boti-whatsapp-outbox-worker  (WhatsApp)
                    └──> client-requests-attention-runner  (Slack)
meeting_reports  ──> reportes post-reunión (con google_docs_url)
```

**El dato clave:** la tabla `users` es el resolvedor universal de contactos — tiene `email`, `phone` y `slack_id` en un solo lugar. Cualquier automatización (correo, WhatsApp, Slack DM) puede resolver el destinatario desde ahí, sea del equipo o cliente. Y `proyectos_seo` tiene los contactos a nivel proyecto (`slack_channel_id`, `whatsapp_contacto`, `whatsapp_group_id`).

Eso es bueno: la "fontanería" de contactos ya existe. Lo que falta es conectar Orbit a esa fontanería.

---

## 4. Las acciones que quieres — dónde está cada una y qué falta

### 4.1 Agendar una reunión 🟡

**Hoy:** se inserta una fila en `orbit_meetings` (desde el front-end de la app Orbit) y luego, **manualmente**, se llama a `orbit-meeting-notify` con `create_google_meet: true` y `send_email: true`.

**Falta para que sea automático:** un trigger en `orbit_meetings` que, al insertarse una reunión, dispare por sí solo la creación del evento de Google y las notificaciones. Así "agendar" = "insertar la fila", y todo lo demás ocurre solo.

### 4.2 Crear el enlace de Google Meet 🟢

**Hoy:** ya está construido en `orbit-meeting-notify`. Solo falta configurar los 3 secrets de Google Calendar OAuth.

**Falta:** generar el `GOOGLE_CALENDAR_REFRESH_TOKEN` con el scope `calendar.events` y cargarlo en los secrets de Supabase. Es un paso de configuración de una sola vez.

### 4.3 Reagendar (cambiar el horario) 🔴

**Hoy:** no existe. Si cambias `starts_at` en Orbit, el evento de Google Calendar se queda con la hora vieja y los asistentes ven información incorrecta.

**Falta:** extender `orbit-meeting-notify` (o un nuevo edge function) para hacer `PATCH` del evento de Google Calendar usando el `google_calendar_event_id`. **Problema previo:** `orbit_meetings` **no guarda el `google_calendar_event_id`** — solo guarda el `external_video_url`. Hay que agregar esa columna para poder actualizar/borrar el evento después. Sin el ID del evento, Google Calendar es un callejón sin retorno.

### 4.4 Eliminar / cancelar una reunión 🔴

**Hoy:** no existe. Borrar la fila en Orbit deja el evento "fantasma" en Google Calendar.

**Falta:** lo mismo que reagendar — necesita el `google_calendar_event_id` guardado, y una acción `DELETE` contra la API de Google. Recomendación: no borrar filas, usar `status = 'cancelled'` (borrado lógico) y que eso dispare la cancelación en Google + un aviso de "reunión cancelada" a los asistentes.

### 4.5 Agregar al equipo / asistentes 🟡

**Hoy:** la tabla `orbit_meeting_attendees` existe y funciona (rol + RSVP). Pero si agregas a alguien **después** de que el evento de Google ya se creó, ese alguien no queda en la lista de invitados de Google Calendar ni recibe correo.

**Falta:** un trigger en `orbit_meeting_attendees` que, al insertar un asistente, (a) lo agregue al evento de Google si ya existe, y (b) le mande su invitación por correo/WhatsApp/Slack.

### 4.6 Recordatorios automáticos 🟡

**Hoy:** Orbit no tiene recordatorios. El sistema viejo sí, vía `notifications_outbox` + cron.

**Falta:** un cron (cada 10-15 min) que busque reuniones de Orbit próximas (ej. en los próximos 60 / 30 / 15 min) que aún no tengan recordatorio enviado, y encole los avisos en `notifications_outbox`. La buena noticia: el outbox y los workers de WhatsApp y Slack **ya existen y ya los arreglamos** — solo hay que alimentarlos desde Orbit.

### 4.7 Mensajes de Slack 🔴

**Hoy:** no hay nada que conecte Orbit con Slack.

**Falta:** al agendar/reagendar/cancelar una reunión de Orbit, encolar un mensaje en `notifications_outbox` con `target_type = 'slack_channel'` apuntando al `slack_channel_id` del proyecto (o `slack_dm` al líder). Necesita un worker de Slack genérico para el outbox (hoy solo existe el de `client_requests`) — o reusar el patrón del edge function `keyword-reserve-check` que postea directo a Slack.

### 4.8 Email al cliente 🟡

**Hoy:** `orbit-meeting-notify` manda correo, pero solo a los `users` que están como asistentes. Si el cliente no es un `user` con email registrado, no le llega.

**Falta:** decidir de dónde sale el correo del cliente (¿`users`? ¿`cliente_users`? ¿un campo de contacto en `proyectos_seo`?) e incluirlo en la lista de destinatarios. La capacidad de enviar correo ya está — es cuestión de resolver bien el destinatario.

### 4.9 WhatsApp al cliente 🔴

**Hoy:** Orbit no tiene WhatsApp. El worker de WhatsApp lee del outbox, que hoy solo lo llena el sistema viejo.

**Falta:** que las acciones de Orbit encolen filas en `notifications_outbox` con `target_type = 'whatsapp'` (al `whatsapp_contacto` del proyecto o al `phone` del cliente en `users`). El worker `boti-whatsapp-outbox-worker` ya está corregido y listo para procesarlas — solo hay que alimentarlo desde Orbit.

### 4.10 Confirmar asistencia (RSVP) 🟡

**Hoy:** `orbit_meeting_attendees.response` existe (pending/accepted/declined) pero nada lo escribe ni lo lee. Los 8 asistentes actuales están todos en `pending`.

**Falta:** una forma de que la gente responda (botón en el correo, comando de Slack, o link) y que esa respuesta se refleje. Y opcionalmente, recordatorios más insistentes a quien no ha confirmado.

---

## 5. La decisión clave: ¿un sistema o dos?

Esto es lo primero que hay que resolver, porque **todo lo demás depende de ello.**

Hoy hay dos sistemas: `project_meetings` (recurrentes, con recordatorios y WhatsApp, sin Google) y `orbit_meetings` (Orbit, con Google Meet y email, sin recordatorios ni Slack ni WhatsApp). Mantener ambos significa que la "fuente de la verdad" está partida en dos — que es justo el problema que quieres resolver.

**Recomendación: consolidar todo en Orbit (`orbit_meetings`).** Tiene el mejor modelo de datos (timestamps reales, RSVP, status) y ya está pensado como agenda canónica. El plan sería:

1. Llevar la generación de reuniones recurrentes (lo que hace `generate_meeting_reminders` con la config de `proyectos_seo`) a que cree filas en `orbit_meetings` en vez de `project_meetings`.
2. Conectar Orbit al `notifications_outbox` para reusar los workers de WhatsApp y Slack que ya existen y ya arreglamos.
3. Dejar `project_meetings` en solo-lectura / archivado.

Alternativa si prefieres no migrar ahora: mantener los dos pero declarar explícitamente que **Orbit es la verdad para reuniones puntuales** y **`project_meetings` para las recurrentes** — pero esto es más frágil y a la larga genera el mismo problema.

---

## 6. Mapa de oportunidades de automatización (priorizado)

Ordenado por relación impacto/esfuerzo. "Esfuerzo" es aproximado.

| # | Oportunidad | Qué resuelve | Esfuerzo | Depende de |
|---|---|---|---|---|
| 1 | **Configurar los secrets de Google Calendar** | Desbloquea TODO lo de Google Meet que ya está construido | Bajo (config) | Generar el refresh token con scope correcto |
| 2 | **Guardar `google_calendar_event_id` en `orbit_meetings`** | Sin esto, reagendar y eliminar son imposibles | Bajo (1 columna + ajuste al edge function) | — |
| 3 | **Trigger "al agendar"** en `orbit_meetings` | Que insertar la reunión dispare solo: evento Google + correos | Medio | #1, #2 |
| 4 | **Reagendar y cancelar** (PATCH/DELETE a Google) | Cierra el círculo de edición; el calendario deja de mentir | Medio | #2 |
| 5 | **Conectar Orbit al `notifications_outbox`** | Reusa los workers de WhatsApp y Slack ya existentes | Medio | — |
| 6 | **Recordatorios de Orbit por cron** | Avisos automáticos 60/30/15 min antes, por WhatsApp y Slack | Medio | #5 |
| 7 | **Trigger "al agregar asistente"** | Invitación automática al sumar a alguien al equipo de la reunión | Medio | #3, #5 |
| 8 | **Email/WhatsApp al cliente** (resolver destinatario) | El cliente recibe invitación y recordatorio | Bajo-Medio | #5, decidir fuente del contacto |
| 9 | **Worker de Slack genérico para el outbox** | Que cualquier automatización (no solo `client_requests`) pueda postear a Slack | Medio | — |
| 10 | **RSVP funcional** | Botones de confirmar/rechazar y seguimiento de quién no respondió | Medio-Alto | #8 |
| 11 | **Consolidar `project_meetings` → Orbit** | Una sola fuente de la verdad de verdad | Alto | decisión de sección 5 |
| 12 | **Reportes post-reunión** | `meeting_reports` ya existe (con `google_docs_url`) pero está vacío y sin flujo | Medio | — |

**El camino corto al primer resultado visible:** #1 → #2 → #3. Con eso, agendar una reunión en Orbit ya crea automáticamente el evento de Google Meet y manda los correos, sin que nadie tenga que apretar un botón extra. Eso es "el calendario como fuente de la verdad" funcionando de punta a punta para el caso más común.

---

## 7. Qué se necesita antes de automatizar (prerequisitos y decisiones)

**Decisiones tuyas:**

1. **¿Un sistema o dos?** (sección 5). Recomendación: consolidar en Orbit.
2. **¿De dónde sale el contacto del cliente?** Para email/WhatsApp al cliente hay que definir si el cliente vive en `users`, en `cliente_users`, o en un campo de `proyectos_seo`.
3. **¿Qué canales por tipo de evento?** Ej.: agendar → correo + Slack; recordatorio → WhatsApp + Slack; cancelar → correo + WhatsApp. Conviene una matriz simple.
4. **¿Qué calendario de Google se usa?** ¿El `primary` de una cuenta de la agencia, o un calendario compartido dedicado?

**Configuración (una sola vez):**

5. Generar y cargar en Supabase los secrets `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN` (scope `calendar.events`), y opcionalmente `GOOGLE_CALENDAR_ID`.
6. Verificar que `MAILJET_API_KEY` / `MAILJET_SECRET_KEY` siguen válidos (parecen ya configurados).

**Nota de seguridad:** igual que en el diagnóstico anterior, `orbit_meetings`, `orbit_meeting_attendees` y `users` tienen RLS deshabilitado. Antes del lanzamiento conviene incluirlas en el plan de RLS — `users` sobre todo, porque tiene email, teléfono y slack_id de todo el mundo.

---

## 8. Plan sugerido (si decides avanzar)

**Fase 1 — Cerrar el círculo de Google (1-2 días de trabajo técnico)**
Configurar secrets de Google → agregar la columna `google_calendar_event_id` a `orbit_meetings` → ajustar `orbit-meeting-notify` para guardarlo → agregar las acciones de reagendar y cancelar. Resultado: agendar/reagendar/eliminar en Orbit se refleja en Google Calendar.

**Fase 2 — Automatizar las notificaciones (2-3 días)**
Trigger "al agendar" + trigger "al agregar asistente" → conectar Orbit al `notifications_outbox` → worker de Slack genérico → recordatorios por cron. Resultado: todo lo de correo/Slack/WhatsApp ocurre solo.

**Fase 3 — Cliente y RSVP (2-3 días)**
Resolver el contacto del cliente e incluirlo en las notificaciones → RSVP funcional con botones → seguimiento de no-confirmados.

**Fase 4 — Consolidación (según prioridad)**
Migrar las reuniones recurrentes de `project_meetings` a Orbit y archivar el sistema viejo.

---

## 9. Conclusión

No estás empezando de cero — al contrario, lo más difícil (crear eventos de Google Meet desde tu propia app y mandar correos branded) **ya está construido** en `orbit-meeting-notify`. El sistema `orbit_meetings` está bien diseñado para ser la fuente de la verdad.

Lo que falta es **conexión y cierre de círculo**: configurar los secrets de Google, poder reagendar/eliminar (hoy solo se puede crear), y enchufar Orbit a los workers de notificaciones que ya existen y ya quedaron arreglados. La infraestructura de WhatsApp y el outbox ya están sanos tras el trabajo anterior — Orbit solo necesita empezar a usarlos.

La oportunidad más grande, y la decisión que desbloquea todo lo demás, es **declarar Orbit como el único sistema** y consolidar ahí. Mientras haya dos tablas de reuniones, no habrá una sola fuente de la verdad.

---

*Análisis basado en la inspección directa del proyecto Supabase Light_House: tablas `orbit_meetings`, `orbit_meeting_attendees`, `project_meetings`, `meeting_reports`, `project_meeting_recipients`, columnas de `proyectos_seo` y `users`, funciones SQL, triggers y los edge functions `orbit-meeting-notify` y `boti-meeting-generator`.*
