# Áreas de trabajo — Seguimiento Escalado de Solicitudes

> El proyecto está dividido en áreas separables para que múltiples agentes puedan trabajar en paralelo sin pisarse.
> **Cada área = un agente activo a la vez.** Coordina vía [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).

---

## A. Canal de supervisores — Nivel 2

**Responsabilidad:** corregir el error de acceso del bot de Slack al canal `C09SN85SGKC` para que el nivel 2 funcione.

**Archivos / componentes que tocas:**
- Workspace de Slack (invitar bot al canal)
- `v_private_channel_id` en `run_client_requests_attention_check` (si hay que cambiar el canal)
- `notifications_outbox` (para limpiar el error existente si se reabre)

**Estado:** 🔴 bloqueado — nivel 2 no entrega notificaciones.

**Pendientes:**
- Identificar el nombre del bot en Slack e invitarlo al canal `C09SN85SGKC`.
- Verificar con `?test=true` que el nivel 2 ya no falla.
- Si el canal fue archivado/no existe, definir el nuevo canal y actualizar el SP.

**Áreas con las que choca:** E (si se cambia el canal, afecta la lógica del SP).

---

## B. Higiene de solicitudes vencidas

**Responsabilidad:** revisar y cerrar las solicitudes `pending` con meses de antigüedad que probablemente ya fueron resueltas sin actualizar el sistema.

**Solicitudes afectadas:**
- `19d62745` — "Alerta API" (creada 2026-04-17, esperada 2026-04-18)
- `d4a7edd9` — "Verificación de Cuenta GBP" (creada 2026-03-18, esperada 2026-03-20)
- `a96c82c9` — "Problemas para enviar datos al API" (creada 2026-03-17, esperada 2026-03-19)

**Archivos / componentes que tocas:**
- Tabla `client_requests` (UPDATE status)
- Tabla `client_request_attention_alerts` (se desactiva automáticamente con la próxima ejecución)

**Estado:** 🟡 pendiente de confirmación del especialista asignado.

**Pendientes:**
- Confirmar con el especialista si están resueltas → UPDATE status = 'completed'.
- Si no están resueltas, actualizar `blocked_reason` o `snoozed_until`.

**Áreas con las que choca:** ninguna directamente.

---

## C. Integración con `business_calendar`

**Responsabilidad:** hacer que el sistema no genere alertas en festivos colombianos.

**Archivos / componentes que tocas:**
- Función SQL `run_client_requests_attention_check` (agregar check al inicio)
- Tabla `business_calendar` (verificar estructura y datos)

**Estado:** ⚪ planeado.

**Pendientes:**
- Verificar columnas de `business_calendar` (¿`tipo`? ¿`is_working_day`?).
- Agregar validación de día hábil al inicio del SP.
- Probar con modo `?test=true` en un día festivo.

**Áreas con las que choca:** E (modifica el mismo SP).

---

## D. Canal adicional WhatsApp para nivel 3

**Responsabilidad:** añadir WhatsApp como canal de respaldo para las alertas de nivel 3 (directiva).

**Archivos / componentes que tocas:**
- Función SQL `run_client_requests_attention_check` (segunda notificación vía outbox con target_type WhatsApp)
- `boti-whatsapp-outbox-worker` (worker ya existente)
- Secrets: `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`
- Tabla destino para el número de WhatsApp de directiva

**Estado:** ⚪ planeado.

**Pendientes:**
- Decidir el número de WhatsApp destino para alertas de directiva.
- Diseñar el template de mensaje (Meta requiere templates pre-aprobados).
- Extender el SP para encolar también en WhatsApp.

**Áreas con las que choca:** E (modifica el SP), F (el worker de WhatsApp ya existe).

---

## E. Stored Procedure — lógica central

**Responsabilidad:** cualquier cambio a `run_client_requests_attention_check`: umbrales de días, condiciones de escalabilidad, categorías de la vista, formato de notificaciones.

**Archivos / componentes que tocas:**
- Función SQL `run_client_requests_attention_check` (en `Light_House`)
- Vista `client_requests_attention` (si cambian los criterios de categorización)

**Estado:** 🟢 activa y correcta (D-002 aplicada el 17-may-2026).

**Pendientes:**
- Sincronizar `client_requests.escalation_level` con el `alert_level` real.
- Evaluar si el fallback de nivel 1 sin Slack ID debería ir al canal de supervisores.

**Áreas con las que choca:** A (canal de nivel 2), C (`business_calendar`), D (WhatsApp).

---

## F. Edge Function — delivery worker

**Responsabilidad:** la lógica dentro de `client-requests-attention-runner` que lee el outbox y entrega los mensajes a Slack.

**Archivos / componentes que tocas:**
- Edge Function `client-requests-attention-runner` (en `Light_House`)
- Secrets: `SLACK_POST_MESSAGE_ENDPOINT`, `SLACK_BOT_TOKEN`, `CLIENT_REQUESTS_CHECK_SECRET`

**Estado:** 🟢 operativa (v38).

**Pendientes:**
- Verificar y cargar los secrets si faltan.
- El parámetro `?limit=N` controla cuántas notificaciones se procesan por ejecución (default 25).

**Áreas con las que choca:** E (el SP produce lo que esta EF consume).

---

## G. Documentación y gobierno

**Responsabilidad:** mantener este directorio coherente — README, AGENT_ONBOARDING, AREAS, WORK_IN_PROGRESS, runbook, componentes, arquitectura. Bitácora de decisiones.

**Estado:** 🟢 creado 2026-05-17.

**Pendientes:**
- Definir owners (producto y técnico) y registrarlos en el README.
- Mantener actualizada la bitácora del README cada vez que se cierre una sesión.

---

## Tabla resumen — choque entre áreas

| | A. Canal Sup. | B. Higiene | C. Calendar | D. WhatsApp | E. SP | F. EF | G. Docs |
|---|---|---|---|---|---|---|---|
| **A. Canal Sup.** | — | | | | 🟡 | | |
| **B. Higiene** | | — | | | | | |
| **C. Calendar** | | | — | | 🔴 | | |
| **D. WhatsApp** | | | | — | 🔴 | 🟡 | |
| **E. SP** | 🟡 | | 🔴 | 🔴 | — | 🟡 | |
| **F. EF** | | | | 🟡 | 🟡 | — | |
| **G. Docs** | | | | | | | — |

- 🔴 alto riesgo de choque (no trabajar en paralelo)
- 🟡 riesgo medio (coordinar antes de tocar)
- vacío = compatibles en paralelo
