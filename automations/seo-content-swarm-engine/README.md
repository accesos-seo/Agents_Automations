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
| Fallos de contract gate | 22 (writer escribe largo de más) |
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

---

## 6. Optimizaciones priorizadas

### Quick wins (impacto alto, 1-2 días)
1. Reparar generación de imágenes (modelo válido + billing).
2. Agregar `'audio_generation'` al check constraint de `content_generation_logs.operation_type`.
3. Audio dedup: `INSERT ... ON CONFLICT DO NOTHING` en `content_audio_items`.
4. Completar brand-voice + auditoria-referencia de vozy-ai.
5. Llenar `latency_ms` y `tokens_*` en logs (observabilidad).

### Optimizaciones medianas (3-5 días)
6. Drenar la cola de enrichment (895 pending).
7. Ajustar prompt del writer (límite de palabras, facts obligatorios).
8. Habilitar tracking de costos por artículo y por marca.

### Estratégicas (1-2 semanas)
9. Activar swarm v3.1 en marca piloto (`armor-corp`).
10. Activar bucle de feedback editorial real (`content_feedback` tiene 0 filas).
11. Unificar `seo-content-orchestrator` (está duplicado en dos proyectos Supabase).
12. Documentar n8n A explícitamente.

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
