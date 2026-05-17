# Audio SEO — Estado actual y hoja de ruta TTS determinista

> Presentación interna · Mayo 2026

---

## ¿Qué problema tenemos?

El pipeline de SEO genera un audio narrado por artículo (`seo-content-audio-skill` v31).  
Hoy ese audio **no es determinista**: la IA analiza el contexto y redacta libremente el guion antes de hablar.

| Dimensión | Comportamiento actual |
|---|---|
| **Texto narrado** | La IA lo redacta según su criterio; puede resumir, omitir o reformular partes |
| **Consistencia entre ejecuciones** | Dos ejecuciones del mismo artículo producen audios distintos |
| **Velocidad, tono, pausas** | Varía con cada modelo / versión |
| **Posibilidad de revisión editorial** | No: el guion no existe como artefacto editable |
| **Traducción confiable** | No: si el guion varía, la traducción también varía |

**Raíz del problema:** estamos usando un LLM de generación de texto + voz al mismo tiempo.  
Lo que necesitamos es separar los dos pasos: primero el texto exacto, luego la voz a partir de ese texto.

---

## ¿Por qué no OpenRouter?

OpenRouter es el proxy LLM que usamos para modelos de texto y visión.  
**No expone modelos TTS** — solo rutea completions de texto.  
Los proveedores de TTS tienen APIs propias y especializadas que requieren integración directa.

---

## Modelo a adoptar: TTS determinista en 2 fases

```
[Artículo HTML]  →  Fase 1: Preparar guion  →  [Texto plano limpio]
                                                        ↓
                                              Fase 2: TTS API
                                                        ↓
                                              [Audio .mp3 idéntico cada vez]
```

**Fase 1 — Preparar el guion** (ya tenemos el texto; solo limpiar)
- Quitar etiquetas HTML, footers, CTAs
- Normalizar siglas, números y URLs para lectura en voz alta
- El guion queda persistido como artefacto editable en `content_audio_items`

**Fase 2 — TTS API** (nueva integración)
- Se envía el texto limpio a la API
- La API devuelve un `.mp3` idéntico para el mismo texto + mismos parámetros
- Resultado: totalmente reproducible, auditable y traducible

---

## Opciones de proveedor TTS

| Proveedor | Voces | Idiomas | Calidad | Determinismo | Notas |
|---|---|---|---|---|---|
| **Google Cloud TTS** | 380+ (Standard + WaveNet + Neural2) | 50+ | ★★★★ | ✅ Total | API madura; integración directa con GCP |
| **Gemini 2.5 Flash/Pro Audio** | Nativas del modelo | ES, EN y más | ★★★★★ | ✅ Con `seed` fijo | Audio natural excepcional; mismo ecosistema Google AI Studio |
| **OpenAI TTS** (`tts-1-hd`) | 6 voces | Multilingüe | ★★★★ | ✅ Total | Sencilla de integrar; costo bajo |
| **ElevenLabs** | 1000+ (clonación de voz) | 30+ | ★★★★★ | ✅ Total | La más natural; costo más alto |

### Recomendación: Gemini 2.5 Flash Audio

Google lanzó generación de audio nativa en Gemini 2.5. Calidad de voz excepcional, mismo ecosistema que ya manejamos (Google AI Studio / Vertex AI), y permite fijar seed para reproducibilidad. Es la opción con mejor relación calidad / integración para nuestra plataforma.

---

## Próximos pasos para implementarlo

| Paso | Tarea | Responsable | Estimado |
|---|---|---|---|
| 1 | Evaluar Gemini 2.5 Flash Audio con 5 artículos reales | Tech | 1 día |
| 2 | Agregar columna `audio_script` a `content_audio_items` para persistir guion | Tech | ½ día |
| 3 | Actualizar `seo-content-audio-skill` v32: separar limpieza de guion y llamada TTS | Tech | 2 días |
| 4 | Configurar secret `GEMINI_API_KEY` (o `GOOGLE_TTS_API_KEY`) en Supabase Light_House | Ops | ½ día |
| 5 | Prueba A/B: regenerar 20 artículos existentes; comparar con audios actuales | QA | 1 día |
| 6 | Activar en producción; deprecar lógica de audio generativo | Tech | ½ día |

**Total estimado: ~5 días de trabajo real**

---

## Resultado esperado

- El mismo artículo siempre produce el mismo audio
- El guion queda editable: el equipo puede corregirlo antes de generar el `.mp3`
- Las traducciones a otros idiomas son confiables (el texto de origen es fijo)
- Costos predecibles: TTS cobra por caracteres, no por tokens de LLM
