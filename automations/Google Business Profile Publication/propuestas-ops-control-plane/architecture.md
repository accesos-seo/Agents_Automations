# Arquitectura — Google Business Profile Publication

## Visión general

La automatización conecta el pipeline de contenido SEO existente (centrado en `content_items`) con el ciclo de publicación de Google Business Profile, sin crear tablas nuevas ni modificar el flujo de validación de artículos.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PIPELINE EXISTENTE                    AUTOMATIZACIÓN GBP (nueva)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

content_items                          project_services
status='validated_by_content_manager'  seo_local.is_active=true
        │                                      │
        ▼                                      ▼
trg_gbp_draft_on_validated  ◄──── Guards compuestos (5 condiciones)
        │
        │ pg_net.http_post (async)
        ▼
gbp-post-generator (Edge Function)
        │
        ├── isGBPEnabledForProject()  ──────► project_services
        │
        ├── calculateGBPScheduledDate()
        │       ├── countMonthlyGBPPosts()  ─► content_items
        │       └── findFirstWorkingDay()   ─► business_calendar
        │
        ├── Fetch en paralelo:
        │       ├── fetchContentItem()       ─► content_items
        │       ├── fetchArticleAnalysis()   ─► article_analysis_index
        │       └── fetchProjectInfo()       ─► proyectos_seo
        │
        ├── generateGBPPost()  ─────────────► Anthropic API (Claude Haiku)
        │
        ├── saveGBPDraft()  ─────────────────► content_items (PATCH)
        │       gbp_post_content
        │       gbp_scheduled_date
        │       gbp_status='draft_ready'
        │
        └── notifyLider()  ──────────────────► notifications_outbox (INSERT)
                                                user_id = lider_id
                                                type = 'gbp_draft_ready'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VALIDACIÓN HUMANA (frontend pendiente)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

notifications_outbox  ──► Líder SEO (notificación)
        │
        ▼
Local SEO Hub (/team/local-seo-hub)
        │
   APROBAR ──────────────────────────────► content_items
        │       gbp_status='seo_approved'       │
        │       gbp_post_content (editable)      │
        │                                        │
   RECHAZAR ─────────────────────────────► content_items
                gbp_status='rejected'
                gbp_notes (obligatorio)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CALENDARIO TRIMESTRAL (frontend pendiente)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

content_items
gbp_status IN ('seo_approved','scheduled','published')
gbp_scheduled_date entre HOY y HOY+90 días
        │
        ▼
Calendario trimestral por marca
(meta: 4 posts/mes × 3 meses = 12 entradas)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PUBLICACIÓN AUTOMÁTICA (Fase 2 — no implementada)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

content_items (gbp_status='scheduled', gbp_scheduled_date <= NOW())
        │
        ▼
gbp-publisher (Edge Function — por crear)
        │
        ▼
Google My Business API
        │
        ▼
content_items → gbp_status='published'
```

---

## Principios de diseño

**Reutilización total de infraestructura existente.** Los campos GBP (`gbp_post_content`, `gbp_status`, `gbp_scheduled_date`, `gbp_notes`) ya existían en `content_items`. `project_services.seo_local` ya configuraba la habilitación GBP en el onboarding. `proyectos_seo.lider_id` ya identificaba al SEO líder. `business_calendar` ya era la fuente de días hábiles para otras automatizaciones. `notifications_outbox` ya era el canal de notificaciones del sistema.

**Asincronía total.** El trigger llama a la Edge Function con `pg_net` (fire-and-forget, timeout 5s). La transacción del artículo nunca espera la respuesta GBP. Si la Edge Function falla, el artículo no se bloquea.

**Ciclo de vida trazable.** Cada transición de `gbp_status` queda registrada en `content_action_history` vía el trigger existente `log_content_changes_trigger`.

**Cuota respetada automáticamente.** La Edge Function consulta cuántos posts GBP tiene el proyecto en el mes objetivo antes de generar. Si el cupo (4) está lleno, avanza al siguiente mes. Si no hay cupo en 4 meses, marca `over_quota`.

---

## Flujo de estados GBP

```
           ┌─────────────────────────────────┐
           │                                 │
    INSERT  │        pending                 │ Estado inicial de todo artículo nuevo
           │           │                    │
           │           │ UPDATE status=      │
           │           │ 'validated_by_      │
           │           │  content_manager'   │
           │           ▼                    │
           │      [trigger activa]           │
           │           │                    │
           │    ┌──────┴──────┐             │
           │    │             │             │
           │ seo_local    seo_local         │
           │ activo       inactivo          │
           │    │             │             │
           │    │         (sin cambio)      │
           │    ▼             │             │
           │ draft_ready ◄────┘             │ Borrador generado, espera validación
           │    │                           │
           │ ┌──┴───┐                       │
           │ │      │                       │
           │ ▼      ▼                       │
           │ seo_   rejected                │ Aprobado o rechazado por el líder
           │ approved                       │
           │ │                             │
           │ ▼                             │
           │ scheduled                     │ Confirmado en el calendario trimestral
           │ │                             │
           │ ▼                             │
           │ published                     │ Publicado en GBP (Fase 2)
           │                               │
           │ over_quota                    │ Sin cupo en los próximos 4 meses
           └─────────────────────────────────┘
```
