# Integración Ahrefs → `brief_data`

**Área:** B — Briefs / Investigación SEO (n8n A)
**Plan maestro:** [`referencias/plan-ahrefs-brief-enrichment.md`](../../../referencias/plan-ahrefs-brief-enrichment.md)
**Estado:** En ejecución — Fase 0 (auditoría)

---

## Estructura de esta carpeta

```
ahrefs-integration/
├── README.md                    ← este archivo
├── fase-0-auditoria/            ← queries y artefactos para auditar n8n A y brief_data actuales
├── fase-1-mvp/                  ← changeset listo para aplicar (n8n + prompts + SQL)
├── fase-2-cache/                ← tabla de caché + integración (post-MVP)
├── n8n-nodes/                   ← JSONs importables de nodos n8n
├── prompts/                     ← updates de prompts de agentes (seo-expert, optimizer)
└── sql/                         ← migrations + queries SQL
```

---

## Cómo ejecutar

### Paso 1 — Auditoría (Fase 0)
1. Ejecutar las queries en `fase-0-auditoria/01-queries-supabase.sql` en Supabase **Light_House** (proyecto `stjugsrkrweakvzmizpq`).
2. Copiar los resultados en `fase-0-auditoria/02-resultados-auditoria.md` (template incluido).
3. Exportar el workflow n8n `8iZcC4mGSFWUlOAc` como JSON y subirlo a `fase-0-auditoria/n8n-workflow-actual.json`.

### Paso 2 — MVP (Fase 1)
Aplicar `fase-1-mvp/CHANGESET.md` paso por paso. Sólo después de completar Fase 0.

### Paso 3 — Caché (Fase 2)
Aplicar `fase-2-cache/CHANGESET.md` cuando Fase 1 esté validada con artículos piloto.

---

## Bitácora

| Fecha | Evento |
|---|---|
| 2026-05-19 | Estructura creada. Plan maestro publicado en `referencias/plan-ahrefs-brief-enrichment.md`. PR #12 abierto. |
