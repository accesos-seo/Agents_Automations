-- =============================================================================
-- FASE 0 — Queries de auditoría
-- Proyecto: Light_House (stjugsrkrweakvzmizpq)
-- =============================================================================
-- Objetivo: obtener todo lo necesario para diseñar la integración Ahrefs sin
-- romper lo que n8n A ya hace hoy. Ejecutar TODAS las queries y pegar los
-- resultados en 02-resultados-auditoria.md.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Q1 — Función SQL que dispara n8n A
-- Objetivo: ver la URL del webhook y qué payload manda
-- -----------------------------------------------------------------------------
SELECT
    proname,
    pg_get_functiondef(oid) AS function_definition
FROM pg_proc
WHERE proname = 'fn_trigger_seo_investigation';


-- -----------------------------------------------------------------------------
-- Q2 — Trigger asociado
-- -----------------------------------------------------------------------------
SELECT
    tgname AS trigger_name,
    tgrelid::regclass AS table_name,
    pg_get_triggerdef(oid) AS trigger_definition
FROM pg_trigger
WHERE tgname = 'tr_investigar_seo_en_n8n';


-- -----------------------------------------------------------------------------
-- Q3 — Estructura completa de la tabla content_items
-- -----------------------------------------------------------------------------
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'content_items'
ORDER BY ordinal_position;


-- -----------------------------------------------------------------------------
-- Q4 — Sample de brief_data actual (5 ejemplos recientes y completos)
-- Objetivo: ver la estructura JSON exacta que n8n A produce hoy
-- -----------------------------------------------------------------------------
SELECT
    id,
    title,
    target_keyword,
    locale,
    brand_slug,
    jsonb_pretty(brief_data) AS brief_data_pretty,
    created_at
FROM content_items
WHERE brief_data IS NOT NULL
  AND brief_data != '{}'::jsonb
ORDER BY created_at DESC
LIMIT 5;


-- -----------------------------------------------------------------------------
-- Q5 — Claves top-level de brief_data agregadas (qué campos existen en general)
-- -----------------------------------------------------------------------------
SELECT
    key,
    COUNT(*) AS occurrences
FROM content_items, jsonb_object_keys(brief_data) AS key
WHERE brief_data IS NOT NULL
GROUP BY key
ORDER BY occurrences DESC;


-- -----------------------------------------------------------------------------
-- Q6 — Ahrefs API key: secrets disponibles en Vault
-- Objetivo: confirmar que existe y obtener el nombre exacto
-- -----------------------------------------------------------------------------
SELECT name, description, created_at, updated_at
FROM vault.secrets
WHERE name ILIKE '%ahrefs%' OR description ILIKE '%ahrefs%';


-- -----------------------------------------------------------------------------
-- Q7 — Marcas activas y sus locales
-- Objetivo: mapear locale → country_code para Ahrefs
-- -----------------------------------------------------------------------------
SELECT DISTINCT
    brand_slug,
    locale,
    COUNT(*) AS article_count
FROM content_items
GROUP BY brand_slug, locale
ORDER BY brand_slug, locale;


-- -----------------------------------------------------------------------------
-- Q8 — Promedio de tiempo de generación (para calibrar impacto de +5s)
-- -----------------------------------------------------------------------------
SELECT
    DATE_TRUNC('day', created_at) AS day,
    COUNT(*) AS total,
    AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) AS avg_seconds
FROM content_items
WHERE processed_at IS NOT NULL
  AND created_at > NOW() - INTERVAL '14 days'
GROUP BY day
ORDER BY day DESC;


-- -----------------------------------------------------------------------------
-- Q9 — agent_registry: confirmar configuración del seo-expert
-- Objetivo: saber dónde está el prompt y cómo lee el brief_data
-- -----------------------------------------------------------------------------
SELECT
    agent_key,
    model,
    status,
    config,
    updated_at
FROM agent_registry
WHERE agent_key IN ('seo-expert', 'content-writer', 'optimizer')
ORDER BY agent_key;


-- -----------------------------------------------------------------------------
-- Q10 — Volumen actual del pipeline (último mes)
-- Objetivo: dimensionar costos Ahrefs realistas
-- -----------------------------------------------------------------------------
SELECT
    DATE_TRUNC('week', created_at) AS week,
    COUNT(*) AS articulos_generados,
    COUNT(DISTINCT target_keyword) AS keywords_unicas,
    ROUND(100.0 * COUNT(DISTINCT target_keyword) / NULLIF(COUNT(*), 0), 1) AS pct_unicas
FROM content_items
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY week
ORDER BY week DESC;
