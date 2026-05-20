-- ============================================================
-- seo_sentinel — Outbox compartido + worker cron
-- ============================================================
-- La tabla `public.notifications_outbox` YA EXISTE en Light_House
-- (creada por Lighthouse u otro sistema con un schema más rico).
-- Convenciones de la tabla existente que usamos:
--   · source             TEXT NOT NULL                  ← filtramos 'seo_sentinel_alert'
--   · target_type        TEXT NOT NULL                  ← 'slack_dm' | 'slack_channel'
--   · channel_id         TEXT                            ← user_id o channel_id Slack
--   · payload            JSONB NOT NULL                 ← { blocks, text }
--   · dedupe_key         TEXT (UNIQUE WHERE NOT NULL)   ← idempotencia
--   · status             TEXT (default 'pending')
--   · locked_at, locked_by                              ← claim pessimista
--   · attempts           INTEGER                         ← retry counter (mapea a retry_count)
--   · next_try_at        TIMESTAMPTZ                     ← próximo retry (mapea a next_retry_at)
--   · error_message      TEXT
--   · sent_at            TIMESTAMPTZ
--
-- NO ejecutamos CREATE TABLE — solo configuramos el cron del worker
-- que pollea las filas WHERE source='seo_sentinel_alert'.
-- ============================================================

-- ============================================================
-- CRON: outbox-worker cada 30 segundos
-- ============================================================
DO $do$
BEGIN
  PERFORM cron.unschedule('seo-sentinel-outbox-worker')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'seo-sentinel-outbox-worker'
  );
END;
$do$;

SELECT cron.schedule(
  'seo-sentinel-outbox-worker',
  '30 seconds',
  $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_FUNCTIONS_URL' LIMIT 1) || '/seo-sentinel-outbox-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SEO_SENTINEL_INTERNAL_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $cron$
);
