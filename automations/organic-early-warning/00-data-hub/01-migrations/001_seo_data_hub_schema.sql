-- ============================================================================
-- Organic Early Warning V2 — Data Hub schema (bronze layer)
-- Migration 001: schema + catalog + raw tables
--
-- Project: Light_House (stjugsrkrweakvzmizpq)
-- Scope:   schema `seo_data_hub`
-- See:     automations/organic-early-warning/ARCHITECTURE.md
--          automations/organic-early-warning/handoff/01-edge-functions-contracts.md
--          CONVENTIONS.md §2, §3, §5, §15-bis
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS seo_data_hub;

-- Extensions used by this hub (pg_cron + pg_net are enabled in migration 004).
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ============================================================================
-- 1) brands_registry — fuente de verdad de las marcas que el hub ingiere
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_data_hub.brands_registry (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  gsc_property_url  TEXT,
  ga4_property_id   TEXT,
  ahrefs_domain     TEXT,
  country_iso       TEXT,                                  -- ISO 3166-1 alpha-2 ('CO','MX',...)
  status            TEXT        NOT NULL DEFAULT 'active'
                    CONSTRAINT brands_registry_status_chk
                    CHECK (status IN ('active','paused','archived')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brands_registry_status
  ON seo_data_hub.brands_registry (status)
  WHERE status = 'active';

-- ============================================================================
-- 2) ingestion_runs — audit de cada corrida del hub (1 row por ingestor x corrida)
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_data_hub.ingestion_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT        NOT NULL
                  CONSTRAINT ingestion_runs_source_chk
                  CHECK (source IN ('gsc','ga4','cwv','ahrefs','crawl')),
  brand_id        UUID        REFERENCES seo_data_hub.brands_registry(id) ON DELETE SET NULL,
  iso_week        TEXT,                                    -- 'YYYY-Www' ISO 8601 (NULL si monthly)
  period_month    TEXT,                                    -- 'YYYY-MM' (NULL si weekly)
  period_start    DATE,
  period_end      DATE,
  status          TEXT        NOT NULL DEFAULT 'running'
                  CONSTRAINT ingestion_runs_status_chk
                  CHECK (status IN ('running','completed','failed')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  rows_inserted   INT         NOT NULL DEFAULT 0,
  rows_updated    INT         NOT NULL DEFAULT 0,
  credits_used    INT         NOT NULL DEFAULT 0,          -- relevante p/ Ahrefs; 0 para el resto
  error_message   TEXT,
  payload         JSONB
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source_started
  ON seo_data_hub.ingestion_runs (source, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status_started
  ON seo_data_hub.ingestion_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_brand_period
  ON seo_data_hub.ingestion_runs (brand_id, period_month, period_end);

-- ============================================================================
-- 3) run_events — append-only trace de cada ingestor (CONVENTIONS §3)
--    El CHECK extiende los event_types canónicos con los específicos del hub.
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_data_hub.run_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID        REFERENCES seo_data_hub.ingestion_runs(id) ON DELETE CASCADE,
  brand_id       UUID        REFERENCES seo_data_hub.brands_registry(id) ON DELETE SET NULL,
  event_source   TEXT        NOT NULL,                    -- 'hub-gsc-weekly', 'hub-watchdog', etc.
  event_type     TEXT        NOT NULL
                 CONSTRAINT run_events_event_type_chk
                 CHECK (event_type IN (
                   'run_started','run_completed','run_failed',
                   'agent_started','agent_completed','agent_failed',
                   'anomaly_detected','diagnosis_saved',
                   'alert_enqueued','alert_sent','alert_failed',
                   'watchdog_triggered','warning',
                   -- Específicos del hub (CONVENTIONS §3 permite extender):
                   'partition_created','rotation_executed'
                 )),
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload        JSONB,
  error_message  TEXT
);

CREATE INDEX IF NOT EXISTS idx_run_events_run_id
  ON seo_data_hub.run_events (run_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_run_events_source_occurred
  ON seo_data_hub.run_events (event_source, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_run_events_type_occurred
  ON seo_data_hub.run_events (event_type, occurred_at DESC);

-- ============================================================================
-- 4) gsc_search_analytics_weekly — GSC Search Analytics (clicks/impr/pos por dim)
--    Particionada por RANGE(ingested_at) — alta cardinalidad (>1M rows/año).
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_data_hub.gsc_search_analytics_weekly (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid(),
  brand_id           UUID        NOT NULL REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  iso_week           TEXT        NOT NULL,                -- 'YYYY-Www'
  dimensions_hash    TEXT        NOT NULL,                -- sha256(date|page|query|device|country|searchAppearance)
  dimensions         JSONB       NOT NULL,
  clicks             INT         NOT NULL DEFAULT 0,
  impressions        INT         NOT NULL DEFAULT 0,
  ctr                NUMERIC,
  position           NUMERIC,
  date               DATE,
  page               TEXT,
  query              TEXT,
  device             TEXT,
  country            TEXT,
  search_appearance  TEXT,
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gsc_search_analytics_weekly_uq
    UNIQUE (brand_id, iso_week, dimensions_hash, ingested_at),
  PRIMARY KEY (id, ingested_at)
) PARTITION BY RANGE (ingested_at);

-- Partición default p/ seguridad; las mensuales las crea ensure_monthly_partitions().
CREATE TABLE IF NOT EXISTS seo_data_hub.gsc_search_analytics_weekly_default
  PARTITION OF seo_data_hub.gsc_search_analytics_weekly DEFAULT;

CREATE INDEX IF NOT EXISTS idx_gsc_sa_weekly_brand_week
  ON seo_data_hub.gsc_search_analytics_weekly (brand_id, iso_week);

CREATE INDEX IF NOT EXISTS idx_gsc_sa_weekly_date
  ON seo_data_hub.gsc_search_analytics_weekly (date);

-- NOTE: la UNIQUE incluye ingested_at porque PG exige que toda UNIQUE en tabla
-- particionada contenga la clave de partición. Los ingestors deben hacer UPSERT
-- contra (brand_id, iso_week, dimensions_hash) dentro de la partición del mes
-- corriente — esto es semánticamente equivalente para idempotencia week-by-week.

-- ============================================================================
-- 5) gsc_url_inspection_weekly — estado de indexación por URL
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_data_hub.gsc_url_inspection_weekly (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                 UUID        NOT NULL REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  iso_week                 TEXT        NOT NULL,
  url                      TEXT        NOT NULL,
  index_status             TEXT,
  coverage_state           TEXT,
  last_crawl_time          TIMESTAMPTZ,
  robots_txt_state         TEXT,
  indexing_state           TEXT,
  mobile_usability_result  TEXT,
  fetched_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gsc_url_inspection_weekly_uq UNIQUE (brand_id, iso_week, url)
);

CREATE INDEX IF NOT EXISTS idx_gsc_url_inspection_brand_week
  ON seo_data_hub.gsc_url_inspection_weekly (brand_id, iso_week);

-- ============================================================================
-- 6) gsc_coverage_weekly — agregados de errores de cobertura por tipo
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_data_hub.gsc_coverage_weekly (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     UUID        NOT NULL REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  iso_week     TEXT        NOT NULL,
  error_type   TEXT        NOT NULL
               CONSTRAINT gsc_coverage_weekly_error_type_chk
               CHECK (error_type IN ('4xx','5xx','soft_404','blocked_by_robots')),
  count        INT         NOT NULL DEFAULT 0,
  sample_urls  TEXT[],
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gsc_coverage_weekly_uq UNIQUE (brand_id, iso_week, error_type)
);

CREATE INDEX IF NOT EXISTS idx_gsc_coverage_brand_week
  ON seo_data_hub.gsc_coverage_weekly (brand_id, iso_week);

-- ============================================================================
-- 7) ga4_organic_weekly — sesiones/users/conversiones por dimensión
--    Particionada por RANGE(ingested_at).
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_data_hub.ga4_organic_weekly (
  id                UUID        NOT NULL DEFAULT gen_random_uuid(),
  brand_id          UUID        NOT NULL REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  iso_week          TEXT        NOT NULL,
  dimensions_hash   TEXT        NOT NULL,                 -- sha256(date|deviceCategory|country|landingPagePlusQueryString)
  dimensions        JSONB       NOT NULL,
  sessions          INT         NOT NULL DEFAULT 0,
  total_users       INT         NOT NULL DEFAULT 0,
  engaged_sessions  INT         NOT NULL DEFAULT 0,
  conversions       NUMERIC,
  purchase_revenue  NUMERIC,
  landing_page      TEXT,
  device_category   TEXT,
  country           TEXT,
  ingested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ga4_organic_weekly_uq
    UNIQUE (brand_id, iso_week, dimensions_hash, ingested_at),
  PRIMARY KEY (id, ingested_at)
) PARTITION BY RANGE (ingested_at);

CREATE TABLE IF NOT EXISTS seo_data_hub.ga4_organic_weekly_default
  PARTITION OF seo_data_hub.ga4_organic_weekly DEFAULT;

CREATE INDEX IF NOT EXISTS idx_ga4_organic_weekly_brand_week
  ON seo_data_hub.ga4_organic_weekly (brand_id, iso_week);

-- ============================================================================
-- 8) cwv_weekly — Core Web Vitals p75 por URL × device
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_data_hub.cwv_weekly (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     UUID        NOT NULL REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  iso_week     TEXT        NOT NULL,
  url          TEXT        NOT NULL,
  device       TEXT        NOT NULL
               CONSTRAINT cwv_weekly_device_chk
               CHECK (device IN ('mobile','desktop','tablet')),
  lcp_p75_ms   INT,
  inp_p75_ms   INT,
  cls_p75      NUMERIC,
  fcp_p75_ms   INT,
  ttfb_p75_ms  INT,
  data_source  TEXT        NOT NULL
               CONSTRAINT cwv_weekly_data_source_chk
               CHECK (data_source IN ('crux','psi_lab')),
  sample_size  INT,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cwv_weekly_uq UNIQUE (brand_id, iso_week, url, device)
);

CREATE INDEX IF NOT EXISTS idx_cwv_weekly_brand_week
  ON seo_data_hub.cwv_weekly (brand_id, iso_week);

-- ============================================================================
-- 9) ahrefs_backlinks_monthly — overview de backlinks por marca/mes
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_data_hub.ahrefs_backlinks_monthly (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           UUID        NOT NULL REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  period_month       TEXT        NOT NULL,                -- 'YYYY-MM'
  domain_rating      NUMERIC,
  total_backlinks    BIGINT,
  total_refdomains   INT,
  new_refdomains     INT,
  lost_refdomains    INT,
  broken_backlinks   INT,
  payload            JSONB,
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ahrefs_backlinks_monthly_uq UNIQUE (brand_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_ahrefs_backlinks_brand_period
  ON seo_data_hub.ahrefs_backlinks_monthly (brand_id, period_month);

-- ============================================================================
-- 10) ahrefs_serp_monthly — posición SERP + competidor por keyword/mes
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_data_hub.ahrefs_serp_monthly (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             UUID        NOT NULL REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  period_month         TEXT        NOT NULL,
  keyword              TEXT        NOT NULL,
  position             INT,
  top_url              TEXT,
  top_competitor_url   TEXT,
  search_volume        INT,
  payload              JSONB,
  ingested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ahrefs_serp_monthly_uq UNIQUE (brand_id, period_month, keyword)
);

CREATE INDEX IF NOT EXISTS idx_ahrefs_serp_brand_period
  ON seo_data_hub.ahrefs_serp_monthly (brand_id, period_month);

-- ============================================================================
-- 11) ahrefs_toxic_links_monthly — backlinks tóxicos detectados por mes
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_data_hub.ahrefs_toxic_links_monthly (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        UUID        NOT NULL REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  period_month    TEXT        NOT NULL,
  link_url_hash   TEXT        NOT NULL,                   -- sha256(link_url) p/ idempotencia compacta
  link_url        TEXT        NOT NULL,
  source_domain   TEXT,
  toxic_score     INT,
  anchor_text     TEXT,
  payload         JSONB,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ahrefs_toxic_links_monthly_uq UNIQUE (brand_id, period_month, link_url_hash)
);

CREATE INDEX IF NOT EXISTS idx_ahrefs_toxic_brand_period
  ON seo_data_hub.ahrefs_toxic_links_monthly (brand_id, period_month);

-- ============================================================================
-- 12) crawl_snapshots — exports de Screaming Frog (u otro crawler) por brand+día
--     Particionada por RANGE(crawl_date) — alta cardinalidad (sitios grandes).
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_data_hub.crawl_snapshots (
  id                     UUID        NOT NULL DEFAULT gen_random_uuid(),
  brand_id               UUID        NOT NULL REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  crawl_date             DATE        NOT NULL,
  url                    TEXT        NOT NULL,
  status_code            INT,
  content_type           TEXT,
  meta_robots            TEXT,
  canonical_url          TEXT,
  is_indexable           BOOLEAN,
  internal_links_in      INT,
  internal_links_out     INT,
  is_orphan              BOOLEAN,
  redirect_chain_depth   INT,
  h1_count               INT,
  title                  TEXT,
  meta_description       TEXT,
  ingested_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crawl_snapshots_uq UNIQUE (brand_id, crawl_date, url),
  PRIMARY KEY (id, crawl_date)
) PARTITION BY RANGE (crawl_date);

CREATE TABLE IF NOT EXISTS seo_data_hub.crawl_snapshots_default
  PARTITION OF seo_data_hub.crawl_snapshots DEFAULT;

CREATE INDEX IF NOT EXISTS idx_crawl_snapshots_brand_date
  ON seo_data_hub.crawl_snapshots (brand_id, crawl_date);

-- ============================================================================
-- TOTAL tablas creadas en esta migración: 12
--   Catálogo (3): brands_registry, ingestion_runs, run_events
--   Raw GSC (3): gsc_search_analytics_weekly, gsc_url_inspection_weekly,
--                gsc_coverage_weekly
--   Raw GA4 (1): ga4_organic_weekly
--   Raw CWV (1): cwv_weekly
--   Raw Ahrefs (3): ahrefs_backlinks_monthly, ahrefs_serp_monthly,
--                   ahrefs_toxic_links_monthly
--   Raw Crawl (1): crawl_snapshots
--
-- Particionadas por RANGE: gsc_search_analytics_weekly, ga4_organic_weekly,
-- crawl_snapshots. Las demás se mantienen sin particionar (cardinalidad baja
-- según ARCHITECTURE.md §"Reglas del data hub").
-- ============================================================================
