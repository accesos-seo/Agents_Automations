#!/usr/bin/env node
/**
 * Test de los 5 endpoints Ahrefs que usaremos en Fase 1
 *
 * Verifica:
 *   1. Que el AHREFS_API_TOKEN es válido
 *   2. Que cada endpoint responde con datos para una keyword de prueba
 *   3. Que la estructura de respuesta coincide con la que asume el nodo de
 *      normalización en n8n-nodes/ahrefs-research-block.json
 *
 * Si la estructura difiere, ajustar el JS de "Normalizar + filtrar
 * competidores" en el bloque n8n antes de aplicar Fase 1.
 *
 * Uso (en tu máquina local):
 *   AHREFS_API_TOKEN=xxx node test-ahrefs-endpoints.mjs
 *
 *   # o con keyword/country específicos
 *   AHREFS_API_TOKEN=xxx KEYWORD="epp para trabajos en altura" COUNTRY=mx node test-ahrefs-endpoints.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const candidates = [
    resolve(__dirname, '../../../../.env.local'),
    resolve(__dirname, '../../../../.env.shared'),
    resolve(__dirname, '../../../../.env')
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      console.error(`✓ Env cargado desde ${path}`);
      return;
    }
  }
}
loadEnv();

const TOKEN = process.env.AHREFS_API_TOKEN || process.env.AHREFS_API_KEY;
const KEYWORD = process.env.KEYWORD || 'epp para trabajos en altura';
const COUNTRY = process.env.COUNTRY || 'mx';

if (!TOKEN) {
  console.error('✗ Falta AHREFS_API_TOKEN');
  process.exit(1);
}

const endpoints = [
  {
    name: 'keyword-overview',
    url: 'https://api.ahrefs.com/v3/keywords-explorer/overview',
    params: { keyword: KEYWORD, country: COUNTRY, select: 'volume,keyword_difficulty,traffic_potential,cpc,search_intent,parent_topic,global_volume' }
  },
  {
    name: 'serp-overview',
    url: 'https://api.ahrefs.com/v3/keywords-explorer/serp-overview',
    params: { keyword: KEYWORD, country: COUNTRY }
  },
  {
    name: 'questions',
    url: 'https://api.ahrefs.com/v3/keywords-explorer/matching-terms',
    params: { keyword: KEYWORD, country: COUNTRY, match: 'questions', limit: 20, select: 'keyword,volume,keyword_difficulty' }
  },
  {
    name: 'related-terms',
    url: 'https://api.ahrefs.com/v3/keywords-explorer/related-terms',
    params: { keyword: KEYWORD, country: COUNTRY, limit: 30, select: 'keyword,volume,keyword_difficulty' }
  },
  {
    name: 'also-rank-for',
    url: 'https://api.ahrefs.com/v3/keywords-explorer/also-rank-for',
    params: { keyword: KEYWORD, country: COUNTRY, limit: 20, select: 'keyword,volume,keyword_difficulty' }
  }
];

async function callEndpoint(ep) {
  const url = new URL(ep.url);
  for (const [k, v] of Object.entries(ep.params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json' }
  });
  return { status: res.status, body: await res.text() };
}

console.error(`\nProbando con keyword="${KEYWORD}" country="${COUNTRY}"\n`);
const results = {};
for (const ep of endpoints) {
  process.stderr.write(`→ ${ep.name}... `);
  try {
    const { status, body } = await callEndpoint(ep);
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    results[ep.name] = { status, ok: status === 200, sample: parsed };
    console.error(status === 200 ? '✓' : `✗ HTTP ${status}`);
  } catch (e) {
    results[ep.name] = { ok: false, error: e.message };
    console.error('✗', e.message);
  }
}

const outPath = resolve(__dirname, 'ahrefs-endpoints-sample.json');
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.error(`\n✓ Respuestas guardadas en ${outPath}`);

const ok = Object.values(results).filter(r => r.ok).length;
console.error(`\n${ok}/${endpoints.length} endpoints OK`);
if (ok < endpoints.length) {
  console.error('\nℹ Revisar las respuestas con error para ajustar URLs/parámetros antes de Fase 1.');
}
