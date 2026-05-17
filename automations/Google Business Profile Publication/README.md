# Google Business Profile Publication

**Automation key:** `gbp-post-generator`
**Versión actual:** 1.0 — trigger + Edge Function en producción, frontend pendiente
**Estado:** `backend_ready` / `frontend_pending`
**Activada:** 2026-05-17
**Owner producto:** SEO Líder (por proyecto, campo `lider_id` en `proyectos_seo`)
**Owner técnico:** Equipo de automatizaciones

Automatización end-to-end que genera, agenda y gestiona posts de Google Business Profile (GBP) a partir de los artículos de blog que el equipo SEO valida. Cuando un `blog_post` alcanza el estado `validated_by_content_manager` en un proyecto con GBP activo, la automatización genera automáticamente un borrador del post (60–70 palabras, con emojis y CTA), calcula su fecha de publicación trimestral y notifica al SEO líder del proyecto para que lo apruebe o rechace desde el Local SEO Hub.

El objetivo operativo es que el cliente vea siempre un calendario trimestral de publicaciones GBP poblado y definido — sin trabajo manual del equipo. La meta es 4 posts GBP por marca por mes, derivados de los ~12 artículos mensuales que se producen por marca.

Ver arquitectura detallada en [`./propuestas-ops-control-plane/architecture.md`](./propuestas-ops-control-plane/architecture.md).

---

## 1. Qué hace

1. **Detecta** cuando un `blog_post` pasa a `validated_by_content_manager` en `content_items` mediante el trigger `trg_gbp_draft_on_validated`.
2. **Verifica elegibilidad** del proyecto: `project_services.seo_local.is_active = true` y cuota mensual < 4 posts GBP por proyecto.
3. **Genera** un borrador GBP de 60–70 palabras usando Claude Haiku, con el contexto del `summary_150_words` de `article_analysis_index` (fallback: `meta_description` → `title`). El post es bilingüe (ES/EN según el idioma del proyecto).
4. **Calcula** la fecha de publicación GBP usando `business_calendar` (zona `America/Bogota`), distribuyendo los 4 posts en 4 semanas del mes objetivo.
5. **Graba** `gbp_post_content`, `gbp_scheduled_date` y `gbp_status = 'draft_ready'` en `content_items`.
6. **Notifica** al `lider_id` del proyecto vía `notifications_outbox` (tipo `gbp_draft_ready`, prioridad 70).
7. **Espera validación** del SEO líder en el panel del Local SEO Hub (pendiente de implementación frontend).

---

## 2. Configuración

| Parámetro | Valor |
|---|---|
| `GBP_POSTS_PER_MONTH` | `4` por proyecto |
| `content_type` elegible | `blog_post` únicamente |
| `status` disparador | `validated_by_content_manager` |
| Modelo de generación | `claude-haiku-4-5-20251001` |
| Max palabras post GBP | 70 palabras |
| Ventana de búsqueda de slots | 4 meses desde hoy |
| Calendario base | `business_calendar` (zona `America/Bogota`) |
| Distribución semanal | Semana 1: días 1–7 · Semana 2: 8–14 · Semana 3: 15–21 · Semana 4: 22–31 |
| Proyecto Supabase | Light\_House (`stjugsrkrweakvzmizpq`) |
| Edge Function | `gbp-post-generator` (versión 2, ACTIVE) |
| `verify_jwt` | `false` (llamada desde trigger SQL) |

---

## 3. Componentes (inventario)

### Tablas involucradas

| Tabla | Rol | Columnas GBP clave |
|---|---|---|
| `content_items` | Tabla principal — artículos y estado GBP | `gbp_status`, `gbp_post_content`, `gbp_scheduled_date`, `gbp_notes` |
| `proyectos_seo` | Proyecto/marca — dueño del GBP | `lider_id`, `nombremarca`, `dominioprincipal` |
| `project_services` | Habilitación GBP por proyecto | `services[].service_type='seo_local'`, `services[].is_active` |
| `article_analysis_index` | Resumen del artículo para contexto IA | `summary_150_words`, `search_intent`, `recommended_cta_type` |
| `business_calendar` | Días hábiles para calcular fecha GBP | `calendar_date`, `is_working_day` |
| `notifications_outbox` | Cola de notificaciones al líder | `user_id`, `type`, `payload`, `dedupe_key` |

### Funciones SQL

| Función | Evento | Rol |
|---|---|---|
| `fn_gbp_draft_on_validated()` | AFTER UPDATE `content_items` | Valida condiciones y llama a la Edge Function vía `pg_net` |

### Triggers

| Trigger | Tabla | Timing | Condición de activación |
|---|---|---|---|
| `trg_gbp_draft_on_validated` | `content_items` | AFTER UPDATE / FOR EACH ROW | `status → 'validated_by_content_manager'` + `content_type = 'blog_post'` + `gbp_status = 'pending'` + `gbp_post_content IS NULL` |

### Edge Functions

| Slug | Versión | Estado | `verify_jwt` | Rol |
|---|---|---|---|---|
| `gbp-post-generator` | 2 | ACTIVE | false | Orquesta: elegibilidad → slot → generación → grabado → notificación |

### Secrets requeridos en la Edge Function

| Secret | Origen |
|---|---|
| `SUPABASE_URL` | Auto-inyectado por Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-inyectado por Supabase |
| `ANTHROPIC_API_KEY` | Configurado en Supabase Dashboard → Edge Function Secrets |

---

## 4. Estado actual (datos reales)

| Métrica | Valor | Fecha |
|---|---|---|
| Artículos `content_items` total | 917 | 2026-05-17 |
| `gbp_status = 'pending'` | 900 | 2026-05-17 |
| `gbp_status = 'scheduled'` | 17 | 2026-05-17 |
| `gbp_status = 'published'` | 2 | 2026-05-17 |
| `gbp_status = 'draft_ready'` | 0 | 2026-05-17 |
| Proyectos con `seo_local` activo | 4 de 5 analizados | 2026-05-17 |
| Trigger en producción | ✅ `trg_gbp_draft_on_validated` | 2026-05-17 |
| Edge Function en producción | ✅ versión 2, ACTIVE | 2026-05-17 |
| Frontend panel validación | ❌ pendiente | 2026-05-17 |
| Frontend calendario trimestral | ❌ pendiente | 2026-05-17 |

---

## 5. Decisiones pendientes del dueño del producto

| # | Decisión requerida | Contexto | Urgencia |
|---|---|---|---|
| P-001 | ¿Criterio de priorización cuando hay > 4 artículos/mes? | Opción A: primeros 4 en llegar (FIFO). Opción B: los 4 con mayor `search_volume`. Actualmente se usa FIFO por slot mensual. | Media |
| P-002 | ¿Habilitar publicación automática en GBP API (Fase 2)? | Requiere OAuth2 con Google My Business API. El frontend muestra la fecha pero no publica automáticamente. | Baja (Fase 2) |
| P-003 | ¿Qué sucede con los 900 artículos existentes en `gbp_status = 'pending'`? | La automatización solo actúa sobre artículos nuevos. ¿Se hace una pasada retroactiva manual o se deja como está? | Media |
| P-004 | ¿El cliente ve el calendario GBP o solo el equipo interno? | Definir si el rol `cliente_user` tiene acceso de lectura al calendario trimestral. | Media |

---

## 6. Optimizaciones priorizadas

### Rápidas (< 1 día)
- Agregar `gbp_eligible` como campo calculado en el listado de artículos del Local SEO Hub para visibilidad inmediata
- Logging de cuándo se descarta un artículo por `over_quota` en `content_action_history`

### Medias (1–3 días)
- Panel frontend de validación para el líder SEO (ver `./propuestas-ops-control-plane/03-frontend-spec/frontend-spec.md`)
- Vista de calendario trimestral GBP agrupado por marca
- Batch retroactivo opcional para los 900 artículos en `pending` con priorización por `search_volume`

### Estratégicas (Fase 2)
- Integración con Google My Business API para publicación directa cuando `gbp_scheduled_date` llega
- Worker de publicación GBP que procese `notifications_outbox` con `type = 'gbp_publish'`
- Métricas de rendimiento del post GBP (clics, vistas) integradas al Smart Report

---

## 7. Links y referencias

| Recurso | Ruta / URL |
|---|---|
| Arquitectura detallada | [`./propuestas-ops-control-plane/architecture.md`](./propuestas-ops-control-plane/architecture.md) |
| Modelo de datos | [`./propuestas-ops-control-plane/data-model.md`](./propuestas-ops-control-plane/data-model.md) |
| Migración SQL (trigger) | [`./propuestas-ops-control-plane/01-database-migrations/001_gbp_trigger.sql`](./propuestas-ops-control-plane/01-database-migrations/001_gbp_trigger.sql) |
| Edge Function fuente | [`./propuestas-ops-control-plane/02-edge-functions/gbp-post-generator/index.ts`](./propuestas-ops-control-plane/02-edge-functions/gbp-post-generator/index.ts) |
| Spec frontend | [`./propuestas-ops-control-plane/03-frontend-spec/frontend-spec.md`](./propuestas-ops-control-plane/03-frontend-spec/frontend-spec.md) |
| Runbook operacional | [`./propuestas-ops-control-plane/runbook.md`](./propuestas-ops-control-plane/runbook.md) |
| Áreas de trabajo | [`./AREAS.md`](./AREAS.md) |
| Sesiones activas | [`./WORK_IN_PROGRESS.md`](./WORK_IN_PROGRESS.md) |
| Onboarding agente | [`./AGENT_ONBOARDING.md`](./AGENT_ONBOARDING.md) |
| Código en repo (Supabase) | `automations/gbp-post-generator/` |

---

## 7.5. Decisiones tomadas

| ID | Fecha | Decisión | Detalle |
|---|---|---|---|
| D-001 | 2026-05-17 | **Punto de disparo: `validated_by_content_manager`** | Se eligió este estado (y no `approved` ni `published`) porque es el primer momento en que el artículo tiene contenido revisado y listo. Dispara antes de publicar para tener tiempo de validación GBP. |
| D-002 | 2026-05-17 | **Cuota: 4 posts GBP por proyecto por mes** | Google Business Profile admite posts frecuentes pero el equipo definió 4/mes como ritmo sostenible. Se distribuyen en las 4 semanas del mes usando `business_calendar`. |
| D-003 | 2026-05-17 | **Solo `content_type = 'blog_post'`** | Las `service_page` y `landing_page` no son contenido editorial apto para GBP. El trigger tiene esta restricción codificada. |
| D-004 | 2026-05-17 | **El `lider_id` de `proyectos_seo` es el validador** | No se crea un rol nuevo. El campo ya existe en producción y representa al SEO líder asignado al proyecto. |
| D-005 | 2026-05-17 | **Habilitación GBP vía `project_services.seo_local.is_active`** | El campo ya existe en el onboarding de cada proyecto. Si `is_active = false` para `seo_local`, la Edge Function descarta el artículo silenciosamente. |
| D-006 | 2026-05-17 | **Generación con Claude Haiku** | Se elige Haiku (no Sonnet) por costo: el post es corto (70 palabras) y la tarea es de baja complejidad semántica. El `summary_150_words` de `article_analysis_index` provee contexto suficiente. |
| D-007 | 2026-05-17 | **`over_quota` como estado explícito** | Cuando no hay cupo en los próximos 4 meses, el artículo queda en `gbp_status = 'over_quota'` con nota en `gbp_notes`. No se bloquea ni se pierde — queda trazable para procesamiento futuro. |
| D-008 | 2026-05-17 | **Los 900 artículos existentes NO se procesan retroactivamente** | La automatización solo actúa sobre artículos nuevos. El backlog histórico requiere decisión explícita del owner (ver P-003). |

---

## 8. Bitácora

| Fecha | Evento |
|---|---|
| 2026-05-17 | Análisis completo de la base de datos Light\_House. Se identifican campos GBP pre-existentes en `content_items` (`gbp_post_content`, `gbp_status`, `gbp_scheduled_date`, `gbp_notes`). |
| 2026-05-17 | Se confirma `lider_id` en `proyectos_seo` y `seo_local` en `project_services` como las dos llaves de habilitación existentes. No se necesitan migraciones de nuevas columnas. |
| 2026-05-17 | Migración `gbp_automation_trigger` aplicada. Trigger `trg_gbp_draft_on_validated` creado con función `fn_gbp_draft_on_validated()` en producción. |
| 2026-05-17 | Edge Function `gbp-post-generator` desplegada en Light\_House (versión 2, `verify_jwt: false`). |
| 2026-05-17 | Documentación completa creada en `automations/Google Business Profile Publication/`. |
