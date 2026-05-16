# Handover — Footer Zone Redesign (SEO Content Swarm Engine)

**Fecha:** 2026-05-16  
**Para:** siguiente agente  
**De:** sesión anterior  
**Estado:** trabajo incompleto — el usuario no está satisfecho con el resultado visual

---

## 1. Qué quiere el usuario (en sus propias palabras)

> "Yo lo que te pasé fue un código para que hiciéramos algo de ese nivel."

El usuario compartió 4 screenshots de un diseño profesional dark-theme y quiere que la sección complementaria debajo de los artículos de Orbit CMS luzca **exactamente así**. No es una aproximación — quiere el diseño.

**Quejas concretas de la última iteración:**
1. **"No es una caja horrible"** — No quiere un rectángulo contenedor. Quiere que sea una sección integrada en la página, separada por una línea como en una landing page profesional, no un div con fondo oscuro y border-radius flotando.
2. **"El contraste no se ve"** — Las letras internas son prácticamente invisibles. Labels, body text, tab numbers, subtítulos de tab — todo se pierde en el fondo oscuro. Una cosa es dark theme con contraste alto, otra es dark opaco donde no se lee nada.

---

## 2. El diseño target (lo que el usuario mostró en los screenshots)

Los 4 screenshots mostraban exactamente esto:

### Tab 01 — Assets / BRIEFING INPUTS
- Keyword principal en **42–48px, blanco puro**, fuente bold/extrabold
- Pills/tags con fondo `rgba(púrpura, 0.15)` y borde visible — texto legible en `#c4b8ff`
- Tarjeta de Search Intent: etiqueta en gris claro, valor en **blanco grande (20px)**
- Tarjeta de Target Length: número grande, barra de progreso con gradiente `#7c6fff → #22d3ee`
- Grid de secciones SECTION 01–04: fondo con tinte púrpura, número en `#a098ff`, título en `#c4beff`

### Tab 02 — Customer Journey / READER PATH
- Label "READER FLOW MAP" visible en gris-púrpura claro
- **SVG inline**: curva bezier sinusoidal de izquierda a derecha, 4 círculos numerados con stroke `#7c6fff`, números en blanco, labels bajo los círculos en `#c0bad8`
- 4 columnas de tarjetas: header con número púrpura + nombre en **blanco**, campos USER NEED / STATE / HOW CONTENT RESPONDS con labels en gris visible y texto en `#c0bad8` (no `#8b85a8` — eso es invisible)
- Referencia de sección en `#a098ff` cursiva

### Tab 03 — Editorial Logic / WHY & HOW
- Pullquote con borde izquierdo `#7c6fff`, `"` grande en púrpura, texto en **`#e0d8ff`** (casi blanco, cursiva)
- 3-col grid: labels visibles en `#9d95cc`, texto en `#c0bad8`
- Decisiones 01/02/03: número en `#a098ff` bold, texto en `#c0bad8`
- Tarjeta de conversion: fondo `rgba(124,111,255,0.18)` con borde púrpura visible

### Tab 04 — SEO Optimization / META + CHECKLIST
- **Gauge SVG circular**: score 90 en blanco grande, "/ 100" en gris, anillo verde `#10b981`
- Meta rows con fondo `rgba(20,17,35,0.85)` y borde `rgba(255,255,255,0.13)` — texto en `#e0d8ff`
- Slug en `#22d3ee` monospace
- Badges "56 chars" en verde claro legible
- 5-col checklist: `✓ PASS` en verde vivo `#34d399`, `! WARN` en amarillo `#fbbf24`

### El separador entre el artículo y la sección
- **No es una caja** — es una línea horizontal con gradiente `transparent → rgba(124,111,255,0.5) → transparent`
- Label centrado "BRIEFING & ANALYSIS" en `#7c6fff`, 10px, letra-spacing amplio
- El wrapper NO tiene `background` ni `border-radius` — el color lo dan las tarjetas internas

---

## 3. Estado técnico actual

### Archivo principal
`/home/user/Agents_Automations/propuesta-orchestrator-v4.4.ts`  
Branch: `claude/redesign-seo-swarm-engine-obZhh`  
Commit: `dd86ac7` — función `buildFooterZone()` reescrita con dark theme (líneas 166–666)

### Artículo de prueba en Supabase
- **Proyecto:** `stjugsrkrweakvzmizpq` (Light_House)
- **Tabla:** `content_items`
- **ID:** `683ab6e9-c42e-4fdf-920c-2ca7c3369919`
- **Título:** "Mastering Fix and Flip: A Strategic Guide to Scalable Real Estate Investing"
- **Marca:** Doug Construction | **Idioma:** en
- **Footer zone empieza en:** char 23561 de `article_content`
- **Longitud total actual:** 55401 chars

El artículo tiene actualmente el último intento de footer zone (con separador y wrapper transparente) desde la última iteración de esta sesión.

### Para reemplazar el footer zone en SQL
```sql
UPDATE content_items
SET article_content = SUBSTRING(article_content FROM 1 FOR 23560) || $fz$
[NUEVO HTML AQUÍ]
$fz$
WHERE id = '683ab6e9-c42e-4fdf-920c-2ca7c3369919';
```

---

## 4. Datos del brief del artículo (para las tarjetas)

```
keyword:       "fix and flip"
secondary:     ["house flipping business model", "fix and flip financing",
                "after repair value ARV", "rehab cost estimation",
                "real estate investment strategy", "hard money loan",
                "property renovation budget", "flip profit margin"]
intent:        "Informativa / Investigación Comercial"
audience:      "Inversionistas inmobiliarios intermedios y avanzados..."
angle:         "Fix and flip desde perspectiva estratégica y financiera avanzada..."
h1:            "Mastering Fix and Flip: A Strategic Guide to Scalable Real Estate Investing"
metaTitle:     "Fix and Flip: Strategic Guide for Professional Investors" (56 chars)
metaDesc:      "Scale your fix and flip business with expert strategies..." (150 chars)
slug:          "fix-and-flip-investment-strategy"
h2s:           ["The Economics of Scalable Fix and Flip Operations",
                "Advanced Financing Strategies and Leverage",
                "Standardizing the Rehab Process: From Scope to Sale",
                "Mitigating Risks and Optimizing Exit Strategies"]
faq:           5 preguntas presentes
extension:     "1400 - 1600 palabras"
wordCount:     ~3040 (sobre el target)
brand:         "Doug Construction"
```

### SEO score: 90/100
- 9 checks en `ok`, 1 en `warn` (word count sobre el máximo)
- `dashoffset` para el gauge SVG = `30.2` (circ=301.59, score=90)
- `gaugeColor` = `#10b981`

### CJ stages (4 etapas con contenido AI real)
1. **Validate Profit Potential** → The Economics of Scalable Fix and Flip Operations
2. **Structure Capital Efficiently** → Advanced Financing Strategies and Leverage
3. **Operationalize the Rehab** → Standardizing the Rehab Process: From Scope to Sale
4. **Protect the Exit** → Mitigating Risks and Optimizing Exit Strategies

(Texto completo de cada campo user_need / user_state / content_response está en el artículo actual — recuperable con `SELECT SUBSTRING(article_content FROM 23561) FROM content_items WHERE id = '683ab6e9...'`)

### EL (Editorial Logic)
- why_structure: "The article is sequenced to mirror how a sophisticated investor..."
- 3 tarjetas: Search Intent Alignment, Target Reader Profile, Content Distribution
- 3 decisiones editoriales numeradas
- conversion_rationale: "By framing Doug Construction around disciplined execution..."

---

## 5. El problema de CSS que se resolvió (no revertir)

**Los radio inputs deben estar DENTRO del wrapper div**, antes del `<nav>`. El selector `~` (sibling) de CSS solo funciona si los inputs son hermanos directos de `.seo-fz-tabs` y `.seo-fz-panels`.

✅ Estructura correcta:
```html
<div class="seo-fz-wrapper">
  <input type="radio" id="uid-r-assets" name="uid-tabs" hidden checked>
  <input type="radio" id="uid-r-cj"     name="uid-tabs" hidden>
  <input type="radio" id="uid-r-el"     name="uid-tabs" hidden>
  <input type="radio" id="uid-r-seo"    name="uid-tabs" hidden>
  <nav class="seo-fz-tabs">
    <label for="uid-r-assets">...</label>
    ...
  </nav>
  <div class="seo-fz-panels">
    <div id="uid-assets" class="seo-fz-panel">...</div>
    ...
  </div>
</div>
```

❌ Estructura incorrecta (no funciona):
```html
<input type="radio" ...>  <!-- FUERA del wrapper -->
<section class="seo-fz-wrapper">
  <nav class="seo-fz-tabs">...</nav>  <!-- NO es hermano del input -->
```

---

## 6. Paleta de colores correcta (alto contraste)

```
Fondo wrapper:          transparent (sin background en el div wrapper)
Fondo tarjetas:         rgba(20, 17, 35, 0.85)
Borde tarjetas:         rgba(255, 255, 255, 0.13)
Acento púrpura:         #7c6fff
Acento teal:            #22d3ee
Texto principal (H):    #ffffff
Texto body:             #c0bad8   ← NO usar #8b85a8, es invisible
Labels uppercase:       #9d95cc   ← NO usar #5a5478, es invisible
Tab inactivo:           #8880b8
Tab activo:             #ffffff con border-bottom #7c6fff
Tab subtítulo inactivo: #6b5fa8
Tab subtítulo activo:   #a098ff
Tab num inactivo:       border rgba(255,255,255,0.2)
Tab num activo:         border #7c6fff, bg rgba(124,111,255,0.15)
Pullquote texto:        #e0d8ff
Tags:                   bg rgba(124,111,255,0.18), border rgba(124,111,255,0.45), color #c4b8ff
Section cards:          bg rgba(124,111,255,0.07), border rgba(124,111,255,0.2)
Section num:            #a098ff
Section title:          #c4beff
Badge OK verde:         bg rgba(16,185,129,0.2), color #34d399, border rgba(16,185,129,0.4)
Badge WARN amarillo:    bg rgba(245,158,11,0.15), color #fbbf24, border rgba(245,158,11,0.4)
Gauge score text:       #ffffff
Gauge sub text:         #c0bad8
Slug mono:              #22d3ee
Meta values:            #e0d8ff
```

---

## 7. Lo que falta / próximos pasos

1. **Verificar visualmente en Orbit** que el último UPDATE se ve bien (hard-refresh Ctrl+Shift+R en la URL del artículo). El usuario aún no ha confirmado si el último intento (con wrapper transparente + contraste mejorado) funcionó.

2. **Si el contraste sigue sin verse:** El CMS Orbit puede tener estilos globales que sobreescriben los colores. En ese caso, añadir `!important` a los estilos críticos de color y background.

3. **Si las tabs siguen sin funcionar:** El CMS puede estar sanitizando los `<input type="radio" hidden>`. En ese caso, reemplazar el sistema CSS-only por JavaScript puro:
   ```html
   <script>
   (function(){
     var w=document.querySelector('.seo-fz-wrapper');
     if(!w)return;
     var tabs=w.querySelectorAll('.seo-fz-tab');
     var panels=w.querySelectorAll('.seo-fz-panel');
     function activate(i){
       tabs.forEach(function(t,j){t.classList.toggle('seo-fz-tab--active',j===i)});
       panels.forEach(function(p,j){p.style.display=j===i?'block':'none'});
     }
     tabs.forEach(function(t,i){t.addEventListener('click',function(){activate(i)})});
     activate(0);
   })();
   </script>
   ```
   Y agregar `.seo-fz-tab--active` al CSS con los estilos activos.

4. **Una vez validado en este artículo:** Actualizar la Edge Function `seo-content-orchestrator` (deploy 52) en Supabase `stjugsrkrweakvzmizpq` con la función `buildFooterZone()` del archivo `propuesta-orchestrator-v4.4.ts`. Actualmente está en la versión 51 (v4.6).

---

## 8. URL de acceso al artículo en Orbit

La URL visible en el screenshot del usuario era:
`orbit.seolabagency.com/8ff8c563-6acc-4def-abe4-43e75a1d451b/content-hub/cms/683ab6e9-c42e-4fdf-920c-2ca7c3369919`

---

## 9. Contexto del sistema

- **Repo:** `accesos-seo/agents_automations` (este repo)
- **Branch de trabajo:** `claude/redesign-seo-swarm-engine-obZhh`
- **Supabase control:** `lwurzjrghzwzxbhrulyn` (Swarm Agentes MD)
- **Supabase runtime:** `stjugsrkrweakvzmizpq` (Light_House)
- **Edge Function objetivo:** `seo-content-orchestrator` (slug)
- **Versión actual en prod:** v51 (VERSION = "4.6")
- **Archivo TS de la propuesta:** `/home/user/Agents_Automations/propuesta-orchestrator-v4.4.ts`
- **README del engine:** `automations/seo-content-swarm-engine/README.md`
