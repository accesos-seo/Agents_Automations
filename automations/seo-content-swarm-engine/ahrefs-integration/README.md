# Integración Ahrefs → `brief_data`

**Área:** B — Briefs / Investigación SEO (n8n A)
**Plan maestro:** [`referencias/plan-ahrefs-brief-enrichment.md`](../../../referencias/plan-ahrefs-brief-enrichment.md)
**Estado:** En ejecución — Fase 0 (auditoría)

---

## Cómo continuar (orden de ejecución)

### Acción 1 — Tú: ejecutar auditoría en tu máquina local Windows

Desde la raíz del repo en local:

```bash
cd automations/seo-content-swarm-engine/ahrefs-integration/fase-0-auditoria

# Auditoría Supabase (10 queries)
node run-audit.mjs

# Test de los 5 endpoints Ahrefs (verifica token + estructura de respuestas)
node test-ahrefs-endpoints.mjs
```

Esto produce 3 archivos en `fase-0-auditoria/`:
- `resultados-auditoria.json` + `resultados-auditoria.md`
- `ahrefs-endpoints-sample.json`

### Acción 2 — Tú: exportar workflow n8n

En n8n → workflow `8iZcC4mGSFWUlOAc` → `⋯` → Download → guardar como `fase-0-auditoria/n8n-workflow-actual.json`.

### Acción 3 — Tú: commit + push

```bash
git add automations/seo-content-swarm-engine/ahrefs-integration/fase-0-auditoria/
git commit -m "data(audit): Fase 0 Ahrefs — resultados auditoría"
git push origin claude/ahrfes-research-OHifu
```

### Acción 4 — Yo: retomar en siguiente sesión

Con los 3 archivos en GitHub puedo:
- Leer la estructura real del `brief_data` actual
- Ajustar el bloque n8n para que encaje exacto con tu workflow
- Adaptar el normalizador a la estructura real de respuestas Ahrefs
- Confirmar nombres de secret, campos del payload, paths de prompts
- Pasar a Fase 1 MVP (aplicación)

---

## Estructura de esta carpeta

```
ahrefs-integration/
├── README.md                    ← este archivo
├── fase-0-auditoria/
│   ├── README.md                ← cómo correr la auditoría (2 caminos)
│   ├── 00-conexion-supabase.md  ← 4 opciones de acceso a Supabase
│   ├── 01-queries-supabase.sql  ← las 10 queries SQL (Camino B manual)
│   ├── 02-resultados-auditoria.md ← template manual
│   ├── run-audit.mjs            ← Camino A: script Node
│   └── test-ahrefs-endpoints.mjs ← test de los 5 endpoints Ahrefs
├── fase-1-mvp/
│   └── CHANGESET.md             ← pasos exactos para aplicar Fase 1
├── fase-2-cache/
│   └── CHANGESET.md             ← caché + expansión a todas las marcas
├── n8n-nodes/
│   ├── README.md                ← cómo importar
│   └── ahrefs-research-block.json ← 10 nodos listos para importar
├── prompts/
│   └── seo-expert-prompt-update.md ← patch al prompt del seo-expert
└── sql/
    ├── 01-validation-queries.sql ← validación piloto armor-corp
    └── 02-cache-migration.sql   ← tabla ahrefs_keyword_cache + helpers
```

---

## Bitácora

| Fecha | Evento |
|---|---|
| 2026-05-19 | Plan maestro publicado en `referencias/plan-ahrefs-brief-enrichment.md`. PR #12 abierto. |
| 2026-05-19 | Estructura creada con artefactos de Fase 0, 1 y 2. |
| 2026-05-19 | Bloqueo: network policy del contenedor remoto bloquea `*.supabase.co` y `api.ahrefs.com`. Solución documentada. |
| 2026-05-19 | Scripts `run-audit.mjs` y `test-ahrefs-endpoints.mjs` agregados para ejecutar Fase 0 desde la máquina local del usuario. |
