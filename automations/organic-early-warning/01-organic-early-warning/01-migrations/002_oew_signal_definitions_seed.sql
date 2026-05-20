-- ============================================================================
-- 002_oew_signal_definitions_seed.sql
-- Seed del catálogo de las 13 señales (S1..S13).
--
-- Depends on: 001_oew_schema.sql (tabla signal_definitions debe existir).
--
-- Fase A (post-deploy inicial): sólo se habilitan S8, S9, S11, S12, S13.
--   - Las leading "duras" (S1..S7) y S10 quedan disabled hasta que el hub
--     tenga histórico (warm-up) o data específica (crawl_snapshots, ahrefs).
--   - Habilitarlas después con: UPDATE ... SET enabled=true WHERE code='S1';
--
-- Idempotencia: ON CONFLICT (id) DO UPDATE => re-correr este SQL refresca
-- name/description/source_hub_table/cadence/weight/config sin perder estado
-- operativo (enabled queda como esté si la operadora lo cambió manualmente).
-- ============================================================================

INSERT INTO organic_early_warning.signal_definitions
  (id, code, kind, name, description, source_hub_table, cadence, weight, enabled, warmup_min_samples, config)
VALUES
  -- ───────────── LEADING (S1..S7) ─────────────
  ('S1','S1','leading',
   'URL fuera del índice',
   'Detecta URLs antes indexadas que GSC reporta como noindex/error/discovered-not-indexed.',
   'gsc_url_inspection_weekly','weekly',8,FALSE,4,
   '{"threshold_k": 3.5, "confidence_to_escalate": 0.7, "min_urls_to_alert": 1, "boost_if_top_traffic": true}'::jsonb),

  ('S2','S2','leading',
   'Pico de errores 404/5xx',
   'Detecta incrementos súbitos de URLs con status_code 4xx/5xx en el reporte de cobertura.',
   'gsc_coverage_weekly','weekly',7,FALSE,4,
   '{"threshold_k": 3.5, "confidence_to_escalate": 0.7, "error_codes": ["4xx","5xx"]}'::jsonb),

  ('S3','S3','leading',
   'Cambios técnicos (noindex/canonical/robots)',
   'Detecta cambios en meta_robots/canonical/robots entre crawls consecutivos.',
   'crawl_snapshots','weekly',6,FALSE,4,
   '{"threshold_k": 3.5, "confidence_to_escalate": 0.7, "fields_watched": ["meta_robots","canonical_url","is_indexable"]}'::jsonb),

  ('S4','S4','leading',
   'Enlaces internos rotos / huérfanas',
   'Detecta páginas con 0 internal_links_in (huérfanas) o referencias a URLs 4xx.',
   'crawl_snapshots','weekly',5,FALSE,4,
   '{"threshold_k": 3.5, "confidence_to_escalate": 0.7, "orphan_min_pct": 0.05}'::jsonb),

  ('S5','S5','leading',
   'Regresión Core Web Vitals',
   'Detecta degradación de LCP/INP/CLS p75 vs baseline (con CrUX o PSI fallback).',
   'cwv_weekly','weekly',7,FALSE,4,
   '{"threshold_k": 3.5, "confidence_to_escalate": 0.7, "metrics": ["lcp_p75_ms","inp_p75_ms","cls_p75"]}'::jsonb),

  ('S6','S6','leading',
   'Caída de referring domains',
   'Detecta pérdida significativa de dominios refer respecto a meses anteriores.',
   'ahrefs_backlinks_monthly','monthly',6,FALSE,3,
   '{"threshold_k": 3.5, "confidence_to_escalate": 0.7, "min_lost_pct": 0.10}'::jsonb),

  ('S7','S7','leading',
   'Pico de enlaces tóxicos',
   'Detecta incremento de backlinks con score tóxico (spam_score) respecto al baseline mensual.',
   'ahrefs_toxic_links_monthly','monthly',5,FALSE,3,
   '{"threshold_k": 3.5, "confidence_to_escalate": 0.7, "min_spam_score": 60}'::jsonb),

  -- ───────────── MIXED (S8..S10) — Fase A enabled S8, S9 ─────────────
  ('S8','S8','mixed',
   'CTR muy bajo para la posición',
   'Detecta queries con CTR < 50% del esperado para su posición promedio (señal de SERP feature perdida o snippet débil).',
   'gsc_search_analytics_weekly','weekly',6,TRUE,4,
   '{"threshold_k": 3.5, "confidence_to_escalate": 0.7, "min_impressions": 100, "ctr_floor_pct_of_expected": 0.5}'::jsonb),

  ('S9','S9','mixed',
   'Pérdida de feature SERP / AI Overview',
   'Detecta caídas de impressions con CTR estable (síntoma de pérdida de rich result o AI Overview).',
   'gsc_search_analytics_weekly','weekly',7,TRUE,4,
   '{"threshold_k": 3.5, "confidence_to_escalate": 0.7, "min_impressions": 200, "impressions_drop_pct": 0.30}'::jsonb),

  ('S10','S10','mixed',
   'Competidor nuevo en top',
   'Detecta nuevos dominios apareciendo en el top-10 SERP de keywords trackeadas.',
   'ahrefs_serp_monthly','monthly',5,FALSE,3,
   '{"threshold_k": 3.5, "confidence_to_escalate": 0.7, "new_competitor_positions": [1,2,3,4,5]}'::jsonb),

  -- ───────────── LAGGING (S11..S13) — Fase A enabled S11, S12, S13 ─────────────
  ('S11','S11','lagging',
   'Caída de clicks/posición fuera de banda',
   'Detecta caídas de clicks o promedio de posición que exceden la banda median ± k*MAD del baseline.',
   'gsc_search_analytics_weekly','weekly',10,TRUE,4,
   '{"threshold_k": 3.5, "confidence_to_escalate": 0.7, "hard_drop_pct": 0.30, "soft_drop_pct_min": 0.20, "soft_drop_pct_max": 0.30}'::jsonb),

  ('S12','S12','lagging',
   'Caída de conversiones orgánicas',
   'Detecta caídas de conversions/revenue del canal Organic Search en GA4.',
   'ga4_organic_weekly','weekly',10,TRUE,4,
   '{"threshold_k": 3.5, "confidence_to_escalate": 0.7, "hard_drop_pct": 0.30, "metric_field": "conversions"}'::jsonb),

  ('S13','S13','lagging',
   'Divergencia GSC↔GA4 (tracking roto)',
   'Detecta divergencia >25% entre clicks de GSC y sessions orgánicas de GA4 (síntoma de tracking roto).',
   'gsc_search_analytics_weekly + ga4_organic_weekly','weekly',8,TRUE,4,
   '{"threshold_k": 3.5, "confidence_to_escalate": 0.7, "divergence_pct": 0.25}'::jsonb)

ON CONFLICT (id) DO UPDATE SET
  code              = EXCLUDED.code,
  kind              = EXCLUDED.kind,
  name              = EXCLUDED.name,
  description       = EXCLUDED.description,
  source_hub_table  = EXCLUDED.source_hub_table,
  cadence           = EXCLUDED.cadence,
  weight            = EXCLUDED.weight,
  -- enabled NO se sobreescribe en conflicto: respeta el toggle operativo.
  -- warmup_min_samples NO se sobreescribe: respeta tuning manual del runbook.
  config            = EXCLUDED.config,
  updated_at        = NOW();
