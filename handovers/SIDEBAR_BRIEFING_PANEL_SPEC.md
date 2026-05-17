# SUPER PROMPT — Sidebar Briefing Panel (Orbit Frontend)

> Entrega este documento completo a la IA que construirá el componente.
> Contiene: contexto, data sources, estructuras JSON, diseño neon completo, comportamiento y CSS de referencia.

---

## 1. CONTEXTO DEL PROYECTO

Estamos construyendo un **panel de análisis editorial** en el sidebar derecho de la aplicación **Orbit** (plataforma SaaS de SEO). Actualmente el sidebar muestra "Acciones Rápidas" (botón Enviar a WordPress, comentarios). Queremos agregar debajo de eso un panel colapsable con **4 tabs** que muestran la inteligencia generada por el orquestador SEO para cada artículo.

El orquestador es una Deno edge function en Supabase que genera artículos y guarda data estructurada en la columna `custom_metadata` de la tabla `content_items`.

**Stack del frontend:** React / Next.js (confirmar con el equipo). La app usa Supabase como backend. El artículo está identificado por su `id` (UUID) en la URL.

---

## 2. FUENTE DE DATOS — Supabase

### Tabla: `content_items`
```sql
SELECT 
  id,
  title,
  main_keyword,
  language,
  word_count,
  custom_metadata   -- JSONB — aquí vive toda la data del panel
FROM content_items
WHERE id = '<article-uuid>';
```

### Estructura completa de `custom_metadata`
```typescript
interface ContentItemMetadata {
  // Versión del motor
  seo_swarm_engine_version: string;          // e.g. "4.7-neon"
  generation_run_id: string;

  // Estado de calidad
  contract_passed: boolean;
  quality_gate: "passed" | "failed_contract" | "partial_saved_after_error";
  required_human_review: boolean;
  contract_validation: ContractValidation;

  // E-E-A-T score
  eeat: {
    eeat_score: number;          // 0-100
    passes: boolean;
    issues: string[];
    required_human_review: boolean;
  };

  // ── BRIEFING COMPLETO (Tab 1: Assets) ──
  brief_contract: BriefContract;

  // ── CUSTOMER JOURNEY (Tab 2) ──
  // ⚠️ REQUIERE CAMBIO EN ORQUESTADOR (ver Sección 7)
  customer_journey?: CustomerJourneyData;

  // ── LÓGICA EDITORIAL (Tab 3) ──
  // ⚠️ REQUIERE CAMBIO EN ORQUESTADOR (ver Sección 7)
  editorial_logic?: EditorialLogicData;

  // Meta
  publication: boolean;
  image_generated: boolean;
  footer_zone_enriched: boolean;
  footer_zone_cj_stages: number;
  footer_zone_el_decisions: number;
}
```

---

## 3. ESTRUCTURAS DE DATOS DETALLADAS

### BriefContract
```typescript
interface BriefContract {
  keyword: string;              // Keyword principal
  secondary: string[];          // Keywords secundarias (máx 8 a mostrar)
  intent: string;               // "informational" | "commercial" | "transactional" | etc.
  audience: string;             // Descripción del público objetivo
  angle: string;                // Ángulo editorial
  h1: string;                   // Título H1 del artículo
  h2: string[];                 // Secciones del artículo (máx 8 a mostrar)
  h2Details: object[];
  faq: string[];                // Preguntas FAQ (máx 6 a mostrar)
  cta: string;                  // Call to action
  metaTitle: string;            // Meta title (ideal 50-60 chars)
  metaDescription: string;      // Meta description (ideal 140-160 chars)
  slug: string;                 // URL slug
  min: number | null;           // Mínimo de palabras
  max: number | null;           // Máximo de palabras
  extensionRaw: string | null;  // Descripción legible del target (e.g. "1500-2000 palabras")
  research: string | null;
  facts: string[];
  source: string;
}
```

### ContractValidation
```typescript
interface ContractValidation {
  passed: boolean;
  wordCount: number;
  issues: string[];
  missingH1: boolean;
  missingH2: string[];
  missingFaq: string[];
  missingCta: boolean;
  missingKeyword: boolean;
  missingFacts: string[];
  extensionRaw: string | null;
  targetWordMin: number | null;
  targetWordMax: number | null;
}
```

### CustomerJourneyData (Tab 2)
```typescript
interface CustomerJourneyData {
  stages: Array<{
    number: number;
    name: string;               // Nombre de la etapa (3-5 palabras)
    icon_label: string;         // Emoji
    user_state: string;         // Qué siente/piensa el usuario
    user_need: string;          // Qué información necesita (mostrar truncado 2 líneas)
    content_response: string;   // Cómo responde el artículo
    section_reference: string;  // H2 que cubre esta etapa
  }>;
  flow_rationale: string;             // Por qué el flujo es en este orden
  search_intent_alignment: string;    // Alineación con intención de búsqueda
  audience_insight: string;           // Perfil del lector
}
```

### EditorialLogicData (Tab 3)
```typescript
interface EditorialLogicData {
  why_structure: string;              // Por qué esta estructura
  search_intent_served: string;       // Qué intención satisface y cómo
  target_reader_profile: string;      // Quién lee esto
  content_distribution_logic: string; // Cómo se distribuye la densidad de info
  key_editorial_decisions: string[];  // Lista de decisiones editoriales clave
  conversion_rationale: string;       // Cómo la estructura lleva a conversión
  quality_signals: string;            // Señales E-E-A-T demostradas
}
```

---

## 4. DISEÑO VISUAL — Sistema Neon Glow

### Paleta de colores (4 tabs, 4 identidades)

| Tab | Nombre | Color principal | RGB |
|-----|--------|----------------|-----|
| 1 | Assets / Briefing | Ámbar `#FCD34D` | `252,211,77` |
| 2 | Customer Journey | Cyan `#00E5FF` | `0,229,255` |
| 3 | Lógica Editorial | Púrpura `#C084FC` | `192,132,252` |
| 4 | SEO Optimization | Verde `#00FF87` | `0,255,135` |

### Fundamentos del diseño
- **Fondo del panel:** `#06060E` (negro espacial profundo)
- **Borde del panel:** `1px solid rgba(108,92,255,0.2)` (púrpura sutil)
- **Borde superior del panel:** línea de 1px con gradiente `rgba(108,58,255,0.7)` → `rgba(0,229,255,0.7)`
- **Box shadow exterior:** `0 0 60px rgba(108,58,255,0.08)` + `inset 0 1px 0 rgba(108,58,255,0.15)`
- **Scrollbar:** gradiente vertical `#6C3AFF` → `#00E5FF`
- **Font:** system-ui / -apple-system / Segoe UI

### Comportamiento de los tabs
- **Inactivos:** color `#1E293B` (casi invisible en el fondo oscuro)
- **Al activarse:** texto cambia a `rgb(var(--tab-color))` con `text-shadow: 0 0 12px rgba(var(--tab-color), 0.6)`
- **Ícono activo:** fondo `rgba(var(--tab-color), 0.08)`, borde `rgba(var(--tab-color), 0.35)`, box-shadow `0 0 12px rgba(var(--tab-color), 0.2)`
- **Línea inferior del tab activo:** `2px solid rgb(var(--tab-color))`
- **Truco CSS:** usar `--tr` como variable custom property en cada tab para colores dinámicos

### Labels y tipografía neon
```css
/* Todos los labels de sección/campo usan esta estructura */
font-size: 9px;
font-weight: 900;
letter-spacing: 0.16em;
text-transform: uppercase;
color: <color-del-tab>;
text-shadow: 0 0 14px rgba(<rgb-del-tab>, 0.5);
```

### Cards de contenido
```css
/* Card base */
background: rgba(<rgb-del-tab>, 0.03);
border: 1px solid rgba(<rgb-del-tab>, 0.1);
border-radius: 14px;
padding: 16px;

/* Valores de texto dentro de cards */
color: #CBD5E1;        /* texto secundario */
color: #F0F9FF;        /* títulos / nombres */
color: #94A3B8;        /* texto de descripción */
```

---

## 5. ESPECIFICACIÓN DE CADA TAB

### TAB 1 — Assets (color: #FCD34D ámbar)

**Datos:** `custom_metadata.brief_contract`

**Diseño de la grilla:** `grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))`

**Contenido a mostrar:**

```
┌─────────────────────────────────────────┐
│ KEYWORD PRINCIPAL          [span 2 cols]│
│  [keyword en font 900, 19px, blanco]    │
├──────────────┬──────────────────────────┤
│ INTENCIÓN    │ EXTENSIÓN OBJETIVO       │
│  [intent]    │  [extensionRaw]          │
├──────────────┴──────────────────────────┤
│ AUDIENCIA                  [span 2 cols]│
│  [audience]                             │
├─────────────────────────────────────────┤
│ ÁNGULO EDITORIAL           [span 2 cols]│
│  [angle]                                │
├─────────────────────────────────────────┤
│ KEYWORDS SECUNDARIAS       [span full]  │
│  [pills/tags por cada keyword]          │
├─────────────────────────────────────────┤
│ ESTRUCTURA DEL ARTÍCULO    [span full]  │
│  [lista ordenada de h2s]                │
├─────────────────────────────────────────┤
│ PREGUNTAS FRECUENTES       [span full]  │
│  [lista de FAQ questions]               │
└─────────────────────────────────────────┘
```

**Pills de keywords:**
```css
background: rgba(108,92,255,0.1);
border: 1px solid rgba(108,92,255,0.25);
color: #A78BFA;
padding: 3px 10px;
border-radius: 20px;
font-size: 11px;
```

---

### TAB 2 — Customer Journey (color: #00E5FF cyan)

**Datos:** `custom_metadata.customer_journey`

**Diseño:** Grilla de cards, `minmax(220px, 1fr)`

**Cada card de etapa:**
```
┌─────────────────────────┐
│ [26px badge] NOMBRE     │  ← badge: cuadrado redondeado, borde cyan, número en cyan
│                         │     con box-shadow: 0 0 10px rgba(0,229,255,0.2)
│ NECESIDAD DEL USUARIO   │  ← label cyan con glow
│  [user_need — 2 líneas] │  ← truncado con -webkit-line-clamp: 2
│                         │
│ [Ver más ▼]             │  ← botón expandir (border cyan sutil)
│                         │
│ expandible:             │  ← oculto por defecto (max-height: 0)
│   ESTADO                │
│   [user_state]          │
│   CÓMO RESPONDE         │
│   [content_response]    │
│   → [section_reference] │  ← pill con flecha
└─────────────────────────┘
```

**Expandible — comportamiento:**
- Estado inicial: `max-height: 0; opacity: 0; overflow: hidden`
- Al abrir: `max-height: 600px; opacity: 1; transition: max-height .4s ease, opacity .3s ease`
- Botón alterna texto: `"Ver más ▼"` / `"Ver menos ▲"` (EN: `"Read more ▼"` / `"Read less ▲"`, PT: `"Ver mais ▼"` / `"Ver menos ▲"`)
- Cada card es independiente

**Debajo de la grilla — 3 bloques de insights:**
```
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│ RAZONAMIENTO DEL    │ │ ALINEACIÓN CON      │ │ PERFIL DE LA        │
│ FLUJO               │ │ INTENCIÓN           │ │ AUDIENCIA           │
│ [flow_rationale]    │ │ [search_intent_     │ │ [audience_insight]  │
│                     │ │  alignment]         │ │                     │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

---

### TAB 3 — Lógica Editorial (color: #C084FC púrpura)

**Datos:** `custom_metadata.editorial_logic`

**Diseño:** Grilla de bloques, `minmax(280px, 1fr)`

**Bloques a mostrar:**
```
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ POR QUÉ ESTA ESTRUCTURA      │ │ PERFIL DEL LECTOR OBJETIVO   │
│ [why_structure]              │ │ [target_reader_profile]      │
└──────────────────────────────┘ └──────────────────────────────┘
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ INTENCIÓN DE BÚSQUEDA        │ │ DISTRIBUCIÓN DEL CONTENIDO   │
│ [search_intent_served]       │ │ [content_distribution_logic] │
└──────────────────────────────┘ └──────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ DECISIONES EDITORIALES CLAVE         [span full — highlight] │
│  • Decision 1                                                 │
│  • Decision 2                                                 │
│  • Decision 3                                                 │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ ESTRATEGIA DE CONVERSIÓN     │ │ SEÑALES DE CALIDAD (E-E-A-T) │
│ [conversion_rationale]       │ │ [quality_signals]            │
└──────────────────────────────┘ └──────────────────────────────┘
```

**El bloque highlight (Decisiones Editoriales) tiene:**
```css
background: rgba(192,132,252,0.06);
border-color: rgba(192,132,252,0.2);
```

---

### TAB 4 — SEO Optimization (color: #00FF87 verde)

**Datos:** `custom_metadata.contract_validation` + `custom_metadata.brief_contract` + `custom_metadata.eeat`

**Sección superior — 2 columnas:**

**Columna izquierda — Score Gauge (SVG donut):**
```
      ┌─────────────┐
      │  [SVG donut]│  ← gradiente #6C5CFF → #00E5FF
      │     85      │  ← número grande blanco
      │    SCORE    │  ← label pequeño
      │  [X ok] [Y warn] │  ← pills verdes/amarillos
      └─────────────┘
```

Score = `Math.round((checks_passed / total_checks) * 100)` donde checks son los items del checklist.

Pills:
- Verde: `background: rgba(0,255,135,0.1); color: #00FF87; border: 1px solid rgba(0,255,135,0.25)`
- Amarillo: `background: rgba(252,211,77,0.1); color: #FCD34D; border: 1px solid rgba(252,211,77,0.25)`

**Columna derecha — Meta & Open Graph:**
```
META TITLE              [OK / WARN badge] [largo en chars]
  [valor del metaTitle]

SLUG
  [valor del slug — monospace cyan]

META DESCRIPTION        [OK / WARN badge] [largo en chars]
  [valor de metaDescription]
```

Badge OK: `background: rgba(0,255,135,0.1); color: #00FF87; border: 1px solid rgba(0,255,135,0.25)`
Badge WARN: `background: rgba(252,211,77,0.1); color: #FCD34D; border: 1px solid rgba(252,211,77,0.2)`
Badge ERR: `background: rgba(239,68,68,0.1); color: #F87171; border: 1px solid rgba(239,68,68,0.2)`

**Reglas de estado de badges:**
- Meta title: OK si 50-60 chars, WARN si fuera de rango
- Meta description: OK si 140-160 chars, WARN si fuera de rango
- Slug: OK si existe, ERR si no

**Checklist (grilla `minmax(155px, 1fr)`):**
```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ ✓ PASS   │ │ ✓ PASS   │ │ ✗ FAIL   │ │ ✓ PASS   │ │ ⚠ WARN   │
│ H1 en    │ │ Keyword  │ │ Keyword  │ │ Meta     │ │ Meta desc│
│ artículo │ │ en H1    │ │ en meta  │ │ title len│ │ longitud │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

**Items del checklist** (derivados de `contract_validation`):
| Check | OK si | Dato |
|-------|-------|------|
| H1 presente | `!missingH1` | |
| Keyword en H1 | keyword en h1 (buscar substring) | |
| Keyword en meta title | keyword en metaTitle | |
| Keyword en meta description | keyword en metaDescription | |
| Meta title (50-60 chars) | 50 ≤ len ≤ 60 | |
| Meta description (140-160) | 140 ≤ len ≤ 160 | |
| FAQ presente | `missingFaq.length === 0` | |
| CTA presente | `!missingCta` | |
| Slug definido | `slug !== null && slug !== ""` | |
| Conteo de palabras | `wordCount >= targetWordMin` | |

**Badge de estado de cada check:**
- OK → `color: #00FF87; text-shadow: 0 0 8px rgba(0,255,135,0.5)`
- WARN → `color: #FCD34D`
- FAIL/ERR → `color: #F87171`

---

## 6. CSS COMPLETO DE REFERENCIA

> Este es el CSS que usa el dashboard embebido actual. Úsalo como base fiel para el componente React/Tailwind. Los nombres de clase son de referencia — el componente React puede usar su propio sistema de estilos.

```css
/* === SCROLLBAR === */
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: #06060E; }
::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #6C3AFF, #00E5FF); border-radius: 999px; }

/* === WRAPPER PRINCIPAL === */
.panel {
  background: #06060E;
  border-radius: 20px;
  border: 1px solid rgba(108, 92, 255, 0.2);
  box-shadow: 0 0 60px rgba(108,58,255,0.08), inset 0 1px 0 rgba(108,58,255,0.15);
  overflow: hidden;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #94A3B8;
}

/* Línea superior neon (borde brillante) */
.panel::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(108,58,255,0.7) 30%, rgba(0,229,255,0.7) 70%, transparent 100%);
}

/* === HEADER === */
.panel-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px 24px 0;
}
.panel-header-line {
  flex: 1; height: 1px;
  background: linear-gradient(90deg, rgba(108,92,255,0.3), transparent);
}
.panel-header-label {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #9B8CFF;
  text-shadow: 0 0 20px rgba(108,92,255,0.9);
}

/* === TABS === */
.tabs-bar {
  display: flex;
  margin: 18px 0 0;
  padding: 0 8px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  background: rgba(0,0,0,0.3);
}
.tab {
  flex: 1;
  padding: 13px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  position: relative;
  bottom: -1px;
  transition: border-color 0.2s;
}
/* CSS custom property por tab — definir en cada .tab */
/* tab-1: --tr: 252,211,77  (amber)  */
/* tab-2: --tr: 0,229,255   (cyan)   */
/* tab-3: --tr: 192,132,252 (purple) */
/* tab-4: --tr: 0,255,135   (green)  */

.tab-icon {
  width: 30px; height: 30px;
  border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 900;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.05);
  color: #1E293B;
  transition: all 0.25s;
}
.tab-label-main {
  font-size: 11px; font-weight: 700;
  color: #1E293B; white-space: nowrap;
  transition: color 0.25s;
}
.tab-label-sub {
  font-size: 8px; font-weight: 800;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: #1E293B;
  transition: color 0.25s;
}

/* Tab activo y hover — aplicar con JS o estado React */
.tab:hover .tab-icon,
.tab.active .tab-icon {
  background: rgba(var(--tr), 0.08);
  border-color: rgba(var(--tr), 0.35);
  color: rgb(var(--tr));
  box-shadow: 0 0 12px rgba(var(--tr), 0.2);
}
.tab.active {
  border-bottom-color: rgb(var(--tr));
}
.tab.active .tab-label-main {
  color: rgb(var(--tr));
  text-shadow: 0 0 12px rgba(var(--tr), 0.6);
}
.tab.active .tab-label-sub {
  color: rgba(var(--tr), 0.6);
}

/* === PANEL CONTENT === */
.tab-panel { display: none; padding: 24px; }
.tab-panel.active { display: block; }

/* === ASSETS PANEL === */
.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.asset-card {
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px;
  padding: 16px;
}
.asset-card.wide { grid-column: span 2; }
.asset-card.full { grid-column: 1 / -1; }
.asset-label {
  font-size: 9px; font-weight: 900;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: #FCD34D;
  text-shadow: 0 0 14px rgba(252,211,77,0.5);
  margin-bottom: 10px;
}
.asset-value { font-size: 13px; color: #CBD5E1; line-height: 1.6; }
.kw-main { font-size: 19px; font-weight: 900; color: #FFFFFF; }
.keyword-tag {
  background: rgba(108,92,255,0.1);
  border: 1px solid rgba(108,92,255,0.25);
  color: #A78BFA;
  padding: 3px 10px; border-radius: 20px;
  font-size: 11px; font-weight: 600;
  display: inline-block; margin: 3px;
}

/* === CUSTOMER JOURNEY PANEL === */
.cj-insights-box {
  background: rgba(0,229,255,0.03);
  border: 1px solid rgba(0,229,255,0.08);
  border-radius: 13px;
  padding: 16px 18px 14px;
  margin-bottom: 20px;
}
.cj-box-label {
  font-size: 9px; font-weight: 900;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: #00E5FF;
  text-shadow: 0 0 14px rgba(0,229,255,0.6);
  margin-bottom: 14px;
  display: block;
}
.cj-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.cj-card {
  background: rgba(0,229,255,0.03);
  border: 1px solid rgba(0,229,255,0.1);
  border-radius: 14px;
  padding: 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.cj-stage-badge {
  width: 26px; height: 26px;
  border-radius: 8px;
  background: rgba(0,229,255,0.1);
  border: 1.5px solid rgba(0,229,255,0.35);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 900;
  color: #00E5FF;
  box-shadow: 0 0 10px rgba(0,229,255,0.2);
  flex-shrink: 0;
}
.cj-card-name { font-size: 13px; font-weight: 700; color: #F0F9FF; line-height: 1.3; }
.cj-field-label {
  font-size: 9px; font-weight: 900;
  letter-spacing: 0.13em; text-transform: uppercase;
  color: #00E5FF;
  text-shadow: 0 0 10px rgba(0,229,255,0.5);
}
.cj-field-text { font-size: 12px; color: #94A3B8; line-height: 1.6; margin: 0; }
.cj-field-text.truncated {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* Expandible */
.cj-expandable {
  max-height: 0; overflow: hidden; opacity: 0;
  transition: max-height 0.4s ease, opacity 0.3s ease;
}
.cj-expandable.open { max-height: 600px; opacity: 1; }
.cj-toggle {
  display: block; width: 100%; margin-top: 10px;
  padding: 6px 12px; border-radius: 8px;
  border: 1px solid rgba(0,229,255,0.15);
  background: rgba(0,229,255,0.05);
  color: #67E8F9; font-size: 10px; font-weight: 700;
  cursor: pointer; text-align: center; letter-spacing: 0.05em;
}
.cj-ref-pill {
  display: inline-flex; align-items: center; gap: 4px;
  background: rgba(0,229,255,0.06);
  border: 1px solid rgba(0,229,255,0.2);
  border-radius: 20px; padding: 3px 10px;
  font-size: 10px; color: #67E8F9; font-weight: 600;
}
.cj-insight-card {
  background: rgba(0,229,255,0.03);
  border: 1px solid rgba(0,229,255,0.08);
  border-radius: 12px; padding: 16px;
}
.cj-insight-title {
  font-size: 9px; font-weight: 900;
  letter-spacing: 0.13em; text-transform: uppercase;
  color: #00E5FF;
  text-shadow: 0 0 10px rgba(0,229,255,0.5);
  margin-bottom: 8px;
}

/* === EDITORIAL LOGIC PANEL === */
.el-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.el-block {
  background: rgba(192,132,252,0.03);
  border: 1px solid rgba(192,132,252,0.08);
  border-radius: 14px; padding: 18px;
}
.el-block.highlight {
  background: rgba(192,132,252,0.06);
  border-color: rgba(192,132,252,0.2);
}
.el-title {
  font-size: 9px; font-weight: 900;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: #C084FC;
  text-shadow: 0 0 12px rgba(192,132,252,0.5);
  margin-bottom: 10px;
}
.el-text { font-size: 12px; color: #94A3B8; line-height: 1.7; }
.el-list { padding-left: 14px; font-size: 12px; color: #94A3B8; line-height: 1.9; }

/* === SEO PANEL === */
.seo-gauge-wrap {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 20px 16px;
  background: rgba(0,255,135,0.03);
  border: 1px solid rgba(0,255,135,0.1);
  border-radius: 14px; min-width: 155px;
}
.seo-score-number { font-size: 22px; font-weight: 800; fill: white; }
.seo-score-label { font-size: 8px; font-weight: 600; fill: #64748B; letter-spacing: 1px; }
.seo-score-text { font-size: 15px; font-weight: 700; color: #FFFFFF; }
.seo-score-text em { color: #00FF87; font-style: normal; text-shadow: 0 0 20px rgba(0,255,135,0.7); }
.pill-ok { background: rgba(0,255,135,0.1); color: #00FF87; border: 1px solid rgba(0,255,135,0.25); padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; }
.pill-warn { background: rgba(252,211,77,0.1); color: #FCD34D; border: 1px solid rgba(252,211,77,0.25); padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; }
.seo-meta-box {
  background: rgba(0,255,135,0.02);
  border: 1px solid rgba(0,255,135,0.08);
  border-radius: 14px; padding: 18px;
  display: flex; flex-direction: column; gap: 14px;
}
.meta-section-label {
  font-size: 9px; font-weight: 900;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: #FCD34D; text-shadow: 0 0 10px rgba(252,211,77,0.4);
}
.meta-field-label {
  font-size: 9px; font-weight: 900;
  letter-spacing: 0.13em; text-transform: uppercase;
  color: #00FF87; text-shadow: 0 0 10px rgba(0,255,135,0.4);
}
.meta-value {
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px; padding: 10px 12px;
  font-size: 12px; color: #E2E8F0; line-height: 1.5;
}
.meta-value.slug { font-family: monospace; font-size: 11px; color: #00E5FF; }
.badge-ok { background: rgba(0,255,135,0.1); color: #00FF87; border: 1px solid rgba(0,255,135,0.25); padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 700; }
.badge-warn { background: rgba(252,211,77,0.1); color: #FCD34D; border: 1px solid rgba(252,211,77,0.2); padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 700; }
.badge-err { background: rgba(239,68,68,0.1); color: #F87171; border: 1px solid rgba(239,68,68,0.2); padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 700; }
.checklist-section {
  background: rgba(0,255,135,0.02);
  border: 1px solid rgba(0,255,135,0.07);
  border-radius: 14px; padding: 18px;
}
.checklist-label {
  font-size: 9px; font-weight: 900;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: #FCD34D; text-shadow: 0 0 10px rgba(252,211,77,0.4);
  margin-bottom: 14px;
}
.checklist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(155px, 1fr));
  gap: 8px;
}
.check-card {
  background: rgba(0,0,0,0.2);
  border-radius: 10px; padding: 10px 12px;
  border: 1px solid transparent;
}
.check-card.ok { border-color: rgba(0,255,135,0.12); }
.check-card.warn { border-color: rgba(252,211,77,0.12); }
.check-card.err { border-color: rgba(239,68,68,0.12); }
.check-badge.ok { color: #00FF87; font-size: 9px; font-weight: 900; text-shadow: 0 0 8px rgba(0,255,135,0.5); }
.check-badge.warn { color: #FCD34D; font-size: 9px; font-weight: 900; }
.check-badge.err { color: #F87171; font-size: 9px; font-weight: 900; }
.check-text { font-size: 10px; color: #475569; line-height: 1.4; margin: 0; }

/* === RESPONSIVE === */
@media (max-width: 768px) {
  .cj-grid { grid-template-columns: 1fr; }
  .el-grid { grid-template-columns: 1fr; }
  .seo-top { grid-template-columns: 1fr; }
  .checklist-grid { grid-template-columns: repeat(2, 1fr); }
}
```

---

## 7. CAMBIO REQUERIDO EN EL ORQUESTADOR (Backend)

> ⚠️ **IMPORTANTE:** Los datos de Customer Journey y Editorial Logic actualmente **NO se guardan** en `custom_metadata` — solo se usan para generar HTML embebido. Para que el sidebar los pueda leer, hay que agregar estas líneas al orquestador en el patch final de `content_items`.

**Archivo:** Edge function `seo-content-orchestrator` en Supabase (proyecto `stjugsrkrweakvzmizpq`)

**Cambio:** En el `await patch(...)` final (después de `buildFooterZone(cjData, elData, ...)`), agregar al objeto `custom_metadata`:

```typescript
// AGREGAR estas dos propiedades al mergeMeta final:
customer_journey: cjData,    // CustomerJourneyData completo
editorial_logic: elData,     // EditorialLogicData completo
```

**Resultado en custom_metadata:**
```json
{
  "customer_journey": {
    "stages": [...],
    "flow_rationale": "...",
    "search_intent_alignment": "...",
    "audience_insight": "..."
  },
  "editorial_logic": {
    "why_structure": "...",
    "search_intent_served": "...",
    "target_reader_profile": "...",
    "content_distribution_logic": "...",
    "key_editorial_decisions": [...],
    "conversion_rationale": "...",
    "quality_signals": "..."
  }
}
```

---

## 8. TEXTOS LOCALIZADOS POR IDIOMA

El sistema soporta 3 idiomas. Detectar con `content_items.language`.

```typescript
const labels = {
  es: {
    panelTitle: "BRIEFING & ANALYSIS",
    tab1: { main: "Assets", sub: "DATOS BRIEFING", icon: "01" },
    tab2: { main: "Customer Journey", sub: "RUTA DEL LECTOR", icon: "02" },
    tab3: { main: "Editorial Logic", sub: "POR QUÉ & CÓMO", icon: "03" },
    tab4: { main: "SEO Optimization", sub: "META + CHECKLIST", icon: "04" },
    mainKeyword: "Keyword principal",
    secondaryKeywords: "Keywords secundarias",
    intent: "Intención de búsqueda",
    targetLength: "Extensión objetivo",
    audience: "Audiencia objetivo",
    angle: "Ángulo editorial",
    structure: "Estructura del artículo",
    faqQuestions: "Preguntas frecuentes",
    userNeed: "Necesidad del usuario",
    userState: "Estado del usuario",
    contentResponse: "Cómo responde el contenido",
    flowRationale: "Razonamiento del flujo",
    searchIntentAlignment: "Alineación con intención",
    audienceInsight: "Perfil de la audiencia",
    expandMore: "Ver más ▼",
    expandLess: "Ver menos ▲",
    whyStructure: "Por qué esta estructura",
    targetReader: "Perfil del lector",
    searchIntentServed: "Intención de búsqueda",
    contentDist: "Distribución del contenido",
    editorialDecisions: "Decisiones editoriales",
    conversionRationale: "Estrategia de conversión",
    qualitySignals: "Señales de calidad (E-E-A-T)",
    metaOg: "Meta & Open Graph",
    seoChecklist: "Checklist SEO",
    metaTitle: "Meta title",
    metaDescription: "Meta description",
    checkH1: "H1 presente",
    checkKwH1: "Keyword en H1",
    checkKwMeta: "Keyword en meta title",
    checkKwDesc: "Keyword en meta desc",
    checkMetaTitleLen: "Meta title (50-60 chars)",
    checkMetaDescLen: "Meta desc (140-160 chars)",
    checkFaq: "FAQ presente",
    checkCta: "CTA presente",
    checkSlug: "Slug definido",
    checkWordCount: "Conteo de palabras",
    score: "SCORE",
  },
  en: {
    panelTitle: "BRIEFING & ANALYSIS",
    tab1: { main: "Assets", sub: "BRIEFING DATA", icon: "01" },
    tab2: { main: "Customer Journey", sub: "READER PATH", icon: "02" },
    tab3: { main: "Editorial Logic", sub: "WHY & HOW", icon: "03" },
    tab4: { main: "SEO Optimization", sub: "META + CHECKLIST", icon: "04" },
    mainKeyword: "Main keyword",
    secondaryKeywords: "Secondary keywords",
    intent: "Search intent",
    targetLength: "Target length",
    audience: "Target audience",
    angle: "Editorial angle",
    structure: "Article structure",
    faqQuestions: "FAQ questions",
    userNeed: "User need",
    userState: "User state",
    contentResponse: "How content responds",
    flowRationale: "Flow rationale",
    searchIntentAlignment: "Search intent alignment",
    audienceInsight: "Audience profile",
    expandMore: "Read more ▼",
    expandLess: "Read less ▲",
    whyStructure: "Why this structure",
    targetReader: "Target reader",
    searchIntentServed: "Search intent served",
    contentDist: "Content distribution",
    editorialDecisions: "Editorial decisions",
    conversionRationale: "Conversion strategy",
    qualitySignals: "Quality signals (E-E-A-T)",
    metaOg: "Meta & Open Graph",
    seoChecklist: "SEO Checklist",
    metaTitle: "Meta title",
    metaDescription: "Meta description",
    checkH1: "H1 present",
    checkKwH1: "Keyword in H1",
    checkKwMeta: "Keyword in meta title",
    checkKwDesc: "Keyword in meta desc",
    checkMetaTitleLen: "Meta title (50-60 chars)",
    checkMetaDescLen: "Meta desc (140-160 chars)",
    checkFaq: "FAQ present",
    checkCta: "CTA present",
    checkSlug: "Slug defined",
    checkWordCount: "Word count",
    score: "SCORE",
  },
  pt: {
    panelTitle: "BRIEFING & ANALYSIS",
    tab1: { main: "Ativos", sub: "DADOS DO BRIEFING", icon: "01" },
    tab2: { main: "Jornada do Cliente", sub: "JORNADA", icon: "02" },
    tab3: { main: "Lógica editorial", sub: "POR QUÊ & COMO", icon: "03" },
    tab4: { main: "Otimização SEO", sub: "META + CHECKLIST", icon: "04" },
    mainKeyword: "Palavra-chave principal",
    secondaryKeywords: "Palavras-chave secundárias",
    intent: "Intenção de busca",
    targetLength: "Extensão alvo",
    audience: "Público-alvo",
    angle: "Ângulo editorial",
    structure: "Estrutura do artigo",
    faqQuestions: "Perguntas frequentes",
    userNeed: "Necessidade do usuário",
    userState: "Estado do usuário",
    contentResponse: "Como o conteúdo responde",
    flowRationale: "Raciocínio do fluxo",
    searchIntentAlignment: "Alinhamento com intenção",
    audienceInsight: "Perfil do público",
    expandMore: "Ver mais ▼",
    expandLess: "Ver menos ▲",
    whyStructure: "Por que essa estrutura",
    targetReader: "Leitor-alvo",
    searchIntentServed: "Intenção de busca atendida",
    contentDist: "Distribuição do conteúdo",
    editorialDecisions: "Decisões editoriais",
    conversionRationale: "Estratégia de conversão",
    qualitySignals: "Sinais de qualidade (E-E-A-T)",
    metaOg: "Meta & Open Graph",
    seoChecklist: "Checklist SEO",
    metaTitle: "Meta title",
    metaDescription: "Meta description",
    checkH1: "H1 presente",
    checkKwH1: "Keyword no H1",
    checkKwMeta: "Keyword no meta title",
    checkKwDesc: "Keyword na meta desc",
    checkMetaTitleLen: "Meta title (50-60 chars)",
    checkMetaDescLen: "Meta desc (140-160 chars)",
    checkFaq: "FAQ presente",
    checkCta: "CTA presente",
    checkSlug: "Slug definido",
    checkWordCount: "Contagem de palavras",
    score: "SCORE",
  },
};
```

---

## 9. COMPORTAMIENTO Y UX

1. **Panel colapsable:** el sidebar puede mostrar/ocultar el panel con un botón. Estado guardado en `localStorage`.
2. **Tab activo por defecto:** Tab 1 (Assets) al abrir.
3. **Loading state:** mientras carga `custom_metadata`, mostrar skeleton en el color del tab activo.
4. **Estado sin datos:** si `custom_metadata` es null o `brief_contract` no existe, mostrar mensaje "Análisis no disponible para este artículo."
5. **CJ/EL sin datos:** si `customer_journey` o `editorial_logic` son null (artículos generados antes del cambio del orquestador), mostrar "Los datos de esta sección estarán disponibles en nuevos artículos."
6. **Expandibles CJ:** cada card es independiente. El estado de expansión no se persiste.
7. **Scroll interno:** si el panel es muy largo, scroll interno dentro del panel (no mover el sidebar completo).

---

## 10. RESUMEN DE IMPLEMENTACIÓN

```
1. Crear componente <BriefingPanel articleId={id} language={language} />
2. Query a Supabase: SELECT custom_metadata FROM content_items WHERE id = articleId
3. Renderizar 4 tabs con el estado React (activeTab: 1|2|3|4)
4. Cada tab lee su sección de custom_metadata
5. Aplicar CSS neon usando el sistema de CSS variables --tr por tab
6. El backend dev debe agregar customer_journey y editorial_logic a custom_metadata (Sección 7)
```

---

*Documento generado el 17/05/2026. Versión del orquestador: 4.7-neon (edge function v66).*
*Contacto técnico: revisar rama `claude/fix-dashboard-design-5aMy0` en accesos-seo/Agents_Automations.*
