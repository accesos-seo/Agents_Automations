# Seguimiento Escalado de Solicitudes — Especialista → Cliente

**Automation key:** `seguimiento-solicitudes-clientes`
**Versión actual:** 1.1 (operativa con re-alertas en nivel máximo)
**Estado:** `active`
**Activada:** 2026-05-05
**Corrección aplicada:** 2026-05-17 (re-alerta en nivel 3 cada 2 días)
**Owner producto:** _por definir_
**Owner técnico:** _por definir_

Automatización de seguimiento y escalabilidad de las solicitudes que el especialista de posicionamiento web asigna al cliente. Cuando el especialista crea una solicitud (ticket) para que el cliente entregue información, recursos o acción, el sistema verifica diariamente si la solicitud está siendo atendida. Si no hay avance en los plazos definidos, escala en tres niveles hacia el supervisor y la directiva.

> **Nota:** No confundir con el sistema de tickets Hub, donde el cliente hace solicitudes al especialista. Aquí la dirección es inversa: el especialista le pide algo al cliente.

---

## 1. Qué hace

Revisa cada día hábil (lunes a viernes, 2PM UTC / 9AM Bogotá) si hay solicitudes que necesitan atención. Cuando las encuentra, escala la alerta según cuánto tiempo llevan sin resolverse:

| Nivel | Umbral | Destino |
|---|---|---|
| **Nivel 1 — Aviso al especialista** | Día 1 | DM de Slack al especialista asignado (si no tiene Slack ID, va al canal de respaldo) |
| **Nivel 2 — Supervisión** | ≥ 3 días | Canal privado de supervisores `C09SN85SGKC` |
| **Nivel 3 — Directiva** | ≥ 7 días | Canal de directiva `C0B1B3V4ZB5` (se repite cada 2 días mientras no se resuelva) |

El sistema categoriza cada solicitud por el tipo de problema que tiene:

- **`overdue`** — fecha de entrega vencida y no está completada ni cancelada
- **`follow_up_due`** — estaba esperando al cliente (`waiting_client`) y el tiempo de follow-up ya venció
- **`stale_internal`** — lleva más de 5 días sin actualizarse y sigue en `pending` o `in_progress`
- **`unassigned`** — sin especialista asignado

Cuando la solicitud se completa, cancela, archiva o se pone en pausa (`snoozed_until`), el sistema la desactiva automáticamente.

---

## 2. Configuración

| Config | Valor |
|---|---|
| Runtime Supabase | `stjugsrkrweakvzmizpq` (`Light_House`) |
| Frecuencia | Lunes a viernes, 14:00 UTC (9:00 AM Bogotá) |
| Canal de respaldo (nivel 1 sin Slack ID) | `C0B1B3V4ZB5` |
| Canal de supervisores (nivel 2) | `C09SN85SGKC` |
| Canal de directiva (nivel 3) | `C0B1B3V4ZB5` |
| Re-alerta nivel 3 | Cada 2 días mientras siga activa |

**Secrets requeridos (en Supabase `Light_House` → Edge Functions → Secrets):**

| Secret | Estado |
|---|---|
| `SLACK_POST_MESSAGE_ENDPOINT` | requerido |
| `SLACK_BOT_TOKEN` o `SLACK_TOKEN` | requerido |
| `CLIENT_REQUESTS_CHECK_SECRET` | requerido — protege el endpoint de la Edge Function |
| `SUPABASE_URL` | automático (Supabase lo inyecta) |
| `SUPABASE_SERVICE_ROLE_KEY` | automático (Supabase lo inyecta) |

---

## 3. Componentes (inventario)

### 3.1 Tablas (en `Light_House`)

| Tabla | Rol |
|---|---|
| `client_requests` | Solicitud principal: `request_name`, `status`, `priority`, `expected_date`, `assigned_to`, `escalation_level`, `snoozed_until`, `waiting_since`, `next_follow_up_at`, `last_attention_notified_at`. |
| `client_request_attention_alerts` | Registro de alertas por solicitud: `alert_level`, `consecutive_days_attention`, `last_alert_level_sent`, `last_notified_at`, `last_evaluated_on`, `slack_channel_id`, `is_active`. |
| `notifications_outbox` | Bandeja de salida para envíos a Slack. Las notificaciones de esta automatización usan `source = 'client_requests_attention'`. |
| `users` | Resuelve `slack_id` del especialista asignado. |
| `business_calendar` | Calendario laboral de la agencia (días hábiles, Bogotá) — referencia; el cron corre L-V. |

### 3.2 Vistas SQL

| Vista | Rol |
|---|---|
| `client_requests_attention` | Filtra solicitudes activas (no archivadas, no completadas/canceladas, no snoozed) y las categoriza por `attention_reason`. Calcula `days_overdue` y `days_waiting`. |

### 3.3 Edge Functions (en `Light_House`)

| Slug | Versión | Rol |
|---|---|---|
| `client-requests-attention-runner` | v38 | Orquestador principal. Llama al procedimiento almacenado, lee las notificaciones pendientes del outbox y las entrega a Slack. Protegido por `x-internal-secret`. |

### 3.4 Funciones SQL

| Función | Rol |
|---|---|
| `run_client_requests_attention_check(p_channel_id)` | Corazón del sistema. Evalúa qué solicitudes necesitan atención, calcula el nivel de alerta, actualiza `client_request_attention_alerts`, y encola notificaciones en `notifications_outbox` agrupadas por nivel y canal. Incluye deduplicación por `dedupe_key`. |

### 3.5 Trabajos programados (`pg_cron`)

| Job ID | Schedule | Destino | Estado |
|---|---|---|---|
| 6 | `0 14 * * 1-5` | `client-requests-attention-runner?channel_id=C0B1B3V4ZB5` | `active: true` |

---

## 4. Estado actual (datos reales 2026-05-17)

| Indicador | Valor |
|---|---|
| Cron activo | 🟢 Sí (`0 14 * * 1-5`, `active: true`) |
| Edge Function activa | 🟢 `client-requests-attention-runner` v38 |
| Alertas activas hoy | 5 solicitudes en nivel 3 (vencidas, `consecutive_days_attention = 10`) |
| Última notificación enviada | 2026-05-05 (5 solicitudes en nivel 3 → directiva) |
| Corrección de re-alerta nivel 3 | ✅ Aplicada 2026-05-17 (próxima notificación: lunes 2026-05-19) |
| Canal de supervisores `C09SN85SGKC` | 🔴 Error conocido — el bot de Slack no tiene acceso (nivel 2 nunca se entregó) |
| `client_requests` totales | 10 solicitudes (7 completadas, 3 pendientes/vencidas) |

---

## 5. Decisiones pendientes del dueño del producto

| Decisión | Opciones | Estado |
|---|---|---|
| Verificar acceso del bot al canal de supervisores | Invitar al bot al canal `C09SN85SGKC` / cambiar el canal de nivel 2 | Pendiente — nivel 2 actualmente no funciona |
| Umbral de días para nivel 2 | 3 días (actual) / 4 días / 5 días | Activo con 3 días |
| Umbral de días para nivel 3 | 7 días (actual) / una semana exacta / 5 días | Activo con 7 días |
| Frecuencia de re-alerta en nivel 3 | 2 días (actual) / diario / 3 días | Activo con 2 días |
| WhatsApp / email como canal adicional | Solo Slack (actual) / Slack + WhatsApp para directiva | Sin implementar |
| Integración con `business_calendar` | Respetar festivos colombianos (hoy el cron corre todos los L-V) | Pendiente |
| Normalizar `escalation_level` en `client_requests` | Campo existe pero siempre es 0 — sincronizarlo con `alert_level` | Pendiente |

---

## 6. Optimizaciones priorizadas

### Urgentes (ya identificadas)
1. **Verificar bot en canal `C09SN85SGKC`** — invitar al bot de Slack al canal de supervisores para que nivel 2 funcione.
2. **Marcar solicitudes completadas como resueltas** — hay 3 solicitudes `pending` vencidas desde hace meses que probablemente ya están resueltas pero sin actualizar el `status`.

### Corto plazo (1-3 días)
3. Integrar `business_calendar` para no alertar en festivos colombianos.
4. Sincronizar `client_requests.escalation_level` con el `alert_level` real de las alertas.

### Medianas (1 semana)
5. Añadir canal de WhatsApp para alertas de nivel 3 (directiva) como canal de respaldo.
6. Modo `dry_run` explícito en el cron (hoy solo disponible vía query param `?test=true`).

---

## 7. Links y referencias

- **Supabase runtime:** proyecto `Light_House` (ref `stjugsrkrweakvzmizpq`)
- **Edge Function:** `client-requests-attention-runner` (v38)
- **Procedimiento almacenado:** `run_client_requests_attention_check()`
- **Vista:** `client_requests_attention`
- **Cron job:** ID 6 (`0 14 * * 1-5`, `active: true`)
- **Arquitectura técnica detallada:** [`arquitectura.md`](arquitectura.md)
- **Runbook operativo:** [`runbook.md`](runbook.md)
- **Inventario exacto de componentes:** [`componentes.md`](componentes.md)

---

## 7.5. Decisiones tomadas

| ID | Fecha | Decisión | Detalle |
|---|---|---|---|
| D-001 | 2026-05-05 | **Activación inicial del sistema** | Cron job ID 6 activado. Edge function `client-requests-attention-runner` operativa. Primera ejecución: 5 solicitudes detectadas en nivel 3, notificación enviada al canal de directiva. El nivel 2 falló por falta de acceso del bot al canal `C09SN85SGKC`. |
| D-002 | 2026-05-17 | **Corrección: re-alerta en nivel 3 cada 2 días** | Bug identificado: una vez que `last_alert_level_sent = 3 = alert_level`, la condición `alert_level > last_alert_level_sent` nunca era verdadera, causando que el sistema dejara de notificar permanentemente. Se agregó condición OR para re-alertar a nivel 3 cuando han pasado ≥2 días desde la última notificación. El sistema operaba en silencio desde el 5-may pese a tener 5 solicitudes críticas activas. |

---

## 8. Bitácora

| Fecha | Evento |
|---|---|
| 2026-05-04 | Primera detección de solicitudes que necesitan atención. Alertas creadas en `client_request_attention_alerts`. |
| 2026-05-05 | Primera ejecución exitosa. Notificación de nivel 3 enviada al canal directivo (`C0B1B3V4ZB5`). Notificación de nivel 2 falló (`C09SN85SGKC` — error de acceso del bot). |
| 2026-05-05–2026-05-15 | Cron ejecutó diariamente (L-V) sin generar notificaciones por el bug de nivel máximo. Alertas actualizaron `consecutive_days_attention` y `last_evaluated_on` correctamente, pero no generaron mensajes nuevos. |
| 2026-05-17 | Auditoría completa de la automatización. Bug de re-alerta identificado y corregido (D-002). Documentación creada en este repositorio. |
