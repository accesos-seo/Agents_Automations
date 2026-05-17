-- ============================================================================
-- 003_cron_jobs.sql
-- pg_cron jobs para cuentas de cobro mensuales
-- ----------------------------------------------------------------------------
-- IMPORTANTE: este archivo NO contiene secretos en texto plano.
-- Los cron jobs leen el internal_secret y la project URL desde Supabase Vault
-- mediante las funciones helper _freelancer_invoice_internal_secret() y
-- _freelancer_invoice_edge_url().
--
-- Asegúrate de ejecutar PRIMERO `005_secrets_setup.sql` para poblar Vault.
-- ============================================================================
-- America/Bogota = UTC-5
--   09:00 Bogotá == 14:00 UTC
--   10:00 Bogotá == 15:00 UTC
-- ============================================================================

-- Desprogramar versiones anteriores (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'freelancer-invoice-generator-daily') THEN
    PERFORM cron.unschedule('freelancer-invoice-generator-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'freelancer-invoice-escalator-daily') THEN
    PERFORM cron.unschedule('freelancer-invoice-escalator-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'freelancer-invoice-document-builder') THEN
    PERFORM cron.unschedule('freelancer-invoice-document-builder');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'freelancer-invoice-outbox-worker') THEN
    PERFORM cron.unschedule('freelancer-invoice-outbox-worker');
  END IF;
END$$;

-- Generator: cada día a las 09:00 Bogotá. La función decide si hoy es el día.
SELECT cron.schedule(
  'freelancer-invoice-generator-daily',
  '0 14 * * *',
  $$ SELECT public.run_monthly_freelancer_invoice_generator(); $$
);

-- Escalator: cada día a las 10:00 Bogotá.
SELECT cron.schedule(
  'freelancer-invoice-escalator-daily',
  '0 15 * * *',
  $$ SELECT public.escalate_pending_freelancer_invoices(); $$
);

-- Document builder Edge Function: cada 10 minutos.
-- URL y secret se leen desde Vault.
SELECT cron.schedule(
  'freelancer-invoice-document-builder',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := public._freelancer_invoice_edge_url('freelancer-invoice-document-builder'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', public._freelancer_invoice_internal_secret()
    ),
    body := jsonb_build_object('source','pg_cron')
  );
  $$
);

-- Outbox worker Edge Function: cada 5 minutos.
SELECT cron.schedule(
  'freelancer-invoice-outbox-worker',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := public._freelancer_invoice_edge_url('freelancer-invoice-outbox-worker'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', public._freelancer_invoice_internal_secret()
    ),
    body := jsonb_build_object('source','pg_cron')
  );
  $$
);
