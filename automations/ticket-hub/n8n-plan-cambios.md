# Plan de cambios N8n — Ticket Hub
**Fecha:** 2026-05-17
**Estado:** listo para aplicar — pendiente acceso a N8n

Este documento describe exactamente qué cambiar en cada workflow de N8n relacionado con el Ticket Hub. Los cambios NO se activan hasta que el equipo esté entrenado.

---

## Contexto: por qué los webhooks están en `/webhook-test/`

En N8n existen dos endpoints por webhook:
- `/webhook-test/{path}` → solo funciona cuando el workflow está abierto en el editor (modo debug). **En producción no responde.**
- `/webhook/{path}` → endpoint de producción. Funciona cuando el workflow está en **Active**.

Actualmente TODOS los triggers del Ticket Hub apuntan a `/webhook-test/`. El cambio a `/webhook/` se hace **al mismo tiempo** que se activa cada workflow en N8n.

---

## Workflows identificados (desde triggers Supabase)

### WF-1: Nuevo Ticket
**Trigger:** INSERT en `tickets`
**Webhook actual:** `webhook-test/nuevo-tickets-cliente`
**Webhook producción:** `webhook/nuevo-tickets-cliente`

**Qué debe hacer este workflow:**
1. Recibir el payload del nuevo ticket (id, ticket_id, subject, priority, language, client_id, proyecto_id)
2. **Verificar horario hábil** (lunes–viernes, 9AM–6PM Bogotá):
   - Si es horario hábil → continuar con notificación interna
   - Si es fuera de horario → enviar solo acuse de recibo al cliente y parar
3. Si el ticket no tiene `assignee_id` → asignar automáticamente (round-robin o regla de negocio) y hacer PATCH a Supabase
4. Notificar al especialista asignado por DM de Slack:
   ```
   📋 Nuevo ticket: {ticket_subject}
   🔴 Prioridad: {priority}
   TKT-{ticket_id} | Cliente: {client_name}
   ```
5. **Acuse de recibo al cliente** (siempre, independiente del horario):
   - Si es día hábil: "Recibimos tu ticket, lo atenderemos pronto."
   - Si es fin de semana/fuera de horario: "Recibimos tu ticket. Lo atenderemos el {próximo día hábil} a partir de las 9 AM."

**Cambios a aplicar cuando se active:**
- [ ] Agregar nodo de verificación de horario hábil (comparar con `business_calendar` en Supabase o lógica de día/hora)
- [ ] Agregar nodo de asignación automática si `assignee_id` es null
- [ ] Cambiar URL del webhook a `/webhook/nuevo-tickets-cliente`
- [ ] Activar el workflow

---

### WF-2: Cierre de Ticket
**Función Supabase:** `notify_ticket_closed`
**Trigger:** UPDATE en `tickets` cuando `status = 'Cerrado'`
**Webhook actual:** `webhook-test/aviso-cierre-ticket`
**Webhook producción:** `webhook/aviso-cierre-ticket`

**⚠️ Nota importante:** la función tiene un comentario engañoso que dice "CORRECCIÓN: AHORA APUNTA A /webhook-test/" — esto es incorrecto. `/webhook-test/` no es producción.

**Qué debe hacer este workflow:**
1. Recibir el payload (ticket_display_id, subject, client_id, closed_at)
2. Enviar confirmación de cierre al cliente:
   ```
   ✅ Tu ticket {TKT-XXXXX} ha sido resuelto y cerrado.
   Si necesitas algo más, abre un nuevo ticket.
   ```
3. Notificar al especialista que lo cerró (DM Slack)

**Cambios a aplicar cuando se active:**
- [ ] Cambiar URL del webhook a `/webhook/aviso-cierre-ticket`
- [ ] Activar el workflow

---

### WF-3: Nuevo Mensaje en Ticket
**Función Supabase:** `tg_notify_nuevo_mensaje_ticket()` (ya corregida — filtra por `ticket_id IS NOT NULL`)
**Trigger:** INSERT en `request_messages` donde `ticket_id IS NOT NULL`
**Webhook actual:** `webhook-test/nuevo-mensaje-ticket`
**Webhook producción:** `webhook/nuevo-mensaje-ticket`

**Qué debe hacer este workflow:**
1. Recibir el mensaje nuevo (ticket_id, sender_id, message, created_at)
2. Determinar si el sender es el cliente o el especialista:
   - Si es el **cliente** → notificar al especialista asignado que hay respuesta del cliente
   - Si es el **especialista** → notificar al cliente que hay una respuesta (si se tiene canal de comunicación con el cliente)
3. Actualizar `tickets.updated_at` implícitamente (ya lo hace el trigger `trigger_update_ticket_on_response`)

**Cambios a aplicar cuando se active:**
- [ ] Cambiar URL del webhook a `/webhook/nuevo-mensaje-ticket`
- [ ] Agregar lógica de distinción cliente vs. especialista
- [ ] Activar el workflow

---

### WF-4: Notificaciones UX — Solicitudes de Clientes
**Función Supabase:** `n8n-ux-requests` trigger
**Trigger:** INSERT/UPDATE en `client_requests`
**Webhook actual:** `webhook-test/notificaciones-ux-supabase`
**Webhook producción:** `webhook/notificaciones-ux-supabase`

**Nota:** este workflow es para el sistema `client_requests` (especialista → cliente), no para el Ticket Hub. Se incluye aquí para tener el inventario completo.

**Cambios a aplicar cuando se active:**
- [ ] Cambiar URL del webhook a `/webhook/notificaciones-ux-supabase`
- [ ] Activar el workflow

---

### WF-5: Nueva Solicitud de Cliente
**Función Supabase:** `notificar_nueva_solicitud`
**Trigger:** INSERT en `client_requests`
**Webhook actual:** `webhook-test/nueva-solicitud-cliente`
**Webhook producción:** `webhook/nueva-solicitud-cliente`

**Cambios a aplicar cuando se active:**
- [ ] Cambiar URL del webhook a `/webhook/nueva-solicitud-cliente`
- [ ] Activar el workflow

---

### WF-6: Nuevo Mensaje en Solicitud de Cliente
**Función Supabase:** `tg_notify_nuevo_mensaje_solicitud()` (ya corregida — filtra por `request_id IS NOT NULL`)
**Trigger:** INSERT en `request_messages` donde `request_id IS NOT NULL`
**Webhook actual:** `webhook-test/nuevo-mensaje-solicitud`
**Webhook producción:** `webhook/nuevo-mensaje-solicitud`

**Cambios a aplicar cuando se active:**
- [ ] Cambiar URL del webhook a `/webhook/nuevo-mensaje-solicitud`
- [ ] Activar el workflow

---

## Workflow nuevo a construir: Worker de Escalamiento Ticket Hub

**Nombre:** `Ticket Hub — Escalamiento Automático`
**Tipo:** Worker que lee el outbox y entrega mensajes a Slack

**Estructura del workflow:**
```
Schedule Trigger (L-V 9:05 AM Bogotá, 5 min después del cron SQL)
  ↓
Supabase: leer notifications_outbox
  WHERE source = 'ticket_hub_attention'
  AND status = 'pending'
  ORDER BY priority DESC, created_at ASC
  LIMIT 10
  ↓
IF: ¿hay notificaciones?
  ↓ Sí
Para cada notificación:
  ↓
Switch: alert_level
  → 1: construir mensaje Nivel 1 (especialista)
  → 2: construir mensaje Nivel 2 (equipo)
  → 3: construir mensaje Nivel 3 (directiva)
  ↓
Slack: enviar mensaje
  (target_type = 'slack_user' → DM | 'slack_channel' → canal)
  ↓
Supabase: PATCH notifications_outbox
  SET status = 'processed', processed_at = now()
  WHERE id = {id}
  ↓ (si error en Slack)
Supabase: PATCH notifications_outbox
  SET status = 'error', error = '{mensaje de error}'
  WHERE id = {id}
```

**Mensajes por nivel** (ver sección 5 del README):
- Nivel 1: `⚠️ TICKET SIN RESPUESTA — {TKT-XXXXX}`
- Nivel 2: `🚨 ALERTA EQUIPO — TICKET SIN ATENCIÓN`
- Nivel 3: `🔴 ALERTA DIRECTIVA — TICKET CRÍTICO`

**Estado:** ⚪ Pendiente construcción.

---

## Workflow nuevo a construir: Acuse de Recibo Automático

**Nombre:** `Ticket Hub — Acuse de Recibo al Cliente`
**Trigger:** se llama desde WF-1 si es fuera de horario

**Lógica:**
```javascript
const bogota = new Date().toLocaleString('es-CO', {timeZone: 'America/Bogota'});
const hora = new Date(bogota).getHours();
const dow = new Date(bogota).getDay(); // 0=Dom, 6=Sáb

const fueraDeHorario = (dow === 0 || dow === 6 || hora < 9 || hora >= 18);

if (fueraDeHorario) {
  // Calcular próximo día hábil
  // Enviar mensaje al cliente
  // NO notificar al equipo interno
} else {
  // Continuar flujo normal
}
```

---

## Plan de activación (orden recomendado)

1. **Construir** WF-worker de escalamiento
2. **Construir** WF-acuse de recibo
3. **Agregar** lógica de horario hábil a WF-1 (nuevo ticket)
4. **Probar** en modo test (workflows en test, no en Active)
5. **Entrenar** al equipo — explicar qué son los mensajes de escalamiento
6. **Activar** todos los workflows (cambiar `/webhook-test/` → `/webhook/`)
7. **Activar** el cron de `fn_check_ticket_hub_attention()` en Supabase

---

## Checklist final antes de activar

- [ ] Bot de Slack invitado al canal `C09SN85SGKC` (supervisores)
- [ ] Secret `TICKET_HUB_CHECK_SECRET` creado en Supabase
- [ ] Edge Function `ticket-hub-attention-runner` desplegada
- [ ] Cron job programado (`0 14 * * 1-5`)
- [ ] WF-worker de escalamiento construido y probado
- [ ] WF-acuse de recibo construido y probado
- [ ] Todos los tickets activos tienen `assignee_id` asignado
- [ ] Todos los proyectos tienen `slack_channel_id` configurado
- [ ] Equipo informado y entrenado
- [ ] Primera ejecución monitoreada manualmente
