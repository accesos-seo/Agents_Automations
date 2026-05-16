# Propuesta 06 (v2) — Sistema de Enlazado Interno con Customer Journey (ILS v3)
**Sesión:** S-009 | **Fecha:** 2026-05-16 | **Estado:** listo para implementar (pendiente acceso a sitemaps)

> Arquitectura definitiva post-clarificación del usuario.  
> Fuente de verdad: WordPress CMS (no Supabase `content_items`).  
> Solicitud técnica de acceso: `handovers/2026-05-16-solicitud-tecnica-sitemap-access.md`.

---

## 1. Arquitectura de los 4 enlaces por artículo

### Taxonomía corregida (según el usuario)

| Término del usuario | Definición | Rol en el enlazado |
|---|---|---|
| **Categoría** | Página de categoría del blog WordPress | Link 1 — en la introducción, por regla |
| **Cluster de contenido** | Páginas de servicio / transaccionales del sitio (en el header) | Links 2 y 3 — CJ, intención de compra |
| **Categoría hermana** | Otra categoría del mismo blog, misma marca | Link 4 — nurturing horizontal |

### Los 4 slots de enlace

| Slot | Nombre | Destino | Dónde se inyecta | Lógica |
|---|---|---|---|---|
| **Slot 1** | Categoría padre | Página de categoría WordPress | Primeras 100 palabras de la intro | Por regla — el anchor es exactamente el nombre de la categoría |
| **Slot 2** | Cluster principal | Página de servicio más relevante al tema del artículo | Dentro del primer H2 o párrafo de decisión | CJ: consideration → decision |
| **Slot 3** | Cluster secundario | Segunda página de servicio relacionada | Antes del CTA o en sección de FAQ | CJ: consideration → consideration/decision |
| **Slot 4** | Categoría hermana | Otra categoría del blog (NO una página de servicio) | Al final de la intro o en H2 informacional | Nurturing: no empujar a compra, expandir contexto |

**Regla de calidad sobre cantidad:** si no existe un candidato con `confidence_score ≥ 0.7` para un slot, el slot se omite. Nunca se fuerza un enlace de baja calidad.

---

## 2. Arquitectura de módulos (diseño anti-colapso)

Cada módulo falla de forma independiente. Si el Módulo 3 falla, el artículo sigue existiendo. Si el Módulo 4 falla, los enlaces ya están seleccionados y se pueden reintentar.

```
MÓDULO 1 (Python, offline)
  wordpress-sitemap-indexer.py
  ↓ puebla → wordpress_sitemap_cache (Supabase)

MÓDULO 2 (Edge Function, en generación)
  seo-content-category-anchor-skill  ← NUEVO, atómico
  ↓ pasa al writer: category_url + category_anchor
  ↓ writer inyecta Link 1 en la intro

MÓDULO 3 (Edge Function, post-generación)
  seo-content-cj-link-selector       ← NUEVO, agnóstico de inyección
  ↓ selecciona Links 2, 3, 4
  ↓ escribe en internal_link_decisions (con slot label)

MÓDULO 4 (Edge Function existente, mejorado)
  ils-contextual-injector             ← MEJORADO con multi-anchor fallback
  ↓ inyecta Links 2, 3, 4 en el HTML
  ↓ reporta éxito/fallo por slot
```

**Triggers de cada módulo:**
- Módulo 1: Manual / n8n cron (no bloquea el pipeline de artículos)
- Módulo 2: Step dentro del orquestador, antes del writer (`brand_context` step)
- Módulo 3: Trigger `trg_ils_on_article_ready` (después de `article_content` estar completo)
- Módulo 4: Step dentro del ILS orchestrator existente

---

## 3. Módulo 1 — Python Sitemap Indexer

### 3.1. Script: `sitemap_indexer.py`

**Propósito:** leer los sitemaps XML de WordPress para cada marca, clasificar URLs por tipo y almacenar en Supabase. El LLM nunca ve las 300-400 URLs crudas.

**Lógica de clasificación de URLs** (heurística, sin LLM):
```python
def classify_url(url: str, domain: str) -> dict:
    """
    Clasifica una URL sin usar LLM — solo por estructura del path.
    """
    path = url.replace(f"https://{domain}", "").strip("/")
    segments = path.split("/")
    
    # Página raíz o sin path → homepage
    if not path or path == "":
        return {"page_type": "homepage", "journey_stage": "discovery"}
    
    # Artículos de blog: tienen fecha en el path o están bajo /blog/
    if re.search(r"/\d{4}/\d{2}/", url) or segments[0] in ("blog", "noticias", "artigos"):
        return {"page_type": "blog_post", "journey_stage": "consideration"}
    
    # Categorías del blog: un solo segmento, sin fecha
    if len(segments) == 1 and "-" in segments[0]:
        return {"page_type": "category", "journey_stage": "discovery"}
    
    # Páginas de servicio: listas conocidas del brand config
    # (se complementa con la Sheet del técnico)
    return {"page_type": "unknown", "journey_stage": None}
```

**Para URLs `unknown`:** el script las marca para revisión humana (no las descarta). Se pueden clasificar manualmente en la Sheet del técnico o con una segunda pasada con LLM sobre solo el subconjunto `unknown`.

**Salida:** INSERT en `wordpress_sitemap_cache` con `ON CONFLICT (proyecto_id, url) DO UPDATE`.

### 3.2. Migración SQL — tabla `wordpress_sitemap_cache`

```sql
CREATE TABLE IF NOT EXISTS wordpress_sitemap_cache (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proyecto_id     uuid NOT NULL REFERENCES proyectos_seo(id) ON DELETE CASCADE,
  url             text NOT NULL,
  title           text,
  slug            text,
  last_modified   date,
  content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
  cluster_key     text,    -- nombre del cluster, ej: "cassino-ao-vivo"
  page_type       text NOT NULL DEFAULT 'blog_post',
    -- 'blog_post' | 'category' | 'service' | 'landing' | 'product' | 'homepage' | 'unknown'
  journey_stage   text,
    -- 'discovery' | 'consideration' | 'decision' | 'conversion'
  language        varchar(10),
  is_active       boolean DEFAULT true,
  indexed_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(proyecto_id, url)
);

CREATE INDEX idx_wsc_proyecto_type  ON wordpress_sitemap_cache(proyecto_id, page_type);
CREATE INDEX idx_wsc_cluster        ON wordpress_sitemap_cache(cluster_key);
CREATE INDEX idx_wsc_stage          ON wordpress_sitemap_cache(journey_stage);
CREATE INDEX idx_wsc_active         ON wordpress_sitemap_cache(is_active);
```

### 3.3. Tabla de configuración de sitemaps por marca

```sql
-- Extensión de proyectos_seo (ALTER) o tabla auxiliar nueva
CREATE TABLE IF NOT EXISTS brand_sitemap_config (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proyecto_id  uuid NOT NULL REFERENCES proyectos_seo(id) ON DELETE CASCADE,
  sitemap_url  text NOT NULL,
  blog_base_url text,         -- ej: https://cassino.bet.br/blog/
  language     varchar(10),
  last_indexed timestamptz,
  is_active    boolean DEFAULT true,
  UNIQUE(proyecto_id)
);
```

---

## 4. Módulo 2 — Category Anchor Skill (Link 1, en generación)

### 4.1. Nueva Edge Function: `seo-content-category-anchor-skill`

**Trigger:** llamada interna desde `seo-content-orchestrator` en el step `brand_context`, después de cargar el brand-voice.

**Input:**
```json
{
  "content_item_id": "uuid",
  "proyecto_id": "uuid"
}
```

**Lógica:**
```typescript
// 1. Obtener category_id del artículo
const { data: item } = await supabase
  .from('content_items')
  .select('category_id, main_keyword, language')
  .eq('id', content_item_id)
  .single();

// 2. Si tiene category_id → buscar en content_categories
if (item.category_id) {
  const { data: cat } = await supabase
    .from('content_categories')
    .select('name, vertical_target_url, vertical_anchor_text')
    .eq('id', item.category_id)
    .single();

  if (cat?.vertical_target_url) {
    return {
      slot: 'category_parent',
      anchor_text: cat.vertical_anchor_text ?? cat.name.toLowerCase(),
      target_url: cat.vertical_target_url,
      placement: 'intro_first_100_words',
    };
  }
}

// 3. Si no tiene category_id → buscar en wordpress_sitemap_cache
//    por similitud de keyword con categorías de esa marca
const { data: candidate } = await supabase
  .from('wordpress_sitemap_cache')
  .select('url, title, cluster_key')
  .eq('proyecto_id', item.proyecto_id)
  .eq('page_type', 'category')
  .eq('is_active', true)
  .textSearch('title', item.main_keyword)
  .limit(1)
  .single();

return candidate
  ? { slot: 'category_parent', anchor_text: candidate.title.toLowerCase(), target_url: candidate.url, placement: 'intro_first_100_words' }
  : null; // Sin categoría → slot omitido, no se bloquea la generación
```

**Output agregado al brand_context payload:**
```json
{
  "category_link": {
    "slot": "category_parent",
    "anchor_text": "jogos de cassino",
    "target_url": "https://cassino.bet.br/jogos-de-cassino/",
    "placement": "intro_first_100_words"
  }
}
```

### 4.2. Patch al writer prompt (en `ops-control-plane`)

Agregar en el system prompt del `content-writer`, en la sección de instrucciones de la introducción:

```
## ENLACE DE CATEGORÍA (obligatorio si category_link está presente)

Si recibes un campo `category_link` en el contexto, debes incluir ese enlace en los 
primeros 100 palabras de la introducción. Reglas:

1. El anchor text es exactamente "{{category_link.anchor_text}}" — no parafrasees.
2. El enlace apunta a "{{category_link.target_url}}".
3. El anchor debe quedar integrado naturalmente en el flujo de la oración.
4. No uses fórmulas como "haz click aquí", "ver más", "consulta". El anchor ES parte del texto.

✅ Correcto: 
   "Os <a href="URL">jogos de cassino</a> são regulamentados no Brasil desde 2023..."

❌ Incorrecto: 
   "Para más info sobre apuestas, <a href="URL">haz click aquí</a>."

Si no recibes `category_link`, redacta la introducción normalmente.
```

---

## 5. Módulo 3 — CJ Link Selector (Links 2, 3, 4)

### 5.1. Nueva Edge Function: `seo-content-cj-link-selector`

**Trigger:** `trg_cj_links_on_article_ready` — AFTER UPDATE de `content_items.article_content` cuando no es NULL.

**Propósito:** seleccionar los 3 mejores enlaces CJ para el artículo, consultando `wordpress_sitemap_cache` con un subconjunto pequeño de candidatos pre-filtrados por Python. El LLM analiza máximo 15-20 URLs, no 300.

**Lógica por slot:**

```typescript
async function selectCJLinks(contentItem, supabase, llm) {
  const { proyecto_id, category_id, main_keyword, article_content, language } = contentItem;

  // === SLOT 2: Cluster Principal (service page más relevante) ===
  // Filtro Python: máximo 5 páginas de servicio del mismo proyecto
  const serviceCandidates = await supabase
    .from('wordpress_sitemap_cache')
    .select('url, title, cluster_key, journey_stage')
    .eq('proyecto_id', proyecto_id)
    .in('page_type', ['service', 'landing', 'product'])
    .eq('is_active', true)
    .limit(5); // El LLM recibe máximo 5 opciones

  // LLM decide cuál es más relevante para el artículo
  const slot2 = await llm.selectBestMatch({
    article_keyword: main_keyword,
    article_excerpt: article_content.substring(0, 500), // primeras 500 chars
    candidates: serviceCandidates.data,
    slot_purpose: 'Página de servicio principal relacionada con el tema del artículo. Intención: mover al lector hacia consideration o decision.',
    min_confidence: 0.7,
  });

  // === SLOT 3: Cluster Secundario (segunda página de servicio relacionada) ===
  const slot3Candidates = serviceCandidates.data
    .filter(c => c.url !== slot2?.target_url); // Excluir el ya elegido

  const slot3 = await llm.selectBestMatch({
    article_keyword: main_keyword,
    candidates: slot3Candidates,
    slot_purpose: 'Segunda página de servicio relacionada. Puede ser un servicio complementario.',
    min_confidence: 0.7,
  });

  // === SLOT 4: Categoría Hermana (nurturing, NO conversión) ===
  // Filtro Python: categorías del mismo proyecto, excluyendo la categoría padre del artículo
  const siblingCandidates = await supabase
    .from('wordpress_sitemap_cache')
    .select('url, title, cluster_key')
    .eq('proyecto_id', proyecto_id)
    .eq('page_type', 'category')
    .neq('url', contentItem.category_url) // excluir la categoría padre ya enlazada
    .eq('is_active', true)
    .limit(5);

  const slot4 = await llm.selectBestMatch({
    article_keyword: main_keyword,
    candidates: siblingCandidates.data,
    slot_purpose: 'Categoría hermana del blog para ampliar el contexto del lector. NO debe ser una página de compra. Es nurturing informacional.',
    min_confidence: 0.65, // criterio más flexible para nurturing
  });

  return [slot2, slot3, slot4].filter(Boolean);
}
```

**Output escrito en `internal_link_decisions`** con los campos:
- `relationship_type`: `'cluster_main'` / `'cluster_secondary'` / `'sibling_category'`
- `source_journey_stage`: del artículo fuente
- `target_journey_stage`: de la página destino
- `selected_anchor_text`: sugerido por el LLM
- `decision_status`: `'approved'` (listo para inyectar)
- `metadata.slot`: `'slot_2'` / `'slot_3'` / `'slot_4'`
- `metadata.confidence`: score del LLM

### 5.2. Trigger SQL

```sql
CREATE OR REPLACE FUNCTION trigger_cj_links_on_article_ready()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo si article_content acaba de ser escrito y aún no tiene CJ links
  IF NEW.article_content IS NOT NULL 
     AND OLD.article_content IS NULL
     AND NEW.ils_status IS NULL THEN
    
    PERFORM net.http_post(
      url := current_setting('app.cj_link_selector_url'),
      body := json_build_object('content_item_id', NEW.id, 'proyecto_id', NEW.proyecto_id)::text,
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_key') || '"}'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cj_links_on_article_ready
AFTER UPDATE ON content_items
FOR EACH ROW EXECUTE FUNCTION trigger_cj_links_on_article_ready();
```

---

## 6. Módulo 4 — Contextual Injector mejorado (existente)

### 6.1. Cambio en `ils-contextual-injector`

Agregar multi-anchor fallback e inyección por slot:

```typescript
async function injectCJLinks(articleHtml: string, decisions: LinkDecision[]): Promise<string> {
  let html = articleHtml;
  const report = [];

  for (const decision of decisions) {
    const slot = decision.metadata?.slot;
    const anchorsToTry = [
      decision.selected_anchor_text,
      ...(decision.anchor_variants ?? []),
    ].filter(Boolean);

    let injected = false;

    // Intento 1: anchor exacto o variante en el texto
    for (const anchor of anchorsToTry) {
      const regex = new RegExp(`(?<!<a[^>]*>)${escapeRegex(anchor)}(?!</a>)`, 'gi');
      if (regex.test(html)) {
        html = html.replace(regex, (match) => `<a href="${decision.target_url}">${match}</a>`);
        injected = true;
        report.push({ slot, status: 'injected_inline', anchor });
        break;
      }
    }

    // Intento 2 (fallback por slot): insertar bloque relacionado en posición estratégica
    if (!injected) {
      const placement = getSlotPlacement(slot, html);
      if (placement) {
        html = html.replace(
          placement.marker,
          `${placement.marker}\n<p class="cj-related-link" data-slot="${slot}">
            <a href="${decision.target_url}">${decision.selected_anchor_text}</a>
          </p>`
        );
        injected = true;
        report.push({ slot, status: 'injected_block_fallback', anchor: decision.selected_anchor_text });
      }
    }

    if (!injected) {
      report.push({ slot, status: 'injection_failed', reason: 'no_match_no_placement' });
    }
  }

  return { html, report };
}

function getSlotPlacement(slot: string, html: string): { marker: string } | null {
  // slot_2 → después del primer </h2>
  if (slot === 'slot_2' && html.includes('</h2>')) {
    return { marker: '</h2>' };
  }
  // slot_3 → antes del primer <h2 class="faq"> o sección FAQ
  if (slot === 'slot_3' && html.includes('FAQ')) {
    return { marker: html.match(/<h2[^>]*>.*?FAQ.*?<\/h2>/i)?.[0] ?? null };
  }
  // slot_4 → al final de la introducción (antes del segundo <h2>)
  if (slot === 'slot_4') {
    const h2s = [...html.matchAll(/<h2/gi)];
    return h2s.length >= 2 ? { marker: h2s[1][0] } : null;
  }
  return null;
}
```

---

## 7. Campos nuevos necesarios en `content_items`

```sql
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS cj_links_status   text;
  -- NULL | 'pending' | 'selected' | 'injected' | 'failed'
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS cj_links_data      jsonb;
  -- Array de los 4 links con sus slots y URLs finales
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS cj_links_completed_at timestamptz;
```

---

## 8. Nuevo tipo de relación en `internal_link_decisions`

Los tipos existentes (`same_cluster`, `next_step`, `commercial_bridge`, `pillar_support`) se mantienen para compatibilidad. Se agregan tres nuevos tipos para el sistema v3:

| Tipo nuevo | Descripción | Slot |
|---|---|---|
| `cluster_main` | Página de servicio principal | Slot 2 |
| `cluster_secondary` | Página de servicio secundaria | Slot 3 |
| `sibling_category` | Categoría hermana (nurturing) | Slot 4 |

---

## 9. Checklist de implementación

### Prerequisitos (antes de codificar)
- [ ] Solicitud técnica entregada al equipo técnico (`handovers/2026-05-16-solicitud-tecnica-sitemap-access.md`)
- [ ] Sitemaps XML accesibles para las 9 marcas
- [ ] Sheet con categorías + clusters completada por el usuario/técnico
- [ ] `content_categories.vertical_target_url` poblada para las marcas activas

### Fase 1 — Módulo 2 (Link 1, categoría padre) — 1-2 días
- [ ] Migración: poblar `content_categories.vertical_target_url` + `vertical_anchor_text`
- [ ] Deploy Edge Function `seo-content-category-anchor-skill`
- [ ] Patch writer prompt en `seo-content-orchestrator`
- [ ] Test: 1 artículo nuevo de Cassino Bet — verificar link en intro

### Fase 2 — Módulo 1 (Python indexer) — 2-3 días
- [ ] Migración SQL: crear `wordpress_sitemap_cache` + `brand_sitemap_config`
- [ ] Desarrollar y ejecutar `sitemap_indexer.py`
- [ ] Revisar y corregir URLs `page_type = 'unknown'`
- [ ] Verificar datos con query de validación

### Fase 3 — Módulo 3 (Links 2-4, CJ Selector) — 3-5 días
- [ ] Migración SQL: campos nuevos en `content_items` + tipos nuevos
- [ ] Deploy Edge Function `seo-content-cj-link-selector`
- [ ] Crear trigger `trg_cj_links_on_article_ready`
- [ ] Test: 3 artículos piloto (Cassino Bet) — verificar calidad de selección

### Fase 4 — Módulo 4 (Injector mejorado) — 1-2 días
- [ ] Patch `ils-contextual-injector` con multi-anchor fallback
- [ ] Test end-to-end: artículo completo → 4 links inyectados
- [ ] Validar report de inyección por slot

---

## 10. Queries de monitoreo post-implementación

```sql
-- Estado de CJ links por artículo
SELECT cj_links_status, count(*) FROM content_items GROUP BY cj_links_status;

-- Tasa de inyección por slot
SELECT 
  (metadata->>'slot') AS slot,
  decision_status,
  count(*)
FROM internal_link_decisions
WHERE relationship_type IN ('cluster_main', 'cluster_secondary', 'sibling_category')
GROUP BY slot, decision_status
ORDER BY slot, decision_status;

-- Artículos sin Link 1 (categoría padre)
SELECT id, title, category_id, proyecto_id
FROM content_items
WHERE article_content IS NOT NULL
  AND article_content NOT LIKE '%vertical_target_url%' -- proxy aproximado
  AND category_id IS NOT NULL;

-- Cobertura del sitemap cache por marca
SELECT p.nombremarca, count(*) AS urls_indexed, 
       count(*) FILTER (WHERE w.page_type = 'category') AS categorias,
       count(*) FILTER (WHERE w.page_type = 'service') AS clusters
FROM wordpress_sitemap_cache w
JOIN proyectos_seo p ON p.id = w.proyecto_id
GROUP BY p.nombremarca
ORDER BY urls_indexed DESC;
```
