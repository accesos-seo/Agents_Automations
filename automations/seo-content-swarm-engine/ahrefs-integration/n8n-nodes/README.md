# Bloque de nodos n8n — Ahrefs Research Block

> Bloque listo para importar al workflow `8iZcC4mGSFWUlOAc` (n8n A — investigación SEO previa).

---

## Archivo

[`ahrefs-research-block.json`](./ahrefs-research-block.json) — 10 nodos + conexiones.

---

## Diagrama

```
        ┌─────────────────────────┐
        │ IF brand_slug = armor-  │  ← Toggle de marca piloto
        │       corp (TRUE)        │
        └────────────┬────────────┘
                     ▼
        ┌─────────────────────────┐
        │ Preparar contexto       │  ← Mapea locale → country, valida keyword
        │ Ahrefs (Code)            │
        └────────────┬────────────┘
                     │ split 5
       ┌──────┬──────┼──────┬──────┐
       ▼      ▼      ▼      ▼      ▼
   ┌───────┐┌──────┐┌──────┐┌──────┐┌──────┐
   │Overv.││SERP  ││Quest.││Relat.││AlsoR.│
   └───┬───┘└──┬───┘└──┬───┘└──┬───┘└──┬───┘
       └──────┴───────┼──────┴───────┘
                      ▼
        ┌─────────────────────────┐
        │ Merge (combineAll)      │
        └────────────┬────────────┘
                     ▼
        ┌─────────────────────────┐
        │ Normalizar + filtrar    │  ← JS: benchmarks, filtra competidores
        │ competidores (Code)     │
        └────────────┬────────────┘
                     ▼
        ┌─────────────────────────┐
        │ Supabase UPDATE          │  ← brief_data.ahrefs_research
        │ content_items.brief_data │
        └─────────────────────────┘
```

---

## Cómo importar en n8n

### Opción A — Copy & paste
1. Abrir el archivo `ahrefs-research-block.json` y copiar todo su contenido.
2. En n8n, abrir el workflow `8iZcC4mGSFWUlOAc`.
3. `Ctrl+A → Delete` (NO HACER — solo si quieres reemplazar todo).
4. **Mejor:** click en cualquier zona vacía del canvas → `Ctrl+V` → n8n pegará los nodos.

### Opción B — Import from File
1. En el workflow, menú `⋯ → Import from File`.
2. Seleccionar `ahrefs-research-block.json`.

---

## Conexiones a hacer manualmente después de importar

1. **Entrada del bloque:** conectar el output del **último nodo existente** del workflow al nodo `IF brand_slug = armor-corp`.
2. **Salida del bloque:** conectar el output de `Supabase: UPDATE brief_data` al nodo `Respond to Webhook` que ya existe (si existe). Si el workflow termina sin respuesta, agregar un Respond to Webhook al final.
3. **Salida FALSE del IF:** dejar sin conectar (o conectar directo al Respond to Webhook si quieres que otros brands sigan funcionando igual).

---

## Credenciales requeridas

### 1. Ahrefs API (HTTP Header Auth)

Crear una credencial nueva en n8n tipo `HTTP Header Auth`:

| Campo | Valor |
|---|---|
| Name | `Ahrefs API` |
| Header Name | `Authorization` |
| Header Value | `Bearer ${AHREFS_API_KEY}` ← donde `AHREFS_API_KEY` se obtiene del secret de Supabase (ver Fase 0 Q6) |

Asignar esta credencial a los 5 nodos HTTP Request del bloque.

### 2. Supabase Light_House

Crear o reutilizar credencial Supabase con:

| Campo | Valor |
|---|---|
| Host | `https://stjugsrkrweakvzmizpq.supabase.co` |
| Service Role Key | El service_role JWT de Light_House |

Asignar al nodo `Supabase: UPDATE brief_data`.

---

## Notas técnicas

### Por qué `continueOnFail: true` en los 5 HTTP

Si una de las 5 llamadas Ahrefs falla (rate limit, timeout, keyword sin datos), el bloque sigue. El nodo normalizador detecta cuáles fallaron y marca `ahrefs_partial_failure: true` en el output. El seo-expert puede operar con datos parciales.

### Por qué el IF al inicio

Toggle simple para activar solo en marca piloto sin tocar el resto del workflow. En Fase 2, este IF se reemplaza por `brand_slug IS NOT NULL` (o se elimina).

### Por qué el Code para normalizar

La API de Ahrefs v3 tiene estructuras de respuesta específicas. El normalizador:
1. Filtra competidores prohibidos del SERP top 10
2. Calcula benchmarks (avg word count, % con FAQ, etc.)
3. Genera `recommended_structure` con umbrales razonables
4. Ordena y limita questions/LSI a top-N por volumen

### Preservación del brief_data existente

El UPDATE usa `Object.assign({}, existing, { ahrefs_research: ... })` — preserva todos los campos que n8n A escribía antes. **No reemplaza** el brief, lo extiende.

### Latencia esperada

Las 5 llamadas son paralelas. Latencia total ≈ max(las 5) + overhead ≈ 2-4 segundos.

---

## Validación post-import

Antes de activar, ejecutar el workflow en modo manual con un `content_item` de prueba:

```sql
-- Crear un content_item de prueba en armor-corp
INSERT INTO content_items (brand_slug, target_keyword, locale, status)
VALUES ('armor-corp', 'epp para trabajos en altura', 'es-MX', 'draft')
RETURNING id;

-- Verificar que el trigger dispara n8n
-- Esperar ~10s y consultar:
SELECT brief_data->'ahrefs_research' FROM content_items
WHERE brand_slug = 'armor-corp'
  AND target_keyword = 'epp para trabajos en altura'
ORDER BY created_at DESC LIMIT 1;
```

Si `ahrefs_research` está presente con `keyword_metrics.volume` no nulo → el bloque funciona.

---

## Ajustes que pueden necesitarse tras Fase 0

El JSON está hecho con asunciones razonables. Tras la auditoría puede que necesitemos ajustar:

| Asunción actual | Posible ajuste tras Fase 0 |
|---|---|
| Endpoint Ahrefs `/v3/keywords-explorer/overview` | Confirmar estructura exacta de respuesta |
| Campo del payload: `target_keyword` | Puede ser `keyword`, `topic`, etc. (Q3, Q4) |
| `brand_slug` viene en el payload del trigger | Confirmar con Q1 (definición de `fn_trigger_seo_investigation`) |
| `content_item_id` viene como `id` | Confirmar con Q1 |
| Header Auth `Bearer {key}` | Ahrefs puede usar otro formato (api_key query param, etc.) |
| Lista de competidores hardcodeada en el Code | Mover a tabla Supabase para Fase 2 |
