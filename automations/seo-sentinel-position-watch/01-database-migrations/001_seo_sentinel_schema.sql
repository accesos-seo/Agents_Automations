-- ============================================================
-- seo_sentinel — Schema inicial
-- Proyecto Supabase: Light_House (project ref stjugsrkrweakvzmizpq)
-- Versión: 1.0
-- ============================================================
-- Este archivo crea el schema dedicado `seo_sentinel` y todas las
-- tablas operativas del sistema agéntico de detección de pérdida
-- de tráfico y posiciones SEO.
--
-- IMPORTANTE: Todas las tablas operativas viven en `seo_sentinel.*`.
-- La única excepción documentada es `public.notifications_outbox`
-- (ver 004_seo_sentinel_outbox.sql), por ser una tabla compartida.
-- ============================================================

-- ============================================================
-- EXTENSIONES REQUERIDAS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- SCHEMA DEDICADO
-- ============================================================
CREATE SCHEMA IF NOT EXISTS seo_sentinel;

-- ============================================================
-- TABLA: seo_sentinel.brands
-- Catálogo de marcas / clientes monitoreados
-- PENDING_CONFIG: poblar con las marcas reales y sus thresholds
-- ============================================================
CREATE TABLE IF NOT EXISTS seo_sentinel.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'suspended')),
  gsc_property_url TEXT,                       -- ej: "https://clinicadentalx.com/"
  ga4_property_id TEXT,                        -- ej: "123456789" (numérico, no Measurement ID)
  alert_threshold_clicks_pct NUMERIC(6,2) NOT NULL DEFAULT 20,
  alert_threshold_position_delta NUMERIC(6,2) NOT NULL DEFAULT 10,
  seasonality_type TEXT,                       -- ej: 'summer_peak', 'year_round', 'b2b_weekday'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: seo_sentinel.brand_team_routing
-- Mapeo marca → canal Slack + responsable
-- PENDING_CONFIG: poblar tras tener IDs de canales de Slack
-- ============================================================
CREATE TABLE IF NOT EXISTS seo_sentinel.brand_team_routing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES seo_sentinel.brands(id) ON DELETE CASCADE,
  slack_channel_id TEXT NOT NULL,              -- ej: C09XXXX
  team_lead_user_id TEXT,                      -- ej: U09XXXX (para mention <@USER_ID>)
  fallback_channel_id TEXT,                    -- canal de respaldo si falla el principal
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: seo_sentinel.holiday_calendar
-- Festivos por país para el false-positive filter
-- ============================================================
CREATE TABLE IF NOT EXISTS seo_sentinel.holiday_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'CO',
  expected_traffic_reduction_pct INTEGER,      -- % de reducción esperada ese día
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (date, country_code)
);

-- Seed: festivos Colombia 2026 (subset principal)
INSERT INTO seo_sentinel.holiday_calendar (date, name, country_code, expected_traffic_reduction_pct) VALUES
  ('2026-01-01', 'Año Nuevo', 'CO', 40),
  ('2026-05-01', 'Día del Trabajo', 'CO', 35),
  ('2026-07-20', 'Día de la Independencia', 'CO', 35),
  ('2026-08-07', 'Batalla de Boyacá', 'CO', 30),
  ('2026-12-25', 'Navidad', 'CO', 50)
ON CONFLICT (date, country_code) DO NOTHING;

-- ============================================================
-- TABLA: seo_sentinel.analysis_runs
-- Una fila por cada ejecución del pipeline (su id es el run_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS seo_sentinel.analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source TEXT NOT NULL
    CHECK (trigger_source IN ('cron', 'manual', 'watchdog_retry')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  brands_total INTEGER NOT NULL DEFAULT 0,
  brands_processed INTEGER NOT NULL DEFAULT 0,
  brands_failed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: seo_sentinel.run_events
-- Append-only trace de eventos del pipeline (debugging + watchdog)
-- ============================================================
CREATE TABLE IF NOT EXISTS seo_sentinel.run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES seo_sentinel.analysis_runs(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES seo_sentinel.brands(id) ON DELETE SET NULL,
  event_source TEXT NOT NULL,                  -- ej: 'orchestrator', 'gsc-ingestor', 'analyst'
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'run_started',
      'run_completed',
      'run_failed',
      'agent_started',
      'agent_completed',
      'agent_failed',
      'anomaly_detected',
      'diagnosis_saved',
      'alert_enqueued',
      'alert_sent',
      'alert_failed',
      'watchdog_triggered',
      'warning'
    )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB,
  error_message TEXT
);

-- ============================================================
-- TABLA: seo_sentinel.traffic_daily
-- Agregado date-level (1 fila por brand + date)
-- ============================================================
CREATE TABLE IF NOT EXISTS seo_sentinel.traffic_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES seo_sentinel.brands(id) ON DELETE CASCADE,
  run_id UUID REFERENCES seo_sentinel.analysis_runs(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  -- Métricas GSC agregadas
  clicks INTEGER,
  impressions INTEGER,
  ctr NUMERIC(7,4),                            -- fracción (0.0000 a 1.0000)
  position NUMERIC(6,2),
  -- Métricas GA4 (best-effort, pueden quedar NULL)
  ga4_sessions_organic INTEGER,
  ga4_users_organic INTEGER,
  ga4_conversions_organic INTEGER,
  -- Estado pipeline
  integrity_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (integrity_status IN ('pending', 'approved', 'approved_with_warnings', 'failed')),
  anomaly_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (anomaly_status IN ('pending', 'normal', 'detected', 'insufficient_data')),
  anomaly_type TEXT
    CHECK (anomaly_type IN ('seo_drop', 'tracking_issue', 'algorithm_update', 'unknown')),
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, date)
);

CREATE INDEX IF NOT EXISTS idx_traffic_daily_brand_date
  ON seo_sentinel.traffic_daily (brand_id, date);
CREATE INDEX IF NOT EXISTS idx_traffic_daily_run
  ON seo_sentinel.traffic_daily (run_id);
CREATE INDEX IF NOT EXISTS idx_traffic_daily_status
  ON seo_sentinel.traffic_daily (anomaly_status, integrity_status);

-- ============================================================
-- TABLA: seo_sentinel.position_snapshots
-- Granular date+page+query (clave para detectar drops de posición)
-- UNIQUE permite UPSERT idempotente en cada corrida
-- ============================================================
CREATE TABLE IF NOT EXISTS seo_sentinel.position_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES seo_sentinel.brands(id) ON DELETE CASCADE,
  run_id UUID REFERENCES seo_sentinel.analysis_runs(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  url TEXT NOT NULL,
  query TEXT NOT NULL,
  position NUMERIC(6,2),
  clicks INTEGER,
  impressions INTEGER,
  ctr NUMERIC(7,4),                            -- fracción (0.0000 a 1.0000)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, date, url, query)
);

CREATE INDEX IF NOT EXISTS idx_position_snapshots_brand_date
  ON seo_sentinel.position_snapshots (brand_id, date);

-- ============================================================
-- TABLA: seo_sentinel.clicks_anomalies
-- Anomalías de clicks detectadas por el analyst (WoW)
-- ============================================================
CREATE TABLE IF NOT EXISTS seo_sentinel.clicks_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES seo_sentinel.analysis_runs(id) ON DELETE SET NULL,
  brand_id UUID NOT NULL REFERENCES seo_sentinel.brands(id) ON DELETE CASCADE,
  anomaly_date DATE NOT NULL,
  current_clicks INTEGER,
  previous_clicks INTEGER,
  wow_drop_pct NUMERIC(7,2),
  anomaly_type TEXT
    CHECK (anomaly_type IN ('seo_drop', 'tracking_issue', 'algorithm_update', 'unknown')),
  false_positive BOOLEAN NOT NULL DEFAULT false,
  false_positive_reason TEXT,
  severity TEXT NOT NULL
    CHECK (severity IN ('RED', 'YELLOW')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clicks_anomalies_brand_date
  ON seo_sentinel.clicks_anomalies (brand_id, anomaly_date);

-- ============================================================
-- TABLA: seo_sentinel.position_anomalies
-- Anomalías de posición (1 fila por url+query con drop relevante)
-- ============================================================
CREATE TABLE IF NOT EXISTS seo_sentinel.position_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES seo_sentinel.analysis_runs(id) ON DELETE SET NULL,
  brand_id UUID NOT NULL REFERENCES seo_sentinel.brands(id) ON DELETE CASCADE,
  anomaly_date DATE NOT NULL,
  url TEXT NOT NULL,
  query TEXT NOT NULL,
  prev_position NUMERIC(6,2),
  current_position NUMERIC(6,2),
  position_delta NUMERIC(6,2),                 -- positivo = empeoró
  lost_top10 BOOLEAN NOT NULL DEFAULT false,
  severity TEXT NOT NULL
    CHECK (severity IN ('RED', 'YELLOW')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_position_anomalies_brand_date
  ON seo_sentinel.position_anomalies (brand_id, anomaly_date);
CREATE INDEX IF NOT EXISTS idx_position_anomalies_severity
  ON seo_sentinel.position_anomalies (severity);

-- ============================================================
-- TABLA: seo_sentinel.incident_diagnostics
-- Diagnóstico enriquecido por LLM (su id es el incident_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS seo_sentinel.incident_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES seo_sentinel.analysis_runs(id) ON DELETE SET NULL,
  brand_id UUID NOT NULL REFERENCES seo_sentinel.brands(id) ON DELETE CASCADE,
  anomaly_date DATE NOT NULL,
  anomaly_kind TEXT NOT NULL
    CHECK (anomaly_kind IN ('clicks_drop', 'position_drop')),
  source_anomaly_id UUID,                      -- FK lógica al clicks/position_anomalies.id originador
  top_affected_urls JSONB,                     -- [{url, clicks_lost, keywords:[...]}]
  top_lost_keywords JSONB,                     -- [{query, prev_position, current_position, clicks_lost}]
  thematic_cluster TEXT,                       -- max 5 palabras (LLM)
  executive_summary TEXT,                      -- 3 oraciones (LLM, generado por dispatcher)
  diagnosis_saved BOOLEAN NOT NULL DEFAULT false,
  dispatch_status TEXT
    CHECK (dispatch_status IN ('pending', 'alert_sent', 'alert_failed', 'alert_fallback')),
  slack_message_ts TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_diagnostics_brand_date
  ON seo_sentinel.incident_diagnostics (brand_id, anomaly_date);
CREATE INDEX IF NOT EXISTS idx_incident_diagnostics_saved
  ON seo_sentinel.incident_diagnostics (diagnosis_saved)
  WHERE diagnosis_saved = true;

-- ============================================================
-- TABLA: seo_sentinel.incident_log
-- Log inmutable de incidentes despachados (auditoría)
-- ============================================================
CREATE TABLE IF NOT EXISTS seo_sentinel.incident_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL UNIQUE REFERENCES seo_sentinel.incident_diagnostics(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES seo_sentinel.brands(id) ON DELETE SET NULL,
  brand_name TEXT,
  anomaly_date DATE,
  anomaly_kind TEXT
    CHECK (anomaly_kind IN ('clicks_drop', 'position_drop')),
  alert_sent_to TEXT[],                        -- ej: ['U09CEO','C09BRAND']
  time_to_detect_minutes INTEGER,
  final_status TEXT NOT NULL
    CHECK (final_status IN ('alert_sent', 'alert_failed', 'alert_fallback')),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ                      -- NULL hasta que el equipo lo resuelva manualmente
);

CREATE INDEX IF NOT EXISTS idx_incident_log_brand_logged
  ON seo_sentinel.incident_log (brand_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_incident_log_status
  ON seo_sentinel.incident_log (final_status);

-- ============================================================
-- ÍNDICES adicionales sobre run_events
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_run_events_run_occurred
  ON seo_sentinel.run_events (run_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_run_events_brand_type
  ON seo_sentinel.run_events (brand_id, event_type);
