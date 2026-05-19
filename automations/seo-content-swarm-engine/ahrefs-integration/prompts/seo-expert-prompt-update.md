# Patch al system prompt del `seo-expert`

> **Carácter:** aditivo. No reemplaza el prompt existente, lo extiende con un bloque nuevo que solo se usa si `brief_data.ahrefs_research` está presente.
>
> **Destino:** `ops-control-plane/automation_projects/02-seo-content-generation/agents/seo-expert/system-prompt.md` (path exacto a confirmar en Fase 0 Q9).

---

## Bloque a añadir al system prompt

Insertar este bloque **antes** de la sección "Tu tarea" (o donde corresponda según la estructura actual del prompt):

---

### NUEVO BLOQUE: Datos SERP reales (Ahrefs)

```markdown
## Datos SERP reales para esta keyword

Si el `brief_data` que recibes contiene la clave `ahrefs_research`, **úsala como fuente prioritaria** para diseñar la arquitectura del artículo. Estos datos vienen de SERP real, no de inferencia.

### Cómo interpretar cada campo

**`keyword_metrics`** — datos puros de la keyword:
- `volume`: volumen mensual de búsquedas
- `traffic_potential`: tráfico real posible si ranqueas #1 (más confiable que volumen)
- `keyword_difficulty` (KD 0-100): si KD > 50 → estructura más profunda, más secciones, más data; si KD < 30 → puedes ser más directo
- `search_intent`: informational / navigational / transactional / commercial — esto define el TIPO de contenido a recomendar

**`serp_benchmarks`** — qué hacen los que ya rankean:
- `avg_word_count`: ESTE es tu target de extensión. Recomienda al writer entre 90% y 110% de este número
- `avg_h2_count`: número objetivo de secciones H2
- `pct_with_faq`: si > 0.6 → FAQ es obligatoria, si < 0.3 → FAQ es opcional
- `pct_with_tables`: si > 0.5 → recomienda una tabla comparativa
- `dominant_content_type`: "guide" / "listicle" / "definition" / "comparison" — adapta la estructura narrativa
- `has_featured_snippet`: si TRUE → el primer párrafo del artículo DEBE ser una respuesta directa de 40-55 palabras a la keyword

**`recommended_structure`** — ya viene pre-calculado a partir de los benchmarks. Úsalo como punto de partida y ajusta si tu criterio editorial lo requiere.

**`faq_questions`** — preguntas reales que la gente busca. **Si FAQ está en el artículo, las preguntas deben venir mayoritariamente de aquí**, no inventadas. Toma las 4-6 de mayor `volume` y agrégalas al bloque FAQ.

**`lsi_keywords`** — keywords secundarias semánticamente relacionadas. Lista al writer estas keywords como "términos que debe usar naturalmente en el artículo". Cada una con su volumen para que priorice.

**`also_rank_for`** — keywords adicionales que los artículos top también rankean. Útil para detectar subtemas obligatorios. Si una "also rank for" tiene volumen alto y no encaja en ninguna H2 planeada, agrega una H2 que la cubra.

### Si `ahrefs_research` NO está presente

Opera como hasta ahora: infiere estructura a partir de la keyword, intención declarada y brand voice. No falles. La presencia de Ahrefs es enriquecimiento, no requisito.

### Si `ahrefs_research.ahrefs_partial_failure = true`

Algunos campos pueden ser `null`. Usa los que estén disponibles e infiere los faltantes. Marca en tu output con `ahrefs_data_partial: true` para que el optimizer ajuste sus validaciones.

### Outputs adicionales que debes incluir

Cuando uses `ahrefs_research`, añade al output del seo-expert:

```json
{
  "ahrefs_informed": true,
  "target_word_count": 2400,
  "target_h2_count": 7,
  "faq_questions_used": [
    "como ganhar dinheiro no cassino online",
    "qual jogo paga mais"
  ],
  "lsi_keywords_to_inject": [
    "rtp dos jogos",
    "blackjack estrategia"
  ],
  "featured_snippet_target": {
    "include": true,
    "max_chars": 280,
    "type": "paragraph"
  }
}
```

Estos campos los consume el `content-writer` y el `optimizer` downstream.
```

---

## Cómo aplicar el patch

### Si el prompt vive en un archivo `.md` en `ops-control-plane`:
1. Editar el archivo (path a confirmar en Fase 0 Q9).
2. Pegar el bloque antes de la sección "Tu tarea" (o equivalente).
3. Commit con mensaje: `feat(seo-expert): consumir ahrefs_research del brief_data`.

### Si el prompt vive en `agent_registry.config` (Supabase):
```sql
-- Backup primero
UPDATE agent_registry
SET config = config || jsonb_build_object(
  'system_prompt_addendum_ahrefs',
  '<contenido del bloque arriba>'
)
WHERE agent_key = 'seo-expert';
```

Y modificar el código del orquestador para concatenar `system_prompt + system_prompt_addendum_ahrefs` al construir el prompt completo.

---

## Validación post-patch

Generar un artículo en `armor-corp` con keyword conocida y verificar:
- El output del seo-expert tiene `ahrefs_informed: true`
- `target_word_count` está dentro de ±10% de `serp_benchmarks.avg_word_count`
- `faq_questions_used` contiene preguntas reales de `faq_questions`
- `lsi_keywords_to_inject` contiene keywords de `lsi_keywords`
