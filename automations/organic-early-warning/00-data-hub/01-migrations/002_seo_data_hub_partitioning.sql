-- ============================================================================
-- Organic Early Warning V2 — Data Hub
-- Migration 002: funciones de particionado + rotación
--
-- Tablas particionadas:
--   - seo_data_hub.gsc_search_analytics_weekly  (RANGE ingested_at)
--   - seo_data_hub.ga4_organic_weekly           (RANGE ingested_at)
--   - seo_data_hub.crawl_snapshots              (RANGE crawl_date)
--
-- Política: 24 meses de retención (ARCHITECTURE.md §"Reglas del data hub").
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ensure_monthly_partitions(months_ahead)
-- Crea particiones mensuales para las 3 tablas particionadas, desde el mes
-- actual hasta el mes actual + months_ahead. Idempotente.
-- Naming: <tabla>_YYYYMM. Cubre [mes_inicio, mes_inicio + 1 mes).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo_data_hub.ensure_monthly_partitions(
  months_ahead INT DEFAULT 3
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  partitioned_tables TEXT[] := ARRAY[
    'gsc_search_analytics_weekly',
    'ga4_organic_weekly',
    'crawl_snapshots'
  ];
  tbl                 TEXT;
  i                   INT;
  month_start         DATE;
  month_end           DATE;
  part_suffix         TEXT;
  part_name           TEXT;
  created_count       INT := 0;
  sql_stmt            TEXT;
BEGIN
  -- Anclamos al primer día del mes actual (UTC) para que las fronteras sean limpias.
  FOR i IN 0..months_ahead LOOP
    month_start := date_trunc('month', (NOW() AT TIME ZONE 'UTC'))::DATE
                   + (i || ' months')::INTERVAL;
    month_end   := month_start + INTERVAL '1 month';
    part_suffix := to_char(month_start, 'YYYYMM');

    FOREACH tbl IN ARRAY partitioned_tables LOOP
      part_name := tbl || '_' || part_suffix;

      sql_stmt := format(
        'CREATE TABLE IF NOT EXISTS seo_data_hub.%I PARTITION OF seo_data_hub.%I '
        'FOR VALUES FROM (%L) TO (%L);',
        part_name, tbl, month_start, month_end
      );

      EXECUTE sql_stmt;

      -- Log idempotente: el INSERT en run_events es siempre append; no rompe
      -- si la partición ya existía (no podemos saber desde DDL si era nueva,
      -- así que registramos el intento para trazabilidad).
      INSERT INTO seo_data_hub.run_events (event_source, event_type, payload)
      VALUES (
        'hub-partitioning',
        'partition_created',
        jsonb_build_object(
          'table', tbl,
          'partition', part_name,
          'from', month_start,
          'to',   month_end
        )
      );

      created_count := created_count + 1;
    END LOOP;
  END LOOP;

  RETURN created_count;
END;
$$;

COMMENT ON FUNCTION seo_data_hub.ensure_monthly_partitions(INT)
  IS 'Crea particiones mensuales (idempotentes) para las tablas particionadas del hub. Llamar desde el watchdog.';

-- ----------------------------------------------------------------------------
-- rotate_old_partitions(retention_months)
-- DETACH + DROP de particiones cuyo rango cae completamente antes de
-- NOW() - retention_months. Loguea cada DROP en run_events.
--
-- Detección: parsea el nombre <tabla>_YYYYMM. La partición default (sufijo
-- 'default') se ignora siempre. Solo aplica a las 3 tablas particionadas
-- del hub.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo_data_hub.rotate_old_partitions(
  retention_months INT DEFAULT 24
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  cutoff_date    DATE;
  rec            RECORD;
  part_month     DATE;
  dropped_count  INT := 0;
BEGIN
  cutoff_date := (date_trunc('month', (NOW() AT TIME ZONE 'UTC'))::DATE)
                 - (retention_months || ' months')::INTERVAL;

  FOR rec IN
    SELECT c.relname AS part_name,
           pn.nspname AS parent_schema,
           p.relname  AS parent_name
    FROM pg_inherits      inh
    JOIN pg_class         c   ON c.oid = inh.inhrelid
    JOIN pg_class         p   ON p.oid = inh.inhparent
    JOIN pg_namespace     pn  ON pn.oid = p.relnamespace
    JOIN pg_namespace     cn  ON cn.oid = c.relnamespace
    WHERE pn.nspname = 'seo_data_hub'
      AND p.relname IN (
        'gsc_search_analytics_weekly',
        'ga4_organic_weekly',
        'crawl_snapshots'
      )
      AND c.relname !~ '_default$'
      AND c.relname ~ '_[0-9]{6}$'
  LOOP
    -- Parsea YYYYMM del sufijo.
    part_month := to_date(right(rec.part_name, 6), 'YYYYMM');

    IF part_month < cutoff_date THEN
      EXECUTE format(
        'ALTER TABLE seo_data_hub.%I DETACH PARTITION seo_data_hub.%I;',
        rec.parent_name, rec.part_name
      );
      EXECUTE format('DROP TABLE IF EXISTS seo_data_hub.%I;', rec.part_name);

      INSERT INTO seo_data_hub.run_events (event_source, event_type, payload)
      VALUES (
        'hub-partitioning',
        'rotation_executed',
        jsonb_build_object(
          'table', rec.parent_name,
          'partition_dropped', rec.part_name,
          'partition_month', part_month,
          'cutoff_date', cutoff_date,
          'retention_months', retention_months
        )
      );

      dropped_count := dropped_count + 1;
    END IF;
  END LOOP;

  RETURN dropped_count;
END;
$$;

COMMENT ON FUNCTION seo_data_hub.rotate_old_partitions(INT)
  IS 'DETACH + DROP de particiones más antiguas que retention_months. Idempotente.';

-- ----------------------------------------------------------------------------
-- Crear las particiones iniciales (mes actual + 3 hacia adelante).
-- ----------------------------------------------------------------------------
SELECT seo_data_hub.ensure_monthly_partitions(3);
