# Áreas de trabajo — Seguimiento Escalado de Solicitudes

> El proyecto está dividido en áreas separables para que múltiples agentes puedan trabajar en paralelo sin pisarse.
> **Cada área = un agente activo a la vez.** Coordina vía [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).

---

## A. Canal de supervisores — Nivel 2

**Responsabilidad:** corregir el error de acceso del bot de Slack al canal `C09SN85SGKC` para que el nivel 2 funcione.

**Componentes que tocas:**
- Workspace de Slack (invitar bot al canal)
- `v_private_channel_id` en `run_client_requests_attention_check` (si hay que cambiar el canal)
- `notifications_outbox` (limpiar el error existente si se reabre)

**Estado:** 🔴 bloqueado — nivel 2 no entrega notificaciones.

**Pendientes:**
- Identificar el nombre del bot e invitarlo al canal `C09SN85SGKC`.
- Verificar con `?test=true` que nivel 2 ya no falla.
- Si el canal fue archivado, definir el nuevo canal y actualizar el SP.

**Choca con:** E (si se cambia el canal, afecta el SP).

---

## B. Higiene de solicitudes vencidas

**Responsabilidad:** revisar y cerrar las solicitudes `pending` con meses de antigüedad.

**Solicitudes afectadas:**
- `19d62745` — “Alerta API” (creada 2026-04-17, esperada 2026-04-18)
- `d4a7edd9` — “Verificación de Cuenta GBP” (creada 2026-03-18, esperada 2026-03-20)
- `a96c82c9` — “Problemas para enviar datos al API” (creada 2026-03-17, esperada 2026-03-19)

**Componentes que tocas:** `client_requests` (UPDATE status).

**Estado:** 🟡 pendiente de confirmación del especialista asignado.

**Choca con:** ninguna directamente.

---

## C. Integración con `business_calendar`

**Responsabilidad:** hacer que el SP no procese alertas en festivos colombianos.

**Componentes que tocas:**
- Función SQL `run_client_requests_attention_check`
- Tabla `business_calendar`

**Estado:** ⚪ planeado.

**Pendientes:**
- Verificar columnas de `business_calendar`.
- Agregar validación al inicio del SP.
- Probar con `?test=true` en un día festivo.

**Choca con:** E (mismo SP).

---

## D. Canal adicional WhatsApp para nivel 3

**Responsabilidad:** añadir WhatsApp como canal de respaldo para alertas de nivel 3.

**Componentes que tocas:**
- Función SQL `run_client_requests_attention_check`
- `boti-whatsapp-outbox-worker` (ya existente)
- Secrets: `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`

**Estado:** ⚪ planeado.

**Pendientes:**
- Decidir el número de WhatsApp destino para directiva.
- Diseñar el template de mensaje (Meta requiere templates pre-aprobados).
- Extender el SP.

**Choca con:** E (mismo SP), F (worker WhatsApp).

---

## E. Stored Procedure — lógica central

**Responsabilidad:** cualquier cambio a `run_client_requests_attention_check`: umbrales, condiciones de escalabilidad, vista, formato de notificaciones.

**Componentes que tocas:**
- Función SQL `run_client_requests_attention_check`
- Vista `client_requests_attention`

**Estado:** 🟢 activa y correcta (D-002 aplicada 2026-05-17).

**Pendientes:**
- Sincronizar `client_requests.escalation_level` con `alert_level` real.
- Evaluar fallback de nivel 1 sin Slack ID.

**Choca con:** A, C, D.

---

## F. Edge Function — delivery worker

**Responsabilidad:** lógica de `client-requests-attention-runner`: leer outbox y entregar a Slack.

**Componentes que tocas:**
- Edge Function `client-requests-attention-runner`
- Secrets: `SLACK_POST_MESSAGE_ENDPOINT`, `SLACK_BOT_TOKEN`, `CLIENT_REQUESTS_CHECK_SECRET`

**Estado:** 🟢 operativa (v38).

**Choca con:** E (el SP produce lo que esta EF consume).

---

## G. Documentación y gobierno

**Responsabilidad:** mantener este directorio coherente.

**Estado:** 🟢 creado 2026-05-17.

**Pendientes:** definir owners (producto y técnico) en el README.

---

## Tabla resumen — choque entre áreas

| | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|
| **A** | — | | | | 🟡 | | |
| **B** | | — | | | | | |
| **C** | | | — | | 🔴 | | |
| **D** | | | | — | 🔴 | 🟡 | |
| **E** | 🟡 | | 🔴 | 🔴 | — | 🟡 | |
| **F** | | | | 🟡 | 🟡 | — | |
| **G** | | | | | | | — |

- 🔴 alto riesgo de choque (no trabajar en paralelo)
- 🟡 riesgo medio (coordinar antes de tocar)
- vacío = compatibles en paralelo
