# Áreas de trabajo — Ticket Hub

> Cada área = un agente activo a la vez. Coordina vía [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).

---

## A. Activación del sistema

**Responsabilidad:** poner en marcha el escalamiento de forma controlada y supervisada.

**Componentes que tocas:**
- Edge Function `ticket-hub-attention-runner` (crear y desplegar)
- Secret `TICKET_HUB_CHECK_SECRET` (crear en Supabase Secrets)
- Cron job `ticket-hub-attention-weekdays-9am` (crear — `0 14 * * 1-5`)
- `ticket_hub_alerts` (verificar estado tras primer ciclo)
- `notifications_outbox` (verificar filas generadas)

**Orden correcto:**
1. Completar áreas B y C primero
2. Construir la Edge Function
3. Ejecutar `SELECT fn_check_ticket_hub_attention()` manualmente y revisar outbox
4. Activar la Edge Function y probar con `?test=true`
5. Crear el cron job
6. Monitorear primer ciclo real en Slack

**Estado:** ⚪ pendiente — esperando decisión del equipo.

**Choca con:** B (datos deben estar completos), C (configuración antes de activar).

---

## B. Datos maestros — asignación de responsables

**Responsabilidad:** garantizar que todos los tickets activos tengan `assignee_id` y que los proyectos tengan `slack_channel_id` y `director_id`.

**Componentes que tocas:**
- Tabla `tickets` (campo `assignee_id`)
- Tabla `proyectos_seo` (campos `slack_channel_id`, `director_id`)
- Tabla `users` (verificar IDs válidos con `slack_id`)

**Tickets actualmente sin `assignee_id`:**

| Ticket | Asunto | Estado | Días sin update |
|--------|--------|--------|----------------|
| TKT-05170 | Ajustes FAQ página en inglés | Notificado | 2 |
| TKT-65217 | Ajustes página de SAT en inglés | Notificado | 2 |
| TKT-55534 | Cambiar la tipografía de la web Perú | Notificado | 2 |
| TKT-24067 | Ajuste página Counseling en inglés | Notificado | 2 |
| TKT-25848 | Ajuste del footer y slugs... | Notificado | 2 |
| TKT-60002 | Ajustes página contactanos EN | Notificado | 2 |
| TKT-05421 | Cambiar formulario web EN | Notificado | 1 |

**Pendientes:**
- Asignar `assignee_id` a los 7 tickets sin responsable (sin esto, Nivel 1 va al canal fallback).
- Verificar `slack_channel_id` en `proyectos_seo` para los proyectos de esos tickets.

**Estado:** 🔴 incompleto.
**Choca con:** A (no activar hasta completar).

---

## C. Configuración — canales y secrets

**Responsabilidad:** ajustar la configuración operativa del sistema.

**Componentes que tocas:**
- Secret `TICKET_HUB_CHECK_SECRET` en Supabase Edge Functions Secrets
- Canal Slack `C09SN85SGKC` — invitar bot para nivel 2
- `fn_check_ticket_hub_attention()` — parámetros de canales si cambian

**Pendientes:**
1. **Crear secret `TICKET_HUB_CHECK_SECRET`** en Supabase → Edge Functions → Secrets.
2. **Invitar al bot de Slack al canal `C09SN85SGKC`** (`/invite @<nombre-del-bot>`). Sin esto, el nivel 2 fallará.
3. Verificar que el bot esté en el canal de directiva `C0B1B3V4ZB5` (ya funciona para otros sistemas).
4. Decidir si el nivel 3 usa DM individual al director o un canal de grupo directiva.

**Estado:** 🟡 pendiente decisiones externas (Slack) y técnicas (secret).
**Choca con:** A (configuración antes de activar).

---

## D. N8n — workflows del Ticket Hub

**Responsabilidad:** construir o ajustar los workflows de N8n que interactúan con el Ticket Hub.

**Componentes que tocas:**
- N8n instance: `https://estancias-atlas-n8n.heh8a3.easypanel.host`
- Workflows existentes (auditar URLs `/webhook-test/` → `/webhook/` cuando se active)
- Worker nuevo para `source = 'ticket_hub_attention'` en outbox
- Workflow de acuse de recibo automático al cliente (fuera de horario hábil)

**Pendientes:**
1. **Auditar todos los workflows del Ticket Hub** — verificar que estén listos para producción (URLs `/webhook/`).
2. **Construir worker de outbox** que lea `notifications_outbox WHERE source='ticket_hub_attention'` y envíe los mensajes de escalamiento a Slack.
3. **Construir workflow de acuse de recibo:** cuando llega un ticket fuera de horario hábil, responder al cliente automáticamente con mensaje de confirmación.
4. **Construir flujo de asignación automática:** al recibir un nuevo ticket, asignar `assignee_id` por round-robin o regla de negocio.
5. **Cambiar `/webhook-test/` → `/webhook/`** en todos los triggers activos cuando el equipo esté listo para activar.

**Importante:** no cambiar las URLs a producción (`/webhook/`) hasta que el equipo esté entrenado. Mantener en `/webhook-test/` hasta activación formal.

**Estado:** 🟡 en revisión.
**Choca con:** A (activar N8n workers al mismo tiempo que el cron de Supabase).

---

## E. Mejoras — AI y automatización de entrada

**Responsabilidad:** mejorar la experiencia cuando llega un nuevo ticket.

**Componentes que tocas:**
- Tabla `tickets` (campos `ai_suggested_response`, `ai_calculated_priority`, `ai_analysis_notes`, `ai_suggested_priority`)
- Edge Function nueva o workflow N8n para análisis AI
- Campo `language` en `tickets` (validación/corrección automática)

**Pendientes:**
1. **Análisis AI al crear ticket:** invocar Claude para poblar `ai_suggested_response` y `ai_calculated_priority` cuando llega un ticket nuevo.
2. **Corrección de `language`:** detectar automáticamente el idioma real del asunto + descripción y corregir si difiere del valor recibido.
3. **Gestión de ticket dormido:** detectar tickets `En Progreso` o `Notificado` sin actualización en +7 días y limpiarlos o escalarlos.

**Estado:** ⚪ planificado — prioridad baja, post-activación.
**Choca con:** ninguna área directamente.

---

## F. Documentación y gobierno

**Responsabilidad:** mantener este directorio coherente y actualizado.

**Archivos que tocas:**
- `README.md`, `AGENT_ONBOARDING.md`, `AREAS.md`, `WORK_IN_PROGRESS.md`

**Pendientes:**
- Definir owners (producto y técnico) en `README.md`.
- Actualizar bitácora cada vez que se tome una decisión o se cierre una sesión.

**Estado:** 🟢 formalizado.
**Choca con:** ninguna.

---

## Tabla resumen — orden y dependencias

| | A. Activación | B. Datos | C. Config | D. N8n | E. AI | F. Docs |
|---|---|---|---|---|---|---|
| **A** | — | 🔴 | 🔴 | 🔴 | | |
| **B** | 🔴 | — | | | | |
| **C** | 🔴 | | — | 🟡 | | |
| **D** | 🔴 | | 🟡 | — | | |
| **E** | | | | | — | |
| **F** | | | | | | — |

- 🔴 alto riesgo de choque
- 🟡 coordinar antes de tocar

**Orden recomendado:** B → C → D → A → E → F (continua)
