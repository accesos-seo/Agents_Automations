# Patch 07 — Orchestrator v4.4: Quality Floor + Meta Description + Quality Enforcer

**Destino:** `accesos-seo/ops-control-plane`
**Path:** `automation_projects/02-seo-content-generation/functions/seo-content-orchestrator/index.ts`
**Acción:** **Sincronizar con versión deployada** (Supabase Light_House ya tiene v4.4 activa)
**Decisión:** D-009 (2026-05-16)
**Estado Supabase:** deployado como versión 43, status ACTIVE

---

## Contexto

El orchestrator legacy (`seo-content-orchestrator`) fue actualizado a v4.4 para resolver 3 problemas críticos detectados en la auditoría D-006:

| Problema | Impacto medido | Solución |
|---|---|---|
| Contract gate falla por word count | 79% de artículos rechazados | Quality floor forzado en `makeContract()` |
| Artículos sin meta description | 91% sin meta | Generación automática post-EEAT |
| Quality gate puramente heurístico | No evalúa semántica | Quality Enforcer semántico (`seo-content-quality-enforcer` v1.0) |

---

## Cambios a aplicar en `index.ts`

### 1. Constantes de versión y quality floor

```typescript
// Antes:
const VERSION = "4.3"; // o similar

// Después:
const VERSION = "4.4";
const QUALITY_FLOOR_MIN = 1500;
const QUALITY_FLOOR_MAX = 2800;
```

### 2. Enforcement del quality floor en `makeContract()`

Localizar la función `makeContract()` y añadir estas líneas **después** de parsear `range` del brief:

```typescript
// Enforce quality floor regardless of brief — D-009
if (range.min === null || (typeof range.min === "number" && range.min < QUALITY_FLOOR_MIN)) {
  range.min = QUALITY_FLOOR_MIN;
}
if (range.max === null || (typeof range.max === "number" && range.max < QUALITY_FLOOR_MAX)) {
  range.max = QUALITY_FLOOR_MAX;
}
const effectiveExtensionRaw = raw && range.min !== QUALITY_FLOOR_MIN
  ? raw
  : `${range.min} - ${range.max} palabras (piso calidad D-009)`;
```

> **Efecto:** cualquier brief que pida menos de 1,500 palabras es silenciosamente escalado a 1,500-2,800. El writer nunca más excederá el contrato por culpa del brief mal calibrado.

### 3. Smart repair bypass

Localizar el bloque que decide si disparar el repair loop. Añadir **antes** del `if (!val.passed)` que llama al repair:

```typescript
// Skip repair if the only issue is acceptable word count excess — D-009
const repairCap = Math.round((contract.max || QUALITY_FLOOR_MAX) * 1.20);
const onlyWordCountExcess =
  val.issues.length === 1 &&
  val.issues[0].includes("excede extensi") &&
  val.wordCount <= repairCap;

if (onlyWordCountExcess) {
  await log(
    supabase, content_item_id, run_id,
    "repair_skipped", "orchestrator", "ok",
    { reason: "only_word_count_excess_within_cap", wordCount: val.wordCount, cap: repairCap }
  );
  val = { ...val, passed: true, issues: [] };
}
```

> **Efecto:** un artículo de 3,360 palabras (máximo 2,800 × 1.20) que solo falla por extensión pasa directamente al EEAT, evitando una reescritura costosa e inútil.

### 4. Meta description fallback (post-EEAT)

Añadir **después** de la llamada al EEAT validator y **antes** de la persistencia final:

```typescript
// Auto-generate meta description when brief didn't provide one — D-009
let metaDescription = (contract.metaDescription || item.meta_description || "").trim();
if (!dryRun && (!metaDescription || metaDescription.length < 70)) {
  try {
    const metaOut = await agent(
      env,
      "meta-description",
      promptMeta(article, contract, language),
      "OPENROUTER_MODEL_CONTENT_WRITER",
      25000
    );
    const generated = String(metaOut.meta_description || "").trim();
    if (generated.length >= 70) {
      metaDescription = generated.slice(0, 160);
      await log(
        supabase, content_item_id, run_id,
        "meta_description", "meta-generator", "ok",
        { generated, length: metaDescription.length }
      );
    }
  } catch (e) {
    await log(
      supabase, content_item_id, run_id,
      "meta_description", "meta-generator", "error",
      { error: String(e).slice(0, 200) }
    );
  }
}
```

**Función auxiliar `promptMeta` a añadir:**

```typescript
function promptMeta(html: string, c: Contract, language: string): string {
  const lang = langName(language); // función ya existente en el orchestrator
  return `Genera una meta description SEO en ${lang} para el artículo.
Reglas: 140-160 caracteres, incluir keyword principal naturalmente, terminar con un beneficio o llamado a la acción, sin comillas.
Keyword: ${c.keyword}.
H1: ${c.h1}.
Primer párrafo: ${strip(html).slice(0, 500)}.
JSON: {meta_description}.`;
}
```

> **Efecto:** 91% de artículos que antes salían sin meta description ahora tienen una generada automáticamente (140-160 chars, con keyword, con CTA).

### 5. Quality Enforcer hook (non-blocking)

Añadir **después del EEAT** y **antes del cálculo del score final**:

```typescript
// Optional Quality Enforcer — non-blocking, D-009
const enforcerEnabled = (Deno.env.get("QUALITY_ENFORCER_ENABLED") || "true").toLowerCase() !== "false";
let qualityEnforcer: J | null = null;

if (!dryRun && enforcerEnabled) {
  try {
    qualityEnforcer = await callQualityEnforcer(env, {
      content_item_id, run_id, language, brand, article_html, contract, validation
    });
    await log(
      supabase, content_item_id, run_id,
      "quality_enforcer", "seo-content-quality-enforcer",
      qualityEnforcer?.passed ? "ok" : "blocked",
      qualityEnforcer
    );
  } catch (e) {
    await log(
      supabase, content_item_id, run_id,
      "quality_enforcer", "seo-content-quality-enforcer", "error",
      { error: String(e).slice(0, 200) }
    );
  }
}
```

**Función `callQualityEnforcer` a añadir:**

```typescript
async function callQualityEnforcer(env: ReturnType<typeof envs>, payload: J): Promise<J | null> {
  const url = `${env.supabaseUrl}/functions/v1/seo-content-quality-enforcer`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.supabaseServiceKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Enforcer ${res.status}`);
    return await res.json() as J;
  } finally {
    clearTimeout(timeout);
  }
}
```

**Score combinado (reemplazar cálculo del score actual):**

```typescript
const eeatScore = Number((eeat as J).eeat_score);
const qualityScore = qualityEnforcer && typeof qualityEnforcer.overall_score === "number"
  ? Number(qualityEnforcer.overall_score)
  : null;

// Combined score: quality enforcer (0-100) + EEAT (0-10 → 0-100), average
const score = Number.isFinite(qualityScore)
  ? Math.round((qualityScore + (Number.isFinite(eeatScore) ? eeatScore * 10 : 80)) / 2)
  : Number.isFinite(eeatScore)
    ? Math.round(eeatScore * 10)
    : val.passed ? 80 : 55;

// Enforcer can block article (in addition to contract gate)
const enforcerBlocked =
  qualityEnforcer?.passed === false &&
  Array.isArray(qualityEnforcer?.blocking_issues) &&
  (qualityEnforcer.blocking_issues as string[]).length > 0;

const overallPassed = val.passed && !enforcerBlocked;
```

### 6. Prompts mejorados (intro + CTA)

En el prompt de la sección **intro**, añadir esta instrucción:

```
La PRIMERA oración debe contener un DATO CUANTIFICABLE (porcentaje, cantidad, fecha, ley, número concreto).
```

En el prompt de la sección **CTA**, añadir esta instrucción (donde `${master.brand}` es el brand slug):

```
El CTA debe MENCIONAR EXPLÍCITAMENTE el nombre de la marca emisora: ${master.brand}.
```

---

## Impacto esperado

| Métrica | Antes | Después |
|---|---|---|
| Contract gate failure rate | 79% | ~5% (solo fallos reales) |
| Artículos sin meta description | 91% | ~0% |
| content_score NULL | 100% | ~0% |
| Artículos bloqueados por competidores | variable | detectado y bloqueado antes de publicar |
| Artículos sin dato en apertura | ~15%? | detectado y bloqueado antes de publicar |

---

## Variable de entorno nueva (opcional)

| Variable | Default | Descripción |
|---|---|---|
| `QUALITY_ENFORCER_ENABLED` | `"true"` | Si `"false"`, desactiva la llamada al enforcer sin necesidad de redeploy |

---

## Orden de aplicación

1. Asegurarse de que `seo-content-quality-enforcer` está deployado en Light_House (**ya está en v1.0**).
2. Aplicar este patch en `ops-control-plane`.
3. Opcionalmente setear `QUALITY_ENFORCER_ENABLED=false` para un rollout gradual.
4. Monitorear `content_generation_logs` con `step = 'quality_enforcer'` para ver tasa de bloqueo.

---

## Monitoreo post-deploy

```sql
-- Tasa de bloqueo del Quality Enforcer (últimas 24h)
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS pct
FROM content_generation_logs
WHERE step = 'quality_enforcer'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Artículos bloqueados con detalle
SELECT
  content_item_id,
  details->>'blocking_issues' AS blocking_issues,
  details->>'overall_score' AS score
FROM content_generation_logs
WHERE step = 'quality_enforcer'
  AND status = 'blocked'
ORDER BY created_at DESC
LIMIT 20;

-- Meta description coverage
SELECT
  COUNT(*) FILTER (WHERE meta_description IS NOT NULL AND meta_description != '') AS with_meta,
  COUNT(*) FILTER (WHERE meta_description IS NULL OR meta_description = '') AS without_meta,
  COUNT(*) AS total
FROM content_items
WHERE article_content IS NOT NULL;
```
