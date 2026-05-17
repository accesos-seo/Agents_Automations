# Áreas de trabajo — Cuentas de Cobro Automáticas para Freelancers

> El proyecto está dividido en áreas separables para que múltiples agentes puedan trabajar en paralelo sin pisarse.
> **Cada área = un agente activo a la vez.** Coordina vía [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).

---

## A. Configuración de freelancers

**Responsabilidad:** datos de cada freelancer en `freelancer_invoice_settings`. Monto fijo mensual, admin responsable, datos bancarios, canal de notificación.

**Archivos / componentes que tocas:**
- Tabla `freelancer_invoice_settings` (Light_House)
- Tabla `users` (read-only para referencias)
- Pantalla frontend `/admin/freelancer-settings` (cuando exista)

**Decisiones tomadas que aplican aquí:** D-002 (modelo monthly_fixed).

**Pendientes en esta área:**
- Cargar los montos reales de los 6 redactores actuales (hoy todos en 0).
- Asignar `admin_user_id` a cada freelancer.
- Completar `payment_account` con datos bancarios estructurados (banco, cuenta, titular, swift).
- Definir si `notification_email` y `notification_slack_id` se mantienen como override opcional o si se exige siempre uno.

**Áreas con las que choca:** ninguna (es configuración).

---

## B. Generación y pipeline

**Responsabilidad:** lógica de generación mensual, document-builder, dispatch, runner SQL. Asegurar idempotencia, manejo de errores, observabilidad.

**Archivos / componentes que tocas:**
- Migración `001_schema.sql`, `002_functions.sql`, `003_cron_jobs.sql`, `005_secrets_setup.sql` (en [`propuestas-ops-control-plane/01-database-migrations/`](propuestas-ops-control-plane/01-database-migrations/))
- Edge Function `freelancer-invoice-document-builder` ([`propuestas-ops-control-plane/02-edge-functions/`](propuestas-ops-control-plane/02-edge-functions/))
- pg_cron jobs `freelancer-invoice-generator-daily`, `freelancer-invoice-document-builder`, `freelancer-invoice-escalator-daily`
- Funciones SQL `generate_monthly_freelancer_invoices`, `dispatch_freelancer_invoice`, `escalate_pending_freelancer_invoices`, `run_monthly_freelancer_invoice_generator`

**Decisiones tomadas que aplican aquí:** D-004 (Google Doc inline), D-005 (4 etapas separadas), D-006 (escalamiento 24/48/72).

**Pendientes en esta área:**
- Métricas: registrar duración de cada etapa para alertar si el document-builder pasa de 5s/invoice.
- Soportar regeneración manual de Doc (si el admin edita bonus/deduction después del primer envío).
- Estrategia de retry si Google Drive API falla (hoy se queda en `draft` indefinidamente).

**Áreas con las que choca:** C (Notificaciones) — comparten `notifications_outbox`.

---

## C. Notificaciones — email + Slack + WhatsApp

**Responsabilidad:** renderizar y entregar las notificaciones encoladas. Hoy solo email vía Mailjet está activo; Slack se encola pero no se envía; WhatsApp no implementado.

**Archivos / componentes que tocas:**
- Edge Function `freelancer-invoice-outbox-worker` (productiva, solo email)
- Funciones SQL `notify_admin_for_invoice_approval`, `notify_admin_for_invoice_rejection`, `notify_writer_of_approval`, `dispatch_freelancer_invoice_followup` (donde se generan los payloads)
- Tabla `notifications_outbox` (compartida con otras automatizaciones)
- Templates HTML inline en el outbox-worker (`wrap()` + `render()` por type)

**Decisiones tomadas que aplican aquí:** D-009 (Mailjet), D-005 (separación dispatch/worker).

**Pendientes en esta área:**
- Construir worker para `target_type='slack_dm'` (replicar patrón del outbox-worker, llamar Slack API).
- Decidir si Slack se mantiene como DM o se manda a un canal compartido.
- Si se quiere WhatsApp: integrar con `boti-whatsapp-outbox-worker` existente.
- Plantilla de "reset escalation" cuando el admin reabre una cuenta rechazada.
- Considerar adjuntar el PDF en el correo (hoy solo va enlace al Google Doc).

**Áreas con las que choca:** B (pipeline) — los payloads los arma el dispatch.

---

## D. Flujo de aprobación — RPCs públicas

**Responsabilidad:** las 4 RPCs invocables desde el frontend o desde un botón del correo. Validar transiciones de estado y permisos.

**Archivos / componentes que tocas:**
- Funciones SQL `acknowledge_freelancer_invoice`, `reject_freelancer_invoice`, `approve_freelancer_invoice`, `mark_freelancer_invoice_paid`
- GRANT EXECUTE en `002_functions.sql`

**Decisiones tomadas que aplican aquí:** D-003 (tokens públicos), D-007 (RLS), D-008 (espejo a `freelancer_payments`).

**Pendientes en esta área:**
- Soportar "reabrir" una cuenta rechazada (transición `rejected_by_writer → sent`) como RPC explícita.
- Endpoint `cancel_freelancer_invoice(invoice_id, reason)` para anulaciones.
- Endpoint `regenerate_freelancer_invoice_doc(invoice_id)` para forzar re-creación del Google Doc.
- Validar que `p_admin_user_id` realmente es admin (hoy se acepta cualquier uuid). Agregar check con `agency_roles`.

**Áreas con las que choca:** E (Frontend) — el frontend las consume.

---

## E. Frontend — pantallas y experiencia

**Responsabilidad:** las 7 pantallas descritas en la especificación. 3 públicas (con token) + 4 privadas (con login).

**Archivos / componentes que tocas:**
- Especificación: [`propuestas-ops-control-plane/03-frontend-spec/frontend-spec.md`](propuestas-ops-control-plane/03-frontend-spec/frontend-spec.md)
- Documento de prompt detallado: `SeoLab_Cuentas_de_cobro_PROMPT_FRONTEND.docx` (en raíz del workspace)
- Repo de frontend (cuando se decida cuál): aplicación Orbit o standalone

**Decisiones tomadas que aplican aquí:** D-003 (tokens), D-007 (RLS).

**Pendientes en esta área:**
- Decidir si vivirá dentro de la app Orbit existente o como standalone.
- Implementar las 3 páginas públicas (`/invoice/ack/:token`, `/invoice/reject/:token`, `/invoice/approve/:token`).
- Implementar las 4 páginas privadas (`/me/invoices`, `/admin/invoices`, `/admin/invoices/:id`, `/admin/freelancer-settings`).
- Manejo de estados visuales (colores por status, badge de escalamiento, timeline de eventos).
- Confirmaciones modales antes de aprobar y pagar.
- Polling cada 30s en cuentas `draft` esperando Google Doc.

**Áreas con las que choca:** D (RPCs) — usa las funciones, no las modifica.

---

## F. Política / governance

**Responsabilidad:** mantener la política operativa actualizada en `company_policies` y en `politicas/cuentas-de-cobro.yaml`. Decisiones de modelo de pago, día de generación, escalamiento, retención tributaria.

**Archivos / componentes que tocas:**
- [`politicas/cuentas-de-cobro.yaml`](politicas/cuentas-de-cobro.yaml)
- Tabla `company_policies` (`policy_type='freelancer_invoices'`)
- Bitácora "7.5. Decisiones tomadas" del [`README.md`](README.md)

**Pendientes en esta área:**
- Definir política tributaria (retención, IVA, regímenes por país).
- Definir si freelancers pueden tener calendarios distintos (quincenal vs mensual).
- Política de cancelación: ¿cuándo se puede anular una cuenta `paid`? ¿quién autoriza?
- Política de auditoría externa: ¿se exporta el ledger mensual? ¿a quién?

**Áreas con las que choca:** **todas**. Cambios de política impactan generator, RPCs, frontend y notificaciones.

---

## G. Integración contable y reporting

**Responsabilidad:** llevar la información de cuentas pagadas hacia el sistema contable de la agencia. KPIs de salud del proceso.

**Archivos / componentes que tocas:**
- Tabla `freelancer_payments` (espejo histórico)
- Endpoint o cron de export (no existe aún)
- Dashboard de métricas (no existe aún)

**Pendientes en esta área:**
- Definir si la integración es con Quickbooks / Alegra / Siigo / hoja de cálculo.
- Endpoint `GET /admin/exports/freelancer-invoices?year=Y&month=M` que devuelva CSV.
- Webhook al sistema contable cuando una invoice pasa a `paid`.
- Vista `freelancer_invoice_health` (sugerida en el runbook): KPIs de drafts atascados, escalamiento alto, emails fallidos, pagos pendientes a más de 7 días.

**Áreas con las que choca:** ninguna directamente.

---

## H. Repo de gobierno — META

**Responsabilidad:** mantener este sub-directorio (`automations/cuentas-de-cobro-freelancers/`) coherente con el resto del repo. Convenciones, documentación, propuestas para ops-control-plane.

**Archivos / componentes que tocas:**
- `README.md`, `AGENT_ONBOARDING.md`, `AREAS.md` (este), `WORK_IN_PROGRESS.md`
- `propuestas-ops-control-plane/*.md`
- Cuando exista: `referencias/` raíz del repo si hay referencias compartidas con otras automations.

**Pendientes en esta área:**
- Coordinar con el desarrollador para mudar `propuestas-ops-control-plane/` al repo `ops-control-plane` real.
- Crear `referencias/politica-freelancers.md` global del repo si la política aplica a otras automations.
- Mantener este AREAS.md actualizado cuando aparezcan áreas nuevas.

**Áreas con las que choca:** ninguna directamente.

---

## Tabla resumen — choque entre áreas

| | A. Conf | B. Pipeline | C. Notif | D. RPC | E. Front | F. Pol | G. Cont | H. Meta |
|---|---|---|---|---|---|---|---|---|
| **A. Configuración** | — | | | | | 🟡 | | |
| **B. Pipeline** | | — | 🟡 | | | 🟡 | | |
| **C. Notificaciones** | | 🟡 | — | | | 🟡 | | |
| **D. RPCs** | | | | — | 🔴 | 🟡 | | |
| **E. Frontend** | | | | 🔴 | — | | | |
| **F. Política** | 🟡 | 🟡 | 🟡 | 🟡 | | — | 🟡 | |
| **G. Contable** | | | | | | 🟡 | — | |
| **H. Meta** | | | | | | | | — |

- 🔴 alto riesgo de choque (no trabajar en paralelo)
- 🟡 riesgo medio (coordinar antes de tocar)
- vacío = compatibles en paralelo

---

## Cómo elegir tu área

Si el usuario te dice qué hacer, ya tienes área. Si no, prioridad sugerida:

1. ¿Hay configuración faltante? → **A. Configuración** (cargar montos para que el sistema arranque).
2. ¿Quieres acelerar entrega de valor? → **E. Frontend** (las pantallas son lo único que bloquea uso real).
3. ¿Quieres ampliar canales? → **C. Notificaciones** (construir Slack worker).
4. ¿Quieres robustecer? → **B. Pipeline** (métricas, retries, regeneración manual).
5. ¿Quieres cerrar ciclo contable? → **G. Integración contable**.
