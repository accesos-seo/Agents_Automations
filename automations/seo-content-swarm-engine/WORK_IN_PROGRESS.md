# Trabajo en curso — SEO Content Swarm Engine

> Registro vivo de qué agente está trabajando en qué área. Evita que dos chats se pisen.
> **Antes de empezar:** verifica que tu área no esté tomada y añade tu fila al final.
> **Cuando termines:** marca tu sesión como cerrada o transfiere.

---

## Sesiones activas

| Sesión | Área | Owner | Inicio | Tarea | Estado |
|---|---|---|---|---|---|
| **S-009** | D. Validator (+ orchestrator gate logic) | Claude-chat-calidad-contenido | 2026-05-16 | Implementar D-008: recalibrar contract gate (piso 1500-2800), generar meta_description automáticamente, mejorar repair loop, construir Quality Enforcer semántico. NO toca prompts del writer. | en_curso |
| **S-013** | B. Briefs / n8n A | _por asignar — chat Claude con acceso n8n_ | _por iniciar_ | Refuerzo n8n A: sanitizador de competidores + inyección de brand_contract. Handover en [`handovers/2026-05-16-handover-n8n-brief-contract.md`](../../handovers/2026-05-16-handover-n8n-brief-contract.md). | listo_para_tomar |

---

## Sesiones cerradas (historial)

| Sesión | Área | Owner | Inicio | Cierre | Resultado |
|---|---|---|---|---|---|
| S-001 | A. Audio (D-001) | Claude vía MCP | 2026-05-16 14:20 | 2026-05-16 14:30 | ✅ Deploy v13 limpieza HTML, prueba end-to-end OK |
| S-002 | H. Política (D-002) | Claude vía MCP | 2026-05-16 14:40 | 2026-05-16 15:00 | ✅ Política de competidores publicada, 4 patches para ops-control-plane listos |
| S-003 | C. Writer (D-003) | Claude vía MCP | 2026-05-16 15:00 | 2026-05-16 15:15 | ✅ 7 artículos pt-BR reescritos manualmente aplicando brand voice |
| S-004 | A. Audio (D-004) | Claude vía MCP | 2026-05-16 15:15 | 2026-05-16 15:20 | ✅ Deploy v14 literal-script, 7 audios regenerados |
| S-005 | I. Meta | Claude vía MCP | 2026-05-16 15:30 | 2026-05-16 15:40 | ✅ Sistema de onboarding y coordinación creado (CLAUDE.md + AGENT_ONBOARDING + AREAS + este archivo) |
| S-006 | G. Enrichment + C. Writer | Claude-chat-customer-journey | 2026-05-16 | 2026-05-16 | ✅ Spec D-005 completo: zona post-FAQ con 3 tabs, Edge Function, migración SQL, HTML/CSS/JS. Propuesta 05 en propuestas-ops-control-plane/. |
| S-007 | D. Validator + C. Writer | Claude-chat-calidad-contenido | 2026-05-16 | 2026-05-16 | ✅ Auditoría completa con datos reales: contract gate 79% fallos (word count mal calibrado), quality gate heurístico inútil semánticamente, 91% artículos sin meta description, content_score siempre NULL. Writer sí genera contenido potente. 5 mejoras propuestas. Ver D-006 en README. |
| S-008 | F. ILS + C. Writer | Claude-chat-enlazado-cj | 2026-05-16 | 2026-05-16 | ✅ Análisis profundo del sistema de enlazado. 4 gaps críticos identificados con datos reales. Arquitectura 4 fases propuesta (categoría padre + CJ slots + multi-anchor + sitemap WP). Spec en propuesta 06. D-007 registrado. Pendiente: P-1 a P-4 del usuario. |
| S-010 | J. Reviewer (nueva área) | Claude-chat-qa-reviewer | 2026-05-16 | 2026-05-16 | ✅ Reviewer Section VALIDADO E2E EN PRODUCCIÓN. 3 políticas RLS aplicadas por el usuario. Prueba real: insert content_feedback → trigger n8n → POST 200 → workflow clasificó "urgent_flag" en 6s. Informe en `handovers/2026-05-16-qa-reviewer-section.md`. 5 mejoras UX pendientes (no bloqueantes). |
| S-011 | F. ILS + C. Writer | Claude-chat-enlazado-cj | 2026-05-16 | 2026-05-16 | ✅ Arquitectura definitiva v2 post-clarificación: taxonomía categoría/cluster/hermana confirmada, 4 slots editoriales, diseño modular anti-colapso (Python + 2 Edge Functions nuevas + injector mejorado). Solicitud técnica formal para técnico. Spec v3 completo en propuesta 06-v3. |
| S-012 | H. Política + F. ILS | Claude-chat-enlazado-cj | 2026-05-16 | 2026-05-16 | ✅ Brand voice Vozy AI (Colombia, es-CO) completo — D-009. Países corregidos: Armor Corp/Leasy/Educa → Perú (es-PE). 15 competidores prohibidos añadidos al YAML. AGENT_ONBOARDING actualizado. Solicitud técnica sitemaps corregida. Pendiente del usuario esta semana: URLs sitemaps, categorías WP, clusters por marca. |
| S-005b | I. Meta + H. Política | Claude-chat-principal | 2026-05-16 15:45 | 2026-05-16 16:30 | ✅ Handover detallado para n8n (S-013) + paquete de aprobación GitHub UI integrado con propuestas 01-07 (S-014). Renumeración tras detectar S-006 a S-012 ya tomados por chats paralelos. PR #2 actualizado. |
| S-014 | B. Briefs — webhook trigger fix | Claude-chat-qa-reviewer | 2026-05-16 | 2026-05-16 | ✅ Webhook n8n `supabase-content-trigger` (muerto) reemplazado por Edge Function `seo-brief-processor` v1. Lee Google Doc, sanitiza 16 competidores, inyecta brand_contract desde GitHub, setea ai_extraction_status=completed solo si sin article_content. Trigger fn_trigger_seo_investigation actualizado. Prueba E2E OK: f0311061 → completed, doc_read=true, brand_slug=bethaus. 286 pending con brief_url listos para backfill manual. |
| S-015 | H. Política + I. Meta | Claude-chat-enlazado-cj | 2026-05-16 | 2026-05-16 | ✅ Migración completa de brand voices a Agents_Automations como fuente de verdad única. 9 brand voices creados (brands/). 2 archivos de pipeline creados (pipeline/). CLAUDE.md y AGENT_ONBOARDING actualizados para apuntar a nueva ubicación. D-010 registrado. |
| S-016 | J. Client Reviewer (nueva área) | Claude-chat-qa-reviewer | 2026-05-16 | 2026-05-16 | ✅ D-009-client implementado: tabla client_article_feedback + RLS (3 políticas) + 2 triggers + Edge Function submit-client-article-feedback v1 ACTIVE. client_approval_status actualizado automáticamente. Pendiente: workflow n8n client-article-feedback-notify. Ver handover 2026-05-16-client-article-feedback.md. |
| S-017 | J. Client Feedback — email confirmación | Claude-chat-principal | 2026-05-16 | 2026-05-16 | ✅ D-010 (email v2): `submit-client-article-feedback` v2 desplegado — Mailjet directo tras INSERT en `client_article_feedback`. Bilingüe (pt-BR / es), 4 variantes por tipo, no-fatal. Trabajo continúa como automatización propia. |
| S-018 | J → migración a automatización propia | Claude-chat-principal | 2026-05-16 | 2026-05-16 | ✅ D-010 (email v3): idioma del correo ahora se resuelve desde `cliente_users.language` → `clientes.language` → `"es"` (independiente del idioma del artículo). Plantilla en **inglés** añadida (Doug Construction, Armor Corp). Nueva automatización [`client-feedback-notifications/`](../client-feedback-notifications/) creada con README + AGENT_ONBOARDING + WORK_IN_PROGRESS + templates. CLAUDE.md actualizado con inventario de automatizaciones. |

---

## Cómo registrar tu sesión

Añade una fila a "Sesiones activas" con este formato, en el commit que inicia tu trabajo:

```markdown
| S-NNN | <letra y nombre del área de AREAS.md> | <tu identificador> | <fecha+hora UTC> | <descripción breve> | en_curso |
```

**Identificador:** usa algo que el usuario pueda asociar al chat. Ejemplo: `Claude-chat-audio-tts` o `Claude-chat-3`.

**Descripción breve:** 1 línea. Ejemplo: "Migrar audio a OpenAI TTS-1-HD y validar literalidad con 3 artículos".

**ID siguiente:** S-019 (las anteriores ya están tomadas — verifica esta lista antes de elegir número).

---

## Cómo cerrar tu sesión

1. Mueve tu fila de "Sesiones activas" a "Sesiones cerradas (historial)".
2. Reemplaza el estado por `✅ <resultado en 1 línea>` o `❌ <motivo del cierre>` o `⏸ <transferido a / pausado por>`.
3. Si descubriste pendientes nuevos, agrégalos a la sección correspondiente de [`AREAS.md`](AREAS.md).
4. Si tomaste una decisión que afecta a otros, regístrala en la sección "7.5. Decisiones tomadas" del [`README.md`](README.md) de la automatización.

---

## Reglas

1. **Un área activa = un agente activo.** Si tu área tiene fila en "Sesiones activas" con otro owner, **NO toques esa área**. Habla con el usuario o elige otra área de [`AREAS.md`](AREAS.md).
2. **Áreas en 🔴 (alto choque):** ver matriz en `AREAS.md`. Si quieres tomar Writer (C) y alguien está en Briefs (B), espera o coordina.
3. **Política (H) bloquea todo:** si hay sesión activa en H, otras áreas deben coordinar antes de cambios que dependan de política.
4. **Si el área que necesitas está tomada y no hay forma de esperar:** crea una sesión nueva con estado `⏸ esperando S-NNN` y pide al usuario que mueva trabajo.
5. **Antes de elegir número de sesión:** lee TODA la lista de "Sesiones activas" y "Sesiones cerradas". El siguiente número libre es secuencial. Si dos chats lo eligen a la vez, el segundo en commitear lo descubrirá al hacer pull y debe renumerar.
