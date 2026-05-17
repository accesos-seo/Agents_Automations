# Cuentas de Cobro Automáticas para Freelancers

**Automation key:** `cuentas-de-cobro-freelancers`
**Versión actual:** 1.0 (productiva con pipeline v2, secretos en Vault)
**Estado:** `active` / `production_ready_gated`
**Activada:** 2026-05-15
**Owner producto:** _por definir_
**Owner técnico:** _por definir_

Sistema que genera, envía, confirma, escala y aprueba la cuenta de cobro mensual de cada redactor/freelancer de la agencia sin intervención humana hasta la aprobación final del administrador. El runtime corre en Supabase **Light_House** (`stjugsrkrweakvzmizpq`). El código de implementación (migraciones SQL y Edge Functions) vive como patches en [`propuestas-ops-control-plane/`](propuestas-ops-control-plane/) pendiente de mudarse a `accesos-seo/ops-control-plane` (path sugerido: `automation_projects/03-freelancer-invoices/`).

---

## 1. Qué hace

El último día del mes − 2 (09:00 hora Bogotá), el sistema:

1. **Genera** una cuenta de cobro en estado `draft` por cada freelancer activo con monto fijo > 0 (idempotente vía `UNIQUE (user_id, year, month)`).
2. **Arma el Google Doc formal** (cabecera, datos del freelancer, periodo, monto, firmas), lo guarda en Drive y registra `document_url` en la cuenta.
3. **Encola y envía notificaciones** vía Mailjet (correo) y Slack DM (cuando hay `slack_id`), con botones "He recibido", "Reportar observación" y enlace al Doc.
4. **Espera la confirmación del redactor**. Si pulsa "He recibido" → notifica al admin con botón "Aprobar". Si pulsa "Reportar observación" → exige motivo y notifica al admin.
5. **El admin aprueba** mediante token público o desde la app. Después puede marcar como pagada con referencia bancaria, lo que se espeja en `freelancer_payments` para contabilidad.
6. Si en cualquier punto nadie responde, el **escalator diario** (10:00 BOG) sube el nivel de insistencia: +24h hasta nivel 3, +48h hasta nivel 5, luego +72h.

Para el flujo end-to-end detallado y los componentes ver [`AGENT_ONBOARDING.md`](AGENT_ONBOARDING.md).

---

## 2. Configuración (en Supabase Light_House)

| Config | Valor |
|---|---|
| `production_go` | `true` |
| `auto_send` | `true` (correos salen automáticamente) |
| `auto_pay` | `false` (el admin marca el pago manual) |
| Modelo de pago | `monthly_fixed` (salario fijo, en USD por default) |
| Día de generación | Último día del mes − 2 (zona Bogotá) |
| Canales | `email` (Mailjet, activo) + `slack_dm` (encola, worker pendiente) |
| Repo de implementación | `accesos-seo/ops-control-plane` (sugerido `automation_projects/03-freelancer-invoices/`) |
| Patches pendientes | [`propuestas-ops-control-plane/`](propuestas-ops-control-plane/) |
| Runtime | Supabase Light_House (`stjugsrkrweakvzmizpq`) |

---

## 3. Componentes (inventario)

### 3.1 Tablas en Light_House

| Tabla | Filas hoy | Función |
|---|---|---|
| `freelancer_invoice_settings` | 7 (6 seed + 1 admin propio) | Configuración por freelancer: monto fijo, admin responsable, canal, datos bancarios. |
| `freelancer_invoices` | 0 | Una fila por (freelancer × mes). Estado, tokens, timestamps, escalamiento, URL del Doc. |
| `freelancer_invoice_events` | 0 | Audit trail completo (created, status_changed, dispatched, ack, reject, approved, paid, followup_*). |
| `freelancer_payments` | 3 (preexistente) | Espejo histórico al marcar pagada. Mantiene compatibilidad con contabilidad. |
| `notifications_outbox` | shared | Cola de correos/Slack pendientes (`source='freelancer_invoice'`). |
| `company_policies` | +1 | Política `freelancer_invoices` documenta el proceso oficial en la base. |

### 3.2 Funciones SQL

| Función | Visibilidad | Función |
|---|---|---|
| `generate_monthly_freelancer_invoices(year, month)` | `service_role` | Crea drafts idempotente. |
| `dispatch_freelancer_invoice(invoice_id)` | `service_role` | Encola correo + Slack y marca `sent`. |
| `acknowledge_freelancer_invoice(token, message?)` | `anon`+`authenticated` | "He recibido" — usado desde el correo y desde la app. |
| `reject_freelancer_invoice(token, reason)` | `anon`+`authenticated` | "Reportar observación" — motivo obligatorio. |
| `approve_freelancer_invoice(token, admin_user_id, notes?)` | `anon`+`authenticated` | "Aprobar". |
| `mark_freelancer_invoice_paid(invoice_id, admin_user_id, ref?)` | `authenticated` | Cierre contable. |
| `escalate_pending_freelancer_invoices()` | `service_role` | Runner diario de insistencia. |
| `run_monthly_freelancer_invoice_generator()` | `service_role` | Decide si hoy = fin de mes − 2; si sí, genera. |
| `_freelancer_invoice_edge_url(slug)` | privado | Lee URL desde Vault. |
| `_freelancer_invoice_internal_secret()` | privado | Lee header secret desde Vault. |

### 3.3 Edge Functions (en Light_House)

| Slug | Versión | Función |
|---|---|---|
| `freelancer-invoice-document-builder` | 4 | Toma drafts, genera Google Doc, marca sent y dispara dispatch. |
| `freelancer-invoice-outbox-worker` | 2 | Envía correos pendientes vía Mailjet. |

### 3.4 pg_cron jobs

| Job | Cron | Función |
|---|---|---|
| `freelancer-invoice-generator-daily` | `0 14 * * *` (09:00 BOG) | `run_monthly_freelancer_invoice_generator()` |
| `freelancer-invoice-document-builder` | `*/10 * * * *` | Llama Edge Function vía pg_net (URL+secret desde Vault) |
| `freelancer-invoice-outbox-worker` | `*/5 * * * *` | Llama Edge Function vía pg_net (URL+secret desde Vault) |
| `freelancer-invoice-escalator-daily` | `0 15 * * *` (10:00 BOG) | `escalate_pending_freelancer_invoices()` |

### 3.5 Secretos en Vault

- `FREELANCER_INVOICE_INTERNAL_SECRET` — header `x-internal-secret` que valida las Edge Functions.
- `FREELANCER_INVOICE_PROJECT_URL` — URL base del proyecto Supabase.

### 3.6 Secretos en Functions Secrets

`MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_DOCS_REFRESH_TOKEN`, `FREELANCER_INVOICE_INTERNAL_SECRET` (mismo valor que en Vault). Opcionales: `FREELANCER_INVOICE_FROM_EMAIL`, `FREELANCER_INVOICE_FROM_NAME`, `FREELANCER_INVOICE_APP_BASE_URL`, `FREELANCER_INVOICE_DRIVE_ROOT`.

Detalle de cada secreto y dónde se configura en [`propuestas-ops-control-plane/SECRETS.md`](propuestas-ops-control-plane/SECRETS.md).

---

## 4. Estado actual (datos reales 2026-05-16)

| Indicador | Valor |
|---|---|
| Freelancers registrados en `freelancer_invoice_settings` | 7 (6 seed migrados desde `freelancer_rates` + Sebastián Castaño deactivado tras test) |
| Freelancers con `monthly_amount > 0` y activos | **0** ⚠ (pendiente cargar montos reales) |
| Cuentas de cobro generadas en producción | 0 (esperando carga de montos) |
| Cron jobs activos | 4 / 4 |
| Edge Functions desplegadas | 2 / 2 |
| Secretos en Vault | 2 / 2 |
| Verificación E2E con correo real | ✅ 2026-05-15 a `robert@seolabagency.com`, Mailjet `provider_message_id 1152921541807296800` |
| RLS habilitada en las 3 tablas | ✅ |
| Frontend construido | ❌ (spec lista en [`propuestas-ops-control-plane/03-frontend-spec/`](propuestas-ops-control-plane/03-frontend-spec/)) |

---

## 5. Decisiones pendientes del dueño del producto

| Decisión | Opciones | Estado |
|---|---|---|
| Monto fijo mensual por cada redactor | Carga manual desde plantilla / archivo Excel / negociado caso a caso | Pendiente |
| Admin responsable por cada freelancer | Único admin global / asignación por proyecto / por marca | Pendiente |
| Worker para Slack DM | Construir / dejar sólo en outbox / canal compartido en lugar de DM | Pendiente |
| Worker para WhatsApp | Reusar `boti-whatsapp-outbox-worker` existente / no usar / canal opcional configurable por freelancer | Pendiente |
| Frontend | Construir desde cero / reutilizar componentes de Orbit / página standalone | Pendiente |
| Política tributaria | Retener impuestos automáticamente / cuenta bruta + autoliquidación / sin retención | Pendiente |
| Día de generación | Mantener fin de mes − 2 / quincenal / configurable por freelancer | Confirmar (default actual: mensual − 2) |

---

## 6. Optimizaciones priorizadas

### Quick wins (impacto alto, 1 día)

- Cargar montos reales y `admin_user_id` de los 6 redactores actuales.
- Construir un worker mínimo para Slack DM (replicar patrón del outbox-worker).
- Plantilla de email de bienvenida que se dispara al primer registro en `freelancer_invoice_settings`.

### Optimizaciones medianas (3-5 días)

- Construir el frontend mínimo: confirmación pública con token + dashboard admin.
- Endpoint de export contable (todos los `paid` del mes en CSV).
- Métricas: dashboard con KPI de cuántas cuentas pasaron sin escalar, tiempo promedio aprobación.

### Estratégicas (1-2 semanas)

- Migrar la implementación de `propuestas-ops-control-plane/` al repo `ops-control-plane` real.
- Integrar con sistema contable (Quickbooks / Alegra / Siigo) para registro automático.
- Soporte multimoneda con tipos de cambio del día (hoy todos USD).
- Política tributaria configurable: retención por país / régimen.

---

## 7. Links y referencias

- Implementación (pendiente migrar): [`propuestas-ops-control-plane/`](propuestas-ops-control-plane/)
- Migraciones SQL: [`propuestas-ops-control-plane/01-database-migrations/`](propuestas-ops-control-plane/01-database-migrations/)
- Edge Functions: [`propuestas-ops-control-plane/02-edge-functions/`](propuestas-ops-control-plane/02-edge-functions/)
- Especificación frontend: [`propuestas-ops-control-plane/03-frontend-spec/frontend-spec.md`](propuestas-ops-control-plane/03-frontend-spec/frontend-spec.md)
- Arquitectura técnica: [`propuestas-ops-control-plane/architecture.md`](propuestas-ops-control-plane/architecture.md)
- Modelo de datos: [`propuestas-ops-control-plane/data-model.md`](propuestas-ops-control-plane/data-model.md)
- Runbook operativo: [`propuestas-ops-control-plane/runbook.md`](propuestas-ops-control-plane/runbook.md)
- Manejo de secretos: [`propuestas-ops-control-plane/SECRETS.md`](propuestas-ops-control-plane/SECRETS.md)
- Política operativa: [`politicas/cuentas-de-cobro.yaml`](politicas/cuentas-de-cobro.yaml)
- Supabase runtime: proyecto Light_House (`stjugsrkrweakvzmizpq`)
- Política en BD: `company_policies` filtra por `policy_type='freelancer_invoices'`

---

## 7.5. Decisiones tomadas

| ID | Fecha | Decisión | Detalle |
|---|---|---|---|
| D-001 | 2026-05-15 | Stack: Supabase puro, sin n8n | Toda la infraestructura ya existía (pg_cron, notifications_outbox, Mailjet, Google Docs). Replicar en n8n agregaría dependencias sin valor para este caso. |
| D-002 | 2026-05-15 | Modelo salario fijo mensual (no por palabras) | Reemplaza el modelo `per_word` de `freelancer_rates`. Esa tabla queda en lectura por compatibilidad. |
| D-003 | 2026-05-15 | Tokens públicos para confirmación sin login | 32 chars hex. RPCs accesibles a `anon`. Validan estado antes de actuar. |
| D-004 | 2026-05-15 | Generación de Google Doc inline en la Edge Function | Evitar dependencia entre Edge Functions (problema JWT). Se replica el OAuth de Google directamente. |
| D-005 | 2026-05-15 | Pipeline en 4 etapas separadas (generator → document-builder → outbox-worker → escalator) | Cada uno con su cron. Separación de responsabilidades; idempotencia individual. |
| D-006 | 2026-05-15 | Escalamiento progresivo 24h → 48h → 72h | Hasta nivel 3 cada 24h, hasta nivel 5 cada 48h, después cada 72h. Nivel ≥5 sugiere contacto manual. |
| D-007 | 2026-05-15 | RLS habilitada con 3 políticas (writer, admin, todas para General Director / KAM) | El frontend no necesita filtrar manualmente. |
| D-008 | 2026-05-15 | Espejo automático en `freelancer_payments` al marcar pagada | Mantiene compatibilidad con la tabla histórica para contabilidad. |
| D-009 | 2026-05-15 | Mailjet como proveedor de correo | Ya está configurado para `send-mention-email`. Cero overhead. Remitente `accesos@seolabagency.com`. |
| D-010 | 2026-05-15 | Verificación E2E con correo real | Cuenta ficticia USD 1 a `robert@seolabagency.com`. Pipeline completo OK. Datos eliminados. |
| D-011 | 2026-05-16 | Secretos movidos a Supabase Vault (no en código) | `_freelancer_invoice_edge_url()` y `_freelancer_invoice_internal_secret()` los leen desde Vault. Repo público-safe. |
| D-012 | 2026-05-16 | Edge Functions fallan duro (500) si falta `FREELANCER_INVOICE_INTERNAL_SECRET` | Eliminado fallback hardcoded. Evita ejecución insegura. |

---

## 8. Bitácora

| Fecha | Evento |
|---|---|
| 2026-05-15 | Diagnóstico inicial: modelo `per_word` (3 items) sin generación automática. Decidido construir desde cero. |
| 2026-05-15 | Migración `freelancer_invoices_v1_schema`: enum + 3 tablas + RLS + triggers. |
| 2026-05-15 | Migración `freelancer_invoices_v1_functions`: 10 funciones SQL de negocio. |
| 2026-05-15 | Migración `freelancer_invoices_v1_cron_jobs`: jobs generator y escalator. |
| 2026-05-15 | Migración `freelancer_invoices_v1_policy_and_seed`: política empresarial + seed para 6 redactores. |
| 2026-05-15 | Hot-fixes: `ON CONFLICT WHERE` (índice parcial); ambigüedad de `user_id` en RETURNING. |
| 2026-05-15 | Verificación E2E en seco: ciclo `draft → sent → ack → approved → paid` OK. |
| 2026-05-15 | Migración `freelancer_invoices_v2_separate_dispatch_and_doc_pipeline`: el generator deja solo drafts; document-builder se encarga del resto. |
| 2026-05-15 | Edge Functions desplegadas: `freelancer-invoice-document-builder` v4 + `freelancer-invoice-outbox-worker` v2. |
| 2026-05-15 | Verificación E2E con correo real a `robert@seolabagency.com` ✅. Pipeline completo Mailjet. |
| 2026-05-16 | Migración `freelancer_invoices_v3_use_vault_for_internal_secret`: secretos a Vault, helpers `_freelancer_invoice_edge_url` y `_freelancer_invoice_internal_secret`. |
| 2026-05-16 | Sanitización del repo para hacerlo público: cero referencias a secretos literales o `project_ref` real. |
| 2026-05-16 | Reorganización según convención del repo `Agents_Automations`: README + AGENT_ONBOARDING + AREAS + WORK_IN_PROGRESS + politicas/ + propuestas-ops-control-plane/. |
