# Changelog — Sistema de cuentas de cobro automáticas

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [1.0.0] — 2026-05-15

### Agregado
- Modelo de datos: enum `freelancer_invoice_status` + tablas `freelancer_invoice_settings`, `freelancer_invoices`, `freelancer_invoice_events`.
- Funciones SQL: `generate_monthly_freelancer_invoices`, `dispatch_freelancer_invoice`, `acknowledge_freelancer_invoice`, `reject_freelancer_invoice`, `approve_freelancer_invoice`, `mark_freelancer_invoice_paid`, `escalate_pending_freelancer_invoices`, `run_monthly_freelancer_invoice_generator`, helpers de notify.
- 4 cron jobs en `pg_cron`: generator, document-builder, outbox-worker, escalator.
- 2 Edge Functions Deno: `freelancer-invoice-document-builder` y `freelancer-invoice-outbox-worker`.
- Audit trail completo en `freelancer_invoice_events` con trigger automático al cambiar estado.
- Política empresarial documentada en `company_policies` (categoría `freelancer_invoices`).
- 6 settings iniciales seed para los redactores actuales (montos en 0, pendientes de configurar).
- Row Level Security: redactor ve solo sus cuentas, admin (General Director / KAM) ve todas.
- Permisos `anon` para las 3 RPC públicas con validación por token.
- Espejo histórico de pagos en `freelancer_payments` al marcar como pagada.
- Templates de email HTML profesionales en español para cada `type` de notificación.
- Generación de Google Doc directo desde la Edge Function (sin dependencia inter-functions).

### Validado
- Ciclo completo `draft → sent → acknowledged → admin_approved → paid` probado en vivo.
- Idempotencia del generator (re-correr no duplica filas; constraint UNIQUE garantiza una sola cuenta por (user, año, mes)).
- Envío real de email vía Mailjet con `provider_message_id` registrado.
- Google Doc creado en Drive con permiso "anyone with link, reader".
- Limpieza completa de datos de prueba post-validación.
