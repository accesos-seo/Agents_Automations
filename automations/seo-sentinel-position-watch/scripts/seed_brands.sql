-- ============================================================
-- seo_sentinel — Seed brands + routing (TEMPLATE)
-- ============================================================
-- Reemplazar los placeholders con datos reales antes de ejecutar.
-- Este archivo es un punto de partida; ajustar según necesidades.
-- ============================================================

-- ============================================================
-- 1. Brand de testing (lovable.dev como sandbox)
-- ============================================================
INSERT INTO seo_sentinel.brands (
  id, name, status, gsc_property_url, ga4_property_id,
  alert_threshold_clicks_pct, alert_threshold_position_delta, seasonality_type
) VALUES (
  gen_random_uuid(),
  'Sandbox lovable.dev',
  'active',
  'sc-domain:lovable.dev',     -- Formato GSC: sc-domain:<dominio>
  NULL,                         -- Sin GA4 (best-effort: se skipea)
  20,                           -- Default 20% WoW para clicks
  10,                           -- Default 10 posiciones para keywords
  'year_round'
) ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. Brand real ejemplo (REEMPLAZAR)
-- ============================================================
-- INSERT INTO seo_sentinel.brands (
--   id, name, status, gsc_property_url, ga4_property_id,
--   alert_threshold_clicks_pct, alert_threshold_position_delta, seasonality_type
-- ) VALUES (
--   gen_random_uuid(),
--   'PENDING_CONFIG: nombre del cliente',
--   'active',
--   'PENDING_CONFIG: sc-domain:cliente.com o https://cliente.com/',
--   'PENDING_CONFIG: numérico (no Measurement ID), ej 123456789',
--   25,                                       -- Cliente con tráfico volátil → umbral más alto
--   10,
--   NULL
-- );

-- ============================================================
-- 3. Brand B2B ejemplo (REEMPLAZAR)
-- ============================================================
-- INSERT INTO seo_sentinel.brands (
--   id, name, status, gsc_property_url, ga4_property_id,
--   alert_threshold_clicks_pct, alert_threshold_position_delta, seasonality_type
-- ) VALUES (
--   gen_random_uuid(),
--   'PENDING_CONFIG: cliente B2B',
--   'active',
--   'PENDING_CONFIG: sc-domain:cliente-b2b.com',
--   NULL,
--   20,
--   10,
--   'b2b_weekday'                             -- Ignora caídas weekend
-- );

-- ============================================================
-- 4. brand_team_routing — canal Slack + responsable por brand
-- ============================================================
-- Para la brand de testing:
INSERT INTO seo_sentinel.brand_team_routing (
  brand_id, slack_channel_id, team_lead_user_id, fallback_channel_id
)
SELECT
  b.id,
  'C09SANDBOX',                              -- PENDING_CONFIG: ID del canal sandbox
  'U05DEV',                                   -- PENDING_CONFIG: ID del dev responsable
  'C09DEVOPS'                                 -- PENDING_CONFIG: canal devops fallback
FROM seo_sentinel.brands b
WHERE b.name = 'Sandbox lovable.dev'
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. Verificación post-seed
-- ============================================================
SELECT
  b.name,
  b.status,
  b.gsc_property_url,
  b.alert_threshold_clicks_pct,
  r.slack_channel_id,
  r.team_lead_user_id
FROM seo_sentinel.brands b
LEFT JOIN seo_sentinel.brand_team_routing r ON r.brand_id = b.id
ORDER BY b.created_at;

-- ============================================================
-- NOTA sobre los IDs de Slack
-- ============================================================
-- Para encontrar el slack_channel_id de un canal:
--   - Slack web → click derecho en el canal → "Copy link"
--   - El ID es lo que viene después del último /  (ej: C09ABC123)
--
-- Para encontrar el team_lead_user_id:
--   - Slack → click en el avatar del usuario → "View full profile"
--   - More (⋮) → "Copy member ID"  (ej: U05ABC123)
--
-- IMPORTANTE: invitar al bot @seo-sentinel a cada canal del routing,
-- incluyendo el fallback_channel_id, con /invite @seo-sentinel
