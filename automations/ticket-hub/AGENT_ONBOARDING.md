# Onboarding — Ticket Hub

> Lee esto antes de tocar cualquier cosa. Reemplaza la necesidad de revisar la conversación anterior.
> Tiempo de lectura: 5 minutos.

---

## 1. Identidad del proyecto

| | |
|---|---|
| **Nombre** | Ticket Hub — Escalamiento de Solicitudes de Clientes |
| **automation_key** | `ticket-hub` |
| **Versión** | 1.0 (infraestructura lista; pendiente activación) |
| **Estado** | `infrastructure_ready` / `pending_activation` |
| **Construida** | 2026-05-17 |
| **Owner producto** | _por definir_ |
| **Owner técnico** | _por definir_ |

**Qué hace:** monitorea diariamente los tickets que los clientes abren al equipo. Cuando un ticket no recibe primera respuesta o está estancado, escala automáticamente en 3 niveles: DM al especialista → canal del equipo → DM a directiva. El sistema está construido y verificado — está **INACTIVO** hasta que el equipo esté entrenado y listo.

> **Dirección del flujo:** Cliente → Especialista. Para el flujo inverso (Especialista → Cliente), ver `seguimiento-solicitudes-clientes`.

---

## 2. Dónde vive cada cosa

### En Supabase (`Light_House` — `stjugsrkrweakvzmizpq`)

| Objeto | Tipo | Rol |
|--------|------|-----|
| `tickets` | Tabla | Fuente de verdad de tickets del Hub |
| `ticket_hub_alerts` | Tabla | Estado de escalamiento por ticket (1:1 con tickets) |
| `v_ticket_hub_attention` | Vista | Filtra tickets activos, calcula `attention_reason`, `hours_since_created`, `days_since_update` |
| `fn_check_ticket_hub_attention()` | Función SQL | Motor principal de escalamiento. INACTIVO — sin cron programado |
| `notifications_outbox` | Tabla | Cola de salida. Usar `source = 'ticket_hub_attention'` |
| `business_calendar` | Tabla | Calendario laboral Bogotá — integrado al motor desde el inicio |
| `request_messages` | Tabla | Mensajes de tickets y de client_requests. El trigger ya filtra por tipo |

### En este repo

```
automations/ticket-hub/
├── README.md             ← Plano de control principal
├── AGENT_ONBOARDING.md   ← Este documento
├── AREAS.md              ← Áreas separables de trabajo
└── WORK_IN_PROGRESS.md   ← Sesiones activas
```

---

## 3. Flujo end-to-end (cómo funciona)

```
1. CRON (L-V 14:00 UTC) → POST a ticket-hub-attention-runner [PENDIENTE]
   ↓
2. VERIFICACIÓN de día hábil (business_calendar)
   Si no es hábil → retorna sin hacer nada
   ↓
3. fn_check_ticket_hub_attention()
   Por cada ticket en v_ticket_hub_attention (attention_reason ≠ 'ok'):
   ├── consecutive_days_attention = 1      → NIVEL 1: DM al assignee
   ├── consecutive_days_attention >= 3     → NIVEL 2: Canal del proyecto
   └── consecutive_days_attention >= 5     → NIVEL 3: DM al director
   ↓
4. INSERT en notifications_outbox (source='ticket_hub_attention')
   ↓
5. ticket-hub-attention-runner [PENDIENTE] envía mensajes a Slack
   ↓
6. PATCH notifications_outbox → 'processed' o 'error'
```

**Razones de atención:**
- `no_first_response` — ticket sin `first_response_at`
- `stale_in_progress` — ticket sin actualizar +3 días
- `unassigned` — ticket sin `assignee_id`

---

## 4. Estado actual (2026-05-17)

| Componente | Estado | Nota |
|------------|--------|------|
| `ticket_hub_alerts` | 🟢 Existe | 0 filas — sistema inactivo |
| `v_ticket_hub_attention` | 🟢 Activa | 14 tickets en radar (sin alertas) |
| `fn_check_ticket_hub_attention` | 🟢 Activa | Sin cron — probar manualmente con `SELECT fn_check_ticket_hub_attention()` |
| Edge Function runner | ⚪ Pendiente | No construida aún |
| Cron job | ⚪ Pendiente | No programado |
| Outbox | 🟢 Limpio | 0 pendientes / fallidos |

---

## 5. Reglas no negociables

1. **No activar el cron sin que el equipo esté entrenado.** El sistema notifica en Slack — si el equipo no sabe qué es, genera confusión.
2. **No hacer DELETE en `ticket_hub_alerts`.** Los registros son trazabilidad. Usar `UPDATE` para desactivar.
3. **No limpiar `notifications_outbox` globalmente.** Filtrar siempre por `source = 'ticket_hub_attention'`.
4. **No modificar `fn_check_ticket_hub_attention()` sin revisar `v_ticket_hub_attention` primero.** La función depende de la vista.
5. **El bot de Slack debe estar en el canal `C09SN85SGKC`** antes de activar — si no, el nivel 2 fallará con `not_in_channel`.

---

## 6. Cómo probar sin riesgo

```sql
-- Revisar qué tickets están en radar (sin enviar nada)
SELECT ticket_display_id, ticket_subject, attention_reason,
       hours_since_created, days_since_update, priority
FROM v_ticket_hub_attention
WHERE attention_reason <> 'ok'
ORDER BY priority, created_at;

-- Ejecutar el motor en seco (inserta en outbox pero no envía a Slack aún)
SELECT fn_check_ticket_hub_attention();

-- Revisar qué se encoló
SELECT id, target_id, target_type, payload->>'alert_level', status, created_at
FROM notifications_outbox
WHERE source = 'ticket_hub_attention'
ORDER BY created_at DESC;

-- Cancelar todo si no quieres que salga nada
UPDATE notifications_outbox
SET status = 'cancelled'
WHERE source = 'ticket_hub_attention' AND status = 'pending';
```

---

## 7. Lo que está pendiente

Ver [`AREAS.md`](AREAS.md) para el detalle. Resumen:

- **Activación (A):** construir la Edge Function, programar el cron, entrenar al equipo.
- **Datos maestros (B):** asignar `assignee_id` a tickets sin responsable; verificar `slack_channel_id` en proyectos.
- **Configuración (C):** invitar bot al canal `C09SN85SGKC`; crear secret `TICKET_HUB_CHECK_SECRET`.
- **N8n (D):** construir worker de outbox para `ticket_hub_attention`; acuse de recibo automático al cliente.
- **Mejoras (E):** AI análisis al crear ticket; asignación automática; filtro horario hábil en triggers de entrada.

---

## 8. Cómo registrar tu sesión

1. Identifica tu área en [`AREAS.md`](AREAS.md).
2. Verifica que no esté tomada en [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).
3. Registra tu sesión en `WORK_IN_PROGRESS.md`. Commit y push antes de empezar.
4. Al terminar, mueve la sesión a "cerradas" y actualiza la bitácora del `README.md`.
