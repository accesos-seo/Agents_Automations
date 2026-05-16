# Análisis profundo — SEO Content Swarm Engine

**Fecha:** 2026-05-16
**Alcance:** Automatización `seo-content-swarm-engine` v3.1
**Proyectos Supabase involucrados:** `Light_House` (`stjugsrkrweakvzmizpq`) — runtime productivo; `Swarm Agentes MD` (`lwurzjrghzwzxbhrulyn`) — control plane
**Repos:** `accesos-seo/ops-control-plane` (implementación), `accesos-seo/Agents_Automations` (este repo, gobierno)
**Status engine:** `active` / `production_ready_gated` — `production_go=true`, `publication_auto=false`

> Este documento es el insumo técnico para decidir optimizaciones. Está pensado para ser leído por el técnico responsable y por el dueño del producto.

---

## 1. Resumen ejecutivo

El motor genera artículos SEO completos (texto, imagen destacada, audio, enlazado interno, enrichment) a partir de un brief almacenado en `content_items`. La orquestación es **toda por Supabase**: triggers SQL + Edge Functions encadenadas, no n8n.

**n8n sí participa en dos puntos concretos, pero no como orquestador del flujo principal:**

1. **Ingreso n8n A — investigación SEO previa al brief:** trigger `tr_investigar_seo_en_n8n` en `content_items` (AFTER INSERT) llama a `fn_trigger_seo_investigation()` → webhook n8n que enriquece el `brief_data` antes de que arranquen los agentes.
2. **Ingreso n8n B — bucle de feedback editorial:** trigger `content_feedback_notify_n8n` en `content_feedback` (AFTER INSERT) llama a `tg_content_feedback_notify_n8n()` → webhook n8n que acumula feedback semanal de Content Managers y regenera la `style_guides` activa.

El flujo principal vive todo en **Edge Functions** (51 desplegadas en `Light_House`). Los problemas reales hoy son:

- **Generación de imágenes rota** (61 fallos): el modelo Flux configurado ya no existe en OpenRouter, y el fallback OpenAI Images está bloqueado por billing.
- **Contract gate muy estricto** (22 errores): el writer escribe ~2.600 palabras cuando el brief pide 1.500.
- **Cola de enrichment colapsada**: 895 artículos `pending` vs 18 completados.
- **124 alertas Quality Gate abiertas** (82 warning + 42 high), todas por meta description corta / og_image vacío / artículo corto.
- **Tracking de costos y latencia desactivado**: `estimated_cost_usd`, `actual_cost_usd`, `latency_ms` son siempre `NULL`. No hay visibilidad de gasto por artículo.
- **Swarm v3.1 nuevo está construido pero apagado**: `seo_content_swarm_runtime_config.enabled=false`. Hay 4 Edge Functions desplegadas y una matriz de 9 agentes lista que no se está usando.

---

## 2. Arquitectura real (lo que sucede de principio a fin)

### 2.1 Diagrama de flujo

```
┌──────────────────────────────────────────────────────────────┐
│ 1. INTAKE: brief llega a content_items (INSERT)             │
│    - Manual (CMS interno) o desde keyword_research_approved │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 2. INGRESO N8N #A  (tr_investigar_seo_en_n8n)               │
│    Edge Function envía webhook a n8n                         │
│    n8n hace investigación → vuelve y UPDATE content_items   │
│    con brief_data, ai_context, ai_extraction_status='ok'    │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 3. TRIGGER on_ai_extraction_completed                       │
│    → trigger_article_generation() llama al orchestrator     │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 4. EDGE FUNCTION seo-content-orchestrator (v42)             │
│                                                              │
│    4.1 brief_contract       (contract-extractor)            │
│    4.2 brand_context        (brand-voice loader) [GATE]     │
│    4.3 seo_expert           (seo-expert agent)              │
│    4.4 content-writer:                                       │
│         section_intro                                        │
│         section_h2_1..6                                      │
│         section_faq, section_cta                             │
│    4.5 sectioned_contract_gate (contract-validator)         │
│    4.6 final_repair         (content-writer si falla gate)  │
│    4.7 humanizer            (humanizer skill)               │
│    4.8 eeat                 (eeat-validator)                │
│    4.9 complete             → UPDATE content_items          │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 5. TRIGGERS PARALELOS sobre content_items UPDATE            │
│                                                              │
│ 5.a  trg_seo_content_image_generation                       │
│      → seo-content-image-skill (v37, flux.2-pro/flux-1.1)   │
│      → escribe og_image_url                                 │
│                                                              │
│ 5.b  trg_request_content_audio_generation                   │
│      → seo-content-audio-skill                              │
│      → content_audio_items                                  │
│                                                              │
│ 5.c  trg_auto_inject_images / trg_inject_parent_category    │
│      → modifica article_content                             │
│                                                              │
│ 5.d  on_article_content_quality_gate                        │
│      → evaluate_seo_article_quality()                       │
│      → genera content_generation_alerts                     │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 6. ILS  (Internal Linking Strategy)                         │
│    Trigger trg_ils_on_image_ready / trg_ils_on_audio_ready  │
│    → ils-orchestrator → ils-contextual-injector             │
│    → escribe internal_link_decisions + ils_pipeline_runs    │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 7. ENRICHMENT                                                │
│    Trigger trg_enrichment_on_ils_completed                   │
│    → content-enrichment-skill (videos, tablas, schema)      │
│    → enrichment_pipeline_runs                                │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 8. CMS / Content Manager revisa → status='validated' →     │
│    'approved' → 'scheduled' → 'published'                    │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 9. INGRESO N8N #B  (content_feedback_notify_n8n)            │
│    Content Manager registra feedback vía Edge Function      │
│    submit-content-feedback → INSERT content_feedback        │
│    → webhook a n8n                                          │
│    n8n acumula semanal → genera nueva style_guides v+1      │
│    → la activa para esa marca → se inyecta en próximo prompt│
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Edge Functions desplegadas (relevantes al swarm)

| Slug | Versión | Rol |
|---|---|---|
| `seo-content-orchestrator` | 42 (Light_House) / 2 (Swarm Agentes MD) | Orquestador principal v16 legacy |
| `seo-content-image-skill` | 37 | Generación de imagen destacada |
| `seo-content-audio-skill` | 31 | Audio "listen this article" |
| `ils-orchestrator` | 32 | Enlazado interno fase 1 |
| `ils-contextual-injector` | 19 | Inyecta enlaces en HTML |
| `seo-internal-linking-skill` | 15 | Skill atómico de linking |
| `content-enrichment-skill` | 29 | Enrichment post-publicación |
| `submit-content-feedback` | 1 | Recibe feedback del CMS |
| `seo-content-swarm-router` | 19 | **v3.1 nuevo, apagado** |
| `seo-content-brief-contract-agent` | 20 | **v3.1, apagado** |
| `seo-content-contract-validator-agent` | 20 | **v3.1, apagado** |
| `seo-content-swarm-qa-runner` | 22 | **v3.1, apagado** |
| `generate-seo-article` | 21 | Función alternativa (¿obsoleta?) |
| `seo-image-multi` | 19 | Generador de imágenes multi (¿alternativo?) |

⚠ Hay duplicidad: `seo-content-orchestrator` está deployado en ambos proyectos Supabase (`Light_House` v42 y `Swarm Agentes MD` v2). Solo Light_House es el productivo.

### 2.3 Triggers SQL críticos (en `Light_House`)

| Tabla | Trigger | Función | Rol |
|---|---|---|---|
| `content_items` | `tr_investigar_seo_en_n8n` | `fn_trigger_seo_investigation()` | **Ingreso n8n A** |
| `content_items` | `on_ai_extraction_completed` | `trigger_article_generation()` | Dispara orchestrator |
| `content_items` | `trg_seo_content_image_generation` | `trigger_seo_content_image_generation()` | Dispara imágenes |
| `content_items` | `trg_request_content_audio_generation` | `request_content_audio_generation()` | Dispara audio |
| `content_items` | `trg_auto_inject_images` | `auto_inject_images_on_content_ready()` | Inyecta imágenes en HTML |
| `content_items` | `trg_block_svg_fallback_og_image` | `block_svg_fallback_og_image()` | Rechaza og_image SVG |
| `content_items` | `trg_ils_on_image_ready` | `trigger_ils_on_image_ready()` | Dispara ILS |
| `content_items` | `trg_enrichment_on_ils_completed` | `trigger_enrichment_on_ils_completed()` | Dispara enrichment |
| `content_items` | `on_article_content_quality_gate` | `trigger_evaluate_seo_article_quality()` | Genera alertas |
| `content_audio_items` | `trg_ils_on_audio_ready` | `trigger_ils_on_audio_ready()` | Path alterno a ILS |
| `content_feedback` | `content_feedback_notify_n8n` | `tg_content_feedback_notify_n8n()` | **Ingreso n8n B** |

### 2.4 Los dos n8n (detalle)

| # | Trigger DB | Tabla | Propósito | Estado actual |
|---|---|---|---|---|
| **A** | `tr_investigar_seo_en_n8n` | `content_items` (AFTER INSERT) | n8n recibe el brief recién creado, hace investigación de SERPs / competencia y vuelve a popular `brief_data` y `ai_context`. Habilita `on_ai_extraction_completed`. | Activo. Necesario confirmar URL del webhook (no está en triggers de Light_House; vive en función `fn_trigger_seo_investigation`). |
| **B** | `content_feedback_notify_n8n` | `content_feedback` (AFTER INSERT) | n8n acumula feedback semanal del CM, lo embebe, y genera nueva versión de `style_guides` que se inyecta en el próximo prompt del content-writer. Bucle de mejora continua. | Activo. Tabla `content_feedback` tiene 0 filas hoy — el bucle nunca ha corrido en producción. |

> Nota: hay un tercer set de triggers n8n en el sistema, pero **no son del swarm de contenido**, son del flujo UX/cliente: `n8n-ux-requests` y `notificar_nueva_solicitud` sobre `client_requests` (van a `estancias-atlas-n8n.heh8a3.easypanel.host`).

---

## 3. Inventario de fallos (datos reales)

### 3.1 Fallos por step (sobre `content_generation_logs`, status='error')

| Step | Agent / Skill | Errores | Causa principal |
|---|---|---|---|
| `image_provider_failed` | seo-content-image-skill | **37** | OpenRouter 404 *"No endpoints found that support the requested output modalities: image, text"* + `black-forest-labs/flux-1.1-pro is not a valid model ID` |
| `image_provider_fallback` | seo-content-image-skill | **24** | OpenAI Images 400 *"Billing hard limit has been reached"* |
| `sectioned_contract_gate` | contract-validator | **22** | word_count fuera de rango (2.600 vs 1.500) + facts faltantes + FAQ faltantes |
| `audio_fatal` | audio-skill | 7 | Unique constraint `content_audio_items_unique_audio_variant_idx` ya existe → duplicado de insert |
| `final_repair` | content-writer | 6 | facts faltantes en repair (mismo síndrome del gate) |
| `complete` | orchestrator | 6 | propaga "facts faltantes" como error final |
| `brand_context` | brand-voice | 4 | "Brand voice no encontrado o placeholder" (vozy-ai sigue placeholder) |
| `fatal` | orchestrator | 3 | check constraint `content_generation_logs_operation_type_check` rechaza `operation_type='audio_generation'` |
| `expansion_1` | content-writer | 1 | facts faltantes en expansión |

### 3.2 Alertas Quality Gate (`content_generation_alerts`, 124 abiertas)

| Tipo | Severidad | Cantidad | Razones |
|---|---|---|---|
| `article_quality_gate_needs_review` | warning | **82** | Meta description ausente o corta; og_image_url vacío; artículo < 1.000 palabras |
| `article_quality_gate_failed` | high | **42** | Las tres causas anteriores combinadas |

### 3.3 Estado de pipelines secundarios

| Pipeline | Completados | Fallidos | Pendientes | Notas |
|---|---|---|---|---|
| ILS (`ils_pipeline_runs`) | 22 (avg 13.716 ms, 4,68 decisiones/artículo) | 1 (duplicate constraint) | — | 2 skipped. Saludable. |
| Enrichment (`enrichment_pipeline_runs`) | 33 (avg 59.131 ms) | 2 | — | Saludable a nivel ejecución. |
| Enrichment a nivel `content_items.enrichment_status` | 18 | 2 | **895** | 🔴 Cola colapsada |

### 3.4 Estado de `content_items` (total 915)

| Status | Cantidad |
|---|---|
| `published` | 644 |
| `draft` | 132 |
| `validated_by_content_manager` | 53 |
| `in_progress` | 35 |
| `completado` | 27 |
| `approved` | 11 |
| `scheduled` | 11 |
| `archived` | 2 |

### 3.5 Inventario de marcas con recursos (último audit 2026-05-08)

| Brand slug | brand-voice | auditoria-referencia | Production-ready |
|---|---|---|---|
| armor-corp | ok | ok | ✅ |
| cassino-bet | ok | ok | ✅ |
| doug-construction | ok | ok | ✅ (resuelto el 2026-05-08) |
| educa-college-prep | ok | ok | ✅ |
| floty | ok | ok | ✅ |
| holisteek | ok | ok | ✅ |
| leasy | ok | ok | ✅ |
| vera-bet | ok | ok | ✅ (resuelto el 2026-05-08) |
| **vozy-ai** | **placeholder** | **placeholder** | 🔴 BLOQUEADA |

---

## 4. Diagnóstico — qué está fallando y por qué

### 4.1 Imágenes (61 fallos, severidad alta)

**Síntoma:** og_image_url vacío en muchos artículos → dispara `article_quality_gate_failed`.

**Causa raíz:**
- `seo-content-image-skill` está configurado con `black-forest-labs/flux-1.1-pro` (modelo retirado en OpenRouter) y/o `black-forest-labs/flux.2-pro` que en OpenRouter aparece como "no endpoint with image+text modalities".
- El fallback es OpenAI Images, **bloqueado por billing hard limit**.
- Hay un parche manual: `manual-consolidation-v25` con `google/gemini-3-pro-image-preview` — funciona pero es un workaround, no la skill principal.

**Impacto:** los artículos se publican sin imagen destacada → caen en quality gate → quedan en cola de revisión humana.

### 4.2 Contract gate estricto (22 fallos)

**Síntoma:** el `contract-validator` rechaza el artículo final.

**Causa raíz (datos reales):**
- Patrón #1 — extensión: el writer entrega 2.600-3.060 palabras cuando el brief pide 1.200-1.500 (16 de los 22 fallos).
- Patrón #2 — facts faltantes: el brief incluye números específicos (montos en MXN, kilómetros, plazos en horas/días) que el writer omite (6 fallos).
- Patrón #3 — FAQ faltantes (3 fallos).
- Patrón #4 — CTA ausente (1 fallo).

**Por qué pasa:** el writer no recibe instrucciones de extensión en su prompt, o no respeta la restricción. El gate es correcto; el problema está en el writer.

### 4.3 Enrichment colapsado (895 pending)

**Síntoma:** `content_items.enrichment_status='pending'` para casi todos los publicados.

**Causa probable:** el trigger `trg_enrichment_on_ils_completed` solo se dispara cuando `ils_status` cambia a `completed`, pero la mayoría de artículos antiguos nunca pasaron por ILS porque ILS se introdujo después.

**Verificación necesaria:** cross-check `content_items` con `enrichment_status='pending'` vs `ils_status`.

### 4.4 Audio duplicates (7 fatales)

**Síntoma:** insert en `content_audio_items` falla por unique constraint en `(content_item_id, audio_mode, language_code, voice_profile_key)`.

**Causa raíz:** el trigger `trg_request_content_audio_generation` se dispara tanto en INSERT como en UPDATE de `content_items`. Cualquier actualización del artículo después de la generación inicial reintenta el insert.

**Fix esperado:** usar `INSERT ... ON CONFLICT DO NOTHING` o filtrar el trigger para que solo dispare en transiciones de status concretas.

### 4.5 Check constraint roto en `content_generation_logs` (3 fatales)

**Síntoma:** insert con `operation_type='audio_generation'` rechazado por `content_generation_logs_operation_type_check`.

**Valores actualmente permitidos (observados):** `image_generation`, `text_generation`, `other`.

**Fix esperado:** ALTER del check constraint para incluir `audio_generation`, o cambiar el logger del trigger `request_content_audio_generation` para usar `'other'` o `'text_generation'`.

### 4.6 Brand voice placeholder en vozy-ai (4 fatales)

**Síntoma:** la skill `brand-context-loader` rechaza el artículo porque `brand-voice.md` es un placeholder.

**Fix esperado:** completar el archivo en `accesos-seo/ops-control-plane:automation_projects/02-seo-content-generation/brands/vozy-ai/brand-voice.md` (y `auditoria-referencia.md`).

### 4.7 Visibilidad de costos = cero

**Síntoma:** todas las filas de `content_generation_logs` tienen `estimated_cost_usd`, `actual_cost_usd`, `latency_ms`, `tokens_input`, `tokens_output` en NULL.

**Causa:** ninguno de los Edge Functions del swarm está llenando esos campos al insertar en `content_generation_logs`.

**Impacto:** imposible calcular costo por artículo, costo por marca, o detectar regresiones de latencia.

---

## 5. Inventario de oportunidades de optimización

Ordenadas por relación impacto / esfuerzo.

### Quick wins (1-2 días, alto impacto)

1. **Reparar imágenes** — actualizar `seo-content-image-skill` para usar un modelo válido (sugerido: confirmar `black-forest-labs/flux-1.1-pro` actualizado o migrar a `google/gemini-3-pro-image-preview` que ya funciona en `manual-consolidation-v25`). Recargar billing OpenAI o eliminar el fallback.
2. **Agregar `'audio_generation'` al check constraint de `content_generation_logs.operation_type`** — fix simple, elimina 3 fatales recurrentes.
3. **Audio dedup** — cambiar el insert en `content_audio_items` a `ON CONFLICT DO NOTHING` o agregar condición en el trigger `trg_request_content_audio_generation` para que solo dispare si no existe el variant.
4. **Completar brand-voice + auditoria-referencia de vozy-ai** — desbloquea la novena marca para producción.
5. **Llenar `latency_ms` y `tokens_*` en logs** — al menos el orquestador. Quick win de observabilidad enorme.

### Optimizaciones medianas (3-5 días)

6. **Drenar la cola de enrichment** — confirmar el criterio de disparo y backfill manual de los 895 pending (o decidir que no aplican a artículos pre-ILS).
7. **Ajustar el writer** — meter en el prompt del `content-writer`:
   - Límite estricto de palabras según `brief_data.word_count_range`.
   - Lista explícita de `facts` a incluir como bullets antes de generar.
   - Recordatorio de FAQ y CTA obligatorios según `brief_data`.

   Esto debería tumbar los 22 fallos de contract gate sin tocar el gate.
8. **Habilitar tracking de costos** — todos los Edge Functions que llaman a OpenRouter deben:
   - Capturar `tokens_input`, `tokens_output` del response.
   - Mantener una tabla de pricing por modelo (o usar `pricing_snapshot`).
   - Calcular `estimated_cost_usd` y persistirlo.

### Estratégicas (1-2 semanas)

9. **Activar swarm v3.1** — `seo_content_swarm_runtime_config.enabled=false` hoy. La matriz de 9 agentes nuevos está construida (brief-contract / seo-strategy / content-plan / section-writer / editor / contract-validator / eeat-validator / persistence / image-orchestrator) y 4 Edge Functions están desplegadas (`seo-content-swarm-router`, `seo-content-brief-contract-agent`, `seo-content-contract-validator-agent`, `seo-content-swarm-qa-runner`). Pasar a v3.1 separa responsabilidades, mejora trazabilidad y habilita QA por agente.
   - Plan sugerido: rollout por marca empezando por `armor-corp` (la más estable, ya usada en `controlled_production_trial`).
10. **Bucle de feedback editorial real** — `content_feedback` tiene 0 filas. Educar a los Content Managers para que lo usen y verificar el extremo n8n B (acumulación semanal → versionado de `style_guides`).
11. **Unificar Edge Function `seo-content-orchestrator`** — está en dos proyectos Supabase (Light_House v42 y Swarm Agentes MD v2). Decidir cuál es la canónica y eliminar la otra.
12. **Documentar n8n A explícitamente** — la URL del webhook está dentro de `fn_trigger_seo_investigation()`. Hoy es una caja negra. Vale la pena documentar qué hace n8n con el brief y cuánto tarda (no hay logs visibles).

### Higiene (½ día)

13. **Decidir qué hacer con `n8n_ai_agent`** — la tabla existe, está vacía y suena a sesiones LangChain de n8n. Confirmar uso o borrar.
14. **Decidir qué hacer con `generate-seo-article` y `seo-image-multi`** — funciones desplegadas que parecen alternativas no usadas.
15. **Documentar las 7 versiones de `manual-consolidation-*`** — son workarounds históricos. Consolidar en una sola o migrar a swarm v3.1.

---

## 6. Decisiones que se le piden al dueño del producto

Antes de tocar nada, sería útil que tomes posición sobre estos puntos:

| Decisión | Opciones |
|---|---|
| **Imágenes**: ¿qué modelo es el oficial? | a) Reparar Flux en OpenRouter; b) Migrar a Gemini-3-pro-image; c) Otro proveedor |
| **Activación swarm v3.1** | a) Mantener legacy v16 e ir migrando agente por agente; b) Cutover completo en una marca piloto; c) Diferir hasta resolver imágenes |
| **n8n A (investigación SEO)** | a) Mantenerlo; b) Migrarlo a Edge Function (homologar al resto); c) Documentarlo y dejarlo |
| **Cola de 895 enrichment pending** | a) Backfill manual; b) Marcar como `skipped` y limpiar; c) Ignorar (artículos viejos no necesitan enrichment) |
| **Quality Gate alerts (124 abiertas)** | a) Resolver una a una con CM; b) Re-procesar masivo con la skill arreglada; c) Cerrar bulk y aceptar el estado actual |

---

## 7. Próximos pasos sugeridos (orden)

1. **Hoy**: aplicar quick wins 1-4 (imágenes, check constraint, audio dedup, vozy-ai). Bajan ~70 errores acumulados.
2. **Esta semana**: quick win 5 (tracking de costos básico) + mediana 7 (ajustar writer). Resuelven el cuello de botella del gate y dan visibilidad.
3. **Próxima semana**: mediana 6 (enrichment) + estratégica 11 (unificar orchestrator).
4. **Mes**: estratégica 9 (swarm v3.1 piloto en armor-corp) + estratégica 10 (activar bucle de feedback).

---

## 8. Anexos

### 8.1 Modelos AI detectados en uso (productivo)

| Operación | Modelos vistos | Proveedor |
|---|---|---|
| Imágenes | `black-forest-labs/flux-1.1-pro`, `black-forest-labs/flux.2-pro`, `google/gemini-3-pro-image-preview` | openrouter |
| Texto (smoke test) | `openai/gpt-4o-mini`, `openai/gpt-5.5`, `deepseek/deepseek-v4-flash` | openrouter |
| Optimizer (contract) | `google/gemini-3.1-pro-preview` | openrouter |
| Audio | OpenRouter streaming (voice profile `editorial_es_mx_listen_article_openrouter_coral`) | openrouter |

### 8.2 Tablas clave a monitorear

- `content_items` — fuente de verdad del artículo.
- `content_generation_logs` (1.459 filas) — traza por step.
- `content_generation_alerts` (124 abiertas) — alertas de calidad.
- `content_feedback` (0 filas) — bucle de mejora.
- `ils_pipeline_runs` (25), `enrichment_pipeline_runs` (35) — pipelines secundarios.
- `seo_content_swarm_runtime_config` — feature flag del swarm v3.1.
- `style_guides` (0 filas) — destino del feedback n8n B.

### 8.3 Eventos canónicos en `runtime_events` (control plane)

Total de eventos para `seo-content-swarm-engine`: 22. Los más relevantes:

- `start`, `dry_run_complete`, `brand_context_loaded`, `reference_audit_loaded`
- `agent_registry_validated`, `agent_controlled_test_complete` (×3 agentes)
- `ai_smoke_test_started`, `ai_smoke_test_blocked`, `ai_smoke_test_completed`
- `controlled_production_trial_requested`, `controlled_production_trial_go_approved`
- `optimizer_execution_queued`, `image_generation_execution_queued`
- `brand_resources_audit_completed`, `brand_resources_recheck_completed` (×3)
- `handover_activated`
- `resource_loading_contract_registered`

### 8.4 Comparación con repositorio `Agents_Automations` (2026-05-16)

**Estado del repo antes del análisis:**

| Carpeta | Contenido |
|---|---|
| `automations/` | Solo `_template/.gitkeep` |
| `agents/` | Solo `_template/.gitkeep` |
| `skills/` | Solo `_template/.gitkeep` |
| `briefs/` | Vacía (`.gitkeep`) |
| `handovers/` | 3 archivos (inicio proyecto, RLS Light_House, este análisis) |

**Estado en Supabase `automation_registry`:** 5 automatizaciones registradas. **Gap: ninguna estaba reflejada como carpeta bajo gobierno.**

**Acción tomada en esta sesión:**

1. Creada `automations/seo-content-swarm-engine/README.md` como plano de control de esta automatización (la primera bajo gobierno).
2. Actualizado el `README.md` raíz con el inventario comparativo Supabase ↔ repo.
3. Este informe queda enlazado desde la carpeta de la automatización como su informe técnico canónico.

**Decisiones pendientes para el dueño del producto sobre las otras 4 automatizaciones:**

- `automation-template`: probablemente no requiere carpeta propia (es plantilla).
- `example-shared-automation`: decidir si autorizar activación o archivar.
- `validation-shared-runtime-001` y `002`: decidir si reactivar, completar o retirar.

Una vez tomadas esas decisiones, las que sigan vivas deben tener su propia carpeta `automations/<key>/` con su README de gobierno equivalente al de `seo-content-swarm-engine`.

### 8.5 Comandos útiles de diagnóstico

```sql
-- Errores recientes por step
SELECT step, agent_or_skill, COUNT(*), MAX(created_at)
FROM content_generation_logs
WHERE status='error' AND created_at > now() - interval '7 days'
GROUP BY 1,2 ORDER BY 3 DESC;

-- Artículos publicados sin imagen
SELECT id, title, brand_name, status, created_at
FROM content_items
WHERE status='published' AND (og_image_url IS NULL OR og_image_url='')
ORDER BY created_at DESC LIMIT 20;

-- Cola de enrichment por marca
SELECT brand_name, COUNT(*)
FROM content_items
WHERE enrichment_status='pending'
GROUP BY 1 ORDER BY 2 DESC;

-- Costo acumulado por marca (cuando esté implementado)
SELECT ci.brand_name, SUM(cgl.estimated_cost_usd)
FROM content_generation_logs cgl
JOIN content_items ci ON ci.id = cgl.content_item_id
WHERE cgl.created_at > now() - interval '30 days'
GROUP BY 1 ORDER BY 2 DESC;
```
