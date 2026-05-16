# SEO Content Swarm Engine

**Automation key:** `seo-content-swarm-engine`
**Versión actual:** 3.1 (legacy v16 activo; v3.1 nuevo desplegado pero apagado)
**Estado:** `active` / `production_ready_gated`
**Activada:** 2026-05-09
**Owner producto:** _por definir_
**Owner técnico:** _por definir_

Esta es la primera automatización del repositorio bajo gobierno explícito. El código de implementación vive en `accesos-seo/ops-control-plane` (path `automation_projects/02-seo-content-generation`). El runtime corre en Supabase `Light_House` (`stjugsrkrweakvzmizpq`). Este directorio es el **plano de control** y **bitácora viva** de la automatización.

---

## 1. Qué hace

Genera artículos SEO completos a partir de un brief en `content_items`. Cada artículo pasa por: investigación SEO previa (n8n) → orquestador → contrato del brief → contexto de marca → SEO expert → writer por secciones → contract gate → humanizer → EEAT validator → **Quality Enforcer semántico** → persistencia. En paralelo: imagen destacada, audio "listen this article", enlazado interno (ILS) y enrichment (videos, tablas, schema).

**Bucle de mejora continua:** feedback editorial de los Content Managers → n8n acumula semanal → genera nueva versión de `style_guides` → se inyecta en el próximo prompt del writer.

> Para el flujo detallado de principio a fin, ver el informe profundo: [`handovers/2026-05-16-analisis-seo-content-swarm.md`](../../handovers/2026-05-16-analisis-seo-content-swarm.md).

---

## 2. Configuración (en Supabase `Swarm Agentes MD`)

| Config | Valor |
|---|---|
| `production_go` | `true` |
| `publication_auto` | `false` |
| `n8n_article_generation_disabled` | `true` |
| `requires_downstream_article_persistence` | `true` |
| Repo de implementación | `accesos-seo/ops-control-plane` |
| Path | `automation_projects/02-seo-content-generation` |
| Runtime Supabase | `lwurzjrghzwzxbhrulyn` (control) + `stjugsrkrweakvzmizpq` (operación) |

**Feature flag swarm v3.1:** `seo_content_swarm_runtime_config.enabled = false`. La matriz nueva de 9 agentes está construida pero no activa.

---

## 3. Componentes (inventario)

### 3.1 Agentes (3 activos en legacy v16)

| Agent key | Rol | Estado |
|---|---|---|
| `seo-expert` | Estructura H1/H2 + keywords + intención | `controlled_test_ready` |
| `content-writer` | Genera secciones del artículo | `controlled_test_ready` |
| `optimizer` | SEO score + mejoras | `controlled_test_ready` |

### 3.2 Skills

| Skill key | Estado | Dónde vive |
|---|---|---|
| `brand-context-loader` | `registered` | `ops-control-plane` |
| `image-generation` | `controlled_test_ready` | Edge Function `seo-content-image-skill` |

### 3.3 Edge Functions productivas (en Supabase `Light_House`)

| Slug | Versión | Función |
|---|---|---|
| `seo-content-orchestrator` | **43 (v4.4)** | Orquestador principal — quality floor + meta_description + Quality Enforcer hook |
| `seo-content-quality-enforcer` | **1** | Quality Enforcer semántico: competidores, dato en apertura, marca en CTA, producto propio, FAQ |
| `seo-content-image-skill` | 37 | Imagen destacada |
| `seo-content-audio-skill` | 33 | Audio narrado |
| `ils-orchestrator` | 32 | Enlazado interno |
| `ils-contextual-injector` | 19 | Inserta enlaces en HTML |
| `seo-internal-linking-skill` | 15 | Skill atómico de linking |
| `content-enrichment-skill` | 29 | Enrichment post-publicación |
| `submit-content-feedback` | 1 | Recibe feedback del CMS |
| `seo-content-swarm-router` | 19 | v3.1 nuevo (apagado) |
| `seo-content-brief-contract-agent` | 20 | v3.1 nuevo (apagado) |
| `seo-content-contract-validator-agent` | 20 | v3.1 nuevo (apagado) |
| `seo-content-swarm-qa-runner` | 22 | v3.1 nuevo (apagado) |

### 3.4 Ingresos a n8n (los dos puntos)

| # | Trigger DB | Tabla | Función | Propósito |
|---|---|---|---|---|
| A | `tr_investigar_seo_en_n8n` | `content_items` AFTER INSERT | `fn_trigger_seo_investigation()` | Investigación SEO previa que enriquece `brief_data` |
| B | `content_feedback_notify_n8n` | `content_feedback` AFTER INSERT | `tg_content_feedback_notify_n8n()` | Bucle de feedback semanal → `style_guides` |

### 3.5 Marcas configuradas (9, 8 listas)

armor-corp, cassino-bet, doug-construction, educa-college-prep, floty, holisteek, leasy, vera-bet, **vozy-ai** (placeholder, bloqueada).

---

## 4. Estado actual (datos reales 2026-05-16)

| Indicador | Valor |
|---|---|
| Total `content_items` | 915 |
| Publicados | 644 |
| Draft | 132 |
| Enrichment pending | **895** (cola colapsada) |
| Alertas Quality Gate abiertas | 124 (82 warning + 42 high) |
| Fallos de generación de imagen recientes | 61 (Flux + OpenAI billing) |
| Fallos de contract gate (últimos 30 días) | 22/28 = **79%** (word count sistémicamente excedido) → **corregido D-009** |
| Artículos sin meta description | **140/154 = 91%** (no hay step que la genere) → **corregido D-009** |
| content_score poblado | **0%** (campo siempre NULL) → **corregido D-009** |
| Visibilidad de costos | **0%** (`estimated_cost_usd` siempre NULL) |
| Visibilidad de latencia | **0%** (`latency_ms` siempre NULL) |

---

## 5. Decisiones pendientes del dueño del producto

| Decisión | Opciones | Estado |
|---|---|---|
| Modelo oficial de imágenes | Flux reparado / Gemini-3-pro-image / otro proveedor | Pendiente |
| Activación de swarm v3.1 | Mantener legacy / cutover en marca piloto / diferir | Pendiente |
| n8n A (investigación previa) | Mantener / migrar a Edge Function / documentar y dejar | Pendiente |
| Cola de 895 enrichment | Backfill / marcar skipped / ignorar | Pendiente |
| 124 alertas Quality Gate abiertas | Resolver 1 a 1 / re-procesar masivo / cerrar bulk | Pendiente |
| **Recalibrar contract gate** | ✅ **Resuelto — D-009** Quality floor 1500-2800 implementado | **Hecho** |
| **Agregar step meta description** | ✅ **Resuelto — D-009** Auto-generación post-EEAT implementada | **Hecho** |
| **Quality Enforcer semántico** | ✅ **Resuelto — D-009** `seo-content-quality-enforcer` v1.0 deployado | **Hecho** |
| RLS `content_feedback` | Añadir políticas SELECT/INSERT (bloqueado para usuarios autenticados) | Pendiente — ver D-008 |
| RLS `content_comments` | Añadir políticas UPDATE/DELETE para resolver/editar | Pendiente — ver D-008 |

---

## 6. Optimizaciones priorizadas

### Quick wins (impacto alto, 1-2 días)
1. Reparar generación de imágenes (modelo válido + billing).
2. Agregar `'audio_generation'` al check constraint de `content_generation_logs.operation_type`.
3. Audio dedup: `INSERT ... ON CONFLICT DO NOTHING` en `content_audio_items`.
4. Completar brand-voice + auditoria-referencia de vozy-ai.
5. Llenar `latency_ms` y `tokens_*` en logs (observabilidad).
6. ✅ **[D-009]** Recalibrar word count en contract gate: floor 1,500-2,800 palabras. Elimina el 79% de fallos.
7. ✅ **[D-009]** Agregar step `meta_description_generator` en el orchestrator. Resuelve el 91% de artículos sin meta.
8. Aplicar SQL de fix RLS para `content_feedback` y `content_comments` (ver D-008).

### Optimizaciones medianas (3-5 días)
9. Drenar la cola de enrichment (895 pending).
10. Ajustar prompt del writer (límite de palabras, facts obligatorios).
11. Habilitar tracking de costos por artículo y por marca.
12. ✅ **[D-009]** Conectar EEAT score → `content_items.content_score` (el validator ya calcula el score, solo falta escribirlo).
13. ✅ **[D-009]** Ajustar repair loop: no disparar repair si el único fallo es word count dentro de rango aceptable.

### Estratégicas (1-2 semanas)
14. ✅ **[D-009]** Quality Enforcer semántico deployado: 5 checks (competidores, dato en apertura, marca en CTA, producto propio, FAQ). Monitorear tasa de bloqueo en producción.
15. Activar swarm v3.1 en marca piloto (`armor-corp`).
16. Activar bucle de feedback editorial real (`content_feedback` tiene 0 filas — requiere fix RLS D-008).
17. Unificar `seo-content-orchestrator` (está duplicado en dos proyectos Supabase).
18. Documentar n8n A explícitamente.
19. Implementar spec ILS categoría padre + CJ (D-007) — pendiente confirmación P-1 a P-4 del usuario.
20. Implementar zona estratégica post-FAQ (D-005) — pendiente aprobación del usuario.

Detalle completo en el [informe de análisis](../../handovers/2026-05-16-analisis-seo-content-swarm.md#5-inventario-de-oportunidades-de-optimización).

---

## 7. Links y referencias

- **Implementación:** https://github.com/accesos-seo/ops-control-plane/tree/main/automation_projects/02-seo-content-generation
- **Informe técnico profundo:** [`handovers/2026-05-16-analisis-seo-content-swarm.md`](../../handovers/2026-05-16-analisis-seo-content-swarm.md)
- **Supabase control plane:** proyecto `Swarm Agentes MD` (ref `lwurzjrghzwzxbhrulyn`)
- **Supabase runtime:** proyecto `Light_House` (ref `stjugsrkrweakvzmizpq`)
- **Tabla principal de artículos:** `content_items` (en Light_House)
- **Tabla principal de logs:** `content_generation_logs` (1.459 filas)
- **Feature flag swarm v3.1:** `seo_content_swarm_runtime_config`
- **Tabla de feedback:** `content_feedback` (vacía — bloqueada por RLS sin políticas, ver D-008)

---

## 7.5. Decisiones tomadas

| ID | Fecha | Decisión | Detalle |
|---|---|---|---|
| D-001 | 2026-05-16 | Audio: limpieza HTML estricta en orden correcto | Deploy v13 de `seo-content-audio-skill`. Eliminada contaminación de `copy-article-block` en script TTS. Validado end-to-end. |
| D-002 | 2026-05-16 | **Prohibición global de mencionar competidores — no negociable** | Política canónica en [`referencias/politica-competidores-prohibidos.md`](../../referencias/politica-competidores-prohibidos.md). Lista operativa en [`politicas/competidores-prohibidos.yaml`](politicas/competidores-prohibidos.yaml). 16 competidores iGaming pt-BR. Aplicación en 7 capas (política, lista, brand-voice, contrato de carga, n8n A, prompts, contract-validator). Patches para `ops-control-plane` listos en [`propuestas-ops-control-plane/`](propuestas-ops-control-plane/). Auditoría retroactiva: 0 artículos contaminados en producción de 153 con contenido. |
| D-003 | 2026-05-16 | **Reescritura manual de los 7 artículos pt-BR de Cassino Bet y Vera Bet** | Ejecutada por intervención directa (no por el pipeline): se reescribieron los 7 artículos aplicando brand voice canónico, productos propios, regulación brasileña, FAQ, CTA con marca + Pix + jogo responsável integrado. Auditoría post-cambio: 0 competidores prohibidos, Ratinho Sortudo en los 3 de Cassino Bet (era 0), productos propios en los 7 (eran 0-1), regulación brasileña integrada. Audios regenerados. |
| D-004 | 2026-05-16 | **Audio v14: lectura literal del artículo** | Deploy v14 de `seo-content-audio-skill`. Eliminados los reemplazos agresivos del script TTS: `/CTA/gi`, `/FAQ schema/gi`, `/H[1-6]/gi` (este último corrompía palabras como "expectativa" → "expellamado a la acciontiva"). Conserva limpieza HTML estricta de v13 y elimina URLs (no pronunciables). Los 7 audios regenerados leen literal el artículo. |
| D-005 | 2026-05-16 | **Zona estratégica post-FAQ: Customer Journey, Assets y Lógica del contenido** | Spec completo en [`propuestas-ops-control-plane/05-article-strategic-zone-SPEC.md`](propuestas-ops-control-plane/05-article-strategic-zone-SPEC.md). Propone: separador visual post-FAQ, tabs navegables (Assets / Customer Journey / Lógica del contenido), nueva Edge Function `seo-content-strategic-zone-skill` (Gemini Flash, temperatura 0.3), 3 nuevos campos en `content_items` (`customer_journey_data`, `editorial_focus_data`, `strategic_zone_status`), trigger `trg_strategic_zone_on_article_ready`. Costo estimado ~$0.002/artículo. Pendiente aprobación e implementación en `ops-control-plane`. |
| D-006 | 2026-05-16 | **Auditoría de calidad del contenido: diagnóstico y hoja de ruta del validator** | Auditoría con datos reales de Supabase (154 artículos con contenido, 124 alertas, logs del pipeline). Hallazgos: (1) El writer genera contenido potente y con datos reales (avg 2,294 palabras, abre con dato cuantificable, estructura correcta). (2) Contract gate falla el 79% por word count mal calibrado (gate pide ≤1,500 palabras; writer produce 2,500-2,650 consistentemente). (3) Repair loop falla 67% porque intenta comprimir 70% de extensión. (4) Quality gate v0.1.1-minimum-heuristic es heurístico puro: no evalúa brand voice, productos propios, competidores, tono, datos. (5) 91% de artículos sin meta description (ningún step la genera). (6) content_score siempre NULL (EEAT calcula score pero no lo persiste). Propuesta de mejora en 5 acciones: recalibrar word count a 1,500-2,500, agregar step meta_description_generator, conectar EEAT→content_score, corregir repair loop para ignorar exceso de palabras en rango aceptable, construir Quality Enforcer semántico con checks bloqueantes. Implementado en D-009. |
| D-007 | 2026-05-16 | **Enlazado interno: categoría padre + Customer Journey en 4 fases** | Análisis profundo con datos reales de Supabase (809 candidatos ILS, 76 decisiones, 25 pipeline runs). Sistema ILS `v2.5` ya implementa CJ con stages discovery/consideration/decision y tipos same_cluster/next_step/commercial_bridge/pillar_support. Gaps encontrados: (1) `content_categories.vertical_target_url` existe pero NULL en 100% de categorías — impide el link de categoría padre en primeras 100 palabras. (2) Universo ILS limitado a `content_items` (915 artículos), ignora URLs de WordPress no en Supabase. (3) Injector usa anchor exacto sin fallback → links seleccionados no se inyectan cuando no hay match. (4) Selección "top-N score" sin lógica de embudo editorial. Arquitectura propuesta en 4 fases: Fase 1 (Capa A) — link de categoría padre en intro vía writer prompt + poblar `vertical_target_url`; Fase 2 — multi-anchor fallback en injector; Fase 3 — selección por slots editoriales (consolidación + CJ forward + conversión + pilar); Fase 4 — `wordpress_sitemap_cache` para expandir universo ILS. Spec completo en [`propuestas-ops-control-plane/06-internal-linking-category-parent-SPEC.md`](propuestas-ops-control-plane/06-internal-linking-category-parent-SPEC.md). Pendiente: 4 preguntas al usuario (P-1 a P-4) antes de implementar. |
| D-008 | 2026-05-16 | **QA dry run Reviewer Section: diagnóstico end-to-end de content_comments + content_feedback** | Dry run completo con datos reales. Hallazgos: (1) `content_comments` funcional — 24 comentarios reales de redactores en producción (4 artículos, menciones de usuarios, texto seleccionado). (2) `content_feedback` tiene 0 filas y está bloqueado: RLS habilitado sin políticas — inserts de frontend con `authenticated` key son rechazados. La Edge Function `submit-content-feedback` (service role) es la única ruta viable. (3) `content_comments` no tiene políticas UPDATE/DELETE — resolver/editar comentarios está bloqueado para usuarios autenticados. (4) Check constraint oculto: `observacion` ≥ 30 chars — el frontend debe validar antes del submit. (5) `category_tag` nunca se usa (NULL en 24/24 rows) y `suggested_text` casi nunca (1/24). (6) Trigger n8n (`content_feedback_notify_n8n`) bien construido y asíncrono; pendiente verificar que el workflow `content-feedback-classify` exista en n8n. SQL de fix listo para aplicar: 4 políticas RLS (SELECT en content_feedback, UPDATE+DELETE en content_comments). Pendiente decisión e implementación. |
| D-009 | 2026-05-16 | **Quality floor + meta description automática + Quality Enforcer semántico** | Deploy `seo-content-orchestrator` v4.4 (versión Supabase 43) con 5 mejoras: (1) **Quality floor** — `makeContract()` fuerza `min=1500, max=2800` palabras independientemente del brief, eliminando el 79% de fallos del contract gate. (2) **Smart repair bypass** — si el único fallo del gate es word count dentro del 1.20× cap, el artículo pasa sin repair (evita reescritura innecesaria). (3) **Meta description fallback** — cuando el brief no provee `meta_description`, el orchestrator invoca un agente meta-generator post-EEAT y persiste el resultado (resuelve el 91% de artículos sin meta). (4) **Quality Enforcer hook** — llama a `seo-content-quality-enforcer` (no bloqueante si la función falla); su resultado se combina con EEAT para calcular `content_score`. (5) **Prompts mejorados** — intro exige dato cuantificable en primera oración; CTA exige mencionar explícitamente el nombre de la marca. Deploy `seo-content-quality-enforcer` v1.0 (nueva Edge Function): 5 checks — competidores iGaming (bloqueante, solo cassino-bet/vera-bet), dato cuantificable en primera oración (bloqueante), marca en CTA (bloqueante), producto propio mencionado (warning), FAQ sustancial (warning). AI semantic check via OpenRouter (non-blocking fallback a regex si falla). Devuelve `{passed, blocking_issues, warnings, brand_score, overall_score}`. Patch para sincronizar ops-control-plane en [`propuestas-ops-control-plane/07-orchestrator-quality-floor-PATCH.md`](propuestas-ops-control-plane/07-orchestrator-quality-floor-PATCH.md). |

## 8. Bitácora

| Fecha | Evento |
|---|---|
| 2026-05-07 | Agentes registrados (seo-expert, content-writer, optimizer) y validados controlled_test |
| 2026-05-08 | Contrato de carga de recursos registrado; audit de 9 marcas |
| 2026-05-08 | Trial de producción aprobado para armor-corp con Gemini-3.1-pro-preview |
| 2026-05-09 | Engine activado v3.1 con `production_go=true` y `publication_auto=false` |
| 2026-05-16 | Informe de análisis profundo (este repo) y primera automatización bajo gobierno |
| 2026-05-16 | D-001 — Fix audio v13: limpieza HTML estricta. Deploy y prueba end-to-end OK. |
| 2026-05-16 | D-002 — Política prohibición de competidores publicada. 0 artículos contaminados en auditoría retroactiva. Patches para `ops-control-plane` listos. |
| 2026-05-16 | D-003 — Reescritura manual de los 7 artículos pt-BR (Cassino Bet × 3, Vera Bet × 4). Brand voice aplicado: 0 competidores, Ratinho Sortudo en los 3 de Cassino Bet, productos propios, regulación brasileña, CTA completo. |
| 2026-05-16 | D-004 — Audio v14: lectura literal sin reemplazos `CTA`/`FAQ schema`/`H[1-6]`. 7 audios regenerados, todos en status `ready`. |
| 2026-05-16 | D-005 — Spec zona estratégica post-FAQ diseñado. 3 tabs: Assets, Customer Journey, Lógica del contenido. Nueva Edge Function + migración SQL + HTML/CSS propuestos. Pendiente implementación en `ops-control-plane`. |
| 2026-05-16 | D-006 — Auditoría calidad del contenido con datos reales. Contract gate: 79% fallos por word count (1,500 vs ~2,300 real). Quality gate heurístico: no mide semántica. 91% sin meta description. 5 mejoras propuestas. |
| 2026-05-16 | D-007 — Análisis profundo de enlazado interno + CJ. `content_categories.vertical_target_url` vacío bloquea capa A. ILS v2.5 funcional pero con 9.4% de uso (76/809 candidatos). Universo limitado a Supabase, ignora sitemap WP. Arquitectura 4 fases propuesta. Pendiente confirmación de URLs de categorías (P-1 a P-4). |
| 2026-05-16 | D-008 — QA dry run Reviewer Section. content_comments funciona (24 filas reales). content_feedback bloqueado por RLS sin políticas (0 filas). 2 bloqueadores críticos + 3 mejoras. SQL de fix preparado. |
| 2026-05-16 | D-009 — Quality floor 1500-2800 + meta description auto + Quality Enforcer. Orchestrator v4.4 (Supabase v43) + `seo-content-quality-enforcer` v1.0 deployados en Light_House. |
