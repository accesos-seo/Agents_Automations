# PATCH — `seo-content-audio-skill` v15 · Gemini TTS via OpenRouter

**Área:** A. Audio — Skill TTS  
**Versión destino:** v15  
**Versión actual:** v33 en Supabase (v14-literal-script)  
**Prioridad:** Alta — resuelve el problema de audio no determinista  
**Repo de implementación:** `accesos-seo/ops-control-plane`  
**Path:** `automation_projects/02-seo-content-generation/edge-functions/seo-content-audio-skill/`

---

## Resumen del cambio

Reemplazar el modelo de audio actual (LLM que genera texto+voz al mismo tiempo) por `google/gemini-3.1-flash-tts-preview` vía OpenRouter. Este modelo es **TTS puro**: recibe texto plano y lo convierte a audio sin razonar, sin parafrasear. Usa la misma `OPENROUTER_API_KEY` que ya existe en el proyecto.

---

## Análisis de impacto — qué cambia y qué no

| Componente | Cambia | Qué cambia |
|---|---|---|
| `seo-content-audio-skill` (Edge Function) | ✅ Sí | Endpoint de la API, formato del request, parsing de la respuesta |
| `OPENROUTER_API_KEY` (secret) | ❌ No | Ya existe. Se reutiliza. |
| `content_audio_items` (tabla) | ⚠️ Parcial | Añadir columnas `audio_script`, `prompt_version`. No se rompe nada existente. |
| `audio_voice_profiles` (tabla) | ✅ Sí | Actualizar `voice_id` y `provider` a voces Gemini |
| `trg_request_content_audio_generation` (trigger) | ❌ No | No toca el trigger |
| Pipeline orquestador | ❌ No | El skill es atómico. El orquestador no sabe qué modelo usa internamente. |
| Storage bucket `content-assets` | ❌ No | El audio sigue subiendo como `.mp3` al mismo path |
| `content_items.audio_url` | ❌ No | El URL final no cambia |

**Riesgo de rotura:** Bajo. El único cambio visible hacia afuera es que el audio suena diferente (más natural) y es idéntico en cada re-generación.

---

## Paso 1 — Migración SQL (ejecutar antes del deploy)

```sql
-- 1. Añadir columnas de trazabilidad al audio (no-breaking: solo ADD COLUMN IF NOT EXISTS)
ALTER TABLE content_audio_items
  ADD COLUMN IF NOT EXISTS audio_script        TEXT,
  ADD COLUMN IF NOT EXISTS audio_script_chars  INTEGER GENERATED ALWAYS AS (length(audio_script)) STORED,
  ADD COLUMN IF NOT EXISTS prompt_version      TEXT DEFAULT 'v14';

-- 2. Actualizar perfiles de voz existentes a voces Gemini
-- IMPORTANTE: ejecutar por separado, verificar filas antes de correr

-- Ver filas actuales primero:
-- SELECT id, language_code, profile_name, voice_id, provider FROM audio_voice_profiles;

-- Actualizar voces por idioma (ajustar los IDs según lo que devuelva el SELECT anterior):
UPDATE audio_voice_profiles
SET
  voice_id  = 'Schedar',   -- voz masculina profesional
  provider  = 'google',
  model     = 'google/gemini-3.1-flash-tts-preview'
WHERE language_code = 'es-MX'
  AND profile_name ILIKE '%male%' OR profile_name ILIKE '%masculin%';

UPDATE audio_voice_profiles
SET
  voice_id  = 'Sulafat',   -- voz femenina cálida
  provider  = 'google',
  model     = 'google/gemini-3.1-flash-tts-preview'
WHERE language_code = 'es-MX'
  AND (profile_name ILIKE '%female%' OR profile_name ILIKE '%femenin%');

UPDATE audio_voice_profiles
SET
  voice_id  = 'Charon',    -- voz masculina informativa
  provider  = 'google',
  model     = 'google/gemini-3.1-flash-tts-preview'
WHERE language_code = 'pt-BR'
  AND (profile_name ILIKE '%male%' OR profile_name ILIKE '%masculin%');

UPDATE audio_voice_profiles
SET
  voice_id  = 'Aoede',     -- voz femenina clara
  provider  = 'google',
  model     = 'google/gemini-3.1-flash-tts-preview'
WHERE language_code = 'pt-BR'
  AND (profile_name ILIKE '%female%' OR profile_name ILIKE '%femenin%');

UPDATE audio_voice_profiles
SET
  voice_id  = 'Kore',      -- voz femenina firme
  provider  = 'google',
  model     = 'google/gemini-3.1-flash-tts-preview'
WHERE language_code = 'en-US';

-- 3. Verificar resultado:
SELECT language_code, profile_name, voice_id, provider, model FROM audio_voice_profiles;
```

**Referencia de voces Gemini disponibles** (para elegir si se quiere cambiar después):

| Voz | Género | Carácter | Recomendada para |
|---|---|---|---|
| Aoede | F | Clara, brillante | pt-BR artículos |
| Charon | M | Informativo, serio | pt-BR artículos |
| Fenrir | M | Enérgico | Podcasts |
| Kore | F | Firme, profesional | en-US artículos |
| Leda | F | Juvenil | Contenido lifestyle |
| Orus | M | Firme | en-US artículos |
| Puck | M | Dinámico | Podcasts |
| Schedar | M | Neutro, uniforme | es-MX artículos |
| Sulafat | F | Cálida | es-MX artículos |
| Zephyr | F | Luminosa | Lifestyle |

---

## Paso 2 — Código del Edge Function (reemplazar el bloque de llamada al modelo)

El edge function actual tiene una función que construye y ejecuta la llamada al modelo. Localizar el bloque donde se hace `fetch` a OpenRouter o a la API de audio y reemplazarlo con lo siguiente:

### 2a. Función de limpieza del HTML (agregar si no existe)

```typescript
function cleanArticleForAudio(html: string): string {
  return html
    .replace(/<!--.*?-->/gs, '')
    .replace(/<(script|style|noscript)[^>]*>.*?<\/\1>/gis, '')
    .replace(/copy-article-block[\s\S]*?\/copy-article-block/gi, '')
    .replace(/ESTRATEGIA DE CONTENIDO[\s\S]*?(?=<h[1-6]|$)/gi, '')
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n$1.\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '— $1. ')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

### 2b. Función principal de generación de audio (REEMPLAZAR la llamada al modelo anterior)

```typescript
async function generateAudioWithGeminiTTS(params: {
  articleContent: string;
  voiceId: string;           // viene de audio_voice_profiles.voice_id
  languageCode: string;      // 'es-MX' | 'pt-BR' | 'en-US'
  contentItemId: string;     // para logs
}): Promise<{ audioBuffer: ArrayBuffer; audioScript: string; chars: number }> {

  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY no configurado');

  // 1. Preparar el guion limpio (texto plano, sin HTML)
  const audioScript = cleanArticleForAudio(params.articleContent);

  // Guardia: límite de 15.000 caracteres por request de Gemini TTS
  const MAX_CHARS = 15000;
  const scriptToSend = audioScript.length > MAX_CHARS
    ? audioScript.substring(0, MAX_CHARS)
    : audioScript;

  if (audioScript.length > MAX_CHARS) {
    console.warn(`[audio-skill] Texto truncado: ${audioScript.length} chars → ${MAX_CHARS}. content_item_id=${params.contentItemId}`);
  }

  // 2. Llamar a OpenRouter — endpoint TTS compatible con OpenAI
  const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://seolabagency.com',  // requerido por OpenRouter
      'X-Title': 'SEO Content Audio Skill',
    },
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-tts-preview',
      input: scriptToSend,
      voice: params.voiceId,           // ej: 'Schedar', 'Aoede', 'Kore'
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter TTS error ${response.status}: ${errorBody}`);
  }

  // 3. La respuesta es el binario del audio directamente (stream mp3)
  const audioBuffer = await response.arrayBuffer();

  return {
    audioBuffer,
    audioScript,
    chars: audioScript.length,
  };
}
```

### 2c. Actualizar el lugar donde se persiste el resultado en `content_audio_items`

Localizar el `INSERT` o `UPDATE` en `content_audio_items` y añadir los nuevos campos:

```typescript
// ANTES (esquema antiguo):
await supabase.from('content_audio_items').upsert({
  content_item_id: contentItemId,
  audio_url: publicUrl,
  status: 'ready',
  // ...otros campos existentes
});

// DESPUÉS (añadir audio_script y prompt_version):
await supabase.from('content_audio_items').upsert({
  content_item_id: contentItemId,
  audio_url: publicUrl,
  status: 'ready',
  audio_script: result.audioScript,          // ← NUEVO: guion editable
  prompt_version: 'v15-gemini-tts',          // ← NUEVO: trazabilidad de versión
  // ...resto de campos existentes sin cambios
});
```

---

## Paso 3 — Verificar secret en Supabase

```bash
# El secret ya debe existir. Verificar en:
# Supabase Light_House → Edge Functions → Secrets → buscar OPENROUTER_API_KEY

# Si no existe (improbable pero verificar):
# Copiar el valor desde la configuración actual del orquestador
# y crearlo como nuevo secret con el mismo nombre.
```

---

## Paso 4 — Deploy y validación

```bash
# 1. Deploy del edge function actualizado
supabase functions deploy seo-content-audio-skill --project-ref stjugsrkrweakvzmizpq

# 2. Prueba manual con un artículo real (usar uno de los 7 artículos pt-BR de cassino-bet o vera-bet):
# Actualizar content_items SET audio_status = 'pending' WHERE id = '<uuid>'
# El trigger lo recogerá y ejecutará el nuevo skill

# 3. Verificar resultado:
SELECT
  cai.content_item_id,
  cai.audio_url,
  cai.audio_script,
  cai.prompt_version,
  cai.audio_script_chars,
  cai.status,
  cai.created_at
FROM content_audio_items cai
WHERE cai.content_item_id = '<uuid>'
ORDER BY cai.created_at DESC
LIMIT 1;

# 4. Escuchar el audio en el URL devuelto y verificar que:
#    - Narra el artículo completo, sin omisiones
#    - No añade frases inventadas
#    - El idioma es correcto (pt-BR para cassino/vera, es-MX para el resto)
#    - Suena natural y profesional
```

---

## Paso 5 — Rollback (si algo falla)

Si el deploy falla o el audio sale mal:

```bash
# Revertir a la versión anterior en Supabase:
supabase functions deploy seo-content-audio-skill --project-ref stjugsrkrweakvzmizpq
# (deployar el archivo anterior sin los cambios)

# O hacer rollback desde el panel de Supabase:
# Edge Functions → seo-content-audio-skill → Versions → seleccionar v14 → Restore
```

Los datos en `content_audio_items` no se borran. Los audios viejos siguen en Storage.  
Los nuevos campos `audio_script` y `prompt_version` son `NULL` en filas anteriores — no rompe nada.

---

## Checklist de validación antes de activar en todas las marcas

- [ ] SQL ejecutado sin errores: `audio_voice_profiles` actualizado
- [ ] Columnas `audio_script` y `prompt_version` creadas en `content_audio_items`
- [ ] Deploy de v15 exitoso en Light_House
- [ ] Audio de prueba generado para 1 artículo pt-BR (cassino-bet)
- [ ] Audio de prueba generado para 1 artículo es-MX (cualquier marca)
- [ ] Verificar que `audio_script` se persistió correctamente (texto limpio, sin HTML)
- [ ] Verificar que `prompt_version = 'v15-gemini-tts'` en la fila
- [ ] Escuchar ambos audios: narración literal del artículo ✓
- [ ] Re-generar el mismo artículo: el audio es idéntico ✓ (determinismo)
- [ ] Registrar decisión D-008 en README.md de esta automatización

---

## Registro de decisión (añadir a README.md sección 7.5)

```markdown
| D-009 | 2026-05-17 | Audio v15: migración a Gemini TTS via OpenRouter | Modelo `google/gemini-3.1-flash-tts-preview` vía `OPENROUTER_API_KEY` existente. TTS puro = determinista por arquitectura. Endpoint `/v1/audio/speech`. Voces: Schedar/Sulafat (es-MX), Charon/Aoede (pt-BR), Kore (en-US). |
```
