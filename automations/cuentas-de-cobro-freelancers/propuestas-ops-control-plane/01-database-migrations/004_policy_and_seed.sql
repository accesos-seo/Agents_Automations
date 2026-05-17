-- ============================================================================
-- 004_policy_and_seed.sql
-- ----------------------------------------------------------------------------
-- Aplicado en producción como: freelancer_invoices_v1_policy_and_seed
-- ============================================================================
-- Inserta la política empresarial documentando el flujo y crea registros
-- iniciales en freelancer_invoice_settings a partir de las tarifas anteriores
-- por palabra (monto 0; el admin debe definir el monto fijo mensual).
-- ============================================================================

INSERT INTO public.company_policies (policy_type, title, description, content, language, is_active)
SELECT
  'freelancer_invoices',
  'POLÍTICA DE CUENTAS DE COBRO AUTOMATIZADAS PARA REDACTORES Y FREELANCERS',
  'Reglas oficiales del proceso automático de generación, envío, confirmación y aprobación de cuentas de cobro mensuales.',
  jsonb_build_object(
    'model',          'monthly_fixed',
    'generation_day', 'fin_de_mes_menos_2',
    'channels',       jsonb_build_array('email','slack_dm'),
    'writer_flow',    jsonb_build_array('recibe_correo_y_slack','pulsa_he_recibido','o_pulsa_observacion_con_motivo'),
    'admin_flow',     jsonb_build_array('recibe_aviso_tras_acknowledge','pulsa_aceptar','marca_como_pagada'),
    'escalation',     jsonb_build_object(
      'levels',  jsonb_build_array(1,2,3,4,5),
      'cadence', jsonb_build_object('lvl_1_2','24h','lvl_3_4','48h','lvl_5_plus','72h')
    ),
    'roles', jsonb_build_object(
      'writer', 'redactor / content_writer / editor',
      'admin',  'General Director / Director General / KAM'
    ),
    'states', jsonb_build_array(
      'draft','sent','acknowledged_by_writer','rejected_by_writer',
      'admin_approved','paid','cancelled'
    ),
    'tables', jsonb_build_array(
      'freelancer_invoice_settings','freelancer_invoices','freelancer_invoice_events'
    ),
    'cron_jobs', jsonb_build_array(
      'freelancer-invoice-generator-daily (0 14 * * *)',
      'freelancer-invoice-document-builder (*/10 * * * *)',
      'freelancer-invoice-outbox-worker (*/5 * * * *)',
      'freelancer-invoice-escalator-daily (0 15 * * *)'
    )
  ),
  'es',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_policies
  WHERE policy_type = 'freelancer_invoices' AND language = 'es'
);

-- Seed inicial de settings a partir de freelancer_rates existente.
-- monthly_amount queda en 0 → el admin debe definirlo antes del primer corte.
INSERT INTO public.freelancer_invoice_settings (user_id, is_active, monthly_amount, currency, notes)
SELECT
  fr.user_id,
  true,
  0,
  COALESCE(fr.currency, 'USD'),
  'Migrado desde freelancer_rates (' || fr.rate_type || ' = ' || fr.amount || ' ' || COALESCE(fr.currency,'USD') ||
  '). PENDIENTE: definir monto fijo mensual.'
FROM public.freelancer_rates fr
WHERE NOT EXISTS (
  SELECT 1 FROM public.freelancer_invoice_settings s WHERE s.user_id = fr.user_id
);
