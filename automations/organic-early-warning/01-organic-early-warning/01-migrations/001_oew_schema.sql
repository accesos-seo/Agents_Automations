-- ============================================================================
-- 001_oew_schema.sql
-- Schema organic_early_warning — tablas operativas del sistema V2.
--
-- Depends on: seo_data_hub schema (migraciones del hub aplicadas primero;
-- en particular seo_data_hub.brands_registry, referenciada por FK).
--
-- Convenciones aplicadas (ver CONVENTIONS.md §2, §3, §5):
--   - Schema dedicado (NO usar public para tablas operativas)
--   - RLS deshabilitada (servicios internos acceden con service-role)
--   - snake_case plural para tablas, snake_case para columnas
--   - Idempotencia: CREATE ... IF NOT EXISTS en toda la migración
--   - run_events append-only con event_types canónicos + extensiones del sistema
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS organic_early_warning;

-- ---------------------------------------------------------------------------
-- Función helper: trigger genérico que actualiza updated_at on UPDATE.
-- Compartida por brand_routing y signal_definitions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION organic_early_warning.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- brand_routing
-- Configuración por marca: a qué canal Slack se dispatchea, lead opcional,
-- umbral de severidad mínimo, overrides estacionales / del motor estadístico.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organic_early_warning.brand_routing (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                    UUID NOT NULL UNIQUE
                                REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  slack_channel_id            TEXT,                        -- canal específico de la brand (override del fallback)
  team_lead_user_id           TEXT NULL,                   -- Slack user_id; NULL = sólo canal
  severity_threshold          TEXT NOT NULL DEFAULT 'YELLOW'
                                CHECK (severity_threshold IN ('WATCH','YELLOW','RED')),
  seasonality_type            TEXT NULL
                                CHECK (seasonality_type IS NULL
                                       OR seasonality_type IN ('b2b_weekday','strong_yoy')),
  k_factor_override           NUMERIC NULL,                -- override del k=3.5 por brand
  expected_holiday_drop_pct   INT NOT NULL DEFAULT 0,      -- expansión de banda en semanas con feriados
  country_iso                 TEXT,                        -- ISO 3166-1 alpha-2, para calendario feriados
  cwv_force_psi               BOOLEAN NOT NULL DEFAULT FALSE,
  active                      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS brand_routing_set_updated_at ON organic_early_warning.brand_routing;
CREATE TRIGGER brand_routing_set_updated_at
  BEFORE UPDATE ON organic_early_warning.brand_routing
  FOR EACH ROW EXECUTE FUNCTION organic_early_warning.set_updated_at();

COMMENT ON TABLE organic_early_warning.brand_routing IS
  'Routing por brand: canal Slack, lead, umbral, overrides estacionales/k_factor.';

-- ---------------------------------------------------------------------------
-- signal_definitions
-- Catálogo pluggable de las 13 señales (S1..S13). El evaluator itera
-- WHERE enabled=true; cambiar weight / config sin redeploy de código.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organic_early_warning.signal_definitions (
  id                  TEXT PRIMARY KEY,                  -- ej. 'S1','S2',...,'S13'
  code                TEXT NOT NULL UNIQUE,              -- duplicado de id para búsquedas legibles
  kind                TEXT NOT NULL CHECK (kind IN ('leading','lagging','mixed')),
  name                TEXT NOT NULL,
  description         TEXT,
  source_hub_table    TEXT,                              -- tabla del hub que lee (referencia documental)
  cadence             TEXT NOT NULL CHECK (cadence IN ('weekly','monthly')),
  weight              INT NOT NULL DEFAULT 5,
  enabled             BOOLEAN NOT NULL DEFAULT FALSE,    -- por default OFF; Fase A habilita 5
  warmup_min_samples  INT NOT NULL DEFAULT 4,            -- mínimo de muestras para disparar lagging
  config              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS signal_definitions_set_updated_at ON organic_early_warning.signal_definitions;
CREATE TRIGGER signal_definitions_set_updated_at
  BEFORE UPDATE ON organic_early_warning.signal_definitions
  FOR EACH ROW EXECUTE FUNCTION organic_early_warning.set_updated_at();

COMMENT ON TABLE organic_early_warning.signal_definitions IS
  'Catálogo de las 13 señales del sistema. Pluggable vía enabled/weight/config.';

-- ---------------------------------------------------------------------------
-- analysis_runs
-- Una fila por corrida del orchestrator. Estado del pipeline + metrics.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organic_early_warning.analysis_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source    TEXT NOT NULL,                       -- 'cron' | 'manual'
  iso_week          TEXT,                                -- ISO 8601 'YYYY-Www'
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running','completed','failed')),
  brands_total      INT,
  brands_processed  INT,
  brands_failed     INT,
  error_message     TEXT,
  metrics           JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_started_at
  ON organic_early_warning.analysis_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_status
  ON organic_early_warning.analysis_runs (status)
  WHERE status = 'running';

-- ---------------------------------------------------------------------------
-- baselines
-- Motor estadístico: median/MAD/mean/std/trend_slope por
-- (brand_id, signal_id, segment_hash, iso_week_of_year). Ventana 8-12 semanas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organic_early_warning.baselines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            UUID NOT NULL
                        REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  signal_id           TEXT NOT NULL
                        REFERENCES organic_early_warning.signal_definitions(id) ON DELETE CASCADE,
  segment_hash        TEXT NOT NULL,                     -- sha256(branded|device|country|page_type)
  iso_week_of_year    INT NOT NULL CHECK (iso_week_of_year BETWEEN 1 AND 53),
  median              NUMERIC,
  mad                 NUMERIC NULL,                      -- Median Absolute Deviation (robusto)
  mean                NUMERIC,
  std                 NUMERIC NULL,                      -- desviación estándar (debugging)
  trend_slope         NUMERIC NULL,                      -- Mann-Kendall slope ∈ [-1, 1]
  n_samples           INT NOT NULL DEFAULT 0,
  is_warm_up          BOOLEAN NOT NULL DEFAULT FALSE,    -- n_samples<4 => no dispara lagging
  last_recomputed     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (brand_id, signal_id, segment_hash, iso_week_of_year)
);

CREATE INDEX IF NOT EXISTS idx_baselines_lookup
  ON organic_early_warning.baselines (brand_id, signal_id, segment_hash);

CREATE INDEX IF NOT EXISTS idx_baselines_recomputed
  ON organic_early_warning.baselines (last_recomputed DESC);

COMMENT ON COLUMN organic_early_warning.baselines.iso_week_of_year IS
  'Semana ISO del año (1-53), NO la fecha. Permite comparar "misma semana histórica" para estacionalidad.';

-- ---------------------------------------------------------------------------
-- incidents
-- Cluster de signal_events relacionados (mismo brand + ventana 14d + solape
-- URLs ≥50%). Granularidad de notificación.
--
-- Creado ANTES de signal_events porque éste último tiene FK incident_id.
-- (La FK signal_events.incident_id es DEFERRABLE INITIALLY DEFERRED para que
-- updates en orden arbitrario dentro de una transacción no rompan.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organic_early_warning.incidents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID NOT NULL
                        REFERENCES organic_early_warning.analysis_runs(id) ON DELETE CASCADE,
  brand_id            UUID NOT NULL
                        REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  severity            TEXT NOT NULL CHECK (severity IN ('WATCH','YELLOW','RED')),
  signal_count        INT NOT NULL DEFAULT 0,
  signal_event_ids    UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  window_start        DATE,
  window_end          DATE,
  url_overlap_pct     NUMERIC,                           -- solape de URLs entre signals del cluster (0..1)
  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','resolved')),
  dispatch_status     TEXT NOT NULL DEFAULT 'pending'
                        CHECK (dispatch_status IN (
                          'pending',
                          'dispatched',
                          'deferred_to_digest',
                          'suppressed',
                          'enqueue_failed',
                          'already_dispatched'
                        )),
  false_positive      BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_incidents_run_id
  ON organic_early_warning.incidents (run_id);

CREATE INDEX IF NOT EXISTS idx_incidents_brand_status
  ON organic_early_warning.incidents (brand_id, status);

CREATE INDEX IF NOT EXISTS idx_incidents_last_updated_at
  ON organic_early_warning.incidents (last_updated_at DESC);

COMMENT ON TABLE organic_early_warning.incidents IS
  'Cluster de signal_events: mismo brand + ventana 14d + solape URLs ≥50%. Granularidad de alerta.';

-- ---------------------------------------------------------------------------
-- signal_events
-- Tabla unificada (V2 reemplaza V1 clicks_anomalies + position_anomalies).
-- Append-only: una row por detección que supera umbral. El clusterer setea
-- incident_id después.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organic_early_warning.signal_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                  UUID NOT NULL
                            REFERENCES organic_early_warning.analysis_runs(id) ON DELETE CASCADE,
  brand_id                UUID NOT NULL
                            REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  signal_id               TEXT NOT NULL
                            REFERENCES organic_early_warning.signal_definitions(id) ON DELETE CASCADE,
  segment_hash            TEXT NOT NULL,
  period_start            DATE,
  period_end              DATE,
  metric_actual           NUMERIC,
  metric_expected         NUMERIC,
  deviation_sigma         NUMERIC NULL,                  -- alias deviation_score (|actual-median|/MAD)
  severity_hint           TEXT CHECK (severity_hint IN ('WATCH','YELLOW','RED')),
  confidence              NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  incident_id             UUID NULL
                            REFERENCES organic_early_warning.incidents(id)
                              DEFERRABLE INITIALLY DEFERRED,
  false_positive          BOOLEAN NOT NULL DEFAULT FALSE,
  false_positive_reason   TEXT,
  payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_events_run_id
  ON organic_early_warning.signal_events (run_id);

CREATE INDEX IF NOT EXISTS idx_signal_events_brand_created
  ON organic_early_warning.signal_events (brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_events_incident_id
  ON organic_early_warning.signal_events (incident_id)
  WHERE incident_id IS NOT NULL;

COMMENT ON COLUMN organic_early_warning.signal_events.deviation_sigma IS
  'Distancia normalizada |actual-median|/MAD. Alias semántico: deviation_score.';

-- ---------------------------------------------------------------------------
-- incident_diagnostics
-- Output del detective (LLM). 1-a-1 con incidents (UNIQUE incident_id).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organic_early_warning.incident_diagnostics (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id           UUID NOT NULL UNIQUE
                          REFERENCES organic_early_warning.incidents(id) ON DELETE CASCADE,
  run_id                UUID NOT NULL
                          REFERENCES organic_early_warning.analysis_runs(id) ON DELETE CASCADE,
  thematic_cluster      TEXT,                            -- ≤60 tokens del LLM
  executive_summary     TEXT,                            -- ≤200 tokens del LLM
  recommended_actions   TEXT,
  top_urls              JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_keywords          JSONB NOT NULL DEFAULT '[]'::jsonb,
  llm_model             TEXT,
  llm_tokens_in         INT,
  llm_tokens_out        INT,
  degraded              BOOLEAN NOT NULL DEFAULT FALSE,  -- true si LLM cayó y se usó plantilla
  diagnosis_saved       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_diagnostics_created_at
  ON organic_early_warning.incident_diagnostics (created_at DESC);

-- ---------------------------------------------------------------------------
-- incident_log
-- Auditoría inmutable de cada incident dispatcheado. Snapshot al momento del envío.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organic_early_warning.incident_log (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id              UUID NOT NULL
                             REFERENCES organic_early_warning.incidents(id) ON DELETE CASCADE,
  run_id                   UUID NOT NULL
                             REFERENCES organic_early_warning.analysis_runs(id) ON DELETE CASCADE,
  brand_name               TEXT,
  severity                 TEXT,
  signal_count             INT,
  alert_sent_to            TEXT[],                       -- [channel_id, optional user_id]
  executive_summary        TEXT,
  slack_channel_id         TEXT,
  slack_user_id            TEXT,
  dedupe_key               TEXT,
  time_to_detect_minutes   INT,
  final_status             TEXT NOT NULL DEFAULT 'alert_sent',
  dispatched_at            TIMESTAMPTZ,
  logged_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_log_incident_id
  ON organic_early_warning.incident_log (incident_id);

CREATE INDEX IF NOT EXISTS idx_incident_log_logged_at
  ON organic_early_warning.incident_log (logged_at DESC);

-- ---------------------------------------------------------------------------
-- run_events
-- Append-only trace de TODO el pipeline. CHECK incluye los event_types canónicos
-- (CONVENTIONS.md §3) + los extendidos del sistema OEW.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organic_early_warning.run_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL
                    REFERENCES organic_early_warning.analysis_runs(id) ON DELETE CASCADE,
  brand_id        UUID NULL
                    REFERENCES seo_data_hub.brands_registry(id) ON DELETE SET NULL,
  event_source    TEXT NOT NULL,                         -- 'orchestrator','baseline-builder','signal-evaluator',etc.
  event_type      TEXT NOT NULL CHECK (event_type IN (
                    -- Canónicos (CONVENTIONS.md §3)
                    'run_started','run_completed','run_failed',
                    'agent_started','agent_completed','agent_failed',
                    'anomaly_detected','diagnosis_saved',
                    'alert_enqueued','alert_sent','alert_failed',
                    'watchdog_triggered','warning',
                    -- Extendidos del sistema OEW
                    'baseline_recomputed',
                    'incident_clustered'
                  )),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload         JSONB,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_run_events_run_id_occurred
  ON organic_early_warning.run_events (run_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_run_events_event_type
  ON organic_early_warning.run_events (event_type, occurred_at DESC);

COMMENT ON TABLE organic_early_warning.run_events IS
  'Trace append-only del pipeline. Canónicos (§3 convenciones) + baseline_recomputed/incident_clustered.';
