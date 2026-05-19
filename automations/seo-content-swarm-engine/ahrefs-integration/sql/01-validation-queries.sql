-- =============================================================================
-- FASE 1 — Validación piloto en armor-corp
-- Ejecutar en Supabase Light_House
-- =============================================================================

-- V1 — ¿Cuántos artículos piloto ya tienen ahrefs_research?
SELECT
    COUNT(*) FILTER (WHERE brief_data ? 'ahrefs_research') AS con_ahrefs,
    COUNT(*) FILTER (WHERE NOT (brief_data ? 'ahrefs_research')) AS sin_ahrefs,
    COUNT(*) AS total
FROM content_items
WHERE brand_slug = 'armor-corp'
  AND created_at > '2026-05-19';


-- V2 — Detalle por artículo piloto: comparación benchmark vs real
SELECT
    id,
    title,
    target_keyword,
    word_count AS real_words,
    (brief_data->'ahrefs_research'->'serp_benchmarks'->>'avg_word_count')::int AS benchmark_words,
    ROUND(
        100.0 * word_count / NULLIF((brief_data->'ahrefs_research'->'serp_benchmarks'->>'avg_word_count')::int, 0),
        1
    ) AS pct_vs_benchmark,
    (brief_data->'ahrefs_research'->'keyword_metrics'->>'keyword_difficulty')::int AS kd,
    (brief_data->'ahrefs_research'->'keyword_metrics'->>'volume')::int AS volume,
    seo_score,
    eeat_score,
    created_at
FROM content_items
WHERE brand_slug = 'armor-corp'
  AND brief_data ? 'ahrefs_research'
ORDER BY created_at DESC;


-- V3 — Verificar uso real de faq_questions en los artículos
-- (revisión manual: comparar las preguntas en ahrefs_research.faq_questions vs las que aparecen en el HTML del artículo)
SELECT
    id,
    title,
    jsonb_array_length(brief_data->'ahrefs_research'->'faq_questions') AS faq_disponibles,
    brief_data->'ahrefs_research'->'faq_questions' AS faq_preguntas
FROM content_items
WHERE brand_slug = 'armor-corp'
  AND brief_data ? 'ahrefs_research'
ORDER BY created_at DESC
LIMIT 10;


-- V4 — Distribución de ahrefs_partial_failure
SELECT
    (brief_data->'ahrefs_research'->>'ahrefs_partial_failure')::bool AS partial_fail,
    COUNT(*) AS articulos
FROM content_items
WHERE brand_slug = 'armor-corp'
  AND brief_data ? 'ahrefs_research'
GROUP BY partial_fail;


-- V5 — Comparativa antes/después: seo_score promedio
WITH antes AS (
    SELECT AVG(seo_score) AS avg_score
    FROM content_items
    WHERE brand_slug = 'armor-corp'
      AND created_at < '2026-05-19'
      AND seo_score IS NOT NULL
),
despues AS (
    SELECT AVG(seo_score) AS avg_score
    FROM content_items
    WHERE brand_slug = 'armor-corp'
      AND created_at >= '2026-05-19'
      AND brief_data ? 'ahrefs_research'
      AND seo_score IS NOT NULL
)
SELECT
    (SELECT avg_score FROM antes) AS antes,
    (SELECT avg_score FROM despues) AS despues_con_ahrefs,
    (SELECT avg_score FROM despues) - (SELECT avg_score FROM antes) AS delta;


-- V6 — Latencia: comparar tiempo de procesamiento antes/después
SELECT
    CASE
        WHEN brief_data ? 'ahrefs_research' THEN 'con_ahrefs'
        ELSE 'sin_ahrefs'
    END AS grupo,
    COUNT(*) AS articulos,
    AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) AS avg_seconds,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (processed_at - created_at))) AS median_seconds
FROM content_items
WHERE brand_slug = 'armor-corp'
  AND processed_at IS NOT NULL
  AND created_at > '2026-05-12'
GROUP BY grupo;


-- V7 — Detección de fallos: artículos donde brief_data NO tiene ahrefs_research
-- pero deberían (creados después del despliegue)
SELECT
    id,
    title,
    target_keyword,
    status,
    created_at,
    brief_data
FROM content_items
WHERE brand_slug = 'armor-corp'
  AND created_at > '2026-05-19'
  AND NOT (brief_data ? 'ahrefs_research')
ORDER BY created_at DESC;
