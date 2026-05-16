# Prompts para el front-end (IA) — Calendario y reuniones (Orbit)

**Para:** el compañero que construye el front-end de Orbit con su herramienta de IA (Lovable, Bolt, v0, Cursor, Claude, etc.).
**Idea:** que pueda **copiar y pegar** estos prompts en su herramienta y obtener una interfaz que se conecta correctamente con la base de datos, exactamente como está diseñado el backend.

> Lee primero [`handoff-frontend.md`](handoff-frontend.md) — explica el contexto y el contrato completo. Este archivo son los prompts concretos.

---

## Cómo usar este documento

1. **Empieza siempre con el "Prompt 0 — Contexto maestro".** Pégalo primero (o tenlo como instrucción permanente / archivo de contexto del proyecto).
2. **Luego pega el prompt de la tarea concreta** (Prompt 1, 2, 3...). Cada uno asume que la IA ya tiene el contexto maestro.
3. **Trabaja una tarea a la vez.** Revisa lo que genera la IA antes de seguir.

**Cambio importante respecto a versiones anteriores:** el backend ahora sincroniza con Google **por triggers**. El front-end ya **NO** necesita llamar a ningún Edge Function para agendar, reagendar ni cancelar — solo escribe en las tablas. Es más simple.

---

## Prompt 0 — Contexto maestro

> Pega esto primero. Es la base que la IA necesita para no inventar nombres de tablas ni romper la integración.

```
CONTEXTO DEL PROYECTO — léelo completo antes de hacer cambios.

Estoy construyendo el front-end de "Orbit", la app interna de SeoLab Agency. El backend es Supabase
(proyecto Light_House). El front-end ya usa el cliente @supabase/supabase-js configurado en el proyecto;
NO crees una nueva configuración de Supabase ni pidas credenciales nuevas, usa el cliente existente.

Orbit es el "centro de comando": su calendario debe ser la FUENTE DE LA VERDAD de las reuniones.
Cuando se agenda, reagenda o cancela una reunión en Orbit, el backend sincroniza SOLO con Google
Calendar y manda las invitaciones — lo dispara un trigger de la base de datos. El front-end NO habla
con Google directamente y NO necesita llamar a ningún Edge Function para agendar/reagendar/cancelar:
SOLO escribe (INSERT/UPDATE) en las tablas de Supabase. El backend hace el resto.

MODELO DE DATOS (tablas de Supabase que usa el calendario):

Tabla `orbit_meetings` — una fila por reunión:
  - id (uuid)
  - proyecto_id (uuid)         → FK a proyectos_seo (la marca/cliente)
  - title (text)
  - starts_at (timestamptz)    → fecha y hora de inicio
  - ends_at (timestamptz)      → opcional; si falta, el backend asume +30 min
  - meeting_kind (text)        → default 'custom'
  - agenda (text)              → opcional
  - location_notes (text)      → opcional
  - status (text)              → 'scheduled' (default) | 'cancelled' | 'completed'
  - source (text)              → default 'orbit'
  - created_by (uuid)          → id del usuario que la creó (tabla users)
  - external_video_url (text)  → lo LLENA el backend con el enlace de Google Meet. El front-end NO lo escribe, solo lo muestra.
  - google_calendar_event_id (text) → lo LLENA el backend. El front-end NO lo toca.
  - created_at, updated_at (timestamptz)

Tabla `orbit_meeting_attendees` — una fila por asistente de una reunión:
  - meeting_id (uuid)          → FK a orbit_meetings
  - user_id (uuid)             → FK a users
  - attendee_role (text)       → default 'team'. Valores: 'team' | 'lead' | 'client'
  - response (text)            → default 'pending'. Valores: 'pending' | 'accepted' | 'declined'

Tabla `users` — personas (equipo y clientes). Campos útiles: id, full_name, email, phone, slack_id.
Tabla `proyectos_seo` — proyectos/marcas. Campos útiles: id, nombremarca.

CÓMO REACCIONA EL BACKEND (no tienes que hacer nada de esto, solo entender qué pasa al escribir):
  - INSERT en orbit_meetings              → el backend crea el evento en Google Calendar + Meet y avisa.
  - UPDATE de starts_at/ends_at/title/agenda → el backend actualiza el evento en Google (reagendar).
  - UPDATE de status = 'cancelled'        → el backend borra el evento en Google (cancelar).
Segundos después, el backend escribe external_video_url (y google_calendar_event_id) en esa fila;
tu UI debería poder refrescar para mostrar el enlace de Meet.

EDGE FUNCTION (solo para UN caso especial, ver Prompt 3): `orbit-meeting-notify`
  - Se invoca con supabase.functions.invoke('orbit-meeting-notify', { body: {...} })
  - Úsalo SOLO para "reenviar invitaciones" manualmente. Para agendar/reagendar/cancelar NO se usa.

REGLAS QUE NO DEBES ROMPER:
  1. El front-end nunca escribe en `external_video_url` ni `google_calendar_event_id` — los llena el backend.
  2. El front-end nunca habla con Google, Slack, WhatsApp o correo directamente. Solo Supabase.
  3. Para "borrar" una reunión NO se borra la fila: se pone status = 'cancelled'.
  4. Las fechas se manejan en timestamptz (UTC en la base); muestra al usuario en zona "America/Bogota".
  5. No inventes nombres de tablas ni columnas. Si necesitas un dato que no está aquí, pregúntame.

Confírmame que entendiste este contexto y espera mi siguiente instrucción con la tarea concreta.
```

---

## Prompt 1 — Pantalla de agenda (ver las reuniones)

```
TAREA: Crea (o ajusta) la pantalla de calendario/agenda de Orbit.

Debe:
- Leer de la tabla `orbit_meetings` las reuniones con status distinto de 'cancelled',
  ordenadas por starts_at ascendente.
- Para cada reunión mostrar: title, fecha y hora (formateada en zona America/Bogota),
  el nombre de la marca (join con proyectos_seo via proyecto_id → nombremarca),
  y la lista de asistentes (join con orbit_meeting_attendees → users.full_name).
- Si `external_video_url` tiene valor, mostrar un botón "Unirse a la videollamada" que abre ese enlace.
  Si está vacío, mostrar "Sin enlace de videollamada aún" (el backend lo llena unos segundos después de agendar).
- Mostrar el `status` con un indicador visual.
- Vista en lista agrupada por día. Si tu framework lo permite fácil, ofrece también vista de calendario mensual.
- Permite un filtro aparte para ver las reuniones canceladas.

Esta pantalla es solo de lectura.
```

---

## Prompt 2 — Agendar una reunión

```
TAREA: Crea el formulario "Agendar reunión" de Orbit.

Campos del formulario:
- title (texto, obligatorio)
- proyecto_id (selector que lista proyectos_seo por nombremarca, obligatorio)
- starts_at (fecha + hora, obligatorio) y ends_at (fecha + hora, opcional)
- agenda (texto largo, opcional)
- asistentes: un selector múltiple de usuarios (tabla users, mostrar full_name) con su rol
  (attendee_role: 'team' | 'lead' | 'client')

Al guardar, en este orden:
1. INSERT en `orbit_meetings` con: title, proyecto_id, starts_at, ends_at, agenda,
   created_by = id del usuario actual, status = 'scheduled', source = 'orbit'. Recupera el id generado.
2. INSERT en `orbit_meeting_attendees` una fila por cada asistente seleccionado:
   { meeting_id: <id del paso 1>, user_id, attendee_role, response: 'pending' }.

Y ya está. NO llames a ningún Edge Function: un trigger del backend detecta el INSERT y crea solo
el evento de Google Calendar + Meet y manda los correos.

Después de guardar:
- Muestra éxito y lleva al detalle de la reunión.
- El campo external_video_url estará vacío al inicio; el backend lo llena en unos segundos.
  Ofrece un botón "Actualizar" o haz un refetch a los ~5-10s para mostrar el enlace de Meet cuando aparezca.
```

---

## Prompt 3 — Gestionar asistentes

```
TAREA: En la vista de detalle de una reunión, agrega la gestión de asistentes.

Debe permitir:
- Ver los asistentes actuales (orbit_meeting_attendees de esa meeting_id, join con users para full_name),
  mostrando su attendee_role y su response (pending/accepted/declined) con indicador visual.
- Agregar un asistente: selector de usuario + rol → INSERT en orbit_meeting_attendees
  { meeting_id, user_id, attendee_role, response: 'pending' }.
- Quitar un asistente: DELETE de esa fila de orbit_meeting_attendees.

NOTA: por ahora, al agregar un asistente DESPUÉS de que la reunión ya fue creada, el backend todavía
no lo suma automáticamente al evento de Google ni le manda correo (es el próximo incremento del backend).
Por eso, junto al botón "Agregar asistente", muestra un botón secundario "Reenviar invitaciones" que
invoque el Edge Function orbit-meeting-notify con:
  supabase.functions.invoke('orbit-meeting-notify', {
    body: { meeting_id, create_google_meet: false, send_email: true, caller_id: <id del usuario actual> }
  })
Así el organizador puede reenviar el correo manualmente mientras tanto.
```

---

## Prompt 4 — Reagendar una reunión

```
TAREA: Agrega la acción "Reagendar" en el detalle de una reunión.

- Formulario para editar starts_at y ends_at (y opcionalmente title/agenda).
- Al guardar: UPDATE de la fila en orbit_meetings con los nuevos valores.
- Y ya está. NO llames a ningún Edge Function: un trigger del backend detecta el cambio de
  fecha/hora/título/agenda y actualiza solo el evento en Google Calendar y avisa a los asistentes.
- Muestra confirmación: "Reunión reagendada. Se actualizó en Google Calendar."
- Haz un refetch de la reunión para reflejar los nuevos datos.
```

---

## Prompt 5 — Cancelar una reunión

```
TAREA: Agrega la acción "Cancelar reunión" en el detalle de una reunión.

- Botón "Cancelar reunión" con confirmación.
- Al confirmar: UPDATE de orbit_meetings poniendo status = 'cancelled'. NUNCA borres la fila.
- Y ya está. NO llames a ningún Edge Function: un trigger del backend detecta el cambio de status
  y borra solo el evento en Google Calendar y avisa de la cancelación a los asistentes.
- La reunión cancelada deja de aparecer en la agenda principal (ya filtrada en el Prompt 1),
  pero sigue consultable en el filtro "canceladas".
- Muestra confirmación: "Reunión cancelada. Se eliminó de Google Calendar."
```

---

## Prompt 6 — Mostrar estado de la reunión y RSVP

```
TAREA: En el detalle de la reunión, muestra el estado de la integración y el RSVP.

Mostrar:
- Si external_video_url tiene valor: "✅ Evento de Google Meet creado" + el enlace.
  Si está vacío: "⏳ Pendiente de generar el evento de Google" (con opción de refrescar).
- La lista de asistentes con su `response` (pending/accepted/declined) como indicadores de color.

RSVP:
- Junto a cada asistente, si el usuario actual ES ese asistente, muestra botones "Confirmar" / "Rechazar"
  que hagan UPDATE de orbit_meeting_attendees.response a 'accepted' / 'declined' para esa fila.
- Esto funciona ya (es solo escribir en la tabla).
```

---

## Reglas para el compañero de front-end

Cosas que **no** debes dejar que la IA haga, aunque las proponga:

1. **No crear integraciones directas con Google / Slack / WhatsApp / correo desde el front-end.** Todo eso lo hace el backend.
2. **No escribir en `external_video_url` ni `google_calendar_event_id`** — esos campos los llena el backend.
3. **No borrar filas de `orbit_meetings`** — cancelar = `status = 'cancelled'`.
4. **No llamar Edge Functions para agendar/reagendar/cancelar** — eso lo hacen los triggers solos. El único uso del Edge Function `orbit-meeting-notify` es el botón manual de "reenviar invitaciones" del Prompt 3.
5. **No guardar secrets ni tokens en el código del front-end.**
6. **No inventar nombres de tablas o columnas.** Si la IA propone una columna que no está en el Prompt 0, está adivinando — corrígela.
7. **Una tarea a la vez.**

---

## Checklist de coordinación con el backend

- [ ] El cliente de Supabase del front-end puede leer/escribir `orbit_meetings` y `orbit_meeting_attendees`.
- [ ] Se acordó cómo se identifica al usuario actual (sesión de Supabase Auth, o id de `users`).
- [ ] El backend confirmó que el trigger `trg_orbit_meeting_sync` está activo (lo está desde el 15-may-2026).
- [ ] Para la prueba final de punta a punta (que el evento aparezca en Google): coordinar con el backend, porque depende de que el `GOOGLE_CALENDAR_REFRESH_TOKEN` ya tenga el scope correcto.

---

*Este documento se actualiza cuando cambie el contrato del backend. Si algo aquí no coincide con la realidad, gana el código del backend — repórtalo para corregir este archivo.*
