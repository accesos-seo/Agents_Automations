# Fase 1 — MVP Changeset

> **Estado:** preparado, esperando Fase 0 completa.
> **Marca piloto:** `armor-corp` (única).
> **Objetivo:** validar que datos Ahrefs en `brief_data` mejoran calidad del artículo, sin tocar producción de otras marcas.

---

## Prerequisitos (Fase 0 completa)

- [ ] `fase-0-auditoria/02-resultados-auditoria.md` rellenado al 100%
- [ ] Workflow actual exportado en `fase-0-auditoria/n8n-workflow-actual.json`
- [ ] Nombre del secret Ahrefs confirmado (Q6)
- [ ] Mapping `locale → country_code` confirmado (Q7)
- [ ] Path del prompt del `seo-expert` confirmado (Q9)

---

## Orden de aplicación

### Paso 1 — n8n: agregar bloque Ahrefs al workflow A

**Archivo:** [`../n8n-nodes/ahrefs-research-block.json`](../n8n-nodes/ahrefs-research-block.json)

1. Abrir workflow `8iZcC4mGSFWUlOAc` en n8n.
2. Importar el JSON de nodos (botón "Import from File" o pegar como clipboard).
3. Conectar el primer nodo del bloque al **último nodo existente del workflow** (después del trabajo actual de n8n A).
4. Conectar el último nodo del bloque (Supabase UPDATE) al nodo "Respond to Webhook" existente.
5. **Configurar credenciales:**
   - Nodo "Ahrefs API call" → Credential HTTP Header Auth con `Authorization: Bearer {{$env.AHREFS_API_KEY}}` (o el nombre que confirmamos en Fase 0).
   - Nodo "Supabase UPDATE" → credential Supabase Light_House con permisos sobre `content_items`.
6. **Toggle de marca piloto:** el primer nodo del bloque tiene un IF que solo deja pasar `brand_slug = 'armor-corp'`. Confirmado.
7. Guardar y activar.

### Paso 2 — Prompt del `seo-expert`

**Archivo:** [`../prompts/seo-expert-prompt-update.md`](../prompts/seo-expert-prompt-update.md)

Aplicar el patch al system prompt del `seo-expert` en `ops-control-plane`. La sección a añadir es **aditiva** — el agente sigue funcionando igual si `ahrefs_research` no está presente en el brief.

### Paso 3 — Validación piloto

Generar 5 artículos en `armor-corp` y comparar antes/después:

```sql
-- En Supabase Light_House
SELECT
  id,
  title,
  word_count,
  seo_score,
  eeat_score,
  brief_data->'ahrefs_research'->'keyword_metrics'->>'keyword_difficulty' AS kd,
  brief_data->'ahrefs_research'->'serp_benchmarks'->>'avg_word_count' AS benchmark_words,
  brief_data->'ahrefs_research'->>'data_fetched_at' AS ahrefs_fetched_at,
  created_at
FROM content_items
WHERE brand_slug = 'armor-corp'
  AND brief_data ? 'ahrefs_research'
ORDER BY created_at DESC
LIMIT 10;
```

**Criterios de éxito del piloto:**
- [ ] 5 de 5 artículos contienen `ahrefs_research` en `brief_data`
- [ ] `word_count` real dentro de ±15% de `serp_benchmarks.avg_word_count`
- [ ] `seo_score` igual o mayor al promedio histórico de `armor-corp`
- [ ] FAQ del artículo usa al menos 4 de las `faq_questions` reales (validación manual)
- [ ] 0 menciones de competidores prohibidos (validación con `contract-validator`)

### Paso 4 — Decisión de expansión

Si los 5 criterios pasan → activar para resto de marcas (cambiar el IF en n8n a `brand_slug IS NOT NULL`).
Si fallan → debug en `armor-corp`, no expandir.

---

## Rollback

### Si algo sale mal en Fase 1

1. **Desactivar el bloque nuevo en n8n:** desconectar el primer nodo del bloque del workflow. El flujo sigue igual que antes.
2. **Limpiar brief_data piloto** (opcional, solo si los datos contaminan):
   ```sql
   UPDATE content_items
   SET brief_data = brief_data - 'ahrefs_research'
   WHERE brand_slug = 'armor-corp'
     AND brief_data ? 'ahrefs_research'
     AND created_at > '2026-05-19';
   ```
3. **Revertir prompt del seo-expert** en `ops-control-plane`.

---

## Artefactos en esta fase

| Archivo | Función |
|---|---|
| `../n8n-nodes/ahrefs-research-block.json` | Bloque de nodos importable |
| `../n8n-nodes/README.md` | Documentación del bloque |
| `../prompts/seo-expert-prompt-update.md` | Patch al prompt del seo-expert |
| `../sql/01-validation-queries.sql` | Queries para validar el piloto |
