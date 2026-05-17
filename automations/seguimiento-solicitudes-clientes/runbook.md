# Runbook — Seguimiento Escalado de Solicitudes

Cómo **operar** esta automatización: probar, monitorear y resolver problemas. Para entender qué hace, ver [`README.md`](README.md); para el detalle técnico, [`arquitectura.md`](arquitectura.md).

---

## Probar sin riesgo

La Edge Function tiene un modo de prueba que evalúa las solicitudes y construye los payloads de Slack **sin enviarlos**:

```bash
curl "https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/client-requests-attention-runner?test=true&channel_id=C0B1B3V4ZB5" \
  -H "x-internal-secret: <CLIENT_REQUESTS_CHECK_SECRET>"
```

La respuesta muestra `"status": "test"` en cada fila y el payload de Slack que se habría enviado.

---

## Monitorear

| Qué revisar | Cómo | Qué esperar |
|---|---|---|
| ¿El cron está activo? | `SELECT jobid, schedule, active FROM cron.job WHERE jobid = 6` | `active = true`, schedule `0 14 * * 1-5` |
| ¿Hay notificaciones pendientes? | `SELECT status, count(*) FROM notifications_outbox WHERE source = 'client_requests_attention' GROUP BY status` | `processed` en su mayoría; 0 filas `pending` después de 2PM UTC los días hábiles |
| ¿Cuántas alertas activas? | `SELECT alert_level, count(*) FROM client_request_attention_alerts WHERE is_active = true GROUP BY alert_level` | Número de solicitudes en atención por nivel |
| ¿Cuándo se notificó por última vez? | `SELECT client_request_id, last_notified_at, alert_level, consecutive_days_attention FROM client_request_attention_alerts WHERE is_active = true ORDER BY last_notified_at DESC` | `last_notified_at` no debe ser > 2 días para nivel 3 |
| ¿Hay errores de Slack? | `SELECT id, target_id, error FROM notifications_outbox WHERE source = 'client_requests_attention' AND status = 'error'` | 0 filas; si hay, revisar el campo `error` |
| ¿Qué solicitudes requieren atención? | `SELECT id, request_name, attention_reason, days_overdue, days_waiting FROM client_requests_attention WHERE attention_reason <> 'ok'` | Lista de solicitudes activas con categoría |

---

## Procedimientos

### Forzar ejecución manual

```bash
curl -X POST \
  "https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/client-requests-attention-runner?channel_id=C0B1B3V4ZB5" \
  -H "x-internal-secret: <CLIENT_REQUESTS_CHECK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"source": "manual"}'
```

### Pausar el cron

```sql
-- Pausar:
UPDATE cron.job SET active = false WHERE jobid = 6;

-- Reactivar:
UPDATE cron.job SET active = true WHERE jobid = 6;
```

### Cerrar una solicitud manualmente

Si una solicitud se resolvió externamente pero el sistema sigue mostrándola como activa:

```sql
-- 1. Marcar como completada:
UPDATE client_requests SET status = 'completed', completed_at = now() WHERE id = '<uuid>';

-- La próxima ejecución del cron la desactivará automáticamente.
-- Para desactivarla de inmediato:
UPDATE client_request_attention_alerts
SET is_active = false, resolved_at = now(), alert_level = 0
WHERE client_request_id = '<uuid>';
```

### Poner en pausa una solicitud sin cerrarla

```sql
UPDATE client_requests
SET snoozed_until = now() + interval '7 days'
WHERE id = '<uuid>';
```

### Corregir el canal de supervisores `C09SN85SGKC` (nivel 2)

1. Identificar el nombre del bot en el workspace de Slack.
2. En el canal `C09SN85SGKC`, ejecutar `/invite @<nombre-del-bot>`.
3. Verificar sin envío real: `?test=true` y confirmar que la fila de nivel 2 no muestra error.
4. Si el canal fue archivado o no existe, actualizar `v_private_channel_id` en la función `run_client_requests_attention_check` y registrar la decisión en el README.

---

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `Missing CLIENT_REQUESTS_CHECK_SECRET` | Secret no cargado en Supabase | Cargarlo en Supabase → Edge Functions → Secrets |
| `Unauthorized` (401) | El cron envía el secret incorrecto | Verificar que el valor en el cron coincida con el secret |
| `Missing SLACK_BOT_TOKEN` | Falta el token del bot | Cargarlo en secrets |
| Error al enviar al canal de supervisores | Bot sin acceso a `C09SN85SGKC` | Invitar el bot al canal (ver procedimiento arriba) |
| El cron no genera notificaciones con alertas activas | `last_alert_level_sent = alert_level` sin re-alerta | Verificar que el SP tiene la corrección D-002 |
| `consecutive_days_attention` no crece | El cron no está activo | `SELECT active FROM cron.job WHERE jobid = 6` |
| Notificaciones duplicadas en Slack | `dedupe_key` no funciona | Revisar la cláusula `WHERE NOT EXISTS` en el SP |

---

## A quién escalar

- **Backend / base de datos / SP:** responsable del backend de automatizaciones.
- **Edge Function / secrets:** quien tenga acceso al panel de Supabase.
- **Configuración de Slack (bot, canales):** quien administre el workspace de Slack.

---

*Mantener este runbook al día cada vez que cambie la operación.*
