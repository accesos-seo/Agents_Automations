# Plan de proyecto — Enriquecimiento de `brief_data` con Ahrefs
**Área:** B — Briefs / Investigación SEO (n8n A)
**Automatización:** `seo-content-swarm-engine`
**Estado:** Planificación — pendiente de aprobación para ejecución
**Fecha:** 2026-05-19
**Autor:** Claude Code (análisis y planeación)

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Problema que resuelve](#2-problema-que-resuelve)
3. [Qué datos entrega Ahrefs y para qué sirve cada uno](#3-qué-datos-entrega-ahrefs-y-para-qué-sirve-cada-uno)
4. [Arquitectura propuesta](#4-arquitectura-propuesta)
5. [Flujo detallado paso a paso](#5-flujo-detallado-paso-a-paso)
6. [Estructura del `brief_data` enriquecido](#6-estructura-del-brief_data-enriquecido)
7. [Cómo consume cada agente downstream los datos de Ahrefs](#7-cómo-consume-cada-agente-downstream-los-datos-de-ahrefs)
8. [Stack técnico: n8n vs Edge Function vs híbrido](#8-stack-técnico-n8n-vs-edge-function-vs-híbrido)
9. [Pros y contras de la integración](#9-pros-y-contras-de-la-integración)
10. [Riesgos técnicos y mitigaciones](#10-riesgos-técnicos-y-mitigaciones)
11. [Costos estimados — Ahrefs API Credits](#11-costos-estimados--ahrefs-api-credits)
12. [Plan de implementación por fases](#12-plan-de-implementación-por-fases)
13. [KPIs de éxito](#13-kpis-de-éxito)
14. [Prerequisito bloqueante: auditar n8n A](#14-prerequisito-bloqueante-auditar-n8n-a)
15. [Decisiones que requieren aprobación del producto](#15-decisiones-que-requieren-aprobación-del-producto)

---

## 1. Resumen ejecutivo

Hoy el agente `seo-expert` recibe una keyword objetivo y tiene que *inferir* qué estructura de artículo funciona para ese término. Lo hace con lógica general de SEO, sin datos del mundo real. El resultado es un artículo bien estructurado en términos de marca pero potencialmente desalineado con lo que los motores de búsqueda ya consideran relevante para esa consulta.

**La propuesta:** enriquecer el campo `brief_data` de cada `content_item` con datos reales de Ahrefs antes de que el orquestador pase el brief al `seo-expert`. Esto transforma la base de conocimiento del pipeline:

- De: _"escribe un artículo sobre X siguiendo nuestro brand voice"_
- A: _"escribe un artículo sobre X donde los 10 primeros resultados promedian 2.400 palabras, todos tienen FAQ, el featured snippet es una definición de 40 palabras, y las preguntas más frecuentes son Y, Z y W"_

El impacto es directo en la calidad del artículo resultante sin cambiar ningún agente del pipeline.

---

## 2. Problema que resuelve

### 2.1 Situación actual

El trigger `tr_investigar_seo_en_n8n` dispara `fn_trigger_seo_investigation()` cuando se inserta un `content_item`. Esa función llama un webhook n8n que devuelve `brief_data`. El problema:

- **El workflow n8n A es una caja negra** — no está documentado qué consultas hace ni qué estructura exacta devuelve.
- **No hay datos cuantitativos de SERP** — el seo-expert no sabe si el keyword tiene volumen de 100 o 100.000 búsquedas/mes.
- **No hay análisis de competencia real de búsqueda** — el seo-expert no sabe qué tipo de contenido está ranqueando: listicles, definiciones, guías paso a paso, comparativas.
- **Las preguntas FAQ son inferidas** — se generan por razonamiento del modelo, no extraídas de las consultas reales de usuarios (PAA — "People Also Ask").

### 2.2 Consecuencia observable

Un artículo puede quedar bien escrito en términos de brand voice pero con una estructura que no coincide con la intención de búsqueda dominante. Por ejemplo: escribir un artículo definitorio largo cuando el SERP está dominado por comparativas cortas, o incluir 3 H2s cuando los resultados top tienen 8.

### 2.3 Lo que cambia con Ahrefs

El `seo-expert` pasaría de operar con información de contexto relativa (brand voice + intención declarada) a operar con datos SERP empíricos. Es el equivalente a dar a un redactor SEO senior acceso a Ahrefs antes de planear el artículo.

---

## 3. Qué datos entrega Ahrefs y para qué sirve cada uno

### 3.1 Datos de keyword

| Campo Ahrefs | Endpoint | Para qué lo usa el pipeline |
|---|---|---|
| `volume` | Keywords Explorer / Overview | El seo-expert prioriza estructura más robusta para keywords de alto volumen |
| `keyword_difficulty` (KD) | Keywords Explorer / Overview | Calibra si el artículo necesita ser muy profundo (KD alto) o puede ser más directo (KD bajo) |
| `traffic_potential` | Keywords Explorer / Overview | Más relevante que el volumen: estima el tráfico real posible si ranqueas 1º |
| `cpc` | Keywords Explorer / Overview | Indica intención comercial; artículos de alto CPC deben tener CTA más fuertes |
| `global_volume` | Keywords Explorer / Overview | Contexto de si es una keyword local o global |
| `parent_topic` | Keywords Explorer / Overview | La keyword "madre" — a veces el artículo debería apuntar a la parent, no a la exact match |
| `search_intent` | Keywords Explorer / Overview | Informacional / Navegacional / Transaccional / Comercial — determina el tipo de contenido |

### 3.2 Datos de SERP (los 10 primeros resultados)

| Campo Ahrefs | Endpoint | Para qué lo usa el pipeline |
|---|---|---|
| URLs top 10 | SERP Overview | Excluir competidores prohibidos del análisis |
| Word count promedio top 10 | SERP Overview | El seo-expert fija el target de extensión del artículo |
| Presencia de FAQ en top 10 | SERP Overview | Determina si el bloque FAQ es obligatorio u opcional |
| Presencia de tablas comparativas | SERP Overview | Instruye al writer a incluir/excluir tablas |
| Featured snippet (tipo y texto) | SERP Overview | Si hay featured snippet, el artículo debe contener la respuesta directa en el primer párrafo |
| Schema markup dominante | SERP Overview | Informa qué schema markup agregar en enrichment |
| Tipo de contenido dominante (listicle, guía, definición) | SERP Overview | Determina la estructura narrativa del artículo |
| Número de H2s promedio en top 10 | SERP Overview | El seo-expert fija el número de secciones |
| Marcas que aparecen en top 10 | SERP Overview | Identificar competidores que ya rankean (para la política de no-mencionar) |

### 3.3 Datos de keywords relacionadas

| Campo Ahrefs | Endpoint | Para qué lo usa el pipeline |
|---|---|---|
| Keywords secundarias (related terms) | Related Terms / Matching Terms | El seo-expert las inyecta como LSI keywords en el artículo |
| Questions ("la gente también pregunta") | Questions | Alimentan directamente el bloque FAQ del artículo |
| Keywords long-tail de bajo KD | Matching Terms | Oportunidades de H2 o secciones adicionales de bajo esfuerzo |
| "Also rank for" keywords | Also Rank For | Keywords que los artículos ganadores también rankean — el artículo debe cubrirlas |

### 3.4 Datos que Ahrefs NO puede dar (y que el pipeline ya tiene o debe obtener de otro lado)

| Lo que falta | Fuente correcta |
|---|---|
| Tone y brand voice | `brand-voice.md` en ops-control-plane (ya existe) |
| Productos propios de la marca | `brand_contract` / `auditoria-referencia.md` (ya existe) |
| Reglas de competidores prohibidos | `competidores-prohibidos.yaml` (ya existe) |
| Imágenes de referencia | Proceso de imagen separado (Área E) |
| Intención editorial específica de la marca | El brief inicial del Content Manager |

---

## 4. Arquitectura propuesta

### 4.1 Diagrama de flujo

```
[content_items INSERT]
        │
        ▼
[tr_investigar_seo_en_n8n]  ─── dispara ───►  [n8n Workflow A — ENRIQUECIDO]
        │                                              │
        │                                     ┌───────┴────────┐
        │                                     │  PASO ACTUAL   │
        │                                     │  (documentar   │
        │                                     │  antes de      │
        │                                     │  modificar)    │
        │                                     └───────┬────────┘
        │                                             │
        │                                     ┌───────▼────────────────────┐
        │                                     │  NUEVO: Nodo Ahrefs        │
        │                                     │  ┌─────────────────────┐   │
        │                                     │  │ 1. keyword overview  │   │
        │                                     │  │ 2. SERP snapshot     │   │
        │                                     │  │ 3. related terms     │   │
        │                                     │  │ 4. questions (PAA)   │   │
        │                                     │  │ 5. matching terms    │   │
        │                                     │  └─────────────────────┘   │
        │                                     └───────┬────────────────────┘
        │                                             │
        │                                     ┌───────▼──────────────────────┐
        │                                     │  NUEVO: Nodo de normalización │
        │                                     │  (mapea datos Ahrefs al       │
        │                                     │  esquema de brief_data)       │
        │                                     └───────┬──────────────────────┘
        │                                             │
        ▼                                             ▼
[content_items.brief_data] ◄──── UPDATE ──── [brief_data enriquecido]
        │
        ▼
[seo-content-orchestrator]
        │
        ├──► [seo-expert]          ← recibe brief con datos Ahrefs reales
        ├──► [content-writer]      ← recibe estructura + LSI keywords del brief
        ├──► [optimizer]           ← valida contra KD y word count benchmark
        ├──► [humanizer]
        └──► [eeat-validator]
```

### 4.2 Puntos de integración (solo 2 cambios)

**Cambio 1 — Workflow n8n A:** agregar nodos Ahrefs después del flujo existente (sin reemplazarlo).

**Cambio 2 — `brief_data` schema:** extender el JSON para incluir la sección `ahrefs_research`. El seo-expert ya lee `brief_data` completo — no requiere cambio en el orquestador si el prompt del seo-expert se actualiza para reconocer los nuevos campos.

---

## 5. Flujo detallado paso a paso

### PASO 1 — Trigger (sin cambio)

```
content_items INSERT
    → tr_investigar_seo_en_n8n
    → fn_trigger_seo_investigation()
    → POST webhook n8n con { content_item_id, keyword, brand_slug, locale }
```

### PASO 2 — Flujo n8n A actual (documentar primero, luego mantener)

> ⚠️ **Este paso es hoy una caja negra.** Prerequisito de Fase 1: documentar exactamente qué nodos existen, qué consultan y qué devuelven en `brief_data`. No modificar hasta documentar.

### PASO 3 — NUEVO: Bloque Ahrefs en n8n A

Después de que el flujo existente complete su trabajo, agregar un bloque con 5 llamadas HTTP a la API de Ahrefs (pueden ir en paralelo para reducir latencia):

#### 3a. Keyword Overview
```
GET https://api.ahrefs.com/v3/keywords-explorer/overview
params: {
  keyword: "{{keyword_objetivo}}",
  country: "{{locale_to_country_code}}",
  select: "volume,keyword_difficulty,traffic_potential,cpc,search_intent,parent_topic,global_volume"
}
```

#### 3b. SERP Overview (top 10)
```
GET https://api.ahrefs.com/v3/keywords-explorer/serp-overview
params: {
  keyword: "{{keyword_objetivo}}",
  country: "{{locale_to_country_code}}"
}
→ extraer de cada resultado:
  - url, title, word_count, has_schema_faq, 
    content_type, h2_count, has_table, 
    has_featured_snippet
```

#### 3c. Questions (PAA)
```
GET https://api.ahrefs.com/v3/keywords-explorer/matching-terms
params: {
  keyword: "{{keyword_objetivo}}",
  country: "{{locale_to_country_code}}",
  match: "questions",
  limit: 20,
  select: "keyword,volume,keyword_difficulty"
}
→ devuelve preguntas reales que la gente busca relacionadas al tema
```

#### 3d. Related Terms (LSI keywords)
```
GET https://api.ahrefs.com/v3/keywords-explorer/related-terms
params: {
  keyword: "{{keyword_objetivo}}",
  country: "{{locale_to_country_code}}",
  limit: 30,
  select: "keyword,volume,keyword_difficulty"
}
→ keywords semánticamente relacionadas para cubrir en el artículo
```

#### 3e. Also Rank For (qué keywords cubren los artículos que ya rankean)
```
GET https://api.ahrefs.com/v3/keywords-explorer/also-rank-for
params: {
  keyword: "{{keyword_objetivo}}",
  country: "{{locale_to_country_code}}",
  limit: 20,
  select: "keyword,volume,keyword_difficulty"
}
```

### PASO 4 — NUEVO: Normalización y filtrado en n8n

Antes de escribir en `brief_data`, un nodo de código (JavaScript en n8n) limpia y normaliza los datos:

1. **Filtrar competidores del SERP**: eliminar de la lista top-10 las URLs de dominios en `competidores-prohibidos.yaml`. Solo se pasan dominios neutrales o de la propia marca.
2. **Calcular benchmarks del SERP**: `avg_word_count`, `pct_with_faq`, `pct_with_tables`, `dominant_content_type`, `avg_h2_count`, `has_featured_snippet`.
3. **Priorizar questions para FAQ**: ordenar las 20 preguntas PAA por volumen, tomar top 8.
4. **Priorizar LSI keywords**: filtrar related terms con KD < 30 y volumen > 100, tomar top 15.
5. **Mapear `search_intent` de Ahrefs a intención legible** para el prompt del seo-expert.

### PASO 5 — UPDATE en `content_items.brief_data`

El nodo final del workflow n8n escribe el `brief_data` enriquecido de vuelta en Supabase:

```javascript
// El brief_data existente se preserva íntegro
// Se añade la sección ahrefs_research como clave nueva
const enriched_brief_data = {
  ...existing_brief_data,     // todo lo que ya había
  ahrefs_research: {          // NUEVO
    keyword_metrics: { ... },
    serp_benchmarks: { ... },
    recommended_structure: { ... },
    faq_questions: [ ... ],
    lsi_keywords: [ ... ],
    also_rank_for: [ ... ],
    data_fetched_at: "ISO timestamp",
    ahrefs_credits_used: N
  }
}
```

### PASO 6 — Lectura por el orquestador (sin cambio estructural)

El orquestador ya lee `brief_data` completo y lo pasa a los agentes. El único cambio es actualizar el **prompt del `seo-expert`** para que reconozca y use `ahrefs_research` cuando esté presente.

---

## 6. Estructura del `brief_data` enriquecido

```json
{
  "keyword": "como ganar en cassino",
  "locale": "pt-BR",
  "brand_slug": "cassino-bet",
  "search_intent_declared": "informational",
  
  "ahrefs_research": {
    "keyword_metrics": {
      "volume": 8100,
      "traffic_potential": 22000,
      "keyword_difficulty": 34,
      "cpc": 1.42,
      "global_volume": 18000,
      "parent_topic": "estrategias de cassino",
      "search_intent": "informational"
    },
    
    "serp_benchmarks": {
      "avg_word_count": 2340,
      "avg_h2_count": 7,
      "pct_with_faq": 0.9,
      "pct_with_tables": 0.6,
      "dominant_content_type": "guide",
      "has_featured_snippet": true,
      "featured_snippet_type": "paragraph",
      "featured_snippet_length_chars": 280,
      "serp_top3_titles": [
        "Como Ganhar no Cassino: 10 Estratégias Comprovadas",
        "Guia Completo para Ganhar em Jogos de Cassino Online",
        "Estratégias que Funcionam: Como Ganhar no Cassino em 2025"
      ]
    },
    
    "recommended_structure": {
      "target_word_count": 2400,
      "suggested_h2_count": 7,
      "faq_required": true,
      "table_recommended": true,
      "featured_snippet_target": true,
      "featured_snippet_definition": "Primeiro parágrafo de 40 palavras com resposta direta"
    },
    
    "faq_questions": [
      { "question": "como ganhar dinheiro no cassino online?", "volume": 1900 },
      { "question": "qual é o jogo mais fácil de ganhar no cassino?", "volume": 1200 },
      { "question": "estratégias para ganhar na roleta?", "volume": 880 },
      { "question": "como funciona o RTP dos jogos de cassino?", "volume": 720 },
      { "question": "é possível ganhar dinheiro real no cassino?", "volume": 590 }
    ],
    
    "lsi_keywords": [
      { "keyword": "jogos de cassino com melhor rtp", "volume": 1300, "kd": 22 },
      { "keyword": "blackjack estrategia basica", "volume": 980, "kd": 18 },
      { "keyword": "cassino online confiavel", "volume": 2200, "kd": 28 },
      { "keyword": "bônus de boas-vindas cassino", "volume": 1600, "kd": 25 }
    ],
    
    "also_rank_for": [
      { "keyword": "melhor jogo para ganhar dinheiro cassino", "volume": 880 },
      { "keyword": "dicas para jogar no cassino", "volume": 2100 }
    ],
    
    "data_fetched_at": "2026-05-19T14:23:00Z",
    "ahrefs_credits_used": 5
  }
}
```

---

## 7. Cómo consume cada agente downstream los datos de Ahrefs

### 7.1 `seo-expert` — El beneficiario principal

**Antes:** recibe keyword + intención + brand voice → infiere estructura.

**Después:** recibe todo lo anterior **más** el bloque `ahrefs_research`. El prompt se actualiza con instrucciones explícitas:

```
DATOS SERP REALES PARA ESTA KEYWORD:
- Extensión benchmark: los top 10 promedian {{avg_word_count}} palabras → apunta a {{target_word_count}}
- Secciones benchmark: los top 10 tienen promedio {{avg_h2_count}} H2s
- FAQ: {{pct_with_faq * 100}}% de los resultados incluyen FAQ → {{faq_required ? 'OBLIGATORIA' : 'RECOMENDADA'}}
- Featured Snippet: {{has_featured_snippet ? 'SÍ existe' : 'No existe'}} → {{featured_snippet_target ? 'El primer párrafo DEBE responder directamente en menos de 50 palabras' : ''}}
- Tablas: {{pct_with_tables * 100}}% tienen tablas comparativas

PREGUNTAS REALES DE USUARIOS (para el bloque FAQ):
{{#each faq_questions}}
  - {{this.question}} ({{this.volume}} búsquedas/mes)
{{/each}}

KEYWORDS SECUNDARIAS A CUBRIR EN EL ARTÍCULO:
{{#each lsi_keywords}}
  - {{this.keyword}}
{{/each}}
```

**Resultado esperado:** el seo-expert genera una arquitectura H1/H2 alineada con lo que los buscadores ya premian, con el número correcto de secciones, FAQ de preguntas reales y LSI keywords integradas.

### 7.2 `content-writer`

Recibe la estructura del seo-expert (que ya incorporó los datos Ahrefs). Adicionalmente, el prompt puede incluir:

- Las preguntas FAQ exactas (para que las responda con las palabras reales de los usuarios)
- Las LSI keywords como "términos que debes mencionar naturalmente"
- La indicación de si hay featured snippet (para escribir el primer párrafo como definición directa)

### 7.3 `optimizer`

Hoy valida SEO score con lógica general. Con Ahrefs puede validar contra benchmarks reales:

- ¿El artículo tiene al menos `target_word_count` palabras?
- ¿Están presentes al menos el 60% de las `lsi_keywords` recomendadas?
- ¿El FAQ responde al menos 4 de las `faq_questions` reales?
- ¿El primer párrafo tiene menos de 55 palabras (optimización featured snippet)?

Esto convierte el optimizer en un **validador basado en datos** en lugar de heurísticas.

### 7.4 `eeat-validator`

No consume datos de Ahrefs directamente. Pero indirectamente se beneficia: un artículo con las preguntas reales de usuarios bien respondidas tiene naturalmente mejor score E-E-A-T.

### 7.5 `contract-validator` (v3.1)

Puede agregar una regla nueva: verificar que las `lsi_keywords` de alto volumen estén presentes en el artículo.

---

## 8. Stack técnico: n8n vs Edge Function vs híbrido

### Opción A — Todo en n8n A (recomendada)

**Descripción:** agregar los nodos Ahrefs dentro del workflow n8n A existente, después del flujo actual.

**Ventajas:**
- No requiere nuevo código de infraestructura
- Los nodos HTTP nativos de n8n manejan las llamadas API sin código custom
- El paralelismo de las 5 llamadas se logra con el nodo `Parallel Branches`
- La normalización se hace con un nodo `Code` (JavaScript)
- El UPDATE a Supabase usa el nodo nativo de Supabase en n8n
- Fácil de depurar visualmente en el editor n8n
- El retry automático de n8n maneja errores transitorios de API

**Desventajas:**
- n8n A es caja negra hasta que se documente → riesgo de conflictos con lo que ya hace
- Latencia adicional: las 5 llamadas paralelas suman ~2-4 segundos al tiempo total
- Los créditos Ahrefs se consumen en cada generación, sin caché fácil de implementar

**Diagrama de nodos nuevos en n8n:**
```
[Nodo existente final] → [Split In Batches]
    ├── [HTTP Request: Ahrefs keyword overview]
    ├── [HTTP Request: Ahrefs SERP overview]
    ├── [HTTP Request: Ahrefs questions]
    ├── [HTTP Request: Ahrefs related terms]
    └── [HTTP Request: Ahrefs also-rank-for]
                │
          [Merge: Combine All]
                │
          [Code: Normalizar + filtrar competidores]
                │
          [Supabase: UPDATE content_items SET brief_data]
                │
          [Respond to Webhook: OK]
```

### Opción B — Edge Function `ahrefs-research-skill` (alternativa)

**Descripción:** crear una Edge Function en Supabase Light_House que encapsula toda la lógica Ahrefs. n8n A llama esta función en lugar de llamar Ahrefs directamente.

**Ventajas:**
- La lógica de normalización vive en TypeScript (más mantenible que nodo Code de n8n)
- Se puede agregar caché en memoria o en tabla Supabase (`ahrefs_cache`) para no reconsumir créditos para la misma keyword + country en 24h
- Separación clara de responsabilidades
- Se puede reutilizar desde otros flujos (calendario de contenido, etc.)
- Los secretos Ahrefs API key van en Supabase Secrets (no en n8n)

**Desventajas:**
- Requiere crear y desplegar una nueva Edge Function
- Más infraestructura a mantener
- Si la Edge Function falla, n8n necesita manejar el error

### Opción C — Híbrido (recomendada a mediano plazo)

**Descripción:** Fase 1 en n8n (más rápida de implementar), luego migrar la normalización a Edge Function `ahrefs-research-skill` en Fase 2 cuando el volumen justifique el caché.

**Por qué es la mejor opción a largo plazo:**
- Arrancar en n8n permite validar los datos y ajustar la normalización rápido
- Migrar a Edge Function cuando el caché empiece a importar (>50 artículos/semana)
- La caché en Supabase ahorra créditos para artículos con la misma keyword (muy común en el pipeline de 9 marcas que comparten nichos)

### Veredicto de stack

| Criterio | n8n puro | Edge Function | Híbrido |
|---|---|---|---|
| Velocidad de implementación | ✅ Rápido | 🟡 Medio | ✅ Rápido (inicio) |
| Caché de créditos | ❌ Sin caché | ✅ Tabla Supabase | ✅ En Fase 2 |
| Mantenibilidad del código | 🟡 Medio | ✅ Alto (TypeScript) | ✅ Alto (a largo plazo) |
| Riesgo de implementación | 🟡 Medio (caja negra) | 🟡 Medio (nuevo deploy) | 🟡 Medio |
| Reutilización futura | ❌ Solo este flujo | ✅ Multi-flujo | ✅ Multi-flujo |
| **Recomendación** | Fase 1 | Fase 2 | **Implementar así** |

---

## 9. Pros y contras de la integración

### ✅ Pros

| Pro | Impacto | Nivel |
|---|---|---|
| El seo-expert genera estructura basada en datos reales de SERP | Directo en calidad del artículo | Alto |
| FAQ deja de ser inferida y pasa a ser de preguntas reales de usuarios | Directo en relevancia y CTR | Alto |
| El optimizer puede validar contra benchmarks cuantitativos | Directo en consistencia del quality gate | Medio |
| Las LSI keywords se cubren sistemáticamente | Indirecto en ranking a largo plazo | Medio |
| Target de extensión alineado con lo que rankea | Evita artículos cortos o innecesariamente largos | Medio |
| Featured snippet strategy integrada desde el brief | Potencial alto impacto en CTR | Alto |
| No requiere cambiar el orquestador ni los agentes (solo el prompt del seo-expert) | Riesgo de regresión muy bajo | Alto |
| Datos auditables y trazables en `brief_data` | Mejora observabilidad del pipeline | Medio |

### ❌ Contras y limitaciones

| Contra | Impacto | Mitigación |
|---|---|---|
| Costo en Ahrefs API credits por cada artículo | Económico — ver sección 11 | Caché + generación bajo demanda |
| Aumenta latencia del paso de investigación 2-4 segundos | Operacional | Paralelo de llamadas; aceptable |
| La API de Ahrefs puede tener downtime o rate limits | Técnico | Fallback: continuar con brief sin datos Ahrefs (degradación graceful) |
| La caja negra de n8n A puede hacer algo que conflictúe | Técnico | Prerequisito: documentar n8n A antes de tocar |
| Los datos SERP son un snapshot puntual (se desactualizan) | Calidad | TTL de 7 días en el caché, refetch en regeneraciones |
| El seo-expert necesita prompt update para usar los datos | Técnico | Cambio controlado con prueba en marca piloto |
| Si Ahrefs no tiene datos para una keyword (nueva, nicho) | Calidad | Fallback a brief sin enriquecimiento, log `ahrefs_no_data: true` |
| Complejidad adicional en el workflow n8n | Mantenimiento | Documentar bien cada nodo nuevo |

---

## 10. Riesgos técnicos y mitigaciones

### Riesgo 1 — n8n A es caja negra → posible conflicto de datos
**Probabilidad:** Alta (si no se documenta antes)
**Impacto:** El brief_data puede tener estructura inesperada; el UPDATE puede sobrescribir campos existentes
**Mitigación:** **Prerequisito bloqueante** — documentar n8n A antes de cualquier implementación. El nodo normalizador usa `spread operator` para no sobrescribir datos existentes.

### Riesgo 2 — Ahrefs API rate limit
**Probabilidad:** Baja en volúmenes normales (<100 artículos/día)
**Impacto:** El workflow n8n falla en la llamada Ahrefs; el artículo no se genera o se genera sin datos
**Mitigación:** Implementar degradación graceful: si Ahrefs falla o rate-limit, el workflow continúa sin `ahrefs_research` en el brief. El seo-expert opera igual que hoy.

### Riesgo 3 — Datos SERP contaminados con competidores prohibidos
**Probabilidad:** Alta (Ahrefs devuelve URLs de todos)
**Impacto:** Datos de competidores llegan al seo-expert o writer
**Mitigación:** El nodo de normalización filtra explícitamente las URLs del SERP contra la lista `competidores-prohibidos.yaml` antes de escribir en `brief_data`. Los títulos y dominios de competidores nunca llegan a los agentes.

### Riesgo 4 — Keywords sin datos en Ahrefs (nicho nuevo, idioma poco cubierto)
**Probabilidad:** Media (especialmente en pt-BR para nichos muy específicos)
**Impacto:** El brief_data no tiene `ahrefs_research`; el artículo funciona como hoy
**Mitigación:** Log `ahrefs_no_data: true` en brief_data. El seo-expert tiene instrucción de operar sin datos Ahrefs si el bloque no está presente. No es fallo, es degradación esperada.

### Riesgo 5 — Costo de créditos Ahrefs supera presupuesto
**Probabilidad:** Media (depende del volumen)
**Impacto:** Económico
**Mitigación:** Ver sección 11. Implementar caché por keyword+country con TTL 7 días. Logging de `ahrefs_credits_used` en cada brief para tener visibilidad real de costos.

### Riesgo 6 — Regresión en calidad del artículo por prompt update del seo-expert
**Probabilidad:** Baja (el cambio de prompt es aditivo, no reemplaza lógica)
**Impacto:** Artículos de menor calidad si el prompt no procesa bien los datos nuevos
**Mitigación:** Probar en 3-5 artículos en `armor-corp` antes de activar para todas las marcas. Comparar métricas del quality gate (seo_score, eeat_score, contract_gate pass/fail) antes y después.

---

## 11. Costos estimados — Ahrefs API Credits

### 11.1 Consumo por artículo

| Llamada API | Credits consumidos |
|---|---|
| Keyword Overview | 1 credit |
| SERP Overview (top 10) | 1 credit |
| Questions | 1 credit |
| Related Terms | 1 credit |
| Also Rank For | 1 credit |
| **Total por artículo** | **5 credits** |

### 11.2 Proyección de consumo mensual

| Escenario | Artículos/mes | Credits/mes | Observación |
|---|---|---|---|
| Volumen actual | ~30 artículos | ~150 credits | Muy manejable |
| Crecimiento x3 | ~90 artículos | ~450 credits | Manejable |
| Escala alta | ~300 artículos | ~1.500 credits | Caché necesaria |
| Con caché 40% hit rate | ~300 artículos | ~900 credits | Con caché activa |

> **Nota:** El plan Ahrefs API Starter incluye 500 credits/mes. El plan Standard incluye 1.500 credits/mes. Los precios actuales están en ahrefs.com/api.

### 11.3 Optimización con caché

Si múltiples marcas generan artículos sobre keywords similares (probable en nichos como iGaming), la caché `keyword + country → ahrefs_data` con TTL de 7 días puede reducir el consumo real en 30-50%.

**Tabla en Supabase propuesta:**
```sql
CREATE TABLE ahrefs_keyword_cache (
  keyword TEXT NOT NULL,
  country_code TEXT NOT NULL,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ GENERATED ALWAYS AS (fetched_at + INTERVAL '7 days') STORED,
  PRIMARY KEY (keyword, country_code)
);
```

Antes de llamar Ahrefs, el nodo n8n consulta esta tabla. Si hay un registro vigente (`expires_at > NOW()`), usa los datos cacheados y consume 0 credits.

---

## 12. Plan de implementación por fases

### Fase 0 — Prerequisito (obligatorio, ~1-2 días)

> Esta fase no es opcional. Sin ella, todo lo demás tiene riesgo alto.

| Tarea | Responsable | Resultado |
|---|---|---|
| Abrir el workflow n8n A (`8iZcC4mGSFWUlOAc`) y mapear todos sus nodos | Usuario (acceso a n8n) | Diagrama o descripción de lo que hace hoy |
| Documentar qué estructura devuelve `brief_data` hoy (campos existentes) | Claude con datos del usuario | Sección B de AREAS.md actualizada |
| Confirmar que la API key de Ahrefs existe y qué plan está activo | Usuario | API key disponible en n8n secrets |
| Confirmar el código de país por locale para las marcas activas | Usuario | Tabla `locale → country_code` |

### Fase 1 — MVP en n8n A (~2-3 días de implementación)

> Objetivo: validar que los datos Ahrefs mejoran la calidad del artículo. Solo en marca piloto (`armor-corp`).

| Tarea | Complejidad | Resultado |
|---|---|---|
| Agregar 5 nodos HTTP paralelos en n8n A (llamadas Ahrefs) | Baja | 5 nodos funcionando |
| Agregar nodo Code de normalización (filtro competidores + benchmarks) | Media | `ahrefs_research` en formato correcto |
| Agregar nodo UPDATE a Supabase `content_items.brief_data` | Baja | Brief enriquecido en DB |
| Actualizar prompt del `seo-expert` para usar `ahrefs_research` | Media | seo-expert lee los datos |
| Generar 3-5 artículos piloto en `armor-corp` | — | Artículos de prueba |
| Comparar: seo_score, eeat_score, contract_gate, word_count vs benchmark | — | Evaluación de impacto |

### Fase 2 — Expansión y caché (~3-4 días)

> Activar para todas las marcas. Implementar caché para optimizar créditos.

| Tarea | Complejidad | Resultado |
|---|---|---|
| Crear tabla `ahrefs_keyword_cache` en Supabase Light_House | Baja | Migration aplicada |
| Agregar nodo de consulta caché al inicio del bloque Ahrefs en n8n | Baja | Caché funcional |
| Activar para todas las marcas (quitar restricción armor-corp) | Baja | Pipeline completo |
| Actualizar prompt del `optimizer` para validar contra benchmarks | Media | Validación cuantitativa |
| Dashboard básico: créditos Ahrefs usados por artículo (en logs) | Baja | Observabilidad de costos |

### Fase 3 — Madurez: Edge Function `ahrefs-research-skill` (~3-5 días, opcional)

> Solo si el volumen de artículos crece >100/mes o si se necesita la skill en otros flujos (calendario de contenido).

| Tarea | Complejidad | Resultado |
|---|---|---|
| Crear Edge Function `ahrefs-research-skill` en TypeScript | Media | Skill reutilizable |
| Migrar lógica de normalización de n8n Code → TypeScript | Media | Código mantenible |
| Integrar caché como módulo de la skill | Media | Caché en TypeScript |
| Actualizar n8n A para llamar la skill en lugar de Ahrefs directo | Baja | n8n simplificado |

---

## 13. KPIs de éxito

### KPIs de calidad del artículo (medibles en Supabase)

| KPI | Línea base actual | Target post-Ahrefs | Fuente |
|---|---|---|---|
| `seo_score` promedio | A determinar (post auditoría) | +10 puntos | `content_generation_logs` |
| `eeat_score` promedio | A determinar | +5 puntos | `content_generation_logs` |
| Contract gate pass rate | ~78% (22 fallos en últimos datos) | >90% | `content_generation_logs` |
| Word count vs. SERP benchmark (desviación) | Sin datos | ±15% del benchmark | `content_items.word_count` |
| FAQ questions reales vs. inferidas | 0% reales hoy | >80% preguntas reales | Manual o análisis de brief_data |

### KPIs operacionales

| KPI | Target |
|---|---|
| Latencia adicional por Ahrefs | < 5 segundos (sobre latencia actual) |
| Tasa de degradación graceful (artículos sin datos Ahrefs) | < 5% |
| Créditos Ahrefs por artículo | ≤ 5 (o 0 si hay caché hit) |
| Cache hit rate (Fase 2+) | > 30% |

### KPI de negocio (largo plazo, 3-6 meses)

- Posición promedio de artículos en Google Search Console (comparar antes/después de activar Ahrefs en el brief)
- CTR de artículos con featured snippet target vs. sin él

---

## 14. Prerequisito bloqueante: auditar n8n A

Antes de escribir una sola línea de código o tocar el workflow, necesitamos responder estas preguntas:

1. **¿Qué nodos tiene hoy el workflow `8iZcC4mGSFWUlOAc`?** Mapear el flujo completo.
2. **¿Qué consultas hace?** ¿Usa Google Search Console? ¿Alguna API de keywords? ¿Solo OpenAI/Claude?
3. **¿Qué estructura exacta tiene `brief_data` hoy?** Tomar un ejemplo real de la tabla `content_items` y verlo.
4. **¿Cuánto tarda en ejecutarse?** Para saber si agregar 3-5 segundos es aceptable.
5. **¿Tiene manejo de errores?** ¿Qué pasa si falla y `brief_data` queda vacío?

**Cómo obtener estos datos:**
- Abrir el workflow directamente en n8n: `estancias-atlas-n8n.heh8a3.easypanel.host/workflow/8iZcC4mGSFWUlOAc`
- Ejecutar una corrida de prueba y ver los datos de cada nodo
- Hacer en Supabase: `SELECT brief_data FROM content_items WHERE brief_data IS NOT NULL LIMIT 3;`

---

## 15. Decisiones que requieren aprobación del producto

| # | Decisión | Opciones | Impacto si se difiere |
|---|---|---|---|
| D-P01 | ¿Qué plan de Ahrefs API está disponible? | Starter (500 cr/mes) / Standard (1.500 cr/mes) / Enterprise | Limita el volumen sin caché |
| D-P02 | ¿Caché 7 días es aceptable para datos SERP? | 3 días / 7 días / 14 días / sin caché | Afecta créditos consumidos |
| D-P03 | ¿Marca piloto para Fase 1? | `armor-corp` (recomendado) / otra | Determina riesgo del piloto |
| D-P04 | ¿Se actualiza el prompt del optimizer en Fase 1 o Fase 2? | Fase 1 (más cambios simultáneos) / Fase 2 (validar primero el seo-expert) | Afecta el alcance del piloto |
| D-P05 | ¿Se implementa Edge Function en Fase 3 o se queda en n8n? | n8n permanente / Edge Function en Fase 3 | Afecta mantenibilidad |

---

*Documento creado: 2026-05-19 — Para implementación ver sección 12. Para preguntas técnicas, ver sección 8 o 10.*
