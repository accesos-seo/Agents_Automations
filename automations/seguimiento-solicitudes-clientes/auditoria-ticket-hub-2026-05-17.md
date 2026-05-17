# Auditoría Completa — Ticket Hub & Automatizaciones
**Fecha:** 2026-05-17  
**Alcance:** tabla `tickets`, triggers Supabase → N8n, `client_requests`, `request_messages`, cron jobs, workers outbox  
**Estado del sistema:** parcialmente operativo — gaps críticos confirmados en producción

---

## Resumen ejecutivo

Se auditaron en vivo la base de datos del proyecto `Light_House` (Supabase), todos los triggers de la tabla `tickets`, las funciones SQL relacionadas con el flujo de notificaciones, y los workflows de N8n que los consumen. Se identificaron **4 gaps críticos**, **4 gaps graves** y **4 gaps menores**.

El hallazgo más urgente: **todos los webhooks de N8n del Ticket Hub apuntan a URLs de prueba (`/webhook-test/`)**, lo que significa que las notificaciones al equipo solo funcionan cuando un desarrollador tiene N8n abierto en modo test. En producción normal, estas notificaciones no llegan. El segundo hallazgo más urgente confirma lo que detectaste: **no existe ningún filtro de días hábiles** — el sistema notifica sábados y domingos igual que lunes a viernes.

---

## 1. Gaps críticos (bloquean operación real)

### GAP-C1 — Todos los webhooks del Ticket Hub apuntan a `/webhook-test/` (producción rota)

**Dónde:** triggers de la tabla `tickets` y `request_messages`

| Trigger | Tabla | URL actual | Problema |
|---|---|---|---|
| `Enviar a n8n - Nuevo Ticket` | `tickets` INSERT | `/webhook-test/nuevo-tickets-cliente` | Solo funciona en modo debug |
| `notify_ticket_closed` | `tickets` UPDATE | `/webhook-test/aviso-cierre-ticket` | Solo funciona en modo debug |
| `notificar_nueva_solicitud` | `client_requests` INSERT | `/webhook-test/nueva-solicitud-cliente` | Solo funciona en modo debug |
| `n8n-ux-requests` | `client_requests` INSERT/UPDATE | `/webhook-test/notificaciones-ux-supabase` | Solo funciona en modo debug |
| `notificar_nuevo_mensaje` | `request_messages` INSERT | `/webhook-test/nuevo-mensaje-ticket` | Solo funciona en modo debug |
| `nuevo-mensaje-solicitud-cliente` | `request_messages` INSERT | `/webhook-test/nuevo-mensaje-solicitud` | Solo funciona en modo debug |

**Explicación técnica:** en N8n, `/webhook-test/{path}` solo acepta peticiones cuando el workflow está abierto en el editor y el botón "Listen for Test Event" está activo. El endpoint de producción es `/webhook/{path}` (sin `-test`). Cuando N8n está en modo "Active" (producción), el endpoint de prueba no responde.

**Excepción positiva:** `tg_client_article_feedback_notify_n8n` y `tg_content_feedback_notify_n8n` ya usan `/webhook/` (correcto).

**Agravante:** la función `notify_ticket_closed` tiene un comentario que dice `-- CORRECCIÓN: AHORA APUNTA A /webhook-test/`, lo que indica que alguien creyó que apuntar a `/webhook-test/` era la corrección correcta, cuando en realidad es el path incorrecto para producción.

**Impacto:** el equipo no recibe notificaciones de nuevos tickets, mensajes nuevos ni tickets cerrados en producción, salvo que alguien tenga N8n abierto en ese preciso momento.

**Corrección:** en cada función trigger, reemplazar `/webhook-test/` por `/webhook/` en la URL del `net.http_post`.

---

### GAP-C2 — Sin filtro de días hábiles en las notificaciones del Ticket Hub

**Dónde:** todos los triggers `INSERT`/`UPDATE` de `tickets` y `request_messages`

Los triggers disparan **en cualquier momento**, 7 días a la semana, 24 horas al día. Si un cliente abre un ticket el sábado a las 11 PM, el sistema:
1. Dispara inmediatamente el webhook de N8n.
2. El workflow notifica al equipo.
3. El equipo no trabaja sábado ni domingo.

El cliente queda esperando respuesta y el equipo recibe ruido innecesario fuera de horario. Cuando el lunes arranca la jornada, no hay forma de distinguir qué tickets llegaron durante el fin de semana.

**La infraestructura para resolverlo ya existe:** la tabla `business_calendar` tiene exactamente las columnas necesarias (`calendar_date`, `is_working_day`, `country_code`). No se usa en ningún trigger de tickets.

**Opciones de solución:**

- **Opción A (recomendada):** dentro del workflow N8n que recibe el webhook, agregar un nodo de condición que verifique el día y hora actuales en Bogotá. Si es fuera de horario, el workflow acusa recibo al cliente con un mensaje automático ("Recibimos tu ticket, te responderemos el próximo día hábil a partir de las 9 AM") y encola la notificación interna para el inicio del día hábil siguiente.
- **Opción B:** en la función trigger de PostgreSQL, consultar `business_calendar` antes de disparar el webhook. Si no es día hábil, insertar la notificación en una tabla de "pendientes a despachar" y programar su envío al inicio del siguiente día hábil.

**Impacto actual (datos reales):** de los 7 tickets actualmente "Notificado", todos fueron creados el jueves 14 o viernes 15 de mayo. La notificación del sábado 16 o domingo 17 no tenía a nadie para responder.

---

### GAP-C3 — Cron jobs 1 y 2 (`smart-report-sync`) tienen placeholders sin sustituir y fallan cada mes

**Dónde:** `cron.job` jobid 1 y 2

```sql
url := 'https://<PROJECT_REF>.supabase.co/functions/v1/smart-report-cache-sync'
Authorization := 'Bearer <SMART_REPORT_CACHE_SYNC_SECRET>'
```

Ambos campos siguen siendo literalmente `<PROJECT_REF>` y `<SMART_REPORT_CACHE_SYNC_SECRET>`. Estos jobs están `active: true` y se ejecutan el día 1 de cada mes. Cada ejecución falla silenciosamente.

**Corrección:** sustituir los placeholders con los valores reales, o desactivar los jobs si el feature aún no está listo.

---

### GAP-C4 — Tickets "En Progreso" abandonados sin seguimiento

**Datos reales:**

| Ticket | Asunto | Días sin actualizar | `first_response_at` |
|---|---|---|---|
| TKT-62370 | Prueba heduin | 64 días | Sí |
| TKT-48483 | Subida de artículos nuevo | 59 días | Sí |
| TKT-92648 | Error en el buscador de recursos | 40 días | Sí |

Estos tres tickets llevan entre 40 y 64 días en estado `En Progreso` sin ninguna actualización. No hay ningún cron, alerta ni mecanismo que detecte tickets "dormidos". En el sistema de `client_requests` existe el `attention_reason = 'stale_internal'` (más de 5 días sin actualizar) — el Ticket Hub no tiene nada equivalente.

**Impacto:** tickets del cliente que probablemente llevan semanas sin respuesta real. El cliente puede haber asumido que no se van a resolver.

---

## 2. Gaps graves (afectan calidad del servicio)

### GAP-G1 — Máquina de estados incompleta: `trigger_update_ticket_on_response` no maneja `Notificado`

**Función:** `trigger_update_ticket_on_response()` en `request_messages`

El trigger que actualiza el estado del ticket cuando el especialista responde solo maneja la transición `Abierto → En Progreso`:

```sql
IF v_current_status = 'Abierto' THEN
    UPDATE tickets SET status = 'En Progreso' ...
END IF;
```

**Problema:** si un ticket está en estado `Notificado` (el sistema ya avisó que nadie lo ha atendido) y el especialista responde, el ticket **sigue en `Notificado`**. El cliente no recibe señal de que su ticket está siendo atendido. Tampoco se registra `first_response_at`.

Hay 7 tickets en `Notificado` ahora mismo, 5 de ellos con `first_response_at = NULL` y `assignee_id = NULL`.

**Corrección:** extender la condición para incluir `Notificado`:
```sql
IF v_current_status IN ('Abierto', 'Notificado') THEN
    UPDATE tickets SET status = 'En Progreso', updated_at = NOW() ...
    -- También poblar first_response_at si es NULL
END IF;
```

---

### GAP-G2 — Tickets `Notificado` sin `assignee_id`: nadie es responsable

De los 7 tickets en estado `Notificado`, **todos tienen `assignee_id = NULL`**. No hay especialista asignado. Cuando el workflow N8n notifica, le avisa a... ¿a quién? Si la notificación va a un canal general, nadie "dueña" el ticket. Sin asignación, no hay responsable claro de responder.

**Impacto:** la notificación se diluye. En equipos pequeños esto se resuelve informalmente, pero a medida que crece el volumen, tickets sin dueño se quedan sin resolver.

**Corrección sugerida:** 
- Forzar asignación al crear el ticket, o asignar automáticamente por round-robin/disponibilidad en el workflow N8n al recibir el nuevo ticket.
- El N8n workflow podría consultar `users` para asignar según turno o carga de trabajo y hacer un PATCH de `assignee_id` antes de notificar.

---

### GAP-G3 — Campo `language` poblado incorrectamente (detección de idioma no funciona)

**Datos reales:**

| Ticket | Asunto | `language` | ¿Correcto? |
|---|---|---|---|
| TKT-62370 | "Prueba heduin" | `en` | ❌ El asunto es en español |
| TKT-48483 | "Subida de artículos nuevo" | `en` | ❌ El asunto es en español |

Todos los demás tickets tienen asuntos en español con `language = 'es'`, lo que es correcto. Pero al menos 2 tickets (y posiblemente más en los 53 cerrados) tienen el campo `language` incorrecto.

**Causa probable:** el campo `language` se está asignando manualmente en el formulario del cliente, o está siendo inferido del proyecto (`proyecto_id → idioma_objetivo`) en lugar de detectarse del contenido del ticket.

**Impacto:** si el workflow N8n usa `language` para decidir en qué idioma responder o clasificar el ticket, los tickets con idioma incorrecto recibirán respuestas en el idioma equivocado. El campo `ai_suggested_response` dependería de este valor.

**Corrección:** en el workflow N8n que recibe el nuevo ticket, agregar un paso de detección de idioma del `ticket_subject` + `ticket_description` (usando la API de Claude o un nodo de N8n de lenguaje) y hacer un PATCH de `language` si difiere del valor recibido.

---

### GAP-G4 — `ai_validation_status` bloqueado en `pending` para todos los tickets abiertos

Todos los tickets activos tienen `ai_validation_status = 'pending'`. Los campos `ai_suggested_response`, `ai_calculated_priority`, `ai_analysis_notes` y `ai_suggested_priority` están vacíos en todos. Esto sugiere que el pipeline de análisis AI para tickets nunca se ejecuta, o que el trigger que debería iniciarlo no existe.

La tabla tiene toda la infraestructura para asistencia AI al especialista, pero está inactiva. Un especialista podría beneficiarse de:
- Respuesta sugerida pre-generada para el ticket.
- Prioridad calculada automáticamente según urgencia del texto.
- Notas de análisis con contexto del cliente/proyecto.

**Corrección:** crear un trigger o paso en el workflow N8n de "nuevo ticket" que invoque Claude (via API Anthropic o edge function) para poblar estos campos apenas el ticket llega.

---

## 3. Gaps menores (mantenimiento y consistencia)

### GAP-M1 — Doble trigger en `request_messages` sin filtro por tipo

Dos triggers distintos disparan en cada INSERT de `request_messages`:
1. `notificar_nuevo_mensaje` → notifica al Hub de Tickets
2. `nuevo-mensaje-solicitud-cliente` → notifica al sistema de solicitudes de clientes

La tabla `request_messages` tiene tanto `ticket_id` (bigint, para tickets Hub) como `request_id` (UUID, para `client_requests`). Sin embargo, **ambos triggers disparan siempre**, aunque el mensaje pertenezca solo a uno de los dos sistemas. Cuando se inserta un mensaje de un ticket Hub, el trigger de `client_requests` también intenta notificar (y viceversa).

**Corrección:** agregar una condición `IF NEW.ticket_id IS NOT NULL THEN` en el trigger de tickets y `IF NEW.request_id IS NOT NULL THEN` en el de solicitudes.

---

### GAP-M2 — `fn_trigger_seo_investigation` tiene la `anon_key` hardcodeada en el código fuente

```sql
anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

La clave anónima de Supabase está literal en el cuerpo de la función SQL. Si el proyecto se clona, la clave rota o se revoca, esta función se rompe sin aviso. La clave anon no es secreta (es pública por diseño), pero mantenerla hardcodeada es frágil.

**Corrección:** leerla de `current_setting()` o de un parámetro de entorno, igual que hacen las demás funciones con `SUPABASE_URL`.

---

### GAP-M3 — `escalation_level` en `client_requests` nunca se sincroniza (siempre = 0)

El campo `escalation_level` en `client_requests` existe pero siempre tiene valor 0. El nivel real de escalación está en `client_request_attention_alerts.alert_level`. Cualquier consulta que use `client_requests.escalation_level` para filtrar o mostrar escalación retorna datos incorrectos.

**Corrección:** al final de `run_client_requests_attention_check()`, agregar un UPDATE que sincronice `client_requests.escalation_level` con el `alert_level` de su alerta activa.

---

### GAP-M4 — Canal de supervisores `C09SN85SGKC` sigue sin bot (nivel 2 de escalación roto desde el 5 de mayo)

Conocido desde el diagnóstico del 15 de mayo. El bot de Slack no es miembro del canal `C09SN85SGKC`. Todas las alertas de nivel 2 del sistema `client_requests` terminan en `status = 'error'` con `not_in_channel`. Los supervisores no reciben ningún aviso de escalación de nivel 2.

**Corrección:** invitar al bot de Slack (`/invite @<nombre-del-bot>`) dentro del canal `C09SN85SGKC` en Slack. No requiere cambios de código.

---

## 4. Matriz de prioridades y plan de acción

| ID | Gap | Impacto | Urgencia | Esfuerzo | Responsable |
|---|---|---|---|---|---|
| GAP-C1 | Webhooks `/webhook-test/` en producción | 🔴 Crítico | Inmediata | Bajo (cambio de URL) | Backend / Supabase |
| GAP-C2 | Sin filtro días hábiles (sábados/domingos) | 🔴 Crítico | Esta semana | Medio (lógica N8n + DB) | Backend + N8n |
| GAP-C3 | Cron smart-report con placeholders | 🔴 Crítico | Esta semana | Bajo (sustituir valores) | Backend / Supabase |
| GAP-C4 | Tickets "En Progreso" sin seguimiento (40-64 días) | 🔴 Crítico | Esta semana | Medio (nuevo cron/alert) | Backend |
| GAP-G1 | Máquina de estados: `Notificado` → `En Progreso` rota | 🟠 Grave | Esta semana | Bajo (1 línea SQL) | Backend |
| GAP-G2 | Tickets `Notificado` sin `assignee_id` | 🟠 Grave | Esta semana | Medio (lógica asignación) | Producto + N8n |
| GAP-G3 | `language` mal detectado en algunos tickets | 🟠 Grave | 1-2 semanas | Medio (detección AI) | N8n + AI |
| GAP-G4 | AI análisis de tickets nunca ejecuta | 🟠 Grave | 1-2 semanas | Alto (pipeline AI) | Backend + AI |
| GAP-M1 | Doble trigger `request_messages` sin filtro | 🟡 Menor | 1-2 semanas | Bajo (condición SQL) | Backend |
| GAP-M2 | `anon_key` hardcodeada en función SQL | 🟡 Menor | 1-2 semanas | Bajo | Backend |
| GAP-M3 | `escalation_level` no sincronizado | 🟡 Menor | Largo plazo | Bajo | Backend |
| GAP-M4 | Bot sin acceso a canal supervisores | 🟡 Menor | Inmediata | Cero (acción en Slack) | Admin Slack |

---

## 5. Correcciones técnicas recomendadas

### 5.1 Corregir URLs de N8n (GAP-C1)

Para cada función trigger, reemplazar `/webhook-test/` por `/webhook/`:

```sql
-- Ejemplo para notify_ticket_closed:
-- ANTES:
url := 'https://estancias-atlas-n8n.heh8a3.easypanel.host/webhook-test/aviso-cierre-ticket'
-- DESPUÉS:
url := 'https://estancias-atlas-n8n.heh8a3.easypanel.host/webhook/aviso-cierre-ticket'
```

Aplicar el mismo cambio a los 5 triggers restantes.

**Nota importante:** antes de aplicar en producción, verificar en N8n que los workflows estén en estado "Active" (no solo guardados). Un workflow inactivo tampoco recibe peticiones en `/webhook/`.

---

### 5.2 Filtro de días hábiles en el workflow N8n (GAP-C2)

Agregar al inicio del workflow "Nuevo Ticket" un nodo de decisión:

```
Nodo 1: obtener hora actual en Bogotá (America/Bogota, UTC-5)
Nodo 2: condición:
  - si DOW ∈ [1,2,3,4,5] Y hora ∈ [9:00, 18:00] → continuar con notificación interna
  - si fuera de horario → enviar solo respuesta automática al cliente:
    "Recibimos tu solicitud (TKT-XXXXX). La atenderemos el próximo día hábil."
    → posponer notificación interna al inicio del siguiente día hábil
```

Para festivos colombianos: conectar el nodo de condición con una consulta a Supabase → `business_calendar` WHERE `calendar_date = TODAY AND is_working_day = false`.

---

### 5.3 Corregir máquina de estados (GAP-G1)

```sql
-- En trigger_update_ticket_on_response, reemplazar:
IF v_current_status = 'Abierto' THEN
-- Por:
IF v_current_status IN ('Abierto', 'Notificado') THEN
```

---

### 5.4 Nuevo alerta para tickets dormidos (GAP-C4)

Similar al `stale_internal` del sistema `client_requests`, agregar a la vista o a un cron job una detección de tickets Hub con:
- `status IN ('En Progreso')` Y `updated_at < NOW() - INTERVAL '7 días'`
- Generar una notificación en Slack al canal de supervisores

---

## 6. Observaciones sobre idiomas

El campo `language` en `tickets` actualmente:
- Se asigna al crear el ticket (valor heredado del proyecto o seleccionado por el cliente).
- No hay validación ni re-detección automática.
- Los workflows de N8n no usan este campo para personalizar las respuestas automáticas.

**Recomendación transversal:** si la agencia atiende clientes en inglés y español, el workflow N8n de "nuevo ticket" debería:
1. Detectar el idioma real del asunto + descripción.
2. Generar el mensaje de acuse de recibo en el idioma detectado.
3. Notificar al especialista indicando el idioma del ticket para que responda correctamente.

Actualmente los mensajes automáticos (si llegaran a funcionar, que no llegan por GAP-C1) serían siempre en el idioma configurado estáticamente, no en el del cliente.

---

## 7. Estado real a la fecha del audit (2026-05-17)

| Sistema | Estado real | Nota |
|---|---|---|
| Notificaciones nuevos tickets → N8n | 🔴 Roto en producción | Apuntan a `/webhook-test/` |
| Notificaciones mensaje nuevo → N8n | 🔴 Roto en producción | Ídem |
| Notificación ticket cerrado → N8n | 🔴 Roto en producción | Ídem + comentario engañoso en el código |
| Escalación cliente→especialista L1 | 🟢 Funciona L-V 9AM | Cron activo, bot OK |
| Escalación cliente→especialista L2 | 🔴 Roto | Bot sin acceso a canal supervisores |
| Escalación cliente→especialista L3 | 🟢 Funciona | Re-alerta cada 2 días corregida |
| Filtro fines de semana / festivos | 🔴 No existe | En ningún flujo de tickets |
| Asignación automática de tickets | 🔴 No existe | Todos los "Notificado" sin assignee |
| Seguimiento tickets dormidos | 🔴 No existe | 3 tickets sin actualizar 40-64 días |
| AI análisis de tickets | 🟡 Infraestructura lista | Campos existen, no se poblan |
| Cron smart-report sync | 🔴 Falla mensualmente | Placeholders `<PROJECT_REF>` sin reemplazar |
| Worker outbox WhatsApp | 🟡 QA / pendiente activación | `dry_run: true` |
| Worker outbox reuniones recordatorios | 🟡 Pendiente activación | Plantillas Meta sin aprobar |

---

*Auditoría realizada el 17 de mayo de 2026 mediante inspección directa de la base de datos Supabase `Light_House` (`stjugsrkrweakvzmizpq`): tablas, columnas, triggers, funciones SQL, cron jobs y revisión de workflows documentados en el repositorio.*
