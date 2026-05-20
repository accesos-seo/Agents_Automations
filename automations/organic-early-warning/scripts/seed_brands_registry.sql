-- =============================================================================
-- seed_brands_registry.sql
-- =============================================================================
-- Plantilla para seedear:
--   1) seo_data_hub.brands_registry          (1 row por brand)
--   2) organic_early_warning.brand_routing   (1 row por brand activa)
--
-- INSTRUCCIONES:
--   - Reemplazar TODOS los 'PENDING_CONFIG: ...' con datos reales del cliente.
--   - Duplicar los bloques "BRAND #N" tantas veces como brands haya.
--   - Aplicar via Supabase Dashboard → SQL Editor del proyecto Light_House
--     (https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/sql/new)
--     o via MCP apply_migration si preferis trazabilidad.
--   - Despues de aplicar, correr el bloque "VALIDACION FINAL" del final del archivo.
--
-- REGLAS:
--   - gsc_property_url: 'sc-domain:cliente.com' (domain property) o
--                       'https://www.cliente.com/' (URL prefix property con slash final).
--                       Tiene que coincidir EXACTO con como aparece en Google Search Console.
--   - ga4_property_id:  ID numerico (Admin → Property Settings → Property ID). NULL si no tiene GA4.
--   - ahrefs_domain:    raiz del dominio, sin https://, sin slash final. Ej: 'cliente.com'.
--   - country_iso:      codigo ISO 3166-1 alpha-2 (CO, AR, MX, US, ES, ...).
--   - status:           'active' (monitoreada) | 'paused' (data se guarda pero no genera alertas)
--                       | 'archived' (no se ingiere mas).
--   - severity_threshold (en brand_routing): 'WATCH' (todo) | 'YELLOW' (default) | 'RED' (solo crisis).
--   - team_lead_user_id: Slack User ID formato 'U05XXXXXXXX'. Si todavia no esta asignado,
--                        dejar NULL — el dispatcher caera al canal default sin @mention.
--   - slack_channel_id:  'C0B1B3V4ZB5' = #alerts-operaciones (default canonico de la agencia).
--                        Cambiar solo si la brand tiene canal dedicado.
--
-- PRE-REQUISITO: la Service Account de GSC ya tiene que estar agregada como
-- Restricted user en la property GSC y como Viewer en la property GA4 de
-- CADA brand. Sin esto, los ingestors devuelven 403 y todo el pipeline queda
-- ciego (ver SECRETS.md → "IMPORTANTE Service Account").
-- =============================================================================


-- =========================== BRAND #1 — EJEMPLO ==============================
INSERT INTO seo_data_hub.brands_registry
  (name,
   gsc_property_url,
   ga4_property_id,
   ahrefs_domain,
   country_iso,
   status,
   created_at,
   updated_at)
VALUES
  ('PENDING_CONFIG: Nombre interno de la marca',          -- ej: 'Clinica Dental Bogota'
   'sc-domain:cliente.com',                               -- o 'https://www.cliente.com/'
   'PENDING_CONFIG: 123456789',                           -- ID numerico GA4. NULL si no tiene GA4.
   'cliente.com',                                         -- raiz dominio sin https
   'CO',                                                  -- ISO alpha-2
   'active',
   NOW(),
   NOW())
ON CONFLICT (gsc_property_url) DO UPDATE SET
  name            = EXCLUDED.name,
  ga4_property_id = EXCLUDED.ga4_property_id,
  ahrefs_domain   = EXCLUDED.ahrefs_domain,
  country_iso     = EXCLUDED.country_iso,
  status          = EXCLUDED.status,
  updated_at      = NOW();

-- Routing para BRAND #1
INSERT INTO organic_early_warning.brand_routing
  (brand_id,
   slack_channel_id,
   team_lead_user_id,
   severity_threshold,
   country_iso,
   active,
   created_at,
   updated_at)
SELECT
  br.id,
  'C0B1B3V4ZB5',                                          -- #alerts-operaciones (default agencia)
  'PENDING_CONFIG: U05XXXXXXXX',                          -- Slack User ID del especialista. NULL si no asignado.
  'YELLOW',                                               -- default; 'WATCH' para ver todo, 'RED' para solo crisis
  'CO',
  true,
  NOW(),
  NOW()
FROM seo_data_hub.brands_registry br
WHERE br.gsc_property_url = 'sc-domain:cliente.com'
ON CONFLICT (brand_id) DO UPDATE SET
  slack_channel_id   = EXCLUDED.slack_channel_id,
  team_lead_user_id  = EXCLUDED.team_lead_user_id,
  severity_threshold = EXCLUDED.severity_threshold,
  country_iso        = EXCLUDED.country_iso,
  active             = EXCLUDED.active,
  updated_at         = NOW();


-- =========================== BRAND #2 — EJEMPLO ==============================
INSERT INTO seo_data_hub.brands_registry
  (name,
   gsc_property_url,
   ga4_property_id,
   ahrefs_domain,
   country_iso,
   status,
   created_at,
   updated_at)
VALUES
  ('PENDING_CONFIG: Segunda marca',
   'https://www.otra-marca.com/',                         -- URL prefix property (ojo al slash final)
   NULL,                                                  -- sin GA4
   'otra-marca.com',
   'AR',
   'active',
   NOW(),
   NOW())
ON CONFLICT (gsc_property_url) DO UPDATE SET
  name            = EXCLUDED.name,
  ga4_property_id = EXCLUDED.ga4_property_id,
  ahrefs_domain   = EXCLUDED.ahrefs_domain,
  country_iso     = EXCLUDED.country_iso,
  status          = EXCLUDED.status,
  updated_at      = NOW();

INSERT INTO organic_early_warning.brand_routing
  (brand_id,
   slack_channel_id,
   team_lead_user_id,
   severity_threshold,
   country_iso,
   active,
   created_at,
   updated_at)
SELECT
  br.id,
  'C0B1B3V4ZB5',
  NULL,                                                   -- todavia sin team lead asignado
  'YELLOW',
  'AR',
  true,
  NOW(),
  NOW()
FROM seo_data_hub.brands_registry br
WHERE br.gsc_property_url = 'https://www.otra-marca.com/'
ON CONFLICT (brand_id) DO UPDATE SET
  slack_channel_id   = EXCLUDED.slack_channel_id,
  team_lead_user_id  = EXCLUDED.team_lead_user_id,
  severity_threshold = EXCLUDED.severity_threshold,
  country_iso        = EXCLUDED.country_iso,
  active             = EXCLUDED.active,
  updated_at         = NOW();


-- =========================== BRAND #3 — EJEMPLO PAUSADO ======================
-- (Brand de testing — datos se ingieren pero no se generan alertas)
INSERT INTO seo_data_hub.brands_registry
  (name,
   gsc_property_url,
   ga4_property_id,
   ahrefs_domain,
   country_iso,
   status,
   created_at,
   updated_at)
VALUES
  ('PENDING_CONFIG: Brand de testing interno',
   'sc-domain:test-domain.dev',
   NULL,
   'test-domain.dev',
   'CO',
   'paused',                                              -- 'paused' = no genera alertas
   NOW(),
   NOW())
ON CONFLICT (gsc_property_url) DO UPDATE SET
  name       = EXCLUDED.name,
  status     = EXCLUDED.status,
  updated_at = NOW();

-- (Una brand 'paused' tambien puede tener routing por si despues se reactiva;
--  pero el dispatcher filtra por brands_registry.status='active', asi que estos
--  routings son inertes hasta que la brand pase a 'active').
INSERT INTO organic_early_warning.brand_routing
  (brand_id, slack_channel_id, team_lead_user_id, severity_threshold,
   country_iso, active, created_at, updated_at)
SELECT br.id, 'C0B1B3V4ZB5', NULL, 'WATCH', 'CO', true, NOW(), NOW()
FROM seo_data_hub.brands_registry br
WHERE br.gsc_property_url = 'sc-domain:test-domain.dev'
ON CONFLICT (brand_id) DO NOTHING;


-- =========================== VALIDACION FINAL ================================
-- Despues de seedear, correr este SELECT y verificar que cada row tenga:
--   - name NO empieza con 'PENDING_CONFIG'
--   - gsc_property_url presente y bien formado
--   - team_lead_user_id real (formato 'U05...') o NULL explicito por ahora
--   - severity_threshold uno de WATCH / YELLOW / RED
-- =============================================================================
SELECT
  br.name,
  br.gsc_property_url,
  br.ga4_property_id,
  br.ahrefs_domain,
  br.country_iso,
  br.status,
  brt.slack_channel_id,
  brt.team_lead_user_id,
  brt.severity_threshold,
  brt.active AS routing_active
FROM seo_data_hub.brands_registry br
LEFT JOIN organic_early_warning.brand_routing brt
  ON brt.brand_id = br.id
ORDER BY br.created_at;

-- Cuantas brands quedaron por estado:
SELECT status, COUNT(*) AS n
FROM seo_data_hub.brands_registry
GROUP BY status
ORDER BY status;

-- Detectar brands activas SIN routing (caso de error a corregir antes de prod):
SELECT br.id, br.name, br.gsc_property_url
FROM seo_data_hub.brands_registry br
LEFT JOIN organic_early_warning.brand_routing brt ON brt.brand_id = br.id
WHERE br.status = 'active' AND brt.brand_id IS NULL;

-- Detectar PENDING_CONFIG no reemplazados (sanity check):
SELECT id, name, gsc_property_url
FROM seo_data_hub.brands_registry
WHERE name LIKE 'PENDING_CONFIG%'
   OR gsc_property_url LIKE '%PENDING_CONFIG%'
   OR ga4_property_id::text LIKE 'PENDING_CONFIG%';
