# Fase 0 — Resultados de auditoría

> Template para pegar los resultados de las 10 queries en `01-queries-supabase.sql`.
> **Acción requerida del usuario:** ejecutar las queries en Supabase Light_House y rellenar este documento.

---

## Q1 — Función `fn_trigger_seo_investigation`

```sql
-- pegar aquí el cuerpo completo de la función
```

**Lo que extraemos de aquí:**
- URL del webhook n8n: _______
- Payload enviado: _______
- ¿Es síncrono o async? _______

---

## Q2 — Trigger `tr_investigar_seo_en_n8n`

```sql
-- pegar definición del trigger
```

**Condición de disparo:** _______ (AFTER INSERT / UPDATE / etc.)

---

## Q3 — Estructura `content_items`

| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| (pegar tabla aquí) | | | |

---

## Q4 — Sample de `brief_data` actual

### Ejemplo 1
```json
// pegar brief_data_pretty del primer registro
```

### Ejemplo 2
```json
// pegar brief_data_pretty del segundo registro
```

### Ejemplo 3
```json
// pegar brief_data_pretty del tercer registro
```

---

## Q5 — Campos top-level recurrentes en `brief_data`

| Campo | Ocurrencias |
|---|---|
| (pegar) | |

**Análisis:** ¿qué campos son universales? ¿cuáles son opcionales? ¿hay algún campo que ya parezca contener datos de SERP/keyword research?

---

## Q6 — Ahrefs API key en Vault

| Nombre del secret | Descripción | Creado |
|---|---|---|
| (pegar) | | |

**Nombre confirmado del secret:** `_______`

---

## Q7 — Marcas y locales

| brand_slug | locale | article_count |
|---|---|---|
| (pegar) | | |

**Mapping a Ahrefs country_code:**

| locale | country_code Ahrefs |
|---|---|
| es-MX | mx |
| es-ES | es |
| pt-BR | br |
| en-US | us |
| (completar según los locales reales) | |

---

## Q8 — Tiempo promedio de generación

| Día | Total | Avg segundos |
|---|---|---|
| (pegar) | | |

**Promedio general:** _______ segundos
**Impacto aceptable de +3-5s:** ✅ Sí / ❌ No

---

## Q9 — Configuración del `seo-expert`

| agent_key | model | status | config |
|---|---|---|---|
| seo-expert | | | |
| content-writer | | | |
| optimizer | | | |

**Pregunta clave:** ¿dónde vive el system prompt del seo-expert? (ops-control-plane path o campo config)

---

## Q10 — Volumen del pipeline (último mes)

| Semana | Artículos | Keywords únicas | % únicas |
|---|---|---|---|
| (pegar) | | | |

**Conclusión costos Ahrefs:**
- Artículos por semana: _______
- Keywords únicas por semana: _______
- Si todas son nuevas: _____ credits/semana ≈ ____ credits/mes
- Con caché 7d (hit rate estimado _____%): _____ credits/mes
- ¿Cabe en el plan Ahrefs actual? _______

---

## Decisiones desbloqueadas por esta auditoría

| Decisión | Resolución |
|---|---|
| ¿Qué nodos tiene n8n A hoy? | _______ |
| ¿`brief_data` tiene campos que conflictúan con `ahrefs_research`? | _______ |
| ¿Dónde meter las nuevas llamadas Ahrefs en n8n? | _______ |
| ¿Nombre del secret de Ahrefs? | _______ |
| ¿Mapping locale → country definitivo? | _______ |
| Path del prompt del seo-expert | _______ |

---

## Workflow n8n A — Export

Acción del usuario: exportar el workflow `8iZcC4mGSFWUlOAc` desde n8n (`Workflows → ⋯ → Download`) y guardarlo en este mismo directorio como `n8n-workflow-actual.json`.

> Una vez subido, podré analizar los nodos exactos y diseñar el bloque Ahrefs que se inserta sin conflicto.
