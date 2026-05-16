# Propuesta 05 — Zona Estratégica Post-FAQ: Customer Journey, Assets y Lógica del contenido

**Estado:** pendiente de revisión / aprobación  
**Área:** G. Enrichment + C. Writer  
**Sesión:** S-006  
**Fecha:** 2026-05-16  
**Para aplicar en:** `accesos-seo/ops-control-plane` + migración SQL en `Light_House`

---

## 1. Qué se propone

Añadir, debajo de la sección FAQ de cada artículo, una **zona estratégica complementaria** visualmente separada del cuerpo del artículo. Esta zona contiene contenido adicional de valor — no editorial, sino analítico y estratégico — organizado en tres pestañas navegables:

| Pestaña | Propósito |
|---|---|
| **Assets** | Imagen destacada, reproductor de audio, enlaces internos generados por ILS |
| **Customer Journey** | Visualización por etapas del recorrido del cliente + razonamiento estratégico |
| **Lógica del contenido** | Estructura, intención de búsqueda, decisiones editoriales y perfil del lector |

**Por qué:** el artículo por sí solo muestra el resultado; la zona estratégica muestra el criterio. Esto eleva la percepción de valor del trabajo, diferencia el output de IA de un simple volcado de texto, y da al cliente contexto para evaluar y aprobar el artículo con criterio.

---

## 2. Arquitectura de datos

### 2.1 Nuevos campos en `content_items` (Light_House)

```sql
ALTER TABLE content_items
  ADD COLUMN customer_journey_data   jsonb,
  ADD COLUMN editorial_focus_data    jsonb,
  ADD COLUMN strategic_zone_status   text DEFAULT 'pending'
    CHECK (strategic_zone_status IN ('pending','generating','ready','failed'));

COMMENT ON COLUMN content_items.customer_journey_data IS 'JSON estructurado con etapas del CJM y razonamiento. Generado por seo-content-strategic-zone-skill.';
COMMENT ON COLUMN content_items.editorial_focus_data IS 'JSON estructurado con decisiones editoriales, intención de búsqueda y perfil del lector.';
COMMENT ON COLUMN content_items.strategic_zone_status IS 'Estado de generación de la zona estratégica post-FAQ.';
```

### 2.2 Schema de `customer_journey_data`

```json
{
  "stages": [
    {
      "order": 1,
      "name": "Descubrimiento",
      "icon": "🔍",
      "user_state": "El usuario no conoce la marca ni el producto",
      "trigger": "Búsqueda genérica de información",
      "content_role": "Captar atención con dato o problema reconocible",
      "keywords_matched": ["frase clave 1", "frase clave 2"]
    },
    {
      "order": 2,
      "name": "Consideración",
      "icon": "⚖️",
      "user_state": "El usuario compara opciones",
      "trigger": "Búsqueda comparativa con intención informacional",
      "content_role": "Generar confianza con información objetiva y prueba social",
      "keywords_matched": []
    },
    {
      "order": 3,
      "name": "Intención",
      "icon": "🎯",
      "user_state": "El usuario tiene intención de actuar",
      "trigger": "Búsqueda transaccional o navegacional",
      "content_role": "Reducir fricción con CTA claro y propuesta de valor directa",
      "keywords_matched": []
    },
    {
      "order": 4,
      "name": "Decisión",
      "icon": "✅",
      "user_state": "El usuario decide registrarse o comprar",
      "trigger": "Click en CTA o navegación directa",
      "content_role": "Confirmar la decisión con garantía o beneficio final",
      "keywords_matched": []
    }
  ],
  "search_intent": "informational | transactional | navigational | commercial",
  "primary_user_profile": "Descripción del lector objetivo principal",
  "journey_rationale": "Explicación de por qué este flujo responde a la intención de búsqueda y al tipo de usuario",
  "intent_to_stage_mapping": "Cómo el artículo guía al lector desde la intención de búsqueda hasta la etapa de decisión"
}
```

### 2.3 Schema de `editorial_focus_data`

```json
{
  "structure_rationale": "Por qué el artículo se estructuró con estos H2 en este orden",
  "search_intent_addressed": "Intención de búsqueda primaria y secundaria que atiende",
  "target_reader": {
    "profile": "Perfil del lector objetivo",
    "knowledge_level": "básico | intermedio | avanzado",
    "motivation": "Qué lo llevó a buscar este tema",
    "objection": "Duda o fricción principal que el artículo resuelve"
  },
  "information_architecture": "Cómo fluye la información: de general a específico, de problema a solución, etc.",
  "editorial_decisions": [
    {
      "decision": "Abrir con estadística de participación",
      "rationale": "Ancla credibilidad desde la primera oración y activa el sesgo de prueba social"
    },
    {
      "decision": "FAQ al final antes del CTA",
      "rationale": "Elimina las últimas objeciones justo antes de pedir la acción"
    }
  ],
  "conversion_strategy": "Cómo el artículo conduce al lector hacia el objetivo de conversión de la marca"
}
```

---

## 3. Pipeline — dónde y cómo se genera

### Opción A (recomendada): Nueva Edge Function `seo-content-strategic-zone-skill`

```
article_content generado (step 4.9)
        ↓
TRIGGER: trg_strategic_zone_on_article_ready
  (AFTER UPDATE OF article_content ON content_items WHERE article_content IS NOT NULL)
        ↓
Edge Function: seo-content-strategic-zone-skill
  Input: content_items row (keyword, article_content, og_image_url, brand_slug, brief_data)
  Proceso:
    1. Extraer estructura H2 + FAQ + CTA del article_content
    2. Llamar LLM (Gemini Flash) con prompt de Customer Journey
    3. Llamar LLM (Gemini Flash) con prompt de Lógica del contenido
    4. UPDATE content_items SET customer_journey_data = ..., editorial_focus_data = ..., strategic_zone_status = 'ready'
        ↓
Frontend: lee customer_journey_data + editorial_focus_data + og_image_url + audio para renderizar la zona
```

**Ventajas de Edge Function separada:**
- No bloquea el pipeline principal (se dispara en paralelo)
- Puede fallar sin afectar la publicación del artículo
- Puede re-ejecutarse de forma independiente

### Opción B: Añadir steps al `seo-content-orchestrator`

Añadir steps `customer_journey` y `editorial_focus` como pasos 4.10 y 4.11 del orquestador legacy. Más simple de implementar, pero agrega latencia al pipeline principal (~30-60s extra).

**Recomendación:** Opción A. La zona estratégica es complementaria, no bloqueante. Un fallo no debe impedir publicar el artículo.

---

## 4. Prompts de generación

### 4.1 Prompt: Customer Journey

```
Eres un estratega de contenido SEO especializado en análisis de intención de búsqueda.

Dado este artículo:
- Keyword principal: {{keyword}}
- Marca: {{brand_name}} ({{brand_domain}})
- Intención de búsqueda detectada por el SEO expert: {{seo_intent}}
- Estructura del artículo (H2s): {{h2_list}}

Genera un Customer Journey Map estructurado para este artículo con exactamente 4 etapas:
Descubrimiento → Consideración → Intención → Decisión.

Para cada etapa define:
- Estado mental del usuario
- Qué lo lleva a buscar en esta etapa
- Qué función cumple el contenido del artículo en esta etapa
- Qué keywords o secciones del artículo responden a esta etapa

Incluye también:
- Un párrafo de "journey_rationale" que explique por qué este flujo particular responde a la intención de búsqueda de esta keyword
- Un párrafo "intent_to_stage_mapping" que muestre cómo el artículo guía al lector desde la búsqueda inicial hasta la conversión

Responde SOLO en JSON con el schema exacto proporcionado. Idioma del output: mismo idioma que el artículo.
```

### 4.2 Prompt: Lógica del contenido

```
Eres un editor SEO senior especializado en arquitectura de contenido.

Dado este artículo:
- Keyword principal: {{keyword}}
- Marca: {{brand_name}}
- Secciones generadas: {{h2_list}}
- Brief original: {{brief_summary}}

Analiza y explica las decisiones editoriales de este artículo:
1. Por qué se estructuró con este orden de H2s
2. Qué intención de búsqueda primaria y secundaria atiende
3. Perfil del lector objetivo (conocimiento, motivación, objeción principal)
4. Cómo fluye la información (de general a específico, de problema a solución, etc.)
5. Las 2-3 decisiones editoriales más relevantes con su justificación
6. Cómo conduce al lector hacia el objetivo de conversión de la marca

Responde SOLO en JSON con el schema exacto proporcionado. Idioma del output: mismo idioma que el artículo.
```

**Modelo a usar:** `google/gemini-flash-1.5` (rápido, económico, suficiente para análisis estructurado).  
**Temperatura:** 0.3 (output analítico, no creativo).

---

## 5. HTML/CSS de la zona estratégica

La zona se inserta como HTML estático en el CMS (o como componente del frontend, dependiendo de la arquitectura del CMS del cliente). El frontend lee los campos `customer_journey_data`, `editorial_focus_data`, `og_image_url` y `content_audio_items` para renderizar.

### 5.1 Separador visual (transición post-FAQ)

```html
<!-- Separator post-FAQ -->
<div class="strategic-zone-separator" aria-hidden="true">
  <div class="separator-gradient"></div>
  <span class="separator-label">Contenido complementario</span>
  <div class="separator-gradient"></div>
</div>
```

```css
.strategic-zone-separator {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 48px 0 32px;
  padding: 0 24px;
}
.separator-gradient {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-border, #e2e8f0), transparent);
}
.separator-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-muted, #94a3b8);
  white-space: nowrap;
}
```

### 5.2 Contenedor y tabs

```html
<section class="strategic-zone" aria-label="Análisis estratégico del artículo">

  <!-- Tab navigation -->
  <nav class="strategic-zone__tabs" role="tablist">
    <button class="sz-tab sz-tab--active" role="tab" data-tab="assets"
            aria-selected="true" aria-controls="sz-panel-assets">
      <svg><!-- ícono asset --></svg> Assets
    </button>
    <button class="sz-tab" role="tab" data-tab="customer-journey"
            aria-selected="false" aria-controls="sz-panel-cjm">
      <svg><!-- ícono journey --></svg> Customer Journey
    </button>
    <button class="sz-tab" role="tab" data-tab="editorial-focus"
            aria-selected="false" aria-controls="sz-panel-editorial">
      <svg><!-- ícono editorial --></svg> Lógica del contenido
    </button>
  </nav>

  <!-- Panel: Assets -->
  <div class="sz-panel sz-panel--active" id="sz-panel-assets" role="tabpanel">
    <!-- Ver sección 5.3 -->
  </div>

  <!-- Panel: Customer Journey -->
  <div class="sz-panel" id="sz-panel-cjm" role="tabpanel" hidden>
    <!-- Ver sección 5.4 -->
  </div>

  <!-- Panel: Lógica del contenido -->
  <div class="sz-panel" id="sz-panel-editorial" role="tabpanel" hidden>
    <!-- Ver sección 5.5 -->
  </div>

</section>
```

### 5.3 Panel: Assets

```html
<div class="sz-assets">

  <!-- Imagen destacada -->
  <div class="sz-asset-card sz-asset-card--image">
    <span class="sz-asset-label">Imagen destacada</span>
    <img src="{{og_image_url}}" alt="{{keyword}}" loading="lazy">
  </div>

  <!-- Audio -->
  <div class="sz-asset-card sz-asset-card--audio">
    <span class="sz-asset-label">Audio del artículo</span>
    <div class="sz-audio-player">
      <audio controls preload="none" src="{{audio_url}}"></audio>
      <div class="sz-audio-meta">
        <span class="sz-audio-duration">{{duration}}</span>
        <span class="sz-audio-voice">{{voice_profile}}</span>
      </div>
    </div>
  </div>

  <!-- Internal Links (ILS) -->
  <div class="sz-asset-card sz-asset-card--links">
    <span class="sz-asset-label">Artículos relacionados</span>
    <ul class="sz-internal-links">
      {{#each internal_links}}
      <li>
        <a href="{{url}}" class="sz-link-item">
          <span class="sz-link-anchor">{{anchor}}</span>
          <span class="sz-link-relevance sz-relevance--{{relevance_level}}">
            {{relevance_score}}%
          </span>
        </a>
      </li>
      {{/each}}
    </ul>
  </div>

</div>
```

### 5.4 Panel: Customer Journey

```html
<div class="sz-cjm">

  <!-- Header explicativo -->
  <div class="sz-cjm__header">
    <h3 class="sz-cjm__title">Recorrido del cliente para esta keyword</h3>
    <p class="sz-cjm__subtitle">
      Este mapa muestra cómo el contenido acompaña al lector desde la primera búsqueda hasta la decisión.
    </p>
  </div>

  <!-- Timeline de etapas -->
  <div class="sz-cjm__timeline" role="list">
    {{#each stages}}
    <div class="sz-stage" role="listitem">
      <!-- Conector visual -->
      <div class="sz-stage__connector" aria-hidden="true">
        <div class="sz-stage__dot"></div>
        {{#unless @last}}<div class="sz-stage__line"></div>{{/unless}}
      </div>
      <!-- Contenido de la etapa -->
      <div class="sz-stage__content">
        <div class="sz-stage__header">
          <span class="sz-stage__icon">{{icon}}</span>
          <span class="sz-stage__order">Etapa {{order}}</span>
          <h4 class="sz-stage__name">{{name}}</h4>
        </div>
        <dl class="sz-stage__details">
          <dt>Estado del usuario</dt>
          <dd>{{user_state}}</dd>
          <dt>Qué lo activa</dt>
          <dd>{{trigger}}</dd>
          <dt>Rol del contenido</dt>
          <dd>{{content_role}}</dd>
          {{#if keywords_matched.length}}
          <dt>Secciones del artículo</dt>
          <dd class="sz-stage__keywords">
            {{#each keywords_matched}}<span class="sz-keyword-tag">{{this}}</span>{{/each}}
          </dd>
          {{/if}}
        </dl>
      </div>
    </div>
    {{/each}}
  </div>

  <!-- Razonamiento estratégico -->
  <div class="sz-cjm__rationale">
    <h4 class="sz-rationale__title">Por qué este flujo</h4>
    <p>{{journey_rationale}}</p>
    <p class="sz-rationale__mapping">{{intent_to_stage_mapping}}</p>
  </div>

</div>
```

```css
/* Customer Journey — estilos base */
.sz-cjm__timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 24px 0;
}

.sz-stage {
  display: flex;
  gap: 16px;
}

.sz-stage__connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 32px;
}

.sz-stage__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary, #3b82f6);
  border: 2px solid #fff;
  box-shadow: 0 0 0 3px var(--color-primary-light, #bfdbfe);
  margin-top: 6px;
}

.sz-stage__line {
  flex: 1;
  width: 2px;
  background: linear-gradient(180deg, var(--color-primary, #3b82f6), var(--color-border, #e2e8f0));
  margin: 4px 0;
  min-height: 24px;
}

.sz-stage__content {
  flex: 1;
  background: var(--color-surface, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}

.sz-stage__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.sz-stage__icon {
  font-size: 20px;
}

.sz-stage__order {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-muted, #94a3b8);
}

.sz-stage__name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  margin: 0;
}

.sz-stage__details {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 12px;
  font-size: 13px;
  margin: 0;
}

.sz-stage__details dt {
  font-weight: 500;
  color: var(--color-muted, #64748b);
  white-space: nowrap;
}

.sz-stage__details dd {
  color: var(--color-text, #334155);
  margin: 0;
}

.sz-keyword-tag {
  display: inline-block;
  background: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #2563eb);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 500;
  margin: 2px;
}

.sz-cjm__rationale {
  background: var(--color-surface-alt, #f1f5f9);
  border-left: 3px solid var(--color-primary, #3b82f6);
  border-radius: 4px;
  padding: 16px 20px;
  margin-top: 8px;
}

.sz-rationale__title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-primary, #3b82f6);
  margin: 0 0 8px;
}

/* Responsive: en mobile el timeline colapsa a vertical compacto */
@media (max-width: 640px) {
  .sz-stage__connector { display: none; }
  .sz-stage { flex-direction: column; }
  .sz-stage__content { margin-bottom: 8px; }
}
```

### 5.5 Panel: Lógica del contenido

```html
<div class="sz-editorial">

  <div class="sz-editorial__grid">

    <!-- Intención de búsqueda -->
    <div class="sz-editorial__card">
      <div class="sz-card__icon">🎯</div>
      <h4 class="sz-card__title">Intención de búsqueda</h4>
      <p class="sz-card__body">{{search_intent_addressed}}</p>
    </div>

    <!-- Perfil del lector -->
    <div class="sz-editorial__card">
      <div class="sz-card__icon">👤</div>
      <h4 class="sz-card__title">Lector objetivo</h4>
      <dl class="sz-reader-profile">
        <dt>Perfil</dt><dd>{{target_reader.profile}}</dd>
        <dt>Nivel</dt><dd>{{target_reader.knowledge_level}}</dd>
        <dt>Motivación</dt><dd>{{target_reader.motivation}}</dd>
        <dt>Objeción</dt><dd>{{target_reader.objection}}</dd>
      </dl>
    </div>

    <!-- Estructura del artículo -->
    <div class="sz-editorial__card sz-editorial__card--full">
      <div class="sz-card__icon">🏗️</div>
      <h4 class="sz-card__title">Por qué esta estructura</h4>
      <p class="sz-card__body">{{structure_rationale}}</p>
      <p class="sz-card__body sz-card__body--secondary">{{information_architecture}}</p>
    </div>

    <!-- Decisiones editoriales -->
    <div class="sz-editorial__card sz-editorial__card--full">
      <div class="sz-card__icon">📝</div>
      <h4 class="sz-card__title">Decisiones editoriales</h4>
      <ul class="sz-decisions">
        {{#each editorial_decisions}}
        <li class="sz-decision">
          <span class="sz-decision__what">{{decision}}</span>
          <span class="sz-decision__why">→ {{rationale}}</span>
        </li>
        {{/each}}
      </ul>
    </div>

    <!-- Estrategia de conversión -->
    <div class="sz-editorial__card sz-editorial__card--full sz-editorial__card--highlight">
      <div class="sz-card__icon">📈</div>
      <h4 class="sz-card__title">Estrategia de conversión</h4>
      <p class="sz-card__body">{{conversion_strategy}}</p>
    </div>

  </div>

</div>
```

```css
.sz-editorial__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.sz-editorial__card {
  background: var(--color-surface, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
}

.sz-editorial__card--full {
  grid-column: 1 / -1;
}

.sz-editorial__card--highlight {
  border-color: var(--color-primary-light, #bfdbfe);
  background: var(--color-primary-xlight, #eff6ff);
}

.sz-card__icon {
  font-size: 20px;
  margin-bottom: 8px;
}

.sz-card__title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-muted, #64748b);
  margin: 0 0 8px;
}

.sz-card__body {
  font-size: 14px;
  color: var(--color-text, #334155);
  line-height: 1.6;
  margin: 0 0 8px;
}

.sz-card__body--secondary {
  color: var(--color-muted, #64748b);
  font-size: 13px;
}

.sz-decisions {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sz-decision {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  background: #fff;
  border-radius: 6px;
  border-left: 3px solid var(--color-primary, #3b82f6);
}

.sz-decision__what {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.sz-decision__why {
  font-size: 12px;
  color: var(--color-muted, #64748b);
}

@media (max-width: 640px) {
  .sz-editorial__grid { grid-template-columns: 1fr; }
}
```

### 5.6 JavaScript de activación de tabs (inline, sin dependencias)

```javascript
// Activación de tabs — zona estratégica
(function () {
  const zone = document.querySelector('.strategic-zone');
  if (!zone) return;

  zone.addEventListener('click', function (e) {
    const btn = e.target.closest('.sz-tab');
    if (!btn) return;

    const tabId = btn.dataset.tab;
    const panels = zone.querySelectorAll('.sz-panel');
    const tabs = zone.querySelectorAll('.sz-tab');

    tabs.forEach(t => {
      t.classList.toggle('sz-tab--active', t === btn);
      t.setAttribute('aria-selected', t === btn ? 'true' : 'false');
    });

    panels.forEach(p => {
      const active = p.id === 'sz-panel-' + tabId;
      p.classList.toggle('sz-panel--active', active);
      p.hidden = !active;
    });
  });
})();
```

---

## 6. Edge Function — `seo-content-strategic-zone-skill`

### Estructura del código (TypeScript / Deno)

```typescript
// seo-content-strategic-zone-skill/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface StrategicZoneRequest {
  content_item_id: string;
  force_regenerate?: boolean;
}

Deno.serve(async (req) => {
  const { content_item_id, force_regenerate = false }: StrategicZoneRequest = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 1. Obtener el content_item
  const { data: item, error } = await supabase
    .from('content_items')
    .select('id, keyword, article_content, brief_data, brand_slug, customer_journey_data, strategic_zone_status')
    .eq('id', content_item_id)
    .single();

  if (error || !item) {
    return new Response(JSON.stringify({ error: 'content_item not found' }), { status: 404 });
  }

  // 2. Guardar si ya está listo (a menos que force_regenerate)
  if (item.strategic_zone_status === 'ready' && !force_regenerate) {
    return new Response(JSON.stringify({ skipped: true, reason: 'already_ready' }), { status: 200 });
  }

  // 3. Marcar como generating
  await supabase
    .from('content_items')
    .update({ strategic_zone_status: 'generating' })
    .eq('id', content_item_id);

  try {
    // 4. Extraer estructura del artículo
    const h2List = extractH2s(item.article_content);
    const brandInfo = item.brief_data?.brand_name ?? item.brand_slug;

    // 5. Llamar LLM para Customer Journey
    const cjmData = await generateCustomerJourney({
      keyword: item.keyword,
      brand_name: brandInfo,
      h2_list: h2List,
      seo_intent: item.brief_data?.search_intent ?? '',
    });

    // 6. Llamar LLM para Lógica del contenido
    const editorialData = await generateEditorialFocus({
      keyword: item.keyword,
      brand_name: brandInfo,
      h2_list: h2List,
      brief_summary: item.brief_data?.summary ?? '',
    });

    // 7. Persistir
    await supabase
      .from('content_items')
      .update({
        customer_journey_data: cjmData,
        editorial_focus_data: editorialData,
        strategic_zone_status: 'ready',
      })
      .eq('id', content_item_id);

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (err) {
    await supabase
      .from('content_items')
      .update({ strategic_zone_status: 'failed' })
      .eq('id', content_item_id);

    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

function extractH2s(html: string): string[] {
  return [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)].map(m =>
    m[1].replace(/<[^>]+>/g, '').trim()
  );
}

async function generateCustomerJourney(params: {
  keyword: string;
  brand_name: string;
  h2_list: string[];
  seo_intent: string;
}): Promise<object> {
  // Llamar a OpenRouter con google/gemini-flash-1.5 o similar
  // Prompt: ver sección 4.1
  // temperature: 0.3
  // Parsear respuesta como JSON y validar contra schema
  throw new Error('implementar');
}

async function generateEditorialFocus(params: {
  keyword: string;
  brand_name: string;
  h2_list: string[];
  brief_summary: string;
}): Promise<object> {
  // Mismo modelo, prompt de sección 4.2
  throw new Error('implementar');
}
```

### Trigger SQL

```sql
-- En Light_House, tabla content_items
CREATE OR REPLACE FUNCTION trigger_strategic_zone_on_article_ready()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.article_content IS NOT NULL
     AND (OLD.article_content IS NULL OR OLD.article_content <> NEW.article_content)
     AND NEW.strategic_zone_status = 'pending' THEN

    PERFORM net.http_post(
      url := current_setting('app.supabase_functions_url') || '/seo-content-strategic-zone-skill',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := jsonb_build_object('content_item_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_strategic_zone_on_article_ready
  AFTER INSERT OR UPDATE OF article_content ON content_items
  FOR EACH ROW EXECUTE FUNCTION trigger_strategic_zone_on_article_ready();
```

---

## 7. Integración con el CMS

El CMS (donde el Content Manager revisa los artículos) debería:

1. **Mostrar la zona en la vista previa del artículo** — leyendo `customer_journey_data` y `editorial_focus_data` de la fila en `content_items`.
2. **Indicar el estado `strategic_zone_status`** — si es `pending` o `failed`, mostrar un botón "Regenerar análisis estratégico" que llama a la Edge Function con `force_regenerate: true`.
3. **Permitir edición manual** de `customer_journey_data` y `editorial_focus_data` como JSON (o con un editor estructurado) por el Content Manager antes de publicar.

---

## 8. Checklist de implementación

- [ ] Migración SQL: añadir `customer_journey_data`, `editorial_focus_data`, `strategic_zone_status` a `content_items`
- [ ] Nueva Edge Function `seo-content-strategic-zone-skill` con los dos prompts
- [ ] Trigger `trg_strategic_zone_on_article_ready` en Light_House
- [ ] HTML/CSS/JS de la zona estratégica integrados en el CMS / frontend del artículo
- [ ] Endpoint en CMS para disparar `force_regenerate`
- [ ] Retrocompatibilidad: los artículos existentes con `strategic_zone_status = 'pending'` deben procesarse mediante un backfill. Propuesta: llamar la Edge Function en lotes de 50 por día para no saturar costos.
- [ ] Confirmar que los 7 artículos pt-BR (Cassino Bet + Vera Bet) se procesan correctamente con idioma pt-BR

---

## 9. Estimación de costos (referencial)

| Componente | Modelo | Tokens aprox. | Costo por artículo |
|---|---|---|---|
| Customer Journey prompt | Gemini Flash 1.5 | ~1.500 in + ~800 out | ~$0.001 |
| Lógica del contenido | Gemini Flash 1.5 | ~1.200 in + ~600 out | ~$0.001 |
| **Total por artículo** | | | **~$0.002** |

Backfill de 915 artículos existentes: **~$1.80 total**. Costo marginal.

---

## 10. Notas adicionales

- **No es decorativo.** La zona estratégica es la diferencia entre "aquí está tu artículo" y "aquí está tu artículo con la lógica que lo hace convertir". Refuerza la propuesta de valor de la agencia.
- **Idioma del output.** El prompt debe incluir la instrucción de responder en el mismo idioma que el artículo. El campo `content_items.language` o `brief_data.language` lo provee.
- **Imagen del Customer Journey.** La imagen actual generada por `seo-content-image-skill` sigue siendo útil como imagen OG (og_image_url). No se reemplaza. La zona estratégica la reutiliza en la pestaña Assets y agrega la visualización HTML del CJM como una capa adicional — no competitiva.
- **Permisos RLS.** Los campos `customer_journey_data` y `editorial_focus_data` son de solo lectura para el frontend público. RLS se aplica cuando se active el plan de RLS por fases (ver handover `2026-05-16-rls-light-house.md`).
