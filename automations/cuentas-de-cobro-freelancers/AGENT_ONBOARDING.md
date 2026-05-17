# Onboarding — Cuentas de Cobro Automáticas para Freelancers

> Lee este documento antes de tomar cualquier acción. Reemplaza la necesidad de revisar la conversación anterior.
> Tiempo de lectura: 4 minutos.

---

## 1. Identidad del proyecto

| | |
|---|---|
| **Nombre** | Cuentas de Cobro Automáticas para Freelancers |
| **automation_key** | `cuentas-de-cobro-freelancers` |
| **Versión actual en producción** | 1.0 (pipeline v2 con secretos en Vault) |
| **Estado** | `active` / `production_ready_gated` |
| **`production_go`** | `true` |
| **`auto_send`** | `true` (correos salen solos) |
| **`auto_pay`** | `false` (el admin marca pago manual) |
| **Activado** | 2026-05-15 |
| **Owner producto** | _por definir_ |
| **Owner técnico** | _por definir_ |

**Qué hace:** automatiza la generación, envío y aprobación de la cuenta de cobro mensual de cada freelancer. El último día del mes − 2 genera un Google Doc por freelancer con monto fijo, envía correo y Slack DM al redactor con botones de confirmación, escala si nadie responde, y permite al admin aprobar y registrar el pago. Todo el flujo queda auditado en `freelancer_invoice_events`.

**Modelo de pago:** salario fijo mensual (`monthly_fixed`). Reemplaza el modelo anterior de pago por palabras (`per_word`) que vivía en `freelancer_rates`.

---

## 2. Dónde vive cada cosa (rutas exactas)

### 2.1. En Supabase

**Runtime productivo** — proyecto `Light_House` (`stjugsrkrweakvzmizpq`):

- `freelancer_invoice_settings` (7 filas) — configuración por freelancer: monto, admin, canal, banco.
- `freelancer_invoices` (0 filas) — una por (freelancer × mes). Estado, tokens, escalamiento, URL del Doc.
- `freelancer_invoice_events` (0 filas) — audit trail: cada cambio de status, follow-up y confirmación.
- `freelancer_payments` (preexistente) — espejo histórico al marcar pagada.
- `notifications_outbox` (compartida) — cola de correos/Slack (`source = 'freelancer_invoice'`).
- `company_policies` — política `policy_type = 'freelancer_invoices'` documentada en BD.
- `users`, `agency_roles` — usadas para RLS y para resolver email/slack/admin.
- Vault (`vault.decrypted_secrets`) — `FREELANCER_INVOICE_INTERNAL_SECRET`, `FREELANCER_INVOICE_PROJECT_URL`.

### 2.2. Edge Functions (en Light_House)

| Slug | Versión | Rol |
|---|---|---|
| `freelancer-invoice-document-builder` | 4 | Toma drafts, crea Google Doc, marca sent, dispara dispatch. |
| `freelancer-invoice-outbox-worker` | 2 | Envía correos pendientes vía Mailjet. |

Ambas con `verify_jwt: false` y validación por header `x-internal-secret` (cargado desde Vault).

### 2.3. pg_cron jobs (4 activos)

| Job | Cron | Función |
|---|---|---|
| `freelancer-invoice-generator-daily` | `0 14 * * *` (09:00 BOG) | `run_monthly_freelancer_invoice_generator()` |
| `freelancer-invoice-document-builder` | `*/10 * * * *` | net.http_post a Edge Function |
| `freelancer-invoice-outbox-worker` | `*/5 * * * *` | net.http_post a Edge Function |
| `freelancer-invoice-escalator-daily` | `0 15 * * *` (10:00 BOG) | `escalate_pending_freelancer_invoices()` |

### 2.4. Implementación en GitHub

**Repo de implementación (sugerido):** `accesos-seo/ops-control-plane`
**Path sugerido:** `automation_projects/03-freelancer-invoices/`

Estructura propuesta:
- `database/migrations/` — los 5 SQL versionados.
- `edge-functions/freelancer-invoice-document-builder/` — código Deno.
- `edge-functions/freelancer-invoice-outbox-worker/` — código Deno.
- `frontend-spec/` — la especificación para construir las pantallas.

⚠ **No tengo acceso de escritura a `ops-control-plane` desde este repo.** Los archivos preparados para mudarse viven en [`propuestas-ops-control-plane/`](propuestas-ops-control-plane/) hasta que el desarrollador los aplique.

### 2.5. En este repo (gobierno)

```
automations/cuentas-de-cobro-freelancers/
├── README.md                          ← Plano de control de la automatización
├── AGENT_ONBOARDING.md                ← Este documento
├── AREAS.md                           ← Áreas de trabajo separables
├── WORK_IN_PROGRESS.md                ← Registro de sesiones activas
├── .gitignore                         ← Evita subir secretos
├── politicas/
│   └── cuentas-de-cobro.yaml         ← Configuración machine-readable de la política
└── propuestas-ops-control-plane/      ← Todo lo que va a ops-control-plane
    ├── README.md                     ← Cómo aplicar los patches
    ├── CHANGELOG.md                   ← Histórico de versiones
    ├── SECRETS.md                     ← Mapa de secretos y cómo configurarlos
    ├── .env.example                   ← Plantilla local con placeholders
    ├── architecture.md                ← Arquitectura técnica
    ├── data-model.md                  ← Tablas, columnas, índices
    ├── runbook.md                     ← Operación y troubleshoot
    ├── 01-database-migrations/        ← 5 SQL + README
    ├── 02-edge-functions/
    │   ├── freelancer-invoice-document-builder/
    │   └── freelancer-invoice-outbox-worker/
    └── 03-frontend-spec/
        └── frontend-spec.md           ← Especificación detallada para el frontend
```

---

## 3. Flujo end-to-end (cómo funciona)

```
1. GENERATOR (pg_cron 09:00 BOG)
   ↓
   run_monthly_freelancer_invoice_generator():
     - Solo si hoy = fin de mes − 2.
     - generate_monthly_freelancer_invoices(año, mes):
         INSERT freelancer_invoices ... ON CONFLICT DO NOTHING
         por cada freelancer is_active=true AND monthly_amount>0.
     - status = 'draft', sin document_url.

2. DOCUMENT-BUILDER (pg_cron cada 10 min)
   ↓
   Edge Function fetcha drafts sin document_url:
     - getGoogleToken() (refresh token desde Functions Secret)
     - ensureFolder("SeoLab Cuentas de cobro" / nombre_freelancer)
     - uploadGoogleDoc(HTML armado con datos del cobro)
     - setPublicReader(fileId)
     - UPDATE freelancer_invoices SET document_url, google_doc_id
     - RPC dispatch_freelancer_invoice(id):
         INSERT notifications_outbox (email + slack si aplica)
         UPDATE status = 'sent', sent_at, next_followup_at = +24h

3. OUTBOX-WORKER (pg_cron cada 5 min)
   ↓
   Edge Function fetcha outbox source='freelancer_invoice', target_type='email', status='pending':
     - Renderiza HTML según `type` (invoice_sent, invoice_reminder_writer, etc.)
     - Envía vía Mailjet
     - UPDATE status = 'sent' (con provider_message_id) o 'error' (con backoff 30 min)

4. REDACTOR RECIBE CORREO
   ↓
   Pulsa "He recibido" → /invoice/ack/:writer_token
     → RPC acknowledge_freelancer_invoice(token, message?)
     → status = 'acknowledged_by_writer'
     → notify_admin_for_invoice_approval(invoice_id) encola correo+slack al admin

   O pulsa "Reportar observación" → /invoice/reject/:writer_token
     → RPC reject_freelancer_invoice(token, reason)
     → status = 'rejected_by_writer'
     → notify_admin_for_invoice_rejection encola alerta al admin

5. ADMIN RECIBE CORREO
   ↓
   Pulsa "Aprobar" → /invoice/approve/:admin_token
     → RPC approve_freelancer_invoice(token, admin_user_id, notes?)
     → status = 'admin_approved'
     → notify_writer_of_approval encola confirmación

6. ADMIN MARCA PAGO (desde el dashboard)
   ↓
   RPC mark_freelancer_invoice_paid(invoice_id, admin_user_id, ref?)
     → status = 'paid', paid_at, payment_reference
     → INSERT freelancer_payments (espejo histórico)
     → Fin del flujo

ESCALATOR (pg_cron 10:00 BOG, cada día)
   ↓
   escalate_pending_freelancer_invoices():
     Para cada invoice en sent/acknowledged con next_followup_at <= now():
       - escalation_level += 1
       - next_followup_at = +24h (lvl<3) | +48h (lvl<5) | +72h
       - dispatch_freelancer_invoice_followup(id, 'writer' | 'admin')
     Cuando alguien confirma/aprueba, escalation_level vuelve a 0.
```

**Tiempo típico:** correo en bandeja del freelancer ~10 min después de la generación.

---

## 4. Estado actual (2026-05-16)

| Indicador | Valor |
|---|---|
| Tablas creadas | 3 ✅ |
| Funciones SQL | 10 ✅ |
| Edge Functions | 2 ✅ |
| Cron jobs | 4 / 4 ✅ |
| RLS en las 3 tablas | ✅ |
| Secretos en Vault | 2 / 2 ✅ |
| Verificación E2E con correo real | ✅ a `robert@seolabagency.com` |
| Freelancers con monto > 0 | **0** ⚠ pendiente carga manual |
| Frontend | ❌ pendiente |

---

## 5. Decisiones tomadas (historia reciente)

| ID | Fecha | Decisión | Estado |
|---|---|---|---|
| D-001 | 2026-05-15 | Stack 100% Supabase (sin n8n) | ✅ Aplicado |
| D-002 | 2026-05-15 | Modelo `monthly_fixed` reemplaza `per_word` | ✅ En BD |
| D-003 | 2026-05-15 | Tokens públicos hex 32 chars sin login | ✅ En RPCs |
| D-004 | 2026-05-15 | Google Doc inline en Edge Function (sin dependencia entre fn) | ✅ Productivo |
| D-005 | 2026-05-15 | Pipeline en 4 etapas (gen / doc / outbox / escalator) | ✅ Productivo |
| D-006 | 2026-05-15 | Escalamiento 24/48/72h por nivel | ✅ En SQL |
| D-007 | 2026-05-15 | RLS con 3 políticas (writer, admin, KAM) | ✅ Habilitada |
| D-008 | 2026-05-15 | Espejo en `freelancer_payments` al marcar pagada | ✅ Implementado |
| D-009 | 2026-05-15 | Mailjet como proveedor de correo | ✅ Productivo |
| D-010 | 2026-05-15 | Verificación E2E con correo real OK | ✅ 1152921541807296800 |
| D-011 | 2026-05-16 | Secretos a Supabase Vault | ✅ Migrado |
| D-012 | 2026-05-16 | Edge Functions fallan 500 sin secret (no fallback) | ✅ Aplicado |

Detalle completo en [`README.md`](README.md) sección 7.5.

---

## 6. Reglas no negociables

1. **Los secretos nunca van en código.** Vault (para SQL) + Functions Secrets (para Deno). El repo es público-safe.
2. **Para cambiar el estado de una cuenta, llamar siempre a las RPCs.** Nunca `UPDATE freelancer_invoices SET status = ...` directo desde frontend/cliente.
3. **`mark_freelancer_invoice_paid` exige `status = admin_approved`** (no se puede pagar sin aprobar antes).
4. **El motivo de rechazo es obligatorio** (`reject_freelancer_invoice` falla si está vacío).
5. **El generator es idempotente** vía `UNIQUE (user_id, year, month)`. Correr `generate_monthly_freelancer_invoices(2026, 5)` N veces produce 1 sola fila.
6. **Las notificaciones tienen `dedupe_key` único**. El mismo aviso no se envía dos veces.
7. **El generator solo dispara el último día del mes − 2** (zona Bogotá). Si quieres forzar generación manual, llamar directo a `generate_monthly_freelancer_invoices(año, mes)`.
8. **Para enviar correo a una dirección de prueba**, sobrescribir `freelancer_invoice_settings.notification_email` (no editar `users.email`).

---

## 7. Lo que está pendiente (por área)

Revisa primero [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md) para no chocar con otra sesión, y luego [`AREAS.md`](AREAS.md) para entender el alcance de tu área. Resumen:

- **Configuración:** cargar montos reales y `admin_user_id` de los 6 redactores.
- **Slack worker:** construir worker para `target_type = 'slack_dm'` (hoy se encola, no se envía).
- **Frontend:** construir las 7 pantallas descritas en [`propuestas-ops-control-plane/03-frontend-spec/frontend-spec.md`](propuestas-ops-control-plane/03-frontend-spec/frontend-spec.md).
- **Migración a ops-control-plane:** mover los archivos de `propuestas-ops-control-plane/` al repo correcto.
- **Integración contable:** export CSV o webhook a sistema contable al marcar `paid`.
- **Multimoneda:** hoy todo USD; soportar otras monedas con tipo de cambio del día si aplica.

---

## 8. Cómo empezar tu sesión (los 4 pasos)

1. Identifica tu **área de trabajo** en [`AREAS.md`](AREAS.md).
2. Verifica que el área **no esté tomada** en [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).
3. **Registra tu sesión** añadiendo una fila en `WORK_IN_PROGRESS.md`. Commit y push antes de empezar.
4. **Trabaja.** Cuando termines, marca tu sesión como cerrada y actualiza la sección "7.5. Decisiones tomadas" y "8. Bitácora" del [`README.md`](README.md) si tu cambio afecta a otros.
