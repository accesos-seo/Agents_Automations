-- ============================================================================
-- 005_secrets_setup.sql
-- Configura los secretos requeridos por los cron jobs en Supabase Vault.
-- ----------------------------------------------------------------------------
-- IMPORTANTE: este archivo es una PLANTILLA. Antes de ejecutarlo, reemplaza
-- los placeholders REPLACE_ME_* con los valores reales de tu entorno.
--
-- Alternativa más segura: ejecutar este SQL directamente en el SQL Editor
-- de Supabase (los valores reales NO se escriben en disco ni se versionan).
-- ============================================================================

-- Helper: crea o reemplaza un secret de Vault de forma idempotente.
DO $$
DECLARE
  v_name  text;
  v_value text;
BEGIN
  FOR v_name, v_value IN
    SELECT * FROM (VALUES
      ('FREELANCER_INVOICE_INTERNAL_SECRET', 'REPLACE_ME_WITH_A_LONG_RANDOM_STRING'),
      ('FREELANCER_INVOICE_PROJECT_URL',    'REPLACE_ME_https://YOUR_PROJECT_REF.supabase.co')
    ) AS s(name, value)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = v_name) THEN
      PERFORM vault.create_secret(v_value, v_name);
    END IF;
    -- Si quieres actualizar un valor existente, descomenta:
    -- PERFORM vault.update_secret(
    --   (SELECT id FROM vault.secrets WHERE name = v_name),
    --   v_value
    -- );
  END LOOP;
END$$;

-- Funciones helper para leer los secretos desde los cron jobs.

CREATE OR REPLACE FUNCTION public._freelancer_invoice_edge_url(p_slug text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_base text;
BEGIN
  SELECT decrypted_secret INTO v_base
  FROM vault.decrypted_secrets
  WHERE name = 'FREELANCER_INVOICE_PROJECT_URL'
  LIMIT 1;
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'Secret FREELANCER_INVOICE_PROJECT_URL no configurado en Vault';
  END IF;
  RETURN v_base || '/functions/v1/' || p_slug;
END;
$$;

CREATE OR REPLACE FUNCTION public._freelancer_invoice_internal_secret()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'FREELANCER_INVOICE_INTERNAL_SECRET'
  LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Secret FREELANCER_INVOICE_INTERNAL_SECRET no configurado en Vault';
  END IF;
  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public._freelancer_invoice_edge_url(text)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public._freelancer_invoice_internal_secret()     FROM PUBLIC;
