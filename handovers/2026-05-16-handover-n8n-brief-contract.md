# Handover — Refuerzo de n8n A (investigación SEO + brand contract)

**Fecha:** 2026-05-16
**Destinatario:** Chat de Claude Code con acceso a n8n del cliente (`estancias-atlas-n8n.heh8a3.easypanel.host`)
**Autor:** Claude principal (sesión S-005)
**Sesión asignada:** S-013 — Área B (Briefs / n8n A) según [`AREAS.md`](../automations/seo-content-swarm-engine/AREAS.md)
**Política canónica que aplica:** [`referencias/politica-competidores-prohibidos.md`](../referencias/politica-competidores-prohibidos.md) (decisión D-002)

---

## 1. Tu misión en 2 líneas

Reforzar el workflow de n8n que genera el `brief_data` de cada artículo SEO para que (a) **nunca devuelva menciones a competidores** y (b) **inyecte un objeto `brand_contract`** con las reglas de marca que el writer debe respetar. Después: validar con dry-run sobre un artículo de prueba y confirmar a Claude principal y al usuario.

> Si no puedes hacer todo el trabajo en una sesión: registra el avance en [`automations/seo-content-swarm-engine/WORK_IN_PROGRESS.md`](../automations/seo-content-swarm-engine/WORK_IN_PROGRESS.md) y transfiere.

---

## 2. Antes de empezar — onboarding obligatorio (5 min)

Lee en este orden:

1. [`CLAUDE.md`](../CLAUDE.md) — reglas no negociables del ecosistema.
2. [`automations/seo-content-swarm-engine/AGENT_ONBOARDING.md`](../automations/seo-content-swarm-engine/AGENT_ONBOARDING.md) — contexto completo del proyecto.
3. [`referencias/politica-competidores-prohibidos.md`](../referencias/politica-competidores-prohibidos.md) — la regla que vas a hacer cumplir.
4. [`automations/seo-content-swarm-engine/politicas/competidores-prohibidos.yaml`](../automations/seo-content-swarm-engine/politicas/competidores-prohibidos.yaml) — lista operativa machine-readable que vas a consumir desde n8n.

**Después de leer, registra tu sesión en `WORK_IN_PROGRESS.md`** así (commit + push antes de tocar n8n):

```markdown
| S-013 | B. Briefs / n8n A | <tu identificador> | <fecha+hora UTC> | Refuerzo n8n A: filtro competidores + brand_contract | en_curso |
```

---

## 3. Contexto técnico — qué es n8n A hoy

### 3.1. Trigger (Supabase → n8n)

Cuando un Content Manager crea un `content_items` con `brief_url IS NOT NULL` y `ai_extraction_status = 'pending'`, el trigger `tr_investigar_seo_en_n8n` (en proyecto Light_House, `stjugsrkrweakvzmizpq`) llama a la función SQL `fn_trigger_seo_investigation()` que hace:

```sql
PERFORM net.http_post(
  url := 'https://estancias-atlas-n8n.heh8a3.easypanel.host/webhook/supabase-content-trigger',
  body := json_build_object('record', row_to_json(NEW))::jsonb,
  headers := '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds := 5000
);
```

### 3.2. Webhook que recibes en n8n

- **URL:** `https://estancias-atlas-n8n.heh8a3.easypanel.host/webhook/supabase-content-trigger`
- **Método:** POST
- **Body:** `{ "record": { ...content_items row completo... } }`
- **Campos clave del `record`:**
  - `id` (uuid) — content_item_id
  - `title` (texto)
  - `main_keyword` (texto)
  - `brief_url` (texto) — URL al documento del brief (si existe)
  - `proyecto_id` (uuid) — FK a `proyectos_seo`
  - `language`, `country` — para resolver idioma
  - `client_id` (uuid)
  - `ai_extraction_status` = `'pending'` cuando llega

### 3.3. Qué hace n8n hoy (inferido — confirmar al abrir el workflow)

1. Recibe el webhook.
2. Hace investigación SEO (probablemente Perplexity / SerpAPI / Tavily o scraping del brief_url).
3. Pasa los resultados + datos del record a un LLM (probablemente OpenAI o Anthropic).
4. El LLM sintetiza el brief con la estructura jsonb que vemos en producción (ver §3.4).
5. Hace `UPDATE content_items SET brief_data = <jsonb>, ai_context = <jsonb>, ai_extraction_status = 'completed' WHERE id = <id>`.
6. El trigger SQL `on_ai_extraction_completed` se dispara solo y llama al orquestador del swarm.

### 3.4. Estructura actual del `brief_data` (jsonb persistido)

Estructura observada en producción (ejemplo del brief de `4fc15f6f-...`, marca Vera Bet):

```jsonc
{
  "resumen_ejecutivo": {
    "meta_seo": { "titulo": "...", "descripcion": "..." },
    "parametros": {
      "angulo_editorial": "...",
      "publico_objetivo": "...",
      "extension_palabras": "1400 - 1600 palabras",
      "intencion_busqueda": "..."
    },
    "h1_propuesto": "...",
    "titulo_brief": "Brief de Contenido SEO – Vera Bet (Brasil)",
    "slug_sugerido": "...",
    "estrategia_keywords": {
      "principal": "apostas online brasil",
      "secundarias": [ "...", "..." ]
    }
  },
  "estructura_contenido": {
    "introduccion": {
      "objetivo": "...",
      "puntos_clave": [ "...", "..." ]
    },
    "elementos_extra": {
      "visuales": [ "..." ],
      "cta_final": "..."
    },
    "desarrollo_h2_h3": [
      {
        "heading": "...",
        "semantic_terms": [ "...", "..." ],
        "contenido_sugerido": "..."
      }
    ],
    "preguntas_frecuentes": [ "...", "..." ]
  },
  "contexto_investigacion": "..." // <-- AQUÍ ES DONDE HOY APARECEN COMPETIDORES
}
```

### 3.5. El problema concreto que vas a resolver

En el ejemplo real auditado, `contexto_investigacion` contenía esto (extracto literal):

```
### 2. Datos Duros y Estadísticas
**Licencias Específicas mencionadas:**
- Betano: Licencia 0001/2024.
- Superbet: Licencia 0002/2024 (Portaria SPA/MF nº 2.090).
- Betnacional: Licencia 0006/2024.
- Novibet: Licencia 0017/2024.
- bet365: Licencia 0021/2024.
- Aposta Ganha: Licencia 0022/2024.
- BetMGM: Licencia 0036/2024 (Portaria SPA/MF nº 2.098).
- BetBoom: Licencia 0069/2024.
...
**Patrocinios Deportivos:**
- Superbet: Patrocinador oficial del Fluminense...
- bet365: Patrocinador oficial de la Champions League.
```

El `content-writer` lee el brief, lo toma como insumo legítimo, y reproduce las menciones de competidores en el artículo. **Ese es el origen de la contaminación.** Filtramos en la fuente y el problema desaparece downstream.

---

## 4. Cambios que tienes que hacer en n8n

### 4.1. Cambio #1 — Sanitizador de competidores (al final del workflow, ANTES del UPDATE)

**Objetivo:** garantizar que ninguno de los 16 competidores prohibidos sobreviva en ningún campo string del `brief_data` que se persiste.

**Pasos en n8n:**

1. Abre el workflow asociado al webhook `/webhook/supabase-content-trigger`.
2. Identifica el último nodo antes del `UPDATE content_items` (probablemente un nodo de "Set" o "Function" que arma el `brief_data` final).
3. **Inserta un nodo `Function` (Code node)** justo después de armar el brief, antes del UPDATE. Llámalo `sanitize-competitors`.

**Código del nodo `sanitize-competitors`** (JavaScript, Node v18+):

```javascript
// Lee la lista canónica desde GitHub.
// Cachear durante la ejecución; no hace falta refrescar por cada item.

const COMPETITORS_YAML_URL = 'https://raw.githubusercontent.com/accesos-seo/Agents_Automations/main/automations/seo-content-swarm-engine/politicas/competidores-prohibidos.yaml';

// Si tu nodo n8n no soporta YAML nativo, define la lista en duro aquí
// (debe mantenerse en paralelo con el YAML del repo — la fuente de verdad
// es el YAML; este array es solo el caché operativo dentro de n8n):
const COMPETITORS = [
  { canonical: 'Blaze', aliases: ['Blaze', 'Blaze.com', 'Blaze Casino', 'Blaze Cassino', 'Blaze Bet', 'Blaze Brasil'] },
  { canonical: 'Stake', aliases: ['Stake.com', 'Stake Casino', 'Stake Cassino', 'Stake Bet', 'Stake Brasil', 'Stake.bet.br'], requiresBrandContext: true },
  { canonical: 'Betano', aliases: ['Betano', 'Betano Brasil', 'Betano.bet.br', 'Betano.com'] },
  { canonical: '1xBet', aliases: ['1xBet', '1x Bet', '1xBet Brasil', '1xBet.com'] },
  { canonical: 'F12Bet', aliases: ['F12Bet', 'F12.Bet', 'F12 Bet', 'F12Bet Brasil'] },
  { canonical: 'KTO', aliases: ['KTO', 'KTO Brasil', 'KTO Bet', 'KTO Cassino', 'KTO.bet.br'] },
  { canonical: 'Estrela Bet', aliases: ['Estrela Bet', 'EstrelaBet', 'Estrela.Bet', 'Estrelabet'] },
  { canonical: 'Pixbet', aliases: ['Pixbet', 'Pix.Bet', 'Pix Bet', 'PixBet Brasil'], requiresBrandContext: true },
  { canonical: 'Sportingbet', aliases: ['Sportingbet', 'Sporting Bet', 'Sporting.Bet', 'Sportingbet Brasil'] },
  { canonical: 'Superbet', aliases: ['Superbet', 'Super Bet', 'Super.Bet', 'Superbet Brasil'] },
  { canonical: 'Novibet', aliases: ['Novibet', 'Novi Bet', 'Novi.Bet', 'Novibet Brasil'] },
  { canonical: 'BetMGM', aliases: ['BetMGM', 'Bet MGM', 'BetMGM Brasil'] },
  { canonical: 'BetBoom', aliases: ['BetBoom', 'Bet Boom', 'Bet.Boom'] },
  { canonical: 'bet365', aliases: ['bet365', 'Bet 365', 'Bet365', 'bet365 Brasil'] },
  { canonical: 'Betnacional', aliases: ['Betnacional', 'Bet Nacional', 'Bet.Nacional', 'Betnacional Brasil'] },
  { canonical: 'Aposta Ganha', aliases: ['Aposta Ganha', 'ApostaGanha', 'Aposta.Ganha', 'ApostaGanha Brasil'] }
];

// Construye patrones regex con word-boundary case-insensitive.
// Para canonicals con `requiresBrandContext`, exige sufijo de marca
// (.com, Brasil, Casino, Cassino, Bet, .bet.br) inmediato.
const BRAND_SUFFIXES = ['\\.com', 'Brasil', 'Casino', 'Cassino', 'Bet', '\\.bet\\.br', 'casino', 'cassino', 'bet'];

function buildRegex(competitor) {
  const aliases = competitor.aliases.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (competitor.requiresBrandContext) {
    // Requiere que el canonical aparezca seguido (con espacio o punto) por uno de los sufijos de marca
    const canonicalEsc = competitor.canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const suffixGroup = BRAND_SUFFIXES.join('|');
    return new RegExp(`\\b(?:${aliases.join('|')})\\b|\\b${canonicalEsc}[\\s.](?:${suffixGroup})\\b`, 'gi');
  }
  return new RegExp(`\\b(?:${aliases.join('|')})\\b`, 'gi');
}

const PATTERNS = COMPETITORS.map(c => ({ canonical: c.canonical, regex: buildRegex(c) }));

function sanitizeString(s) {
  if (typeof s !== 'string') return { text: s, removed: [] };
  let text = s;
  const removed = [];
  for (const { canonical, regex } of PATTERNS) {
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      removed.push({ canonical, count: matches.length, samples: matches.slice(0, 3) });
      // Reemplaza por marcador neutro para no romper la sintaxis del párrafo.
      text = text.replace(regex, '[concorrente removido por política]');
    }
  }
  return { text, removed };
}

function walkAndSanitize(obj, removalsAccumulator, path = '$') {
  if (typeof obj === 'string') {
    const { text, removed } = sanitizeString(obj);
    if (removed.length) removalsAccumulator.push({ path, removed });
    return text;
  }
  if (Array.isArray(obj)) {
    return obj.map((v, i) => walkAndSanitize(v, removalsAccumulator, `${path}[${i}]`));
  }
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = walkAndSanitize(v, removalsAccumulator, `${path}.${k}`);
    }
    return out;
  }
  return obj;
}

// === Aplicación al brief_data ===
const briefData = $input.first().json.brief_data || $input.first().json;
const removals = [];
const sanitized = walkAndSanitize(briefData, removals);

return [{
  json: {
    brief_data: sanitized,
    sanitization_report: {
      total_competitors_found: removals.reduce((sum, r) => sum + r.removed.reduce((s, x) => s + x.count, 0), 0),
      removals,
      policy_version: 1,
      policy_url: COMPETITORS_YAML_URL,
      sanitized_at: new Date().toISOString()
    }
  }
}];
```

**Resultado esperado:** todas las menciones de los 16 competidores en cualquier string del brief quedan reemplazadas por `[concorrente removido por política]`. Si quedan 0, el brief sale limpio. Si hay > 0, el `sanitization_report` registra cuáles para auditoría.

### 4.2. Cambio #2 — Inyección del `brand_contract` (antes del UPDATE final)

**Objetivo:** entregar al writer un contrato verificable con productos propios, palabras prohibidas, regla de apertura y CTA template específicos de la marca. Esto resuelve el problema de genericidad (decisión D-003 fue manual; esto lo automatiza).

**Pasos en n8n:**

1. **Inserta un nodo HTTP Request** justo después del sanitizador, antes del UPDATE. Llámalo `fetch-brand-voice`. Configurado así:
   - Method: GET
   - URL: `https://raw.githubusercontent.com/accesos-seo/ops-control-plane/main/automation_projects/02-seo-content-generation/brands/{{ $json.brand_slug }}/brand-voice.md`
   - Para que el `brand_slug` esté disponible, necesitas un nodo anterior que lo derive desde `record.proyecto_id`. Ver §4.2.1.

2. **Inserta otro nodo Function** después de obtener el `brand-voice.md`. Llámalo `inject-brand-contract`.

#### 4.2.1. Resolución del `brand_slug` desde `proyecto_id`

Inserta un nodo Postgres / Supabase HTTP que ejecute:

```sql
SELECT
  LOWER(REPLACE(REPLACE(nombremarca, ' ', '-'), '_', '-')) AS brand_slug,
  nombremarca,
  dominioprincipal,
  paisobjetivo
FROM public.proyectos_seo
WHERE id = '{{ $('Webhook').first().json.record.proyecto_id }}';
```

Output esperado: `{ brand_slug: 'cassino-bet', nombremarca: 'Cassino Bet', dominioprincipal: 'cassino.bet.br', paisobjetivo: 'Brasil' }`

#### 4.2.2. Código del nodo `inject-brand-contract`

```javascript
// Recibe: el brief_data sanitizado + brand_voice_markdown del nodo anterior.
// Produce: brief_data con brand_contract embebido.

const brandSlug = $('resolve-brand-slug').first().json.brand_slug;
const brandVoiceMd = $('fetch-brand-voice').first().json.body || $('fetch-brand-voice').first().json.data;

// Extracción ligera de campos clave del brand-voice.md.
// Si el archivo tiene front-matter o secciones canónicas, parsea ahí.
// Mientras no exista parser estructurado, embebemos el markdown completo como contexto.

const brandContract = {
  brand_slug: brandSlug,
  brand_name: $('resolve-brand-slug').first().json.nombremarca,
  domain: $('resolve-brand-slug').first().json.dominioprincipal,
  market: $('resolve-brand-slug').first().json.paisobjetivo,
  policy_version: 1,
  brand_voice_md_url: `https://github.com/accesos-seo/ops-control-plane/blob/main/automation_projects/02-seo-content-generation/brands/${brandSlug}/brand-voice.md`,
  brand_voice_md: brandVoiceMd, // markdown completo cargado en el prompt del writer
  rules: {
    forbidden_competitors_url: 'https://raw.githubusercontent.com/accesos-seo/Agents_Automations/main/automations/seo-content-swarm-engine/politicas/competidores-prohibidos.yaml',
    opening_must_contain_data: true,  // 1ra oración debe contener RTP, probabilidad, vantagem da casa, odd o métrica equivalente
    must_use_pronoun: 'você',
    forbidden_pronouns: ['tu'],
    cta_must_include: ['marca', 'Pix', 'jogo responsável']
  },
  // Productos propios según marca — fuente: brand-voice.md
  branded_products: extractBrandedProducts(brandSlug),
  // Palabras a evitar (extracto operacional del brand-voice)
  forbidden_words_pt: [
    'incrível', 'fantástico', 'surpreendente', 'experiência única',
    'ganhe dinheiro', 'fica rico', 'retorno garantido', 'estratégia infalível',
    'alavancar', 'robusto', 'em conclusão', 'vale ressaltar',
    'é fundamental destacar', 'no cenário atual'
  ]
};

function extractBrandedProducts(slug) {
  // Hardcoded por ahora; idealmente se parsea del brand-voice.md
  // (sección §7 en cassino-bet/brand-voice.md).
  const PRODUCTS = {
    'cassino-bet': [
      'slots PG Soft', 'slots Pragmatic Play', 'slots Hacksaw Gaming',
      'roleta brasileira', 'roleta europeia', 'roleta ao vivo',
      'blackjack clássico', 'blackjack ao vivo',
      'crash games Aviator', 'crash games JetX', 'crash games Spaceman',
      'Ratinho Sortudo', 'roleta do Ratinho',
      'jackpot progressivo'
    ],
    'vera-bet': [
      'slots', 'live casino', 'crash games',
      'apostas esportivas', 'apostas ao vivo', 'Cash Out',
      'Aviator', 'JetX', 'Spaceman',
      'mercados de futebol', 'Handicap Asiático', 'Over/Under'
    ]
    // Otras marcas: pendiente de definir (D-002 fase 2).
  };
  return PRODUCTS[slug] || [];
}

// Embebemos el contract dentro del brief_data, no como campo aparte,
// para que el orquestador lo encuentre como parte del payload del brief.
const incoming = $input.first().json.brief_data;
const briefDataWithContract = {
  ...incoming,
  brand_contract: brandContract
};

return [{
  json: {
    brief_data: briefDataWithContract,
    ai_context: { brand_contract_injected: true, brand_contract_version: 1 }
  }
}];
```

### 4.3. Cambio #3 — Encadenar al UPDATE existente

El nodo que hoy hace el `UPDATE content_items SET brief_data = ...` debe consumir el output del `inject-brand-contract`. Verifica que el mapping del UPDATE use:

```sql
UPDATE content_items
SET
  brief_data = '{{ JSON.stringify($json.brief_data) }}'::jsonb,
  ai_context = '{{ JSON.stringify($json.ai_context) }}'::jsonb,
  ai_extraction_status = 'completed'
WHERE id = '{{ $('Webhook').first().json.record.id }}';
```

### 4.4. Cambio #4 — Logging de auditoría

Inserta un último nodo (después del UPDATE) que escriba en `content_generation_logs` con:

```sql
INSERT INTO public.content_generation_logs (
  content_item_id, run_id, step, agent_or_skill, status, operation_type, output_snapshot
) VALUES (
  '{{ $('Webhook').first().json.record.id }}',
  '{{ $execution.id }}',
  'brief_sanitized_and_contracted',
  'n8n-investigation',
  'ok',
  'other',
  '{{ JSON.stringify({
    sanitization_report: $('sanitize-competitors').first().json.sanitization_report,
    brand_contract_version: 1
  }) }}'::jsonb
);
```

Esto permite auditar cuántas redacciones se hicieron por artículo desde Supabase con:

```sql
SELECT content_item_id, output_snapshot->'sanitization_report' AS report, created_at
FROM content_generation_logs
WHERE step = 'brief_sanitized_and_contracted'
ORDER BY created_at DESC;
```

---

## 5. Dry-run de validación (obligatorio antes de marcar como cerrado)

### 5.1. Crear un content_item de prueba

Ejecuta en Supabase Light_House (`stjugsrkrweakvzmizpq`) — esto NO genera artículo real, solo crea el registro para que dispare el webhook:

```sql
INSERT INTO public.content_items (
  proyecto_id, client_id, title, main_keyword, content_type,
  language, country, brief_url, ai_extraction_status, status, created_at, updated_at
) VALUES (
  '6212e39b-8d87-4cbc-8700-cb25cc58336a',  -- Vera Bet
  (SELECT client_id FROM proyectos_seo WHERE id='6212e39b-8d87-4cbc-8700-cb25cc58336a'),
  '[DRY-RUN n8n] Apostas Online Brasil — Teste de Sanitização',
  'apostas online brasil teste',
  'blog_post',
  'pt',
  'Brasil',
  'https://example.com/brief-dry-run.txt',  -- brief_url cualquiera para disparar el trigger
  'pending',
  'draft',
  now(), now()
)
RETURNING id;
```

Guarda el `id` retornado. Este es el `<test_item_id>` para los pasos siguientes.

### 5.2. Esperar 30-60 segundos y verificar el brief generado

```sql
SELECT
  id,
  ai_extraction_status,
  brief_data ? 'brand_contract' AS tiene_brand_contract,
  brief_data->'brand_contract'->>'brand_slug' AS brand_slug,
  jsonb_array_length(COALESCE(brief_data->'brand_contract'->'branded_products', '[]'::jsonb)) AS productos_listados,
  (
    SELECT COUNT(*)
    FROM regexp_matches(
      brief_data::text,
      '\mBlaze\M|\mStake\.(com|Casino|Cassino|Bet|Brasil)|\mBetano\M|1xBet|F12Bet|\mKTO\M|Estrela Bet|Pixbet|Pix\.Bet|Sportingbet|Superbet|Novibet|BetMGM|BetBoom|bet365|Betnacional|Aposta Ganha',
      'gi'
    )
  ) AS menciones_competidores_residuales
FROM public.content_items
WHERE id = '<test_item_id>';
```

**Criterios de éxito:**

| Indicador | Valor esperado |
|---|---|
| `ai_extraction_status` | `completed` |
| `tiene_brand_contract` | `true` |
| `brand_slug` | `vera-bet` |
| `productos_listados` | ≥ 5 |
| `menciones_competidores_residuales` | **0** |

### 5.3. Verificar el log de auditoría

```sql
SELECT output_snapshot->'sanitization_report' AS report
FROM content_generation_logs
WHERE content_item_id = '<test_item_id>'
  AND step = 'brief_sanitized_and_contracted'
ORDER BY created_at DESC LIMIT 1;
```

Esperado: `report.total_competitors_found > 0` con detalle por canonical en `removals` (porque el brief crudo de SEO investigation típicamente trae varios licenciatarios brasileños).

### 5.4. Limpieza del registro de prueba

Una vez verificado, **NO publicar ese artículo**. Eliminarlo:

```sql
DELETE FROM public.content_items WHERE id = '<test_item_id>';
```

(Los logs en `content_generation_logs` quedan como auditoría.)

---

## 6. Confirmación al usuario y a Claude principal

Cuando termines, reporta en chat con este formato (literal):

```
✅ S-013 — Refuerzo n8n A completado

Cambios aplicados en workflow n8n (webhook /supabase-content-trigger):
  1. Nodo `sanitize-competitors` (Function): filtro de los 16 competidores prohibidos.
  2. Nodo `resolve-brand-slug` (Postgres): obtiene brand_slug desde proyecto_id.
  3. Nodo `fetch-brand-voice` (HTTP): carga brand-voice.md de la marca desde ops-control-plane.
  4. Nodo `inject-brand-contract` (Function): construye brand_contract y lo embebe en brief_data.
  5. Nodo de logging: registra brief_sanitized_and_contracted en content_generation_logs.

Dry-run validado:
  - test_item_id: <uuid>
  - tiene_brand_contract: true
  - productos_listados: <N>
  - menciones_competidores_residuales: 0
  - total_competitors_found en sanitización: <N>
  - registro eliminado tras verificación.

Workflow en n8n: <link al workflow>
Versión del workflow: <vN>
```

Si algo falló:

```
❌ S-013 — Refuerzo n8n A incompleto

Bloqueado en: <paso>
Razón: <descripción>
Lo que necesito: <decisión humana o acceso adicional>
```

Y actualiza `WORK_IN_PROGRESS.md` moviendo tu fila a "Sesiones cerradas" con el resultado.

---

## 7. Qué NO hacer

- **No publicar el artículo de prueba.** Es para verificar el brief, no para producción.
- **No modificar el trigger SQL `fn_trigger_seo_investigation`** desde n8n. El trigger funciona; el problema es el contenido del brief, no el disparo.
- **No cambiar la URL del webhook ni el método.** Si los cambias, el trigger SQL deja de funcionar y rompes el pipeline entero.
- **No añadir competidores hardcodeados que no estén en `competidores-prohibidos.yaml`.** La lista canónica vive en este repo; si necesitas añadir uno nuevo, hablar primero con Producto.
- **No tocar otra área distinta de Briefs (B).** Si encuentras un problema downstream (Writer, Validator), regístralo como pendiente en `AREAS.md` o avísale al usuario — no entres a tocarlo.

---

## 8. Si te bloqueas

- **No tienes acceso al workflow de n8n específico:** pide al usuario el link directo al workflow + credenciales si hace falta.
- **El workflow tiene una arquitectura que no calza con esta guía** (ej. usa un solo nodo LLM que devuelve todo el brief incluyendo el `contexto_investigacion`): igual aplica la lógica — el nodo `sanitize-competitors` opera sobre el output del LLM antes de persistir. La idea es defensa en profundidad: el LLM puede equivocarse, el sanitizador no.
- **La lista de competidores cambia mañana:** la fuente de verdad es el YAML en el repo. n8n debería pull-ear la lista periódicamente o por evento. Por ahora, mantén el array hardcodeado en el nodo como fallback y documenta que el sync con el YAML queda pendiente.

---

## 9. Próxima fase tras tu cierre

Cuando tu sesión esté cerrada, los handovers paralelos en marcha son:

- **S-009** — Recalibrar contract gate + meta_description automática + Quality Enforcer (área D, en curso por `Claude-chat-calidad-contenido`).
- **S-014** — Aplicar los 5 patches copy/paste en `ops-control-plane` (lo hace el usuario directamente en GitHub UI según `propuestas-ops-control-plane/README.md`).

Pero esos son trabajos para otros chats — no los tomes en esta sesión.
