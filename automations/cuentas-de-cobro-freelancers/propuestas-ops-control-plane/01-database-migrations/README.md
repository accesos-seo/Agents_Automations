# Migraciones SQL

Aplicar en orden numérico. Idempotentes en su mayoría.

| # | Archivo | Equivalente en historial Supabase |
|---|---|---|
| 001 | `001_schema.sql` | `freelancer_invoices_v1_schema` |
| 002 | `002_functions.sql` | `freelancer_invoices_v1_functions` + `_fix_partial_unique_conflict` + `_fix_generator_drop_recreate` + `_v2_separate_dispatch_and_doc_pipeline` (consolidado) |
| 003 | `003_cron_jobs.sql` | `freelancer_invoices_v1_cron_jobs` (actualizado con los 4 jobs del pipeline v2, leyendo secretos desde Vault) |
| 004 | `004_policy_and_seed.sql` | `freelancer_invoices_v1_policy_and_seed` |
| 005 | `005_secrets_setup.sql` | `freelancer_invoices_v3_use_vault_for_internal_secret` |

**Orden de aplicación recomendado:** 001 → 002 → 004 → 005 (con valores reales en el SQL Editor) → 003.

## Aplicación

```bash
# Vía Supabase CLI
supabase db push

# O manualmente con psql contra la BD
for f in 001_*.sql 002_*.sql 003_*.sql 004_*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

## Reversa (rollback)

```sql
-- DROP en orden inverso:
SELECT cron.unschedule('freelancer-invoice-outbox-worker');
SELECT cron.unschedule('freelancer-invoice-document-builder');
SELECT cron.unschedule('freelancer-invoice-escalator-daily');
SELECT cron.unschedule('freelancer-invoice-generator-daily');

DROP FUNCTION IF EXISTS public.run_monthly_freelancer_invoice_generator() CASCADE;
DROP FUNCTION IF EXISTS public.escalate_pending_freelancer_invoices() CASCADE;
DROP FUNCTION IF EXISTS public.dispatch_freelancer_invoice_followup(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.notify_writer_of_approval(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.notify_admin_for_invoice_rejection(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.notify_admin_for_invoice_approval(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.mark_freelancer_invoice_paid(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.approve_freelancer_invoice(text, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.reject_freelancer_invoice(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.acknowledge_freelancer_invoice(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.dispatch_freelancer_invoice(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.generate_monthly_freelancer_invoices(int, int) CASCADE;
DROP FUNCTION IF EXISTS public.log_freelancer_invoice_status_change() CASCADE;
DROP FUNCTION IF EXISTS public.touch_freelancer_invoice_updated_at() CASCADE;

DROP TABLE IF EXISTS public.freelancer_invoice_events CASCADE;
DROP TABLE IF EXISTS public.freelancer_invoices CASCADE;
DROP TABLE IF EXISTS public.freelancer_invoice_settings CASCADE;
DROP TYPE  IF EXISTS public.freelancer_invoice_status;

DELETE FROM public.company_policies WHERE policy_type = 'freelancer_invoices';
```
