-- =============================================================================
-- FASE 2 — Migration: tabla ahrefs_keyword_cache
-- Proyecto: Light_House (stjugsrkrweakvzmizpq)
-- =============================================================================
-- Aplicar SOLO después de validar Fase 1 en armor-corp.
-- =============================================================================

BEGIN;

-- Tabla de caché por (keyword, country_code)
CREATE TABLE IF NOT EXISTS ahrefs_keyword_cache (
    keyword TEXT NOT NULL,
    country_code TEXT NOT NULL,
    data JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ GENERATED ALWAYS AS (fetched_at + INTERVAL '7 days') STORED,
    credits_used INT DEFAULT 5,
    PRIMARY KEY (keyword, country_code)
);

-- Índice para queries de expiración (limpieza)
CREATE INDEX IF NOT EXISTS idx_ahrefs_cache_expires
    ON ahrefs_keyword_cache (expires_at);

-- Comentarios
COMMENT ON TABLE ahrefs_keyword_cache IS
    'Caché de respuestas Ahrefs por (keyword + country). TTL 7 días. '
    'Reduce consumo de credits cuando múltiples marcas/artículos comparten keyword.';

COMMENT ON COLUMN ahrefs_keyword_cache.data IS
    'JSONB con la estructura ahrefs_research completa (keyword_metrics + serp_benchmarks + faq_questions + lsi_keywords + also_rank_for).';

COMMENT ON COLUMN ahrefs_keyword_cache.expires_at IS
    'Generado automáticamente como fetched_at + 7 días. Para refrescar, hacer DELETE + INSERT.';

-- Función helper: get_or_fetch (para uso desde el bloque n8n o futuras Edge Functions)
CREATE OR REPLACE FUNCTION get_ahrefs_cache(p_keyword TEXT, p_country TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_data JSONB;
BEGIN
    SELECT data INTO v_data
    FROM ahrefs_keyword_cache
    WHERE keyword = LOWER(TRIM(p_keyword))
      AND country_code = LOWER(p_country)
      AND expires_at > NOW();

    RETURN v_data;  -- NULL si no hay hit válido
END;
$$;

COMMENT ON FUNCTION get_ahrefs_cache IS
    'Devuelve datos cacheados de Ahrefs para una keyword+country si están vigentes. NULL si no.';

-- Función helper: set_ahrefs_cache (upsert)
CREATE OR REPLACE FUNCTION set_ahrefs_cache(
    p_keyword TEXT,
    p_country TEXT,
    p_data JSONB,
    p_credits_used INT DEFAULT 5
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO ahrefs_keyword_cache (keyword, country_code, data, fetched_at, credits_used)
    VALUES (LOWER(TRIM(p_keyword)), LOWER(p_country), p_data, NOW(), p_credits_used)
    ON CONFLICT (keyword, country_code)
    DO UPDATE SET
        data = EXCLUDED.data,
        fetched_at = EXCLUDED.fetched_at,
        credits_used = EXCLUDED.credits_used;
END;
$$;

COMMENT ON FUNCTION set_ahrefs_cache IS
    'Upsert de datos Ahrefs en caché. Resetea fetched_at y expires_at.';

-- Job de limpieza: borrar registros expirados (correr semanalmente vía pg_cron si disponible)
CREATE OR REPLACE FUNCTION cleanup_ahrefs_cache()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INT;
BEGIN
    DELETE FROM ahrefs_keyword_cache WHERE expires_at < NOW() - INTERVAL '1 day';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION cleanup_ahrefs_cache IS
    'Borra registros de caché expirados hace más de 1 día. Llamar desde pg_cron o manualmente.';

COMMIT;

-- =============================================================================
-- Métricas operacionales (queries útiles después de Fase 2)
-- =============================================================================

-- ¿Cuántas keywords están en caché y cuántas están vigentes?
-- SELECT
--     COUNT(*) AS total,
--     COUNT(*) FILTER (WHERE expires_at > NOW()) AS vigentes,
--     COUNT(*) FILTER (WHERE expires_at <= NOW()) AS expiradas
-- FROM ahrefs_keyword_cache;

-- ¿Cuántos credits hemos ahorrado este mes? (estimado: vigentes consultadas > 1 vez)
-- Esto requiere un contador de "veces consultado" — agregar en Fase 2.1 si se quiere medir.

-- Top keywords cacheadas
-- SELECT keyword, country_code, fetched_at, expires_at
-- FROM ahrefs_keyword_cache
-- WHERE expires_at > NOW()
-- ORDER BY fetched_at DESC
-- LIMIT 20;
