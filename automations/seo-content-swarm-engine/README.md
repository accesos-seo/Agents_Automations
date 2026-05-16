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

Genera artículos SEO completos a partir de un brief en `content_items`. Cada artículo pasa por: investigación SEO previa (n8n) → orquestador → contrato del brief → contexto de marca → SEO expert → writer por secciones → contract gate → humanizer → EEAT validator → persistencia. En paralelo: imagen destacada, audio "listen this article", enlazado interno (ILS) y enrichment (videos, tablas, schema).

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
| `seo-content-orchestrator` | 42 | Orquestador principal |
| `seo-content-image-skill` | 37 | Imagen destacada |
| `seo-content-audio-skill` | 31 | Audio narrado |
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
| Fallos de contract gate (últimos 30 días) | 22/28 = **79%** (word count sistémicamente excedido) |
| Artículos sin meta description | **140/154 = 91%** (no hay step que la genere) |
| content_score poblado | **0%** (campo siempre NULL) |
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
| **Recalibrar contract gate** | Subir límite a 1,500-2,500 palabras (el writer ya produce ese rango naturalmente) | **Pendiente — ver D-006** |
| **Agregar step meta description** | Nueva llamada post-humanizer que genere meta description automáticamente | **Pendiente — ver D-006** |
| **Quality Enforcer semántico** | Reemplazar gate heurístico por validador que checa brand voice, datos, productos propios, competidores | **Pendiente — ver D-006** |

---

## 6. Optimizaciones priorizadas

### Quick wins (impacto alto, 1-2 días)
1. Reparar generación de imágenes (modelo válido + billing).
2. Agregar `'audio_generation'` al check constraint de `content_generation_logs.operation_type`.
3. Audio dedup: `INSERT ... ON CONFLICT DO NOTHING` en `content_audio_items`.
4. Completar brand-voice + auditoria-referencia de vozy-ai.
5. Llenar `latency_ms` y `tokens_*` en logs (observabilidad).
6. **[D-006] Recalibrar word count en contract gate: cambiar target a 1,500-2,500 palabras.** Elimina el 79% de fallos del gate.
7. **[D-006] Agregar step `meta_description_generator` en el orchestrator.** Resuelve el 91% de artículos sin meta.

### Optimizaciones medianas (3-5 días)
8. Drenar la cola de enrichment (895 pending).
9. Ajustar prompt del writer (límite de palabras, facts obligatorios).
10. Habilitar tracking de costos por artículo y por marca.
11. **[D-006] Conectar EEAT score → `content_items.content_score`** (el validator ya calcula el score, solo falta escribirlo).
12. **[D-006] Ajustar repair loop:** no disparar repair si el único fallo es word count dentro de rango aceptable.

### Estratégicas (1-2 semanas)
13. **[D-006] Construir Quality Enforcer semántico** que reemplace `v0.1.1-minimum-heuristic`: checks bloqueantes de brand voice, productos propios, datos cuantificables en apertura, ausencia de competidores, CTA con nombre de marca.
14. Activar swarm v3.1 en marca piloto (`armor-corp`).
15. Activar bucle de feedback editorial real (`content_feedback` tiene 0 filas).
16. Unificar `seo-content-orchestrator` (está duplicado en dos proyectos Supabase).
17. Documentar n8n A explícitamente.

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
- **Tabla de feedback:** `content_feedback` (vacía aún)

---

## 7.5. Decisiones tomadas

| ID | Fecha | Decisión | Detalle |
|---|---|---|---|
| D-001 | 2026-05-16 | Audio: limpieza HTML estricta en orden correcto | Deploy v13 de `seo-content-audio-skill`. Eliminada contaminación de `copy-article-block` en script TTS. Validado end-to-end. |
| D-002 | 2026-05-16 | **Prohibición global de mencionar competidores — no negociable** | Política canónica en [`referencias/politica-competidores-prohibidos.md`](../../referencias/politica-competidores-prohibidos.md). Lista operativa en [`politicas/competidores-prohibidos.yaml`](politicas/competidores-prohibidos.yaml). 16 competidores iGaming pt-BR. Aplicación en 7 capas (política, lista, brand-voice, contrato de carga, n8n A, prompts, contract-validator). Patches para `ops-control-plane` listos en [`propuestas-ops-control-plane/`](propuestas-ops-control-plane/). Auditoría retroactiva: 0 artículos contaminados en producción de 153 con contenido. |
| D-003 | 2026-05-16 | **Reescritura manual de los 7 artículos pt-BR de Cassino Bet y Vera Bet** | Ejecutada por intervención directa (no por el pipeline): se reescribieron los 7 artículos aplicando brand voice canónico, productos propios, regulación brasileña, FAQ, CTA con marca + Pix + jogo responsável integrado. Auditoría post-cambio: 0 competidores prohibidos, Ratinho Sortudo en los 3 de Cassino Bet (era 0), productos propios en los 7 (eran 0-1), regulación brasileña integrada. Audios regenerados. |
| D-004 | 2026-05-16 | **Audio v14: lectura literal del artículo** | Deploy v14 de `seo-content-audio-skill`. Eliminados los reemplazos agresivos del script TTS: `/CTA/gi`, `/FAQ schema/gi`, `/H[1-6]/gi` (este último corrompía palabras como "expectativa" → "expellamado a la acciontiva"). Conserva limpieza HTML estricta de v13 y elimina URLs (no pronunciables). Los 7 audios regenerados leen literal el artículo. |
| D-005 | 2026-05-16 | **Zona estratégica post-FAQ: Customer Journey, Assets y Lógica del contenido** | Spec completo en [`propuestas-ops-control-plane/05-article-strategic-zone-SPEC.md`](propuestas-ops-control-plane/05-article-strategic-zone-SPEC.md). Propone: separador visual post-FAQ, tabs navegables (Assets / Customer Journey / Lógica del contenido), nueva Edge Function `seo-content-strategic-zone-skill` (Gemini Flash, temperatura 0.3), 3 nuevos campos en `content_items` (`customer_journey_data`, `editorial_focus_data`, `strategic_zone_status`), trigger `trg_strategic_zone_on_article_ready`. Costo estimado ~$0.002/artículo. Pendiente aprobación e implementación en `ops-control-plane`. |
| D-006 | 2026-05-16 | **Auditoría de calidad del contenido: diagnóstico y hoja de ruta del validator** | Auditoría con datos reales de Supabase (154 artículos con contenido, 124 alertas, logs del pipeline). Hallazgos: (1) El writer genera contenido potente y con datos reales (avg 2,294 palabras, abre con dato cuantificable, estructura correcta). (2) Contract gate falla el 79% por word count mal calibrado (gate pide ≤1,500 palabras; writer produce 2,500-2,650 consistentemente). (3) Repair loop falla 67% porque intenta comprimir 70% de extensión. (4) Quality gate v0.1.1-minimum-heuristic es heurístico puro: no evalúa brand voice, productos propios, competidores, tono, datos. (5) 91% de artículos sin meta description (ningún step la genera). (6) content_score siempre NULL (EEAT calcula score pero no lo persiste). Propuesta de mejora en 5 acciones: recalibrar word count a 1,500-2,500, agregar step meta_description_generator, conectar EEAT→content_score, corregir repair loop para ignorar exceso de palabras en rango aceptable, construir Quality Enforcer semántico con checks bloqueantes. Pendiente decisión e implementación. |
| D-007 | 2026-05-16 | **Enlazado interno: categoría padre + Customer Journey en 4 fases** | Análisis profundo con datos reales de Supabase (809 candidatos ILS, 76 decisiones, 25 pipeline runs). Sistema ILS `v2.5` ya implementa CJ con stages discovery/consideration/decision y tipos same_cluster/next_step/commercial_bridge/pillar_support. Gaps encontrados: (1) `content_categories.vertical_target_url` existe pero NULL en 100% de categorías — impide el link de categoría padre en primeras 100 palabras. (2) Universo ILS limitado a `content_items` (915 artículos), ignora URLs de WordPress no en Supabase. (3) Injector usa anchor exacto sin fallback → links seleccionados no se inyectan cuando no hay match. (4) Selección "top-N score" sin lógica de embudo editorial. Arquitectura propuesta en 4 fases: Fase 1 (Capa A) — link de categoría padre en intro vía writer prompt + poblar `vertical_target_url`; Fase 2 — multi-anchor fallback en injector; Fase 3 — selección por slots editoriales (consolidación + CJ forward + conversión + pilar); Fase 4 — `wordpress_sitemap_cache` para expandir universo ILS. Spec completo en [`propuestas-ops-control-plane/06-internal-linking-category-parent-SPEC.md`](propuestas-ops-control-plane/06-internal-linking-category-parent-SPEC.md). Pendiente: 4 preguntas al usuario (P-1 a P-4) antes de implementar. |
| D-008 | 2026-05-16 | **Reviewer Section: QA E2E + 3 políticas RLS aplicadas → flujo productivo validado** | QA inicial: (1) `content_comments` funcional (24 comentarios reales). (2) `content_feedback` bloqueado por RLS sin políticas (0 filas). (3) `content_comments` sin políticas UPDATE/DELETE. (4) Check constraint oculto `observacion` ≥ 30 chars. **3 políticas RLS aplicadas. Prueba E2E real:** insert → trigger `content_feedback_notify_n8n` → POST 200 → workflow clasificó "urgent_flag" en 6s. Reviewer section 100% productivo. Informe en [`handovers/2026-05-16-qa-reviewer-section.md`](../../handovers/2026-05-16-qa-reviewer-section.md). |
| D-009 | 2026-05-16 | **Brand voice Vozy AI (Colombia, es-CO) — redactado y desbloqueado** | Brand voice completo redactado desde conocimiento de marca (B2B IA Conversacional LATAM). Incluye: identidad de marca + producto Lili + 6 soluciones + 3 buyer personas (VP CX, CTO, Dir. Ops) + 5 atributos de voz (experta, práctica, humana, confiable, visionaria) + regla de apertura con dato + métricas de referencia (AHT, FCR, CSAT) + CTA canónico + lista de 15 competidores prohibidos. Competidores añadidos al YAML. Países corregidos: Armor Corp/Leasy/Educa → Perú (es-PE); Vozy AI → Colombia (es-CO). vozy-ai desbloqueada — pendiente aplicar propuesta 07 en `ops-control-plane`. |

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
| 2026-05-16 | D-007 (v2) — Taxonomía definitiva: categoría (blog padre) / cluster de contenido (páginas de servicio) / categoría hermana (nurturing). 4 slots: intro-categoría (por regla) + cluster-principal + cluster-secundario + hermana. Arquitectura modular: Python (sitemap indexer) + seo-content-category-anchor-skill (nueva) + seo-content-cj-link-selector (nueva) + ils-contextual-injector (mejorado con multi-anchor). Fuente de verdad: WordPress CMS, no Supabase. Solicitud técnica formal emitida. Spec completo en propuesta 06-v3. |
| 2026-05-16 | D-008 — Reviewer Section validado E2E en producción. 3 políticas RLS aplicadas. Prueba real: insert → trigger n8n → POST 200 → clasificacion_ia="urgent_flag" en 6s. Informe `handovers/2026-05-16-qa-reviewer-section.md`. |
| 2026-05-16 | D-009 — Brand voice Vozy AI completado (Colombia, es-CO). Propuesta 07 lista para aplicar. 15 competidores prohibidos añadidos al YAML. Países corregidos: Armor Corp/Leasy/Educa → Perú (es-PE). Vozy-ai desbloqueada. Sitemaps/categorías/clusters WP: pendiente — usuario entrega esta semana. |
