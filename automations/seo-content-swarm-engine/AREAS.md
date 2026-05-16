# Áreas de trabajo — SEO Content Swarm Engine

> El proyecto está dividido en áreas separables para que múltiples agentes puedan trabajar en paralelo sin pisarse.
> **Cada área = un agente activo a la vez.** Coordina vía [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).

---

## A. Audio — Skill TTS

**Responsabilidad:** generación, calidad y mantenimiento del audio "listen this article" y "podcast summary".

**Archivos / componentes que tocas:**
- Edge Function `seo-content-audio-skill` (versión actual: v33 / v14-literal-script)
- Tabla `content_audio_items` (Light_House)
- Tabla `audio_voice_profiles` (Light_House)
- Función SQL `request_content_audio_generation()`

**Decisiones tomadas que aplican aquí:** D-001 (v13 limpieza HTML), D-004 (v14 literal).

**Pendientes en esta área:**
- Decidir Camino B: migrar a TTS puro (OpenAI TTS, ElevenLabs, Google, Azure) en vez de `gpt-audio-mini`.
- Race condition en `INSERT content_audio_items` (los 7 audio_fatal documentados): aplicar `ON CONFLICT DO NOTHING`.
- Truncado silencioso a 16.000 chars: añadir evento `audio_truncated` con alerta.

**Áreas con las que choca:** ninguna (audio es atómico).

---

## B. Briefs / Investigación SEO (n8n A)

**Responsabilidad:** calidad del `brief_data` que llega al writer. Filtrado de competidores. Inyección de `brand_contract` con productos propios.

**Archivos / componentes que tocas:**
- Trigger `tr_investigar_seo_en_n8n` (Light_House)
- Función SQL `fn_trigger_seo_investigation()` (Light_House)
- Webhook n8n externo: `estancias-atlas-n8n.heh8a3.easypanel.host/...`
- Campo `content_items.brief_data` (jsonb)

**Decisiones tomadas que aplican aquí:** D-002 (política de competidores — capa 5).

**Pendientes en esta área:**
- Refuerzo de n8n A: filtrar competidores de `contexto_investigacion` antes de devolver.
- Inyección de `brand_contract` con: lista de productos propios, palabras prohibidas, regla de "abre con dato".
- Documentar exactamente qué hace n8n A hoy (es caja negra). La URL del webhook está dentro de `fn_trigger_seo_investigation`.

**Áreas con las que choca:** Writer (consume brief), Validator (mide cumplimiento del contrato).

---

## C. Writer / Agentes generadores

**Responsabilidad:** prompts y comportamiento de los agentes que generan el artículo. Mejora de tono, adherencia al brand voice, ejecución de secciones.

**Archivos / componentes que tocas:**
- Edge Function `seo-content-orchestrator` (legacy v16, productiva)
- Agentes registrados en `agent_registry`: `seo-expert`, `content-writer`, `optimizer`
- Edge Function `seo-content-swarm-router` (v3.1, apagada)
- Recursos en `ops-control-plane:automation_projects/02-seo-content-generation/agents/`

**Decisiones tomadas que aplican aquí:** D-002 (política de competidores — capa 6), D-003 (los 7 artículos reescritos manualmente como referencia de calidad).

**Pendientes en esta área:**
- Inyectar `brand_contract` cargado por brand-context-loader directamente en system prompt del writer.
- Reforzar prompt con: prohibición de competidores, palabras prohibidas, regla de apertura con dato.
- Decidir si activar swarm v3.1 (con `brief-contract-agent` + `section-writer-agent` + `editor-agent`).
- Plan piloto: rollout en `armor-corp` antes de extender a las demás marcas.

**Áreas con las que choca:** Briefs (input), Validator (output).

---

## D. Contract validator / Quality gate

**Responsabilidad:** verificación pre-publicación de que el artículo cumple brand voice, productos propios, cero competidores, FAQ presente, CTA correcto, extensión.

**Archivos / componentes que tocas:**
- Edge Function `seo-content-contract-validator-agent` (v3.1, desplegada pero apagada)
- Step `sectioned_contract_gate` en el orquestador legacy
- Tabla `content_generation_logs` (filtros por step)
- Tabla `content_generation_alerts` (124 abiertas hoy)

**Decisiones tomadas que aplican aquí:** D-002 (política de competidores — capa 7).

**Pendientes en esta área:**
- Añadir regla bloqueante `forbidden_competitors_check` (severidad high).
- Añadir regla `brand_mentions_min` (mínimo N menciones de la marca emisora).
- Añadir regla `branded_products_min` (mínimo M productos propios mencionados).
- Añadir regla `opening_data_check` (la primera oración debe contener un dato cuantificable).
- Limpiar las 124 alertas abiertas: bulk close para causas ya resueltas + 1 a 1 para casos complejos.

**Áreas con las que choca:** Writer (rechaza output del writer), Briefs (mide cumplimiento del brand_contract).

---

## E. Imágenes — Skill de imagen destacada

**Responsabilidad:** generación de imagen destacada del artículo. Selección de proveedor. Persistencia en Storage.

**Archivos / componentes que tocas:**
- Edge Function `seo-content-image-skill` (v37)
- Trigger `trg_seo_content_image_generation` (Light_House)
- Función SQL `trigger_seo_content_image_generation()`
- Storage bucket `content-assets`
- Campo `content_items.og_image_url`

**Estado crítico hoy:**
- 61 fallos recientes: `black-forest-labs/flux-1.1-pro` retirado de OpenRouter; `flux.2-pro` da 404 "no endpoints with image+text modalities".
- Fallback OpenAI Images bloqueado por billing hard limit.
- Workaround manual: `google/gemini-3-pro-image-preview` funcionando vía `manual-consolidation-v25`.

**Pendientes en esta área:**
- Decidir proveedor oficial: Flux reparado / Gemini-3-pro-image / OpenAI repuesta / ElevenLabs Images / otro.
- Implementar y validar end-to-end con armor-corp como piloto.
- Trigger `trg_block_svg_fallback_og_image` (existente) ya rechaza SVG — mantener.

**Áreas con las que choca:** ninguna (imagen es independiente del texto y del audio).

---

## F. ILS — Internal Linking Strategy

**Responsabilidad:** detección de oportunidades de enlace interno entre artículos. Inserción contextual.

**Archivos / componentes que tocas:**
- Edge Function `ils-orchestrator` (v32)
- Edge Function `ils-contextual-injector` (v19)
- Edge Function `seo-internal-linking-skill` (v15)
- Tablas: `internal_link_candidates` (809), `internal_link_decisions` (76), `ils_pipeline_runs` (25)
- Trigger `trg_ils_on_audio_ready` y `trg_ils_on_image_ready`

**Estado:** 22 ok / 1 failed / 2 skipped. Pipeline saludable.

**Pendientes en esta área:**
- Bug detectado: 1 fallo por duplicate key en `internal_link_decisions_source_content_id_target_content_id_key`. Aplicar dedupe pre-insert.
- Revisar criterio de matching: muchos artículos tienen "Sin inyección automática de enlaces en el cuerpo (el texto del artículo no tuvo coincidencias con los términos clave de los candidatos)". Decidir si el criterio es demasiado estricto.
- Migrar el bloque `ESTRATEGIA DE CONTENIDO` que hoy se inyecta dentro de `article_content` a una tabla de metadatos separada (hoy contamina el output).

**Áreas con las que choca:** Enrichment (ILS dispara enrichment).

---

## G. Enrichment — Post-publicación

**Responsabilidad:** videos, tablas comparativas, schema markup, FAQ adicional para artículos publicados.

**Archivos / componentes que tocas:**
- Edge Function `content-enrichment-skill` (v29)
- Trigger `trg_enrichment_on_ils_completed`
- Tabla `enrichment_pipeline_runs` (35)
- Campos `content_items.enrichment_status`, `enrichment_elements`, `enrichment_completed_at`

**Estado crítico:**
- 33 completados, 2 failed, **895 pending**.
- La cola pending vino de artículos antiguos pre-ILS que nunca se procesaron.

**Pendientes en esta área:**
- Decidir destino de los 895 pending: backfill / marcar `skipped` / ignorar.
- Confirmar que el trigger se dispara correctamente para artículos nuevos.

**Áreas con las que choca:** ILS (input).

---

## H. Política / Governance — Brand voice y reglas globales

**Responsabilidad:** mantener las reglas no negociables, la política de competidores, los brand-voice canónicos, y los handovers de gobierno.

**Archivos / componentes que tocas:**
- [`referencias/politica-competidores-prohibidos.md`](../../referencias/politica-competidores-prohibidos.md)
- [`politicas/competidores-prohibidos.yaml`](politicas/competidores-prohibidos.yaml)
- [`propuestas-ops-control-plane/`](propuestas-ops-control-plane/)
- Brand-voice de cada marca en `ops-control-plane:automation_projects/02-seo-content-generation/brands/<brand_slug>/brand-voice.md`
- Auditoría de referencia en `ops-control-plane:automation_projects/02-seo-content-generation/brands/<brand_slug>/auditoria-referencia.md`
- Bitácora de decisiones del README de esta automatización.

**Decisiones tomadas que aplican aquí:** D-002 (política completa).

**Pendientes en esta área:**
- Aplicar los 4 patches en `ops-control-plane` (lista para que el desarrollador lo haga).
- Definir competidores prohibidos por cada una de las 7 marcas restantes (armor-corp, doug-construction, educa-college-prep, floty, holisteek, leasy, vozy-ai).
- Completar `vozy-ai/brand-voice.md` y `auditoria-referencia.md` (hoy placeholders, marca bloqueada).
- Considerar consolidar las "Reglas no negociables" del swarm en un solo archivo enlazado desde cada brand-voice.

**Áreas con las que choca:** **todas**. Cualquier cambio de política impacta los prompts (Writer), el validator (Validator), el brief (Briefs).

---

## I. Repo de gobierno — META

**Responsabilidad:** mantener este repo (`Agents_Automations`) coherente. READMEs, handovers, estructura, convenciones.

**Archivos / componentes que tocas:**
- `README.md` raíz
- `CLAUDE.md` raíz
- `automations/seo-content-swarm-engine/README.md`
- `automations/seo-content-swarm-engine/AGENT_ONBOARDING.md` (este documento)
- `automations/seo-content-swarm-engine/AREAS.md`
- `automations/seo-content-swarm-engine/WORK_IN_PROGRESS.md`
- `handovers/`

**Pendientes en esta área:**
- Documentar las 7 marcas restantes cuando se decidan sus competidores y brand voices.
- Crear carpetas `automations/<key>/` para las otras 4 automatizaciones registradas en Supabase si se decide gobernarlas explícitamente.

**Áreas con las que choca:** ninguna directamente, pero los cambios meta afectan cómo se entienden las demás áreas.

---

## Tabla resumen — choque entre áreas

|  | A. Audio | B. Brief | C. Writer | D. Valid. | E. Img | F. ILS | G. Enrich | H. Pol | I. Meta |
|---|---|---|---|---|---|---|---|---|---|
| **A. Audio** | — |  |  |  |  |  |  |  |  |
| **B. Brief** |  | — | 🔴 | 🔴 |  |  |  | 🟡 |  |
| **C. Writer** |  | 🔴 | — | 🔴 |  |  |  | 🟡 |  |
| **D. Validator** |  | 🔴 | 🔴 | — |  |  |  | 🟡 |  |
| **E. Imagen** |  |  |  |  | — |  |  |  |  |
| **F. ILS** |  |  |  |  |  | — | 🟡 |  |  |
| **G. Enrichment** |  |  |  |  |  | 🟡 | — |  |  |
| **H. Política** | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | — |  |
| **I. Meta** |  |  |  |  |  |  |  |  | — |

- 🔴 alto riesgo de choque (no trabajar en paralelo)
- 🟡 riesgo medio (coordinar antes de tocar)
- vacío = compatibles en paralelo

---

## Cómo elegir tu área

Si el usuario te dice qué hacer, ya tienes área. Si no, elige siguiendo este orden de prioridad:

1. ¿Hay algo crítico bloqueando producción? → **Imágenes (E)** o **Validator (D)**.
2. ¿Quiere acelerar entrega de valor? → **Writer (C)** o **Briefs (B)** con plan piloto.
3. ¿Quiere consolidar gobierno? → **Política (H)** o **Meta (I)**.
4. ¿Quiere experimentar arquitectura? → **Audio (A)** con migración a TTS puro.
