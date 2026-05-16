# Análisis Profundo — Enlazado Interno y Customer Journey
**Sesión:** S-008 | **Área:** F. ILS + C. Writer | **Fecha:** 2026-05-16

> Este documento es la fuente de verdad del sistema de enlazado interno del SEO Content Swarm Engine.  
> Contiene diagnóstico con datos reales de Supabase, arquitectura propuesta y plan de implementación.

---

## 1. Lo que pediste (en resumen)

Dos capas de enlazado bien diferenciadas:

| Capa | Enlace | Quién lo hace | Cuándo | Destino |
|---|---|---|---|---|
| **A** | Categoría padre del blog (anchor exacto) | Writer (primer agente) | Primeras 100 palabras de la intro | URL de categoría WordPress |
| **B** | Customer Journey: 3-4 enlaces con intención | ILS orchestrator (agente CJ) | Post-generación, sobre el HTML final | Artículos reales del sitio (desde sitemap WP) |

La premisa clave: la capa B debe ser la **joya de la corona** — un embudo editorial donde cada enlace tiene lógica de intención (discovery → consideration → decision) y le da al usuario un camino claro hacia la conversión.

---

## 2. Estado actual del sistema — Diagnóstico con datos reales

### 2.1. Infraestructura ILS existente

El sistema ya está más avanzado de lo que parece. Hallazgos clave:

**Tablas activas:**
- `internal_link_candidates`: **809 filas** (candidatos generados)
- `internal_link_decisions`: **76 filas** (decisiones tomadas)
- `ils_pipeline_runs`: **25 ejecuciones** (22 ok / 1 failed / 2 skipped)

**Stages del Customer Journey ya modelados en Supabase:**
```
discovery → consideration → decision
```

**Relationship types en uso:**
| Tipo | Count | Journey flow | Descripción |
|---|---|---|---|
| `same_cluster` | 631 | consideration→consideration | Artículos del mismo cluster temático |
| `next_step` | 58 | consideration→decision | Siguiente paso natural en el embudo |
| `commercial_bridge` | 51 | consideration→decision | Puente hacia conversión directa |
| `pillar_support` | 57 | consideration→decision | Enlace al pilar/padre del cluster |

**Engine actual:** `ils_v2.5` — ya apunta a "5 enlaces por Customer Journey y autoridad de cluster"

---

### 2.2. Gap crítico #1 — Categoría padre: infraestructura existe pero está vacía

**Lo bueno:** la tabla `content_categories` ya tiene las columnas exactas que necesitas:
```sql
content_categories.vertical_target_url   -- URL de la categoría WP ← VACÍA HOY
content_categories.vertical_anchor_text  -- Anchor exacto para el link ← VACÍA HOY
```

**El problema:** las 15+ categorías registradas (Jogos de Aposta, Jogos de Cassino, Apostas Online, etc.) tienen `vertical_target_url = NULL` y `vertical_anchor_text = NULL` en el 100% de los casos.

**La conexión ya existe:**
```
content_items.category_id → content_categories.id
```

Pero solo **532 de 915 artículos** tienen `category_id` asignado. Los 383 restantes no tienen categoría enlazada.

**Conclusión:** La capa de datos está construida. Solo falta:
1. Poblar `vertical_target_url` y `vertical_anchor_text` por categoría
2. Que el writer reciba estos datos y los inyecte en las primeras 100 palabras

---

### 2.3. Gap crítico #2 — El universo del ILS ignora WordPress

**Problema raíz:** el ILS construye su universo de candidatos exclusivamente desde `content_items` de Supabase. Pero tu sitio WordPress tiene artículos publicados que jamás pasaron por el swarm o que se crearon manualmente.

**Consecuencia:** cuando el ILS busca artículos para enlazar, trabaja con un universo incompleto. Un artículo de Cassino Bet publicado hace 6 meses directamente en WP no existe como candidato.

**Dato concreto:** de los 915 artículos en `content_items`, 644 están publicados. Pero el WordPress real de cualquier marca activa tiene más páginas que esas 644 — landings, páginas de categoría, artículos legacy, páginas de producto.

**Solución:** crear una tabla `wordpress_sitemap_cache` que:
- Se actualiza periódicamente via Edge Function (o n8n)
- Importa URLs, títulos y slugs del sitemap XML de cada dominio
- Permite al ILS expandir su universo de candidatos a TODO el sitio

---

### 2.4. Gap crítico #3 — Tasa de inyección: 76/809 = 9.4%

**809 candidatos generados, solo 76 decisiones tomadas.** Esto no es un problema del algoritmo de selección — es un problema de volumen de artículos procesados.

Los `ils_pipeline_runs` muestran que en cada ejecución se toman 4-5 decisiones contra un universo de 4-11 artículos. El pipeline se ejecuta solo 25 veces. Conclusión: la mayoría de los 915 artículos nunca pasaron por ILS.

**Pero hay un problema secundario más grave:** entre los artículos que sí pasaron por ILS, el `ils-contextual-injector` reporta frecuentemente "Sin inyección automática de enlaces en el cuerpo (el texto del artículo no tuvo coincidencias con los términos clave de los candidatos)".

**Por qué ocurre:** el injector busca el `anchor_suggestion` exacto dentro del HTML del artículo. Si el writer escribió "jogos de cassino" pero el anchor es "jogos de cassino online", no hay match → el enlace se pierde.

**La solución ya está modelada pero no implementada:** `internal_link_candidates.anchor_variants` es un campo `jsonb` que debería contener variantes del anchor. Si el injector iterara sobre todas las variantes antes de desistir, la tasa subiría significativamente.

---

### 2.5. Gap crítico #4 — La lógica de Customer Journey no se ejecuta como embudo

El sistema actual selecciona "top-5 por score" — no construye un embudo editorial. Las 5 decisiones de un artículo pueden ser:
- 3x `same_cluster` consideration→consideration
- 1x `commercial_bridge` consideration→decision
- 1x `pillar_support`

No hay garantía de que los enlaces tengan una progresión intencional. Un lector puede pasar por 3 artículos del mismo stage sin ser movido hacia la conversión.

**Lo que debería ser:** cada artículo tiene una posición en el journey (`source_journey_stage`) y sus enlaces deben moverlo hacia adelante O profundizar en su mismo stage con criterio editorial, no solo por score.

---

## 3. Arquitectura propuesta — El sistema de enlazado ideal

### 3.1. Visión del sistema completo

```
ARTÍCULO NUEVO
     │
     ├─── CAPA A: Enlace Categoría Padre (Writer, en generación)
     │    └─→ Link en primeras 100 palabras → URL de categoría WP
     │
     └─── CAPA B: Customer Journey Links (ILS, post-generación)
          ├─→ Link 1: Mismo cluster, alta autoridad (consolidación)
          ├─→ Link 2: next_step → decisión/conversión (CJ forward)
          ├─→ Link 3: commercial_bridge → landing/producto (CJ exit)
          └─→ Link 4 (opt.): pillar_support → pilar del cluster
```

**Total:** 1 link de categoría + 3-4 links CJ = **4-5 links por artículo**, todos con intención definida.

---

### 3.2. Capa A — Enlace de Categoría Padre (acción inmediata)

**¿Quién lo hace?** El orquestador (`seo-content-orchestrator`) cuando carga el brand context, antes de pasarlo al writer.

**Flujo propuesto:**
```
1. brand-context-loader carga el brand-voice
2. Consulta: content_items.category_id → content_categories
3. Obtiene: vertical_target_url + vertical_anchor_text
4. Inyecta en el system prompt del writer:
   "En los primeros 100 palabras de la introducción, incluye el anchor 
   '{vertical_anchor_text}' enlazando a '{vertical_target_url}'. 
   Debe quedar natural dentro del primer párrafo o segundo párrafo máximo."
```

**Prerequisito:** poblar `content_categories.vertical_target_url` y `vertical_anchor_text`.

**Acción requerida de tu parte:** por cada categoría de blog (ej: "Jogos de Cassino"), decirme cuál es la URL de la categoría en WP y el anchor exacto. Propongo una migración SQL simple para actualizarlas todas de una vez.

---

### 3.3. Capa B — Customer Journey Links (rediseño del ILS)

#### 3.3.1. Nuevo modelo de selección de enlaces

En vez de "top-5 por score", propongo una **selección por slot editorial**:

| Slot | Tipo | Relación Journey | Regla de selección | Placement sugerido |
|---|---|---|---|---|
| **Slot 1** | Consolidación | same_stage | Artículo del mismo cluster con mayor tráfico potencial | Dentro de sección principal (H2) |
| **Slot 2** | CJ Forward | source_stage → siguiente_stage | Artículo que mueve al lector al siguiente step | Al final de intro o antes del H2 de decisión |
| **Slot 3** | Conversión | →decision | `commercial_bridge` con mayor `confidence_score` | Sección CTA o párrafo pre-FAQ |
| **Slot 4** | Pilar | →pillar | `pillar_support` del cluster | Primer H2 del artículo |

Si no hay candidato para un slot, se omite (no se fuerza). Esto garantiza que cada enlace tiene propósito editorial, no solo score.

#### 3.3.2. Expansión del universo: WordPress Sitemap Cache

**Nueva tabla propuesta:**
```sql
CREATE TABLE wordpress_sitemap_cache (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proyecto_id   uuid NOT NULL REFERENCES proyectos_seo(id),
  url           text NOT NULL,
  title         text,
  slug          text,
  last_modified date,
  content_item_id uuid REFERENCES content_items(id), -- NULL si no está en Supabase
  cluster_key   text,   -- asignado por el ILS al indexar
  journey_stage text,   -- discovery/consideration/decision (inferido)
  indexed_at    timestamptz DEFAULT now(),
  UNIQUE(proyecto_id, url)
);
```

**Cómo se llena:** Edge Function `wordpress-sitemap-indexer` (nueva) que:
1. Lee el sitemap XML de `proyectos_seo.dominioprincipal + /sitemap.xml`
2. Parsea URLs + títulos
3. Inserta en `wordpress_sitemap_cache` con `ON CONFLICT DO NOTHING`
4. El ILS puede ahora candidatear estas URLs aunque no estén en `content_items`

**Para Cassino Bet**: `cassino.bet.br/sitemap.xml` → todas sus páginas pasan a ser candidatos

#### 3.3.3. Multi-anchor injection (fix del injector)

**Problema actual:** el `ils-contextual-injector` usa un anchor exacto → falla cuando el texto del artículo no coincide exactamente.

**Fix propuesto:** el injector itera sobre `anchor_variants` (jsonb array que ya existe en la tabla):
```typescript
// Pseudocódigo para ils-contextual-injector
for (const anchor of [decision.selected_anchor_text, ...decision.anchor_variants]) {
  if (articleHtml.includes(anchor)) {
    // inyectar link aquí
    break;
  }
}
// Si ninguna variante matchea → insertar como "Lectura recomendada:" al final de la sección
```

**Fallback de último recurso:** si ningún anchor hace match, el injector agrega el link como bloque de "Lectura relacionada" al final del párrafo más relevante semánticamente.

---

## 4. Diagnóstico de qué está bloqueando producción HOY

Por orden de impacto:

| # | Problema | Impacto | Esfuerzo fix | Prioridad |
|---|---|---|---|---|
| 1 | `content_categories.vertical_target_url` vacío | El link de categoría no puede existir | Bajo (1 migración SQL) | 🔴 Alta |
| 2 | 383 artículos sin `category_id` | Sin categoría, sin link padre | Medio (asignar manualmente o por marca) | 🔴 Alta |
| 3 | Universo ILS sin sitemap WP | CJ links limitados | Alto (nueva Edge Function) | 🟡 Media |
| 4 | Inyector sin multi-anchor fallback | Links seleccionados no se inyectan | Medio (patch edge function) | 🟡 Media |
| 5 | Selección "top-5 score" sin slots editoriales | CJ sin lógica de embudo | Alto (rediseño algoritmo) | 🟡 Media |
| 6 | 809 candidatos vs 25 ejecuciones ILS | La mayoría de artículos no tienen CJ links | Bajo (revisar trigger) | 🟡 Media |

---

## 5. Plan de implementación por fases

### Fase 1 — Categoría padre (1-2 días) — MÁXIMO IMPACTO INMEDIATO

**1.1.** Tú me das: por cada categoría activa (Jogos de Cassino, Apostas Online, etc.) → URL WP + anchor texto  
**1.2.** Yo ejecuto: migración SQL para poblar `content_categories.vertical_target_url` y `vertical_anchor_text`  
**1.3.** Patch al orquestador en `ops-control-plane`: brand-context-loader consulta la categoría y la pasa al writer  
**1.4.** Patch al writer prompt: instrucción explícita de inyectar el link en las primeras 100 palabras  
**Resultado:** cada artículo nuevo tiene su enlace a la categoría padre. Artículos existentes → no se retochan automáticamente (hacerlo manualmente o en lote separado).

### Fase 2 — Multi-anchor fallback (2-3 días)

**2.1.** Patch a `ils-contextual-injector`: iterar sobre `anchor_variants` antes de desistir  
**2.2.** Agregar bloque "Lectura relacionada" como fallback de último recurso  
**2.3.** Actualizar el campo `anchor_variants` en candidatos existentes con variantes semánticas  
**Resultado:** tasa de inyección pasa de ~40% a ~80%+ estimado.

### Fase 3 — Selección por slots editoriales (3-5 días)

**3.1.** Rediseñar el algoritmo de selección en `ils-orchestrator`: reemplazar "top-5 score" por "4 slots editoriales"  
**3.2.** Validar con 3 artículos piloto (Cassino Bet, por ser la marca más activa)  
**Resultado:** cada artículo tiene un embudo real: consolidación + CJ forward + conversión + pilar.

### Fase 4 — Sitemap WP Cache (5-7 días)

**4.1.** Crear tabla `wordpress_sitemap_cache` en Supabase  
**4.2.** Crear Edge Function `wordpress-sitemap-indexer`  
**4.3.** Modificar `ils-orchestrator` para incluir sitemap URLs en el universo de candidatos  
**4.4.** Asignar `cluster_key` y `journey_stage` a URLs del sitemap (puede ser con Gemini/Claude)  
**Resultado:** universo del ILS pasa de 915 artículos internos a todos los URLs publicados.

---

## 6. Preguntas que requieren tu respuesta antes de implementar

Estas decisiones son tuyas, no puedo tomarlas unilateralmente:

### P-1 (BLOQUEANTE para Fase 1)
**¿Cuáles son las URLs de categoría en WordPress y el anchor exacto para cada categoría activa?**

Por ejemplo:
- "Jogos de Cassino" → `cassino.bet.br/jogos-de-cassino/` con anchor "jogos de cassino"
- "Apostas Online" → `cassino.bet.br/apostas-online/` con anchor "apostas online"

Sin esto, la capa A no puede implementarse.

### P-2 (Diseño de la Fase 3)
**¿Quieres 3 o 4 links CJ en los artículos? ¿Qué importa más: cantidad o que sean todos de alta confianza?**

Mi recomendación: 3 slots obligatorios (consolidación + CJ forward + conversión) + 1 opcional (pilar), solo si existe candidato con confidence ≥ 0.7.

### P-3 (Alcance de la Fase 4)
**¿El sitemap incluye solo el blog o también landing pages, páginas de producto y categorías?**

Esto define si el universo del ILS incluye páginas de conversión directa (landings) como candidatos para `commercial_bridge` links — lo cual sería muy potente para el embudo.

Mi recomendación: incluir TODO el sitemap, pero marcar las no-blog URLs como `journey_stage = 'conversion'` para que sean candidatas solo para el slot de conversión.

### P-4 (Artículos existentes)
**¿Retroalimentamos los 644 artículos publicados con los links nuevos, o solo los artículos nuevos?**

Retroalimentar exige una operación masiva de re-inyección HTML. Es seguro pero costoso. ¿Lo hacemos?

---

## 7. Lo que NO cambio sin tu autorización

- `publication_auto` (sigue en `false`)
- Estructura del HTML generado más allá de añadir los `<a href>` específicos
- Brand voice de ninguna marca
- Ningún artículo publicado en WordPress (solo modificamos `article_content` en Supabase, WP no se toca hasta que Content Manager apruebe)

---

## 8. Decisión propuesta para registrar

**D-007 (propuesta):** Implementar sistema de enlazado en 4 fases:
- Capa A: link de categoría padre en primeras 100 palabras via writer prompt + `content_categories.vertical_target_url`
- Capa B: ILS CJ con 4 slots editoriales (consolidación + forward + conversión + pilar)
- Expansión de universo vía `wordpress_sitemap_cache`
- Fix de injector con multi-anchor fallback

**Pendiente:** respuesta a P-1, P-2, P-3, P-4 para comenzar implementación.

---

## Apéndice — Queries de verificación rápida

```sql
-- Ver categorías sin URL configurada
SELECT id, name, slug, client_id FROM content_categories 
WHERE vertical_target_url IS NULL ORDER BY client_id;

-- Ver artículos sin categoría asignada
SELECT COUNT(*), proyecto_id FROM content_items 
WHERE category_id IS NULL GROUP BY proyecto_id ORDER BY count DESC;

-- Ver ratio de inyección del ILS
SELECT 
  decision_status, 
  count(*), 
  round(count(*)::numeric / (SELECT count(*) FROM internal_link_decisions) * 100, 1) || '%' AS pct
FROM internal_link_decisions GROUP BY decision_status;

-- Ver qué artículos nunca pasaron por ILS
SELECT COUNT(*) FROM content_items ci
WHERE status IN ('published', 'approved', 'validated')
  AND ils_status IS NULL;
```
