# Ticket Hub — Escalamiento de Solicitudes de Clientes

**Automation key:** `ticket-hub`
**Versión actual:** 1.0 (infraestructura lista; pendiente de activación)
**Estado:** `infrastructure_ready` / `pending_activation`
**Construida:** 2026-05-17
**Última revisión:** 2026-05-17
**Owner producto:** _por definir_
**Owner técnico:** _por definir_

Sistema de seguimiento y escalamiento automático de tickets que los **clientes abren al equipo especialista**. Cuando un ticket no recibe primera respuesta dentro del plazo esperado, el sistema escala progresivamente: primero avisa al especialista asignado, luego al canal del equipo, y finalmente a la directiva — sin intervención manual.

> **Dirección del flujo:** Cliente → Especialista (tabla `tickets`)
> No confundir con `seguimiento-solicitudes-clientes`, donde el flujo es inverso: Especialista → Cliente (tabla `client_requests`).

---

## 1. Qué hace

Evalúa cada día hábil (lunes a viernes, 9 AM Bogotá) si hay tickets sin primera respuesta o estancados. Cuando los encuentra, escala en tres niveles:

| Nivel | Cuándo | Destinatario | Canal |
|-------|--------|--------------|-------|
| **1 — Especialista** | Día 1 (ticket sin respuesta) | Especialista asignado al ticket | DM Slack |
| **2 — Supervisión** | Día 3 (+2 días hábiles) | Canal del equipo del proyecto | Canal Slack del proyecto |
| **3 — Directiva** | Día 5 (+2 días más) | Director del proyecto | DM Slack al director |
| **3 — Re-alerta** | Cada 2 días en nivel 3 | Director del proyecto | DM repetido |

> Misma cadencia que `vigilancia-stock-palabras-clave`: Día 1 → Nivel 1, +2d → Nivel 2, +2d → Nivel 3.

**Razones de atención que activan el escalamiento:**

| Razón | Condición |
|-------|-----------|
| `no_first_response` | Ticket activo sin `first_response_at` registrado |
| `stale_in_progress` | Ticket en `En Progreso` o `Notificado` sin actualizar por +3 días |
| `unassigned` | Ticket activo sin `assignee_id` asignado |

**El sistema se desactiva automáticamente** cuando el ticket pasa a `Cerrado` o `Cancelado`.

---

## 2. Configuración

| Config | Valor |
|--------|-------|
| Runtime Supabase | `stjugsrkrweakvzmizpq` (`Light_House`) |
| Frecuencia | Lunes a viernes, 14:00 UTC (9:00 AM Bogotá) — **PENDIENTE activación** |
| Canal supervisores (nivel 2) | Canal `slack_channel_id` del proyecto, o `C09SN85SGKC` como fallback |
| Canal directiva (nivel 3) | DM al `director_id` del proyecto, o `C0B1B3V4ZB5` como fallback |
| Re-alerta nivel 3 | Cada 2 días mientras el ticket siga abierto |
| Filtro días hábiles | Integrado — consulta `business_calendar` antes de ejecutar |

**Secrets requeridos (Supabase → Edge Functions → Secrets):**

| Secret | Estado |
|--------|--------|
| `TICKET_HUB_CHECK_SECRET` | Pendiente — crear para proteger el endpoint |
| `SLACK_BOT_TOKEN` | Existente (compartido con otros sistemas) |
| `SLACK_POST_MESSAGE_ENDPOINT` | Existente |

---

## 3. Componentes (inventario)

### 3.1 Tablas

| Tabla | Rol | Estado |
|-------|-----|--------|
| `tickets` | Fuente de verdad. Columnas clave: `status`, `assignee_id`, `first_response_at`, `priority`, `language`, `proyecto_id` | 🟢 |
| `ticket_hub_alerts` | Estado de escalamiento por ticket (1:1). Columnas: `alert_level`, `consecutive_days_attention`, `last_alert_level_sent`, `last_notified_at`, `last_evaluated_on`, `is_active` | 🟢 creada 2026-05-17 |
| `notifications_outbox` | Cola de salida. `source = 'ticket_hub_attention'` | 🟢 |
| `users` | Resuelve `slack_id` del `assignee_id` para DM de nivel 1 y `director_id` para nivel 3 | 🟢 |
| `proyectos_seo` | Provee `slack_channel_id` y `director_id` por proyecto | 🟢 |
| `business_calendar` | Calendario laboral Bogotá — integrado al motor desde el inicio | 🟢 |

### 3.2 Vista SQL

| Vista | Rol | Estado |
|-------|-----|--------|
| `v_ticket_hub_attention` | Filtra tickets activos y los categoriza por `attention_reason`. Calcula `hours_since_created` y `days_since_update`. | 🟢 creada 2026-05-17 |

### 3.3 Función SQL

| Función | Rol | Estado |
|---------|-----|--------|
| `fn_check_ticket_hub_attention(p_supervisors_channel_id, p_directors_channel_id)` | Motor principal. Evalúa `v_ticket_hub_attention`, calcula nivel, hace UPSERT en `ticket_hub_alerts`, encola en `notifications_outbox`. | 🟢 creada 2026-05-17 — INACTIVA |

### 3.4 Edge Function (pendiente de construir)

| Slug | Rol | Estado |
|------|-----|--------|
| `ticket-hub-attention-runner` | Orquestador: llama a `fn_check_ticket_hub_attention()`, lee el outbox y entrega mensajes a Slack. | ⚪ Pendiente construcción |

### 3.5 Cron Job (pendiente de activar)

| Schedule | Comando | Estado |
|----------|---------|--------|
| `0 14 * * 1-5` (L-V 9AM Bogotá) | POST a `ticket-hub-attention-runner` | ⚪ Pendiente — no activar hasta que el equipo esté listo |

### 3.6 N8n (pendiente de revisar/construir)

| Workflow | Rol | Estado |
|----------|-----|--------|
| Worker de outbox Slack — Ticket Hub | Lee `notifications_outbox WHERE source='ticket_hub_attention'` y entrega los mensajes a Slack | ⚪ Pendiente |
| Acuse de recibo automático al cliente | Al recibir nuevo ticket: responde al cliente confirmando recepción (solo días hábiles) | ⚪ Pendiente |

---

## 4. Flujo end-to-end

```
pg_cron (L-V 14:00 UTC) → POST a ticket-hub-attention-runner
                              Header: x-internal-secret = TICKET_HUB_CHECK_SECRET
  ↓
Edge Function: ticket-hub-attention-runner
  1. Verifica día hábil (business_calendar)
  2. Llama a fn_check_ticket_hub_attention()
  3. Lee notifications_outbox WHERE source='ticket_hub_attention' AND status='pending'
  4. Para cada notificación: construye mensaje Slack y POST
  5. PATCH notifications_outbox → status='processed' o 'error'
  ↓
fn_check_ticket_hub_attention()
  A. Verifica que hoy sea día hábil — si no, retorna early
  B. Desactiva alertas de tickets cerrados/cancelados
  C. LOOP por cada ticket en v_ticket_hub_attention WHERE attention_reason <> 'ok':
       · Incrementa consecutive_days_attention
       · alert_level: ≥5d → 3 | ≥3d → 2 | resto → 1
       · Calcula destino (DM o canal según nivel y datos del proyecto)
       · UPSERT en ticket_hub_alerts
       · Condición: alert_level > last_alert_level_sent
                    OR (level=3 AND last_notified_at < now()-2d)
       · INSERT en notifications_outbox (con dedupe_key anti-duplicados)
```

---

## 5. Mensajes de Slack por nivel

**Nivel 1 — DM al especialista:**
```
⚠️ *TICKET SIN RESPUESTA — {TKT-XXXXX}*

Hola, hay un ticket que lleva {N} día(s) sin primera respuesta.

📋 *Asunto:* {ticket_subject}
🔴 *Prioridad:* {priority}
⏰ *Creado hace:* {hours_since_created} horas

Por favor responde al cliente lo antes posible.

_Si no hay respuesta en 48h, se notificará al equipo supervisor._
```

**Nivel 2 — Canal del equipo:**
```
🚨 *ALERTA EQUIPO — TICKET SIN ATENCIÓN — {TKT-XXXXX}*

El especialista fue avisado hace 48h y el ticket sigue sin primera respuesta.

📋 *Asunto:* {ticket_subject}
🔴 *Prioridad:* {priority}
📅 *Lleva:* {consecutive_days} días hábiles sin respuesta

Equipo: coordinen para resolver esto hoy. En 48h se escala a directiva.
```

**Nivel 3 — DM a directiva:**
```
🔴 *ALERTA DIRECTIVA — TICKET CRÍTICO — {TKT-XXXXX}*

Este ticket lleva más de 4 días hábiles sin respuesta al cliente. Intervención requerida.

📋 *Asunto:* {ticket_subject}
🔴 *Prioridad:* {priority}
📅 *Días sin respuesta:* {consecutive_days}

Se notificó al especialista y al equipo sin resolución.
Requiere atención inmediata.
```

---

## 6. Estado actual (2026-05-17)

| Indicador | Valor |
|-----------|-------|
| `ticket_hub_alerts` | 🟢 Tabla creada |
| `v_ticket_hub_attention` | 🟢 Vista activa |
| `fn_check_ticket_hub_attention` | 🟢 Función activa — sin cron |
| Edge Function `ticket-hub-attention-runner` | ⚪ Pendiente construcción |
| Cron job | ⚪ No programado — sistema INACTIVO |
| Outbox | 🟢 Limpio (0 pendientes/fallidos) |
| Crons rotos eliminados | ✅ `smart-report-sync-educa/all-monthly` eliminados |
| Tickets activos abiertos | 14 (7 `En Progreso`, 7 `Notificado`) |
| `trigger_update_ticket_on_response` | ✅ Corregido — maneja `Notificado → En Progreso` |
| Double trigger `request_messages` | ✅ Corregido — filtros por `ticket_id`/`request_id` |

---

## 7. Decisiones pendientes del dueño del producto

| Decisión | Opciones | Estado |
|----------|----------|--------|
| Fecha de activación | Cuándo activar el cron y entrenar al equipo | Pendiente |
| Construir Edge Function `ticket-hub-attention-runner` | Igual que `client-requests-attention-runner` | Pendiente |
| Acuse de recibo automático al cliente (fuera de horario) | Mensaje automático cuando llega ticket en fin de semana | Pendiente |
| Canal supervisores nivel 2 | ¿`slack_channel_id` del proyecto o canal global `C09SN85SGKC`? | Pendiente — bot sin acceso a `C09SN85SGKC` |
| Invitar bot al canal `C09SN85SGKC` | Acción en Slack: `/invite @<bot>` | Pendiente — bloquea nivel 2 |
| `TICKET_HUB_CHECK_SECRET` | Crear secret en Supabase Edge Functions | Pendiente |
| Asignación automática de tickets sin `assignee_id` | Round-robin en N8n al recibir nuevo ticket | Pendiente |
| AI análisis al crear ticket | Poblar `ai_suggested_response`, `ai_calculated_priority` | Pendiente |

---

## 8. Decisiones tomadas

| ID | Fecha | Decisión | Detalle |
|----|-------|----------|---------|
| D-001 | 2026-05-17 | **Infraestructura base construida** | `ticket_hub_alerts`, `v_ticket_hub_attention`, `fn_check_ticket_hub_attention()` creados. Sistema INACTIVO sin cron. |
| D-002 | 2026-05-17 | **Modelo de escalamiento = vigilancia-stock-palabras-clave** | Mismos tiempos (Día 1/3/5) y grupos (especialista DM / equipo canal / director DM). |
| D-003 | 2026-05-17 | **Limpieza completa del outbox** | 3 notificaciones fallidas/en error canceladas. Outbox en 0 pendientes. |
| D-004 | 2026-05-17 | **Crons rotos desactivados** | `smart-report-sync-educa-monthly` y `smart-report-sync-all-monthly` eliminados (tenían placeholders `<PROJECT_REF>` sin reemplazar). |
| D-005 | 2026-05-17 | **Máquina de estados corregida** | `trigger_update_ticket_on_response` ahora maneja `Notificado → En Progreso` además de `Abierto → En Progreso`. |
| D-006 | 2026-05-17 | **Double trigger corregido** | Triggers de `request_messages` ahora filtran por `ticket_id IS NOT NULL` o `request_id IS NOT NULL` según corresponda. |

---

## 9. Bitácora

| Fecha | Evento |
|-------|--------|
| 2026-05-17 | Auditoría completa. 12 gaps identificados. Infraestructura base construida. Outbox limpiado. Crons rotos eliminados. Bugs SQL corregidos. Sistema en modo INACTIVO esperando activación formal. |
