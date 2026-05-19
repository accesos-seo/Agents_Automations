#!/usr/bin/env node
/**
 * Audit script — Fase 0 de la integración Ahrefs
 *
 * Ejecuta las 10 queries de auditoría contra Supabase Light_House y deja:
 *   - resultados-auditoria.json (dump crudo, para Claude)
 *   - resultados-auditoria.md   (resumen legible, reemplaza el template 02-)
 *
 * Cómo correr (en tu máquina local Windows o cualquier OS con Node 18+):
 *
 *   # opcion A: tienes .env.shared / .env.local
 *   node run-audit.mjs
 *
 *   # opcion B: pasar credenciales inline
 *   SUPABASE_URL=https://stjugsrkrweakvzmizpq.supabase.co \
 *   SUPABASE_SERVICE_KEY=eyJhbG... \
 *   node run-audit.mjs
 *
 * Requiere Node 18+ (fetch nativo). Cero dependencias externas.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Carga de credenciales ────────────────────────────────────────────────
function loadEnv() {
  const candidates = [
    resolve(__dirname, '../../../../.env.local'),
    resolve(__dirname, '../../../../.env.shared'),
    resolve(__dirname, '../../../../.env'),
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env.shared'),
    resolve(process.cwd(), '.env')
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      console.error(`✓ Credenciales cargadas desde ${path}`);
      return;
    }
  }
  console.error('ℹ No se encontró .env — usando variables del entorno');
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.LIGHTHOUSE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.LIGHTHOUSE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('✗ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// ─── Ejecutor de SQL vía RPC (función pública 'exec_sql') o REST ──────────
// Usamos la convención de Supabase: si existe una función SQL "exec_sql(query text)",
// la usamos. Si no, recurrimos a queries que se pueden expresar como REST.
async function sql(query) {
  // Intentar via PostgREST RPC genérico — requiere la extension `pg_net` o un
  // wrapper. Si tu proyecto no lo tiene, dejaremos el SQL en un archivo .sql
  // para que lo ejecutes en el SQL Editor del dashboard.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  if (!res.ok) {
    throw new Error(`exec_sql failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// ─── REST helpers que NO necesitan exec_sql ───────────────────────────────
async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!res.ok) {
    throw new Error(`REST ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// ─── Queries ──────────────────────────────────────────────────────────────
const queries = {
  Q1_fn_trigger_definition: {
    description: 'Definición completa de fn_trigger_seo_investigation',
    sql: `SELECT proname, pg_get_functiondef(oid) AS def
          FROM pg_proc
          WHERE proname = 'fn_trigger_seo_investigation';`
  },
  Q2_trigger_definition: {
    description: 'Trigger tr_investigar_seo_en_n8n',
    sql: `SELECT tgname, tgrelid::regclass::text AS table_name, pg_get_triggerdef(oid) AS def
          FROM pg_trigger WHERE tgname = 'tr_investigar_seo_en_n8n';`
  },
  Q3_content_items_columns: {
    description: 'Estructura de content_items',
    sql: `SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_name = 'content_items'
          ORDER BY ordinal_position;`
  },
  Q4_brief_data_samples: {
    description: 'Samples de brief_data',
    restPath: 'content_items?select=id,title,target_keyword,locale,brand_slug,brief_data,created_at&brief_data=not.is.null&order=created_at.desc&limit=5'
  },
  Q5_brief_data_keys: {
    description: 'Top-level keys de brief_data',
    sql: `SELECT key, COUNT(*) AS occurrences
          FROM content_items, jsonb_object_keys(brief_data) AS key
          WHERE brief_data IS NOT NULL
          GROUP BY key
          ORDER BY occurrences DESC;`
  },
  Q6_ahrefs_secret: {
    description: 'Ahrefs API key en vault.secrets',
    sql: `SELECT name, description, created_at, updated_at
          FROM vault.secrets
          WHERE name ILIKE '%ahrefs%' OR description ILIKE '%ahrefs%';`
  },
  Q7_brands_locales: {
    description: 'Marcas y locales activos',
    sql: `SELECT brand_slug, locale, COUNT(*) AS articles
          FROM content_items
          GROUP BY brand_slug, locale
          ORDER BY brand_slug, locale;`
  },
  Q8_generation_latency: {
    description: 'Latencia promedio de generación (14 días)',
    sql: `SELECT DATE_TRUNC('day', created_at)::date AS day,
                 COUNT(*) AS total,
                 ROUND(AVG(EXTRACT(EPOCH FROM (processed_at - created_at)))::numeric, 1) AS avg_seconds
          FROM content_items
          WHERE processed_at IS NOT NULL
            AND created_at > NOW() - INTERVAL '14 days'
          GROUP BY day
          ORDER BY day DESC;`
  },
  Q9_agent_registry: {
    description: 'Configuración de los agentes principales',
    restPath: `agent_registry?select=agent_key,model,status,config,updated_at&agent_key=in.(seo-expert,content-writer,optimizer)`
  },
  Q10_volume_pipeline: {
    description: 'Volumen semanal del pipeline (30 días)',
    sql: `SELECT DATE_TRUNC('week', created_at)::date AS week,
                 COUNT(*) AS articulos,
                 COUNT(DISTINCT target_keyword) AS keywords_unicas
          FROM content_items
          WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY week
          ORDER BY week DESC;`
  }
};

// ─── Ejecución ────────────────────────────────────────────────────────────
async function run() {
  const results = {};
  let restAvailable = true;
  let sqlAvailable = true;

  // Probar conectividad REST básica
  try {
    await rest('content_items?select=id&limit=1');
  } catch (e) {
    console.error('✗ REST API no responde:', e.message);
    restAvailable = false;
  }

  // Probar exec_sql
  try {
    await sql('SELECT 1 AS test;');
  } catch (e) {
    console.error('ℹ exec_sql RPC no disponible — solo se ejecutarán queries REST');
    sqlAvailable = false;
  }

  for (const [key, q] of Object.entries(queries)) {
    process.stderr.write(`→ ${key} (${q.description})... `);
    try {
      if (q.restPath && restAvailable) {
        results[key] = { ok: true, via: 'rest', data: await rest(q.restPath) };
        console.error('✓');
      } else if (q.sql && sqlAvailable) {
        results[key] = { ok: true, via: 'rpc', data: await sql(q.sql) };
        console.error('✓');
      } else {
        results[key] = { ok: false, error: 'No hay método disponible (REST no responde y exec_sql no existe)', sql: q.sql, restPath: q.restPath };
        console.error('✗ skipped');
      }
    } catch (e) {
      results[key] = { ok: false, error: e.message, sql: q.sql, restPath: q.restPath };
      console.error('✗', e.message);
    }
  }

  // ── Salidas ────────────────────────────────────────────────────────────
  const jsonPath = resolve(__dirname, 'resultados-auditoria.json');
  writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.error(`\n✓ Dump crudo: ${jsonPath}`);

  const mdPath = resolve(__dirname, 'resultados-auditoria.md');
  writeFileSync(mdPath, renderMarkdown(results));
  console.error(`✓ Reporte legible: ${mdPath}`);

  // Si exec_sql no estaba disponible, generar el archivo SQL para ejecutar manual
  if (!sqlAvailable) {
    const fallbackSql = Object.entries(queries)
      .filter(([_, q]) => q.sql)
      .map(([k, q]) => `-- ${k}: ${q.description}\n${q.sql}\n`)
      .join('\n');
    const sqlPath = resolve(__dirname, 'queries-pendientes-manual.sql');
    writeFileSync(sqlPath, fallbackSql);
    console.error(`\nℹ exec_sql RPC no existe en este proyecto. Ejecutar manualmente en SQL Editor:`);
    console.error(`  → ${sqlPath}`);
    console.error(`  → Pegar los resultados en resultados-auditoria.md o re-ejecutar este script después de crear la RPC.`);
  }

  console.error('\n=== Resumen ===');
  const ok = Object.values(results).filter(r => r.ok).length;
  console.error(`${ok}/${Object.keys(queries).length} queries completadas`);
}

// ─── Renderizado a Markdown ───────────────────────────────────────────────
function renderMarkdown(results) {
  const lines = [
    '# Fase 0 — Resultados de auditoría',
    '',
    `> Generado automáticamente por \`run-audit.mjs\` el ${new Date().toISOString()}`,
    '> Dump crudo en \`resultados-auditoria.json\`',
    ''
  ];
  for (const [key, q] of Object.entries(queries)) {
    const r = results[key];
    lines.push(`## ${key} — ${q.description}`, '');
    if (!r.ok) {
      lines.push(`> ❌ Error: ${r.error}`);
      if (r.sql) lines.push('', '```sql', r.sql, '```');
      lines.push('');
      continue;
    }
    const data = r.data;
    if (Array.isArray(data) && data.length === 0) {
      lines.push('_(sin resultados)_', '');
      continue;
    }
    if (Array.isArray(data)) {
      // Renderizar como tabla si es flat, como JSON si es nested
      const first = data[0];
      const flat = first && typeof first === 'object' && Object.values(first).every(v =>
        v === null || ['string','number','boolean'].includes(typeof v)
      );
      if (flat) {
        const cols = Object.keys(first);
        lines.push('| ' + cols.join(' | ') + ' |');
        lines.push('|' + cols.map(() => '---').join('|') + '|');
        for (const row of data) {
          lines.push('| ' + cols.map(c => String(row[c] ?? '').replace(/\|/g, '\\|').slice(0, 200)).join(' | ') + ' |');
        }
      } else {
        lines.push('```json', JSON.stringify(data, null, 2).slice(0, 8000), '```');
      }
    } else {
      lines.push('```json', JSON.stringify(data, null, 2).slice(0, 8000), '```');
    }
    lines.push('');
  }
  return lines.join('\n');
}

run().catch(e => {
  console.error('\n✗ Error fatal:', e.message);
  process.exit(1);
});
