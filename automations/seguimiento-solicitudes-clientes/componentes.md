# Inventario de componentes — Seguimiento Escalado de Solicitudes

Lista exacta de todo lo que compone esta automatización en Supabase (`Light_House`). Sirve para **trazabilidad**: si tocas algo, está aquí.

Estado: 🟢 OK · 🟡 Parcial / atención · 🔴 Bloqueado / falta · ⚪ Planeado

---

## Tablas

| Tabla | Rol | Estado |
|---|---|---|
| `client_requests` | Solicitud principal. Columnas clave: `status`, `expected_date`, `assigned_to`, `waiting_since`, `next_follow_up_at`, `snoozed_until`, `last_attention_notified_at`, `escalation_level` | 🟢 |
| `client_request_attention_alerts` | Registro de alerta por solicitud (1:1). Columnas: `alert_level`, `consecutive_days_attention`, `last_alert_level_sent`, `last_notified_at`, `last_evaluated_on`, `slack_channel_id`, `is_active`, `resolved_at` | 🟢 |
| `notifications_outbox` | Bandeja de salida. `source = 'client_requests_attention'`, `type = 'client_requests_attention'` | 🟢 |
| `users` | Resuelve `slack_id` del especialista asignado para DM de nivel 1 | 🟢 |
| `business_calendar` | Calendario laboral Bogotá — no integrado aún en la lógica del SP | 🟡 sin uso en este flujo |

---

## Vistas SQL

| Vista | Rol | Estado |
|---|---|---|
| `client_requests_attention` | Filtro + categorización. Calcula `attention_reason`, `days_overdue`, `days_waiting` | 🟢 |

---

## Edge Functions

| Slug | Versión | `verify_jwt` | Estado |
|---|---|---|---|
| `client-requests-attention-runner` | v38 | `false` | 🟢 activa |

> `verify_jwt: false` es intencional — el cron de PostgreSQL no puede enviar JWT. La protección se hace mediante el header `x-internal-secret` con el valor del secret `CLIENT_REQUESTS_CHECK_SECRET`.

---

## Funciones SQL

| Función | Firma | Estado |
|---|---|---|
| `run_client_requests_attention_check` | `(p_channel_id text DEFAULT 'C0B1B3V4ZB5') RETURNS jsonb` | 🟢 corregida (D-002, 17-may-2026) |

---

## Trabajos programados (`pg_cron`)

| Job ID | Schedule | Comando | Estado |
|---|---|---|---|
| 6 | `0 14 * * 1-5` | `net.http_post` a `client-requests-attention-runner` | 🟢 `active: true` |

---

## Secrets requeridos

Se cargan en Supabase → Edge Functions → Secrets. **Nunca** en este repo.

| Secret | Para qué | Estado |
|---|---|---|
| `CLIENT_REQUESTS_CHECK_SECRET` | Autenticación del endpoint (`x-internal-secret`) | Configurado |
| `SLACK_POST_MESSAGE_ENDPOINT` | URL de la API de Slack | Requerido |
| `SLACK_BOT_TOKEN` (o `SLACK_TOKEN`) | Bearer token del bot de Slack | Requerido |
| `SUPABASE_URL` | URL del proyecto | Automático |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio | Automático |

---

## Canales de Slack

| Canal ID | Nivel | Propósito | Estado |
|---|---|---|---|
| DM `U...` del especialista | Nivel 1 | Aviso directo al responsable | 🟢 funciona si `users.slack_id` está poblado |
| `C0B1B3V4ZB5` | Nivel 1 (fallback) y Nivel 3 | Canal directivo / respaldo | 🟢 |
| `C09SN85SGKC` | Nivel 2 | Canal privado de supervisores | 🔴 bot sin acceso |

---

## Historial de versiones relevante

| Fecha | Componente | Cambio |
|---|---|---|
| 2026-05-04 | EF v1–v37 | Construcción inicial |
| 2026-05-05 | EF v38 | Versión estable. Primera ejecución exitosa |
| 2026-05-17 | SP `run_client_requests_attention_check` | D-002: re-alerta en nivel 3 cada 2 días |

---

*Última revisión del inventario: 17 de mayo de 2026.*
