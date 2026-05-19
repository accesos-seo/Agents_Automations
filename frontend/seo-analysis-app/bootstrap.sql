-- ============================================================
--  bootstrap.sql — Preparar Supabase Light_House para la mini-app
-- ============================================================
--  CORRELO UNA SOLA VEZ desde el SQL Editor de Supabase ANTES
--  de iniciar la app, o no va a funcionar (faltan permisos +
--  Realtime).
--
--  Además, en el Dashboard de Supabase hacé:
--   Settings → API → Exposed schemas → AGREGAR "ahrefs_web_analysis"
--   (esa configuración no es scripteable por SQL, requiere UI)
-- ============================================================

BEGIN;

-- 1) Permitir que el rol anon (y authenticated) acceda al esquema
GRANT USAGE ON SCHEMA ahrefs_web_analysis TO anon, authenticated;

-- 2) SELECT sobre las tablas que el frontend lee
GRANT SELECT ON ALL TABLES IN SCHEMA ahrefs_web_analysis TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA ahrefs_web_analysis
  GRANT SELECT ON TABLES TO anon, authenticated;

-- 3) EXECUTE sobre los RPCs públicos que el frontend llama
GRANT EXECUTE ON FUNCTION public.ahrefs_enqueue_url_analysis(text, text, text, text, text, date, integer, boolean)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ahrefs_dispatch_ready_analysis_requests(integer)
  TO anon, authenticated;

-- 4) RLS — políticas mínimas de SOLO LECTURA para testing
--    (en producción reemplazar por reglas reales por cliente / usuario)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'clients','analysis_requests','pipeline_orchestrations','analysis_runs',
    'ingestion_batches','site_overview','historical_comparisons',
    'diagnostic_reports','agent_findings','diagnosis_result','recovery_plan',
    'reports','report_sections'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS app_read_all ON ahrefs_web_analysis.%I', t);
    EXECUTE format('CREATE POLICY app_read_all ON ahrefs_web_analysis.%I FOR SELECT TO anon, authenticated USING (true)', t);
  END LOOP;
END $$;

-- 5) Realtime — agregar tablas a la publicación supabase_realtime
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'analysis_requests','pipeline_orchestrations','analysis_runs',
    'site_overview','historical_comparisons','diagnostic_reports',
    'agent_findings','diagnosis_result','recovery_plan',
    'reports','report_sections'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE ahrefs_web_analysis.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      -- ya estaba agregada, OK
      NULL;
    END;
  END LOOP;
END $$;

COMMIT;

-- ============================================================
--  Verificación rápida (debería devolver filas)
-- ============================================================
SELECT 'schemas expuestos OK' AS check_step,
       has_schema_privilege('anon', 'ahrefs_web_analysis', 'USAGE') AS anon_usage,
       has_function_privilege('anon', 'public.ahrefs_enqueue_url_analysis(text, text, text, text, text, date, integer, boolean)', 'EXECUTE') AS anon_rpc;

SELECT 'tablas en realtime' AS check_step, count(*) AS n_tables
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'ahrefs_web_analysis';
