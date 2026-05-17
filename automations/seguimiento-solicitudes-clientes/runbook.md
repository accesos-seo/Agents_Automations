# Runbook — Seguimiento Escalado de Solicitudes

Cómo **operar** esta automatización: probar, monitorear y resolver problemas. Para entender qué hace, ver [`README.md`](README.md); para el detalle técnico, [`arquitectura.md`](arquitectura.md).

---

## Probar sin riesgo

La Edge Function tiene un modo de prueba que evalúa las solicitudes y construye los payloads de Slack **sin enviarlos**:

```bash
curl "https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/client-requests-attention-runner?test=true&channel_id=C0B1B3V4ZB5" \
  -H "x-internal-secret: <CLIENT_REQUESTS_CHECK_SECRET>"
```

---

## Monitorear

| Qué revisar | Cómo | Qué esperar |
|---|---|---|
| ¿El cron está activo? | `SELECT jobid, schedule, active FROM cron.job WHERE jobid = 6` | `active = true` |
| ¿Hay notificaciones pendientes? | `SELECT status, count(*) FROM notifications_outbox WHERE source = 'client_requests_attention' GROUP BY status` | `0 pending` después de 2PM UTC en días hábiles |
| ¿Cuántas alertas activas? | `SELECT alert_level, count(*) FROM client_request_attention_alerts WHERE is_active = true GROUP BY alert_level` | Número por nivel |
| ¿Cuándo se notificó por última vez? | `SELECT client_request_id, last_notified_at, alert_level, consecutive_days_attention FROM client_request_attention_alerts WHERE is_active = true ORDER BY last_notified_at DESC` | `last_notified_at` no debe ser > 2d para nivel 3 |
| ¿Hay errores de Slack? | `SELECT id, target_id, error FROM notifications_outbox WHERE source = 'client_requests_attention' AND status = 'error'` | 0 filas |
| ¿Qué solicitudes requieren atención? | `SELECT id, request_name, attention_reason, days_overdue FROM client_requests_attention WHERE attention_reason <> 'ok'` | Lista activa |

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
UPDATE cron.job SET active = false WHERE jobid = 6;  -- pausar
UPDATE cron.job SET active = true  WHERE jobid = 6;  -- reactivar
```

### Cerrar una solicitud manualmente

```sql
UPDATE client_requests SET status = 'completed', completed_at = now() WHERE id = '<uuid>';
-- La próxima ejecución del cron la desactiva. Para hacerlo de inmediato:
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

1. En Slack: `/invite @<nombre-del-bot>` dentro del canal `C09SN85SGKC`.
2. Verificar con `?test=true` que la fila de nivel 2 ya no muestra error.
3. Si el canal fue archivado, actualizar `v_private_channel_id` en `run_client_requests_attention_check` y registrar la decisión en el README.

---

## Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `Missing CLIENT_REQUESTS_CHECK_SECRET` | Secret no cargado | Cargarlo en Supabase → Edge Functions → Secrets |
| `Unauthorized` (401) | Secret del cron incorrecto | Verificar que el valor del cron coincide con el secret |
| `Missing SLACK_BOT_TOKEN` | Falta el token | Cargarlo en secrets |
| Error al canal de supervisores | Bot sin acceso a `C09SN85SGKC` | Invitar bot al canal |
| No genera notificaciones con alertas activas | Bug de nivel máximo (pre-D-002) | Verificar que el SP tiene la cláusula OR para nivel 3 |
| `consecutive_days_attention` no crece | Cron no activo | `SELECT active FROM cron.job WHERE jobid = 6` |
| Notificaciones duplicadas | `dedupe_key` no funciona | Revisar `WHERE NOT EXISTS` en el SP |

---

## A quién escalar

- **Backend / SP / DB:** responsable del backend de automatizaciones.
- **Secrets / Edge Function:** quien tenga acceso al panel de Supabase.
- **Configuración Slack:** quien administre el workspace.

---

*Mantener este runbook al día cada vez que cambie la operación.*
