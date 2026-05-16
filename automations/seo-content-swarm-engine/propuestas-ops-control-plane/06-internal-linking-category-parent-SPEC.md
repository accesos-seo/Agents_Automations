# Propuesta 06 — Category Parent Link + Customer Journey ILS v3
**Sesión:** S-008 | **Fecha:** 2026-05-16 | **Estado:** pendiente de aplicar

> Spec técnico para el desarrollador que aplica los cambios en `ops-control-plane` y Supabase.  
> Prerequisito: el usuario debe responder P-1 a P-4 del handover `2026-05-16-analisis-enlazado-customer-journey.md`.

---

## Módulo A — Category Parent Link (Capa A)

### A.1. Migración SQL en Light_House (`stjugsrkrweakvzmizpq`)

**Objetivo:** poblar `content_categories.vertical_target_url` y `vertical_anchor_text`.

Template (completar con las URLs y anchors reales una vez que el usuario las confirme):

```sql
-- Ejemplo: una vez el usuario confirme las URLs reales
UPDATE content_categories SET
  vertical_target_url   = 'https://cassino.bet.br/jogos-de-cassino/',
  vertical_anchor_text  = 'jogos de cassino'
WHERE slug = 'jogos-de-cassino' AND client_id = 'c5567ee7-6fe3-4301-829e-0bc220755100';

-- Repetir por cada categoría activa
```

### A.2. Patch al brand-context-loader (en `seo-content-orchestrator`)

Después de cargar `brand_voice`, el loader debe ejecutar:

```typescript
// Dentro de brand-context-loader step
const { data: categoryData } = await supabase
  .from('content_categories')
  .select('name, vertical_target_url, vertical_anchor_text')
  .eq('id', contentItem.category_id)
  .single();

const categoryContext = categoryData?.vertical_target_url
  ? {
      category_name: categoryData.name,
      category_url: categoryData.vertical_target_url,
      category_anchor: categoryData.vertical_anchor_text ?? categoryData.name.toLowerCase(),
    }
  : null;

// Incluir en el payload que va al writer
brandContext.category_link = categoryContext;
```

### A.3. Patch al writer prompt

Añadir en el system prompt del `content-writer` agent, dentro de la sección de instrucciones de la introducción:

```
ENLACE DE CATEGORÍA (OBLIGATORIO si category_link está presente):
En los primeros 100 palabras de la introducción (sección intro / section_intro),
incluye el texto "{{category_link.category_anchor}}" como anchor text de un enlace HTML
que apunta a "{{category_link.category_url}}".
El enlace debe quedar completamente natural dentro del flujo del párrafo.
No añadas texto como "ver más en" o "haz click aquí". El anchor debe ser parte de la oración.

Ejemplo correcto:
  "Os <a href="https://cassino.bet.br/jogos-de-cassino/">jogos de cassino</a> 
   são regulamentados no Brasil desde 2023..."

Ejemplo incorrecto:
  "Para saber más sobre jogos de cassino, <a href="...">haz click aquí</a>."
```

---

## Módulo B — ILS v3 con slots editoriales

### B.1. Cambio de algoritmo en `ils-orchestrator`

**Reemplazar:** selección "top-N por priority_score"  
**Por:** selección por slots editoriales secuenciales

```typescript
const SLOT_RULES = [
  {
    slot: 'consolidation',
    filter: (c) => c.relationship_type === 'same_cluster' && c.source_journey_stage === c.target_journey_stage,
    sort: (a, b) => b.confidence_score - a.confidence_score,
    required: true,
  },
  {
    slot: 'cj_forward',
    filter: (c) => c.relationship_type === 'next_step' || 
                   (c.relationship_type === 'same_cluster' && journeyOrder[c.target_journey_stage] > journeyOrder[c.source_journey_stage]),
    sort: (a, b) => b.priority_score - a.priority_score,
    required: true,
  },
  {
    slot: 'conversion',
    filter: (c) => c.relationship_type === 'commercial_bridge',
    sort: (a, b) => b.confidence_score - a.confidence_score,
    required: false, // Si no hay candidato, no se fuerza
  },
  {
    slot: 'pillar',
    filter: (c) => c.relationship_type === 'pillar_support' && c.confidence_score >= 0.7,
    sort: (a, b) => b.confidence_score - a.confidence_score,
    required: false,
  },
];

const journeyOrder = { discovery: 1, consideration: 2, decision: 3 };

function selectBySlots(candidates) {
  const decisions = [];
  const used = new Set();
  
  for (const rule of SLOT_RULES) {
    const eligible = candidates
      .filter(c => !used.has(c.target_content_id) && rule.filter(c))
      .sort(rule.sort);
    
    if (eligible.length > 0) {
      const winner = eligible[0];
      decisions.push({ ...winner, slot: rule.slot });
      used.add(winner.target_content_id);
    }
  }
  
  return decisions; // 2-4 links según disponibilidad
}
```

### B.2. Fix al `ils-contextual-injector` — multi-anchor fallback

```typescript
// Reemplazar el bloque de búsqueda actual por:
async function findAndInjectAnchor(articleHtml, decision, targetUrl) {
  const anchorsToTry = [
    decision.selected_anchor_text,
    ...(decision.anchor_variants ?? []),
  ].filter(Boolean);

  for (const anchor of anchorsToTry) {
    const regex = new RegExp(`(?<!<a[^>]*>)${escapeRegex(anchor)}(?!</a>)`, 'i');
    if (regex.test(articleHtml)) {
      return articleHtml.replace(regex, `<a href="${targetUrl}">${anchor}</a>`);
    }
  }

  // Fallback: insertar bloque de lectura relacionada
  return injectRelatedReadingBlock(articleHtml, decision, targetUrl);
}

function injectRelatedReadingBlock(html, decision, targetUrl) {
  // Insertar antes del cierre del primer <h2> o antes de </article>
  const readingBlock = `<p class="related-reading">
    <strong>Leitura relacionada:</strong> 
    <a href="${targetUrl}">${decision.selected_anchor_text}</a>
  </p>`;
  
  return html.replace(/<\/h2>/, `</h2>${readingBlock}`);
}
```

---

## Módulo C — WordPress Sitemap Cache

### C.1. Migración SQL — nueva tabla

```sql
CREATE TABLE wordpress_sitemap_cache (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proyecto_id     uuid NOT NULL REFERENCES proyectos_seo(id) ON DELETE CASCADE,
  url             text NOT NULL,
  title           text,
  slug            text GENERATED ALWAYS AS (
    regexp_replace(url, '^.*/([^/]+)/?$', '\1')
  ) STORED,
  last_modified   date,
  content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  cluster_key     text,
  journey_stage   text CHECK (journey_stage IN ('discovery', 'consideration', 'decision', 'conversion')),
  page_type       text DEFAULT 'blog_post', -- blog_post | category | landing | product
  indexed_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(proyecto_id, url)
);

CREATE INDEX idx_sitemap_proyecto ON wordpress_sitemap_cache(proyecto_id);
CREATE INDEX idx_sitemap_cluster ON wordpress_sitemap_cache(cluster_key);
CREATE INDEX idx_sitemap_stage ON wordpress_sitemap_cache(journey_stage);
```

### C.2. Edge Function `wordpress-sitemap-indexer` (nueva)

**Trigger:** n8n cron o manual. Entrada: `{ proyecto_id, sitemap_url }`.

```typescript
// Pseudocódigo de la Edge Function
async function indexSitemap(proyecto_id: string, sitemap_url: string) {
  const xml = await fetch(sitemap_url).then(r => r.text());
  const urls = parseSitemapXml(xml); // extrae <url><loc>, <url><lastmod>, <url><title>

  for (const entry of urls) {
    await supabase.from('wordpress_sitemap_cache').upsert({
      proyecto_id,
      url: entry.loc,
      title: entry.title ?? null,
      last_modified: entry.lastmod ?? null,
      page_type: inferPageType(entry.loc), // heurístico por path
    }, { onConflict: 'proyecto_id,url' });
  }

  // Opcional: usar Claude para inferir cluster_key y journey_stage 
  // basándose en el título y la URL
}
```

---

## Checklist de implementación

- [ ] **P-1 respondida:** URLs de categorías WP confirmadas por el usuario
- [ ] **P-2 respondida:** Número de slots CJ definido (3 o 4)
- [ ] **P-3 respondida:** Scope del sitemap (solo blog o todo el sitio)
- [ ] **P-4 respondida:** ¿Retroalimentar artículos publicados?
- [ ] Migración A.1 aplicada en Light_House
- [ ] Patch A.2 aplicado en `seo-content-orchestrator`
- [ ] Patch A.3 aplicado en el writer prompt del agent
- [ ] Algoritmo B.1 desplegado en `ils-orchestrator`
- [ ] Fix B.2 desplegado en `ils-contextual-injector`
- [ ] Migración C.1 aplicada (si P-3 aprobado)
- [ ] Edge Function `wordpress-sitemap-indexer` desplegada
- [ ] Prueba end-to-end con 1 artículo de Cassino Bet
