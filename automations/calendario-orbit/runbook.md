# Runbook — Calendario y reuniones (Orbit)

Cómo **operar** esta automatización en el día a día: probar, monitorear, resolver problemas. Para entender qué es, ver [`README.md`](README.md); para el detalle técnico, [`arquitectura.md`](arquitectura.md).

---

## Probar sin riesgo

Antes de cualquier prueba real, recuerda que casi todo tiene modo seguro:

- **`orbit-meeting-notify`** — llamarlo con `send_email: false` prueba solo la creación del evento de Google, sin mandar correos.
- **`boti-whatsapp-outbox-worker`** — corre en `dry_run` por defecto (no envía WhatsApp real) salvo que el secret `BOTI_ALLOW_REAL_WHATSAPP_SENDS` esté en `true`.

### Probar la creación de un evento de Google

1. Tener (o crear) una reunión de prueba en `orbit_meetings`.
2. Invocar `orbit-meeting-notify` con el cuerpo:
   ```json
   { "meeting_id": "<id-de-la-reunion>", "create_google_meet": true, "send_email": false }
   ```
3. **Éxito si:** la respuesta trae `meet_link`, y `orbit_meetings.external_video_url` queda con un enlace `https://meet.google.com/...`. El evento debe aparecer en el Google Calendar de la cuenta.
4. **Si falla:** la respuesta trae un campo `warnings` que dice exactamente qué pasó.

---

## Monitorear

| Qué revisar | Cómo | Qué esperar |
|---|---|---|
| ¿Se crean los eventos de Google? | Tras agendar, mirar `orbit_meetings.external_video_url` | Debe llenarse con un enlace de Meet |
| ¿El outbox está sano? | `SELECT status, count(*) FROM notifications_outbox GROUP BY status` | 0 filas en `processing` por más de ~15 min |
| ¿El reaper corre? | `SELECT * FROM cron.job WHERE jobname = 'outbox-stuck-reaper'` | `active = true`, cada 10 min |
| ¿Hay errores de envío? | `SELECT id, source, error FROM notifications_outbox WHERE status = 'failed'` | Idealmente vacío; revisar `error` si hay filas |

---

## Procedimientos

### Agendar una reunión (flujo actual)

1. Se inserta la reunión en `orbit_meetings` y sus asistentes en `orbit_meeting_attendees` (lo hace la app Orbit).
2. La app llama a `orbit-meeting-notify` con `create_google_meet: true`, `send_email: true`.
3. Verificar que `external_video_url` se llenó y que la respuesta no trae `warnings`.

### Reagendar / cancelar

🟢 **Soportado (Fase 1).** El trigger `trg_orbit_meeting_sync` lo sincroniza solo:
- **Reagendar:** `UPDATE orbit_meetings SET starts_at = ... WHERE id = ...` → `orbit-meeting-sync` hace PATCH del evento de Google.
- **Cancelar:** `UPDATE orbit_meetings SET status = 'cancelled' WHERE id = ...` → `orbit-meeting-sync` hace DELETE del evento de Google.

Funciona de punta a punta **una vez que el `GOOGLE_CALENDAR_REFRESH_TOKEN` tenga el scope `calendar.events`** (ver Errores comunes). Mientras tanto el trigger se dispara pero Google rechaza la operación con un `warning`; nada se rompe.

### Recuperar el outbox si algo se atasca

El reaper (`outbox-stuck-reaper`, cada 10 min) lo hace solo. Para forzarlo manualmente:
```sql
SELECT * FROM public.reset_stuck_outbox_notifications();
```
Devuelve cuántas filas devolvió a `pending` (`requeued`) y cuántas marcó `failed`.

### Pausar la automatización

- Para que **no se creen eventos de Google:** quitar (o invalidar) los secrets `GOOGLE_CALENDAR_*`. El edge function degrada con un `warning`, no rompe.
- Para que **no se envíen WhatsApp reales:** poner `BOTI_ALLOW_REAL_WHATSAPP_SENDS` en `false` (o quitarlo).
- Para **detener un cron:** `SELECT cron.unschedule('<nombre-del-job>');`

---

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `warnings: "Meet no creado: configura GOOGLE_CALENDAR_..."` | Faltan los secrets de Google o el nombre está mal escrito | Seguir [`configuracion/guia-google-calendar-api.md`](configuracion/guia-google-calendar-api.md); revisar nombres exactos |
| El refresh token de Google muere a los ~7 días | La pantalla de consentimiento OAuth quedó en "Testing" | Ponerla en "Internal" o "In production" y regenerar el token |
| `redirect_uri_mismatch` al generar el token | Falta la URI de redirección en la credencial OAuth | Agregar `https://developers.google.com/oauthplayground` |
| El correo no le llega al cliente | El cliente no está en `users` con correo válido | Pendiente de diseño: definir de dónde sale el contacto del cliente |
| Filas atascadas en `processing` | Un worker las tomó y no las soltó | El reaper las recupera en ≤10 min; o ejecutar `reset_stuck_outbox_notifications()` |
| Cambié la hora en Orbit y Google no se actualizó | No existe la sincronización de reagendar | Esperado hoy — ver Fase 1 en `arquitectura.md` |

---

## A quién escalar

- **Backend / base de datos / edge functions:** el responsable del backend de automatizaciones.
- **Front-end de Orbit:** el compañero a cargo del front-end (ver [`prompts-frontend-ia.md`](prompts-frontend-ia.md) para los ajustes de front-end).
- **Credenciales de Google / Mailjet:** quien tenga acceso a Google Cloud Console y a los secrets de Supabase.

---

*Mantener este runbook al día cada vez que cambie la operación.*
