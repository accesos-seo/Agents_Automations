# PATCH — `seo-content-audio-skill` · Prompt de narración literal

**Versión destino:** v15 (o siguiente disponible)  
**Área:** A. Audio — Skill TTS  
**Problema que resuelve:** la IA improvisa el guion en lugar de narrar el artículo tal como está escrito.

---

## Contexto del problema

El skill actual llama a un modelo de audio (p. ej. `gpt-4o-audio-preview` o `gemini-2.5-flash`) sin un system prompt suficientemente restrictivo. El modelo recibe el artículo y, por naturaleza, empieza a parafrasear, resumir, o añadir frases de transición que no existen en el texto original. Esto hace que:

- El audio nunca es igual aunque el artículo no haya cambiado.
- El equipo no puede editar el guion porque no existe como artefacto previo.
- Las traducciones del audio no pueden validarse contra una fuente fija.

La solución es un **system prompt de contención total** + un **user message que entrega el guion limpio ya preparado**, para que el modelo haga exclusivamente síntesis de voz, no redacción.

---

## Cómo integrar este prompt en el skill

```typescript
// En seo-content-audio-skill — función buildAudioPayload()

const systemPrompt = SYSTEM_PROMPT_AUDIO_NARRATOR;   // bloque A (abajo)
const userMessage  = buildUserMessage(cleanScript, voiceProfile, brandSlug); // bloque B (abajo)

// Para Gemini 2.5 Flash Audio:
const response = await gemini.generateContent({
  model: 'gemini-2.5-flash-preview-tts',       // o el modelo de audio activo
  contents: [{ role: 'user', parts: [{ text: userMessage }] }],
  systemInstruction: { parts: [{ text: systemPrompt }] },
  generationConfig: {
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: voiceProfile.voice_id }
      }
    },
    seed: deterministicSeedFrom(contentItemId),  // garantiza reproducibilidad
  },
});
```

---

## Bloque A — SYSTEM PROMPT (fijo, no varía por artículo)

```
Eres un locutor profesional. Tu única función es leer en voz alta el texto que recibes, sin cambiar ninguna palabra.

REGLAS ABSOLUTAS — ninguna tiene excepción:
1. Lee exactamente lo que está escrito. No parafrasees, no resumas, no añadas introducciones ("En este artículo veremos…"), no añadas cierres ("Hasta aquí el artículo…"), no uses frases de transición que no estén en el texto.
2. No omitas ningún párrafo, título o fragmento. Si el texto dice "Conclusión", dilo. Si dice "Preguntas frecuentes", dilo.
3. No corrijas el texto. Si hay una oración larga, léela larga. Si hay una lista, léela ítem por ítem.
4. No menciones ningún competidor bajo ninguna circunstancia, aunque aparezca en el texto (en ese caso, sáltate esa palabra en silencio y continúa).
5. No cambies el idioma del texto. Si el texto está en pt-BR, habla en pt-BR. Si está en es-MX, habla en es-MX. Si está en en-US, habla en en-US.
6. No añadas opinión, no evalúes el contenido, no hagas preguntas retóricas que no estén escritas.
7. Tu output es únicamente audio. No respondas con texto.

GUION DE VOZ:
- Tono: informativo, calmado y profesional. No dramático, no entusiasta.
- Velocidad: natural para lectura de artículo. Ni rápido ni lento.
- Pausas: aplica pausa corta (0.3 s) al final de cada oración, pausa media (0.6 s) al final de cada párrafo o título H2/H3, pausa larga (1 s) antes de una sección nueva.
- Énfasis: solo en palabras que estén en MAYÚSCULAS o entre asteriscos en el texto original. Ningún otro énfasis.
```

---

## Bloque B — USER MESSAGE (dinámico, se construye por artículo)

```
Lee el siguiente artículo de principio a fin, siguiendo las reglas del system prompt.

MARCA: {{brand_slug}}
IDIOMA: {{language_code}}          ← es-MX | pt-BR | en-US
VOZ ASIGNADA: {{voice_profile_name}}

---INICIO DEL GUION---
{{clean_script}}
---FIN DEL GUION---
```

**Variables que el skill debe inyectar:**

| Variable | Fuente en Supabase |
|---|---|
| `{{brand_slug}}` | `content_items.brand_slug` |
| `{{language_code}}` | `audio_voice_profiles.language_code` |
| `{{voice_profile_name}}` | `audio_voice_profiles.profile_name` |
| `{{clean_script}}` | resultado de `cleanArticleForAudio(content_items.article_content)` |

---

## Función `cleanArticleForAudio` — qué debe hacer antes de enviar el guion

Esta limpieza se aplica al `article_content` (HTML) antes de ponerlo en `{{clean_script}}`. El resultado se persiste en `content_audio_items.audio_script` para que sea editable.

```typescript
function cleanArticleForAudio(html: string): string {
  return html
    // 1. Eliminar bloques internos del CMS que no son contenido editorial
    .replace(/<!--.*?-->/gs, '')
    .replace(/<(script|style|noscript)[^>]*>.*?<\/\1>/gis, '')
    .replace(/copy-article-block[\s\S]*?\/copy-article-block/gi, '')
    .replace(/ESTRATEGIA DE CONTENIDO[\s\S]*?(?=<h[1-6]|$)/gi, '')

    // 2. Convertir etiquetas estructurales a pausas/énfasis legibles
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n$1.\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '— $1. ')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n')
    .replace(/<br\s*\/?>/gi, '\n')

    // 3. Strip de todas las etiquetas HTML restantes
    .replace(/<[^>]+>/g, ' ')

    // 4. Decodificar entidades HTML
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

    // 5. Limpiar espacios y líneas vacías múltiples
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

---

## Función `deterministicSeedFrom` — reproducibilidad garantizada

```typescript
function deterministicSeedFrom(contentItemId: string): number {
  // Convierte el UUID a un entero de 32 bits para usar como seed
  const hash = contentItemId.replace(/-/g, '');
  return parseInt(hash.substring(0, 8), 16);
}
```

Usar siempre el mismo `seed` para el mismo `content_item_id` garantiza que el audio generado es idéntico en cada re-generación, incluso si el modelo de IA tiene stochasticity interna.

---

## Cambios de schema requeridos

```sql
-- Persistir el guion limpio como artefacto editable (antes de enviar a la API de audio)
ALTER TABLE content_audio_items
  ADD COLUMN IF NOT EXISTS audio_script TEXT,
  ADD COLUMN IF NOT EXISTS audio_script_chars INTEGER GENERATED ALWAYS AS (length(audio_script)) STORED,
  ADD COLUMN IF NOT EXISTS audio_seed BIGINT,
  ADD COLUMN IF NOT EXISTS prompt_version TEXT DEFAULT 'v15';
```

---

## Reglas de negocio que el prompt ya cubre

| Regla | Cobertura en el prompt |
|---|---|
| Cero menciones de competidores | Regla 4 del system prompt: saltar en silencio |
| Idioma correcto por marca | Regla 5 + variable `{{language_code}}` |
| Sin frases inventadas | Regla 1: literalidad total |
| Reproducibilidad | `seed` fijo por `content_item_id` |
| Guion editable por el equipo | Persistido en `audio_script` antes de enviar |
| Truncado visible | `audio_script_chars` alerta si supera 16.000 chars |

---

## Qué NO hace este prompt (fuera de alcance)

- No selecciona el modelo de audio: eso lo decide el skill según `audio_voice_profiles.provider`.
- No define el idioma de la voz sintética: lo toma de `voice_id` en el perfil.
- No gestiona el upload al Storage ni la URL final.
- No reemplaza la migración a TTS puro (Gemini TTS / OpenAI TTS / ElevenLabs): ese sigue siendo el Camino B estratégico. Este patch es el Camino A de contención mientras se decide el proveedor.
