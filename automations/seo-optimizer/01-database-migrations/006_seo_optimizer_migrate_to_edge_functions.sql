-- ============================================================================
-- Migration: 006_seo_optimizer_migrate_to_edge_functions.sql
-- Purpose:   Reapunta el cron y el trigger del writer a Supabase Edge Functions
--            (en lugar de Railway). Reemplaza por completo lo definido en 003
--            para los cron jobs.
-- Depends:   001 (triggers existen), 003 (cron jobs existen — se reemplazan).
-- ============================================================================
-- IMPORTANT:
--   - SEO_OPTIMIZER_RAILWAY_URL en Vault YA NO se necesita; puedes borrarlo.
--   - SEO_OPTIMIZER_INTERNAL_SECRET sigue requerido para el header x-internal-secret.
--   - La URL base de las Edge Functions queda hardcoded a este proyecto Light_House.
-- ============================================================================

-- Función helper reescrita para Edge Functions
CREATE OR REPLACE FUNCTION seo_optimizer.cron_post(p_path TEXT, p_body JSONB DEFAULT '{}'::jsonb)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_url       TEXT;
    v_secret    TEXT;
    v_req_id    BIGINT;
    v_base      TEXT := 'https://stjugsrkrweakvzmizpq.supabase.co/functions/v1';
BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'SEO_OPTIMIZER_INTERNAL_SECRET';
    IF v_secret IS NULL THEN
        RAISE WARNING '[seo_optimizer.cron_post] Missing SEO_OPTIMIZER_INTERNAL_SECRET — skipping POST to %', p_path;
        RETURN NULL;
    END IF;
    -- p_path puede venir como '/orchestrator' (legacy) o como 'seo-optimizer-orchestrator' (nuevo)
    v_url := v_base || '/' || TRIM(LEADING '/' FROM p_path);
    SELECT net.http_post(
        url := v_url,
        headers := jsonb_build_object('content-type','application/json','x-internal-secret',v_secret),
        body := p_body::text
    ) INTO v_req_id;
    RETURN v_req_id;
END;
$$;

-- Trigger del writer reescrito para Edge Functions
CREATE OR REPLACE FUNCTION seo_optimizer.tg_dispatch_writer_on_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_secret TEXT;
BEGIN
    IF NOT (OLD.status = 'pending' AND NEW.status = 'approved') THEN RETURN NEW; END IF;
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'SEO_OPTIMIZER_INTERNAL_SECRET';
    IF v_secret IS NULL THEN
        INSERT INTO seo_optimizer.run_events (run_id, client_id, event_source, event_type, payload, error_message)
        VALUES (NEW.run_id, NEW.client_id, 'db_trigger', 'warning',
                jsonb_build_object('opportunity_id', NEW.id, 'reason', 'missing_vault_secret'),
                'SEO_OPTIMIZER_INTERNAL_SECRET not in vault');
        RETURN NEW;
    END IF;
    PERFORM net.http_post(
        url := 'https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/seo-optimizer-writer',
        headers := jsonb_build_object('content-type','application/json','x-internal-secret',v_secret),
        body := jsonb_build_object('opportunity_id', NEW.id)::text
    );
    INSERT INTO seo_optimizer.run_events (run_id, client_id, event_source, event_type, payload)
    VALUES (NEW.run_id, NEW.client_id, 'db_trigger', 'approval_received',
            jsonb_build_object('opportunity_id', NEW.id, 'category', NEW.category));
    RETURN NEW;
END;
$$;

-- Re-agendar los cron jobs con los nuevos nombres de endpoint
DO $$ BEGIN PERFORM cron.unschedule('seo-optimizer-monthly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('seo-optimizer-reeval-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('seo-optimizer-outbox-worker'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('seo-optimizer-watchdog'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
    'seo-optimizer-monthly',
    '0 14 1 * *',
    $job$ SELECT seo_optimizer.cron_post('seo-optimizer-orchestrator', '{"trigger":"cron","period_days":90}'::jsonb); $job$
);

SELECT cron.schedule(
    'seo-optimizer-reeval-daily',
    '0 15 * * *',
    $job$ SELECT seo_optimizer.cron_post('seo-optimizer-reeval-batch', '{}'::jsonb); $job$
);

SELECT cron.schedule(
    'seo-optimizer-outbox-worker',
    '* * * * *',
    $job$ SELECT seo_optimizer.cron_post('seo-optimizer-outbox-worker', '{}'::jsonb); $job$
);

SELECT cron.schedule(
    'seo-optimizer-watchdog',
    '*/5 * * * *',
    $job$ SELECT * FROM seo_optimizer.watchdog_check(); $job$
);
