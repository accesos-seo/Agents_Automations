# Modelo de datos

## Diagrama de relaciones

```
users (existing)
  │
  │  user_id          admin_user_id      created_by
  ▼                     ▼                  ▼
freelancer_invoice_settings  ◀──── 1:1 ──── users (admin)
  │
  │ (datos copiados al generar)
  ▼
freelancer_invoices ──── 1:N ───▶ freelancer_invoice_events
  │
  │ (al marcar pagada)
  ▼
freelancer_payments (espejo histórico)

notifications_outbox  ◀──── encola desde ──── dispatch / notify helpers
                           (source = 'freelancer_invoice')

company_policies  ◀──── policy_type = 'freelancer_invoices' (documentación legal)
```

## Tabla `freelancer_invoice_settings`

| Columna | Tipo | Nullable | Default | Notas |
|---|---|---|---|---|
| `user_id` | `uuid` | NO | — | PK + FK `users.id` ON DELETE CASCADE |
| `is_active` | `boolean` | NO | `true` | Si false, no se genera cuenta |
| `monthly_amount` | `numeric(12,2)` | NO | `0` | CHECK ≥ 0. Si 0, se omite |
| `currency` | `text` | NO | `'USD'` | |
| `payment_method` | `text` | SÍ | — | Ej. "Transferencia BBVA" |
| `payment_account` | `jsonb` | NO | `'{}'` | Datos bancarios estructurados |
| `admin_user_id` | `uuid` | SÍ | — | FK `users.id`. Quien aprueba |
| `notification_email` | `text` | SÍ | — | Override de `users.email` |
| `notification_slack_id` | `text` | SÍ | — | Override de `users.slack_id` |
| `notes` | `text` | SÍ | — | Notas internas |
| `created_at`, `updated_at` | `timestamptz` | NO | `now()` | Trigger automático |

## Tabla `freelancer_invoices`

| Columna | Tipo | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | NO | — | FK `users.id` (writer) |
| `period_year` | `int` | NO | — | |
| `period_month` | `int` | NO | — | CHECK 1..12 |
| `period_start`, `period_end` | `date` | NO | — | Día 1 / último del mes |
| `rate_type` | `text` | NO | `'monthly_fixed'` | Reservado para futuro |
| `monthly_amount` | `numeric(12,2)` | NO | — | Snapshot al generar |
| `bonus_amount` | `numeric(12,2)` | NO | `0` | |
| `deduction_amount` | `numeric(12,2)` | NO | `0` | |
| `total_amount` | `numeric(12,2)` | NO | computed | STORED: monthly + bonus − deduction |
| `currency` | `text` | NO | `'USD'` | |
| `status` | `freelancer_invoice_status` | NO | `'draft'` | enum |
| `document_url` | `text` | SÍ | — | URL del Google Doc |
| `google_doc_id` | `text` | SÍ | — | File ID en Drive |
| `writer_token` | `text` | NO | random hex 32 | UNIQUE |
| `admin_token` | `text` | NO | random hex 32 | UNIQUE |
| `writer_acknowledged_at` | `timestamptz` | SÍ | — | Cuándo confirmó |
| `writer_response` | `text` | SÍ | — | Mensaje opcional |
| `writer_rejected_at` | `timestamptz` | SÍ | — | Cuándo rechazó |
| `writer_rejection_reason` | `text` | SÍ | — | Motivo |
| `admin_user_id` | `uuid` | SÍ | — | FK `users.id` |
| `admin_approved_at` | `timestamptz` | SÍ | — | |
| `admin_notes` | `text` | SÍ | — | |
| `paid_at` | `timestamptz` | SÍ | — | |
| `payment_reference` | `text` | SÍ | — | |
| `escalation_level` | `int` | NO | `0` | |
| `follow_up_count` | `int` | NO | `0` | |
| `last_followup_at`, `next_followup_at` | `timestamptz` | SÍ | — | |
| `sent_at` | `timestamptz` | SÍ | — | Primera notificación |
| `last_writer_notified_at` | `timestamptz` | SÍ | — | |
| `last_admin_notified_at` | `timestamptz` | SÍ | — | |
| `created_at`, `updated_at` | `timestamptz` | NO | `now()` | Trigger automático |
| `created_by` | `uuid` | SÍ | — | |
| `metadata` | `jsonb` | NO | `'{}'` | Espacio libre |

**Constraints:**
- `UNIQUE (user_id, period_year, period_month)` — una sola cuenta por persona-mes.

**Índices:**
- `(status)` — filtros del dashboard.
- `(period_year, period_month)` — listados por periodo.
- `(user_id, period_year DESC, period_month DESC)` — historial del freelancer.
- `(next_followup_at)` parcial `WHERE status IN ('sent','acknowledged_by_writer')` — escalator.
- UNIQUE `(writer_token)`, UNIQUE `(admin_token)` — lookups por token.

## Tabla `freelancer_invoice_events`

Audit log. Una fila por evento. El trigger `trg_log_freelancer_invoice_status` la rellena automáticamente en cada cambio de `status`.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `bigserial` | PK |
| `invoice_id` | `uuid` | FK `freelancer_invoices.id` ON DELETE CASCADE |
| `event_type` | `text` | Ver lista abajo |
| `actor_user_id` | `uuid` | NULL = sistema |
| `actor_role` | `text` | `writer` / `admin` / `system` |
| `payload` | `jsonb` | Detalles |
| `created_at` | `timestamptz` | |

**event_types posibles:**

| event_type | Cuándo | payload típico |
|---|---|---|
| `created` | Al insertar la cuenta | `{"status": "draft"}` |
| `status_changed` | Cualquier cambio de status (trigger) | `{"from": "...", "to": "..."}` |
| `dispatched` | Tras dispatch | `{"email": true, "slack": false}` |
| `document_generated` | Tras crear Google Doc | `{"url": "...", "document_id": "..."}` |
| `acknowledged_by_writer` | Writer confirma | `{"message": "..."}` |
| `rejected_by_writer` | Writer rechaza | `{"reason": "..."}` |
| `admin_approved` | Admin aprueba | `{"notes": "..."}` |
| `paid` | Admin marca pagada | `{"reference": "..."}` |
| `followup_writer` | Insistencia al writer | `{"escalation_level": N}` |
| `followup_admin` | Insistencia al admin | `{"escalation_level": N}` |

## Vistas / queries recomendadas

**Cuentas pendientes de mi aprobación (admin):**
```sql
SELECT * FROM freelancer_invoices
WHERE admin_user_id = auth.uid()
  AND status = 'acknowledged_by_writer'
ORDER BY writer_acknowledged_at;
```

**Mi historial (writer):**
```sql
SELECT period_year, period_month, total_amount, currency, status, document_url
FROM freelancer_invoices
WHERE user_id = auth.uid()
ORDER BY period_year DESC, period_month DESC;
```

**KPI del dashboard:**
```sql
SELECT status, count(*), sum(total_amount) AS total
FROM freelancer_invoices
WHERE period_year = EXTRACT(year FROM now())::int
GROUP BY status;
```
