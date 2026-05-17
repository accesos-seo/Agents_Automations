# CHANGELOG — Google Business Profile Publication

## [1.0.0] — 2026-05-17

### Added
- Trigger `trg_gbp_draft_on_validated` en `content_items` (AFTER UPDATE, FOR EACH ROW)
- Función SQL `fn_gbp_draft_on_validated()` con 5 guards de seguridad
- Edge Function `gbp-post-generator` v2 en Light\_House (ACTIVE, `verify_jwt: false`)
  - Verificación de elegibilidad vía `project_services.seo_local.is_active`
  - Cálculo de slot trimestral con `business_calendar` (4 semanas por mes, hasta 4 meses adelante)
  - Generación de post GBP 60–70 palabras con Claude Haiku (`claude-haiku-4-5-20251001`)
  - Fallback de contexto: `summary_150_words` → `meta_description` → `title`
  - Soporte bilingüe (ES/EN detectado por `content_items.language`)
  - Escritura de `gbp_post_content`, `gbp_scheduled_date`, `gbp_status = 'draft_ready'`
  - Inserción en `notifications_outbox` para `lider_id` del proyecto
  - Estado `over_quota` cuando no hay slot disponible en los próximos 4 meses
- Documentación completa en `automations/Google Business Profile Publication/`

### Pending (Fase 2)
- Panel frontend de validación del líder SEO en `/team/local-seo-hub`
- Vista de calendario trimestral GBP por marca
- Worker de publicación automática vía Google My Business API
