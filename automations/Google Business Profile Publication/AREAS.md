# AREAS — Google Business Profile Publication

> Cada área es una unidad de trabajo paralelo-segura. Antes de trabajar, verifica la
> matriz de colisiones al final de este archivo. Registra tu sesión en WORK_IN_PROGRESS.md.

---

## Área A — Trigger & Activación

**Descripción:** Gestión del trigger SQL que dispara la automatización GBP.

**Responsabilidad:** Crear, modificar o depurar `trg_gbp_draft_on_validated` y `fn_gbp_draft_on_validated()` en la base de datos Light\_House.

**Archivos / componentes que tocas:**
- `fn_gbp_draft_on_validated()` — función trigger en Supabase
- `trg_gbp_draft_on_validated` — trigger en `content_items`
- `propuestas-ops-control-plane/01-database-migrations/001_gbp_trigger.sql`
- `automations/gbp-post-generator/supabase/migrations/20260517_gbp_automation_trigger.sql`

**Decisiones tomadas que aplican aquí:** D-001, D-003, D-008 (ver README sección 7.5)

**Pendientes en esta área:**
- [ ] Monitorear los primeros artículos reales que pasen por el trigger
- [ ] Confirmar que el timeout de 5000ms es suficiente (la Edge Function tarda ~3-8s — el trigger es async, no espera respuesta)
- [ ] Agregar log en `content_action_history` cuando el trigger descarta un artículo (no solo Warning en PostgreSQL)

**Áreas con las que choca:** B (ambas tocan la llamada pg_net), D (ambas controlan elegibilidad)

---

## Área B — Edge Function Core (Generación GBP)

**Descripción:** Lógica principal de la Edge Function `gbp-post-generator`: generación del post con Claude Haiku, escritura en `content_items` y notificación al líder.

**Responsabilidad:** Desarrollar, depurar y versionar la Edge Function en Light\_House.

**Archivos / componentes que tocas:**
- `automations/gbp-post-generator/supabase/functions/gbp-post-generator/index.ts`
- `propuestas-ops-control-plane/02-edge-functions/gbp-post-generator/index.ts`
- Edge Function `gbp-post-generator` en Supabase Dashboard

**Decisiones tomadas que aplican aquí:** D-006 (Claude Haiku), D-007 (over_quota explícito)

**Pendientes en esta área:**
- [ ] Testear con artículos reales y verificar calidad del output de Claude Haiku
- [ ] Ajustar el prompt del sistema si la calidad de los posts no es satisfactoria
- [ ] Agregar retry logic si la llamada a Anthropic API falla (actualmente lanza error 500)
- [ ] Considerar prompt caching de Anthropic para reducir costo en proyectos de alto volumen
- [ ] Verificar que `ANTHROPIC_API_KEY` esté configurado en Supabase Edge Function Secrets

**Áreas con las que choca:** A (la EF es llamada por el trigger), C (slot calculation vive en la EF), E (notificación vive en la EF)

---

## Área C — Cálculo de Slot Trimestral

**Descripción:** Lógica de distribución de las 4 fechas GBP mensuales usando `business_calendar`.

**Responsabilidad:** Ajustar o mejorar el algoritmo de `calculateGBPScheduledDate()` dentro de la Edge Function.

**Archivos / componentes que tocas:**
- `automations/gbp-post-generator/supabase/functions/gbp-post-generator/index.ts` (funciones `calculateGBPScheduledDate`, `countMonthlyGBPPosts`, `findFirstWorkingDayInRange`)
- Tabla `business_calendar` en Supabase (solo lectura)

**Decisiones tomadas que aplican aquí:** D-002 (4 posts/mes), D-007 (over_quota si no hay slot)

**Pendientes en esta área:**
- [ ] Verificar que `business_calendar` tiene datos cargados para 2026 completo
- [ ] Probar comportamiento en diciembre → enero (cruce de año)
- [ ] Evaluar si la distribución semanal fija (1-7, 8-14, 15-21, 22-31) es la más adecuada o si conviene espaciado dinámico
- [ ] Implementar lógica de re-procesamiento de artículos `over_quota` cuando se libera un slot

**Áreas con las que choca:** B (el cálculo vive dentro de la Edge Function)

---

## Área D — Elegibilidad por Proyecto

**Descripción:** Control de qué proyectos generan posts GBP, basado en `project_services.seo_local`.

**Responsabilidad:** Mantener la lógica de `isGBPEnabledForProject()` y asegurar que el campo `seo_local.is_active` en `project_services` esté correctamente configurado en el onboarding.

**Archivos / componentes que tocas:**
- `automations/gbp-post-generator/supabase/functions/gbp-post-generator/index.ts` (función `isGBPEnabledForProject`)
- Tabla `project_services` en Supabase
- Proceso de onboarding de nuevas marcas (documentación externa)

**Decisiones tomadas que aplican aquí:** D-005 (habilitación vía project_services)

**Pendientes en esta área:**
- [ ] Documentar en el proceso de onboarding que `seo_local.is_active = true` habilita la automatización GBP
- [ ] Verificar cuántos de los 23 proyectos tienen `seo_local` activo actualmente (se verificaron 4 de 5 analizados)
- [ ] Evaluar si se necesita un campo adicional `gbp_monthly_quota` configurable por proyecto (actualmente hardcodeado en 4)

**Áreas con las que choca:** A (la elegibilidad se verifica en la EF, no en el trigger)

---

## Área E — Sistema de Notificaciones

**Descripción:** Inserción y gestión de notificaciones al líder SEO vía `notifications_outbox`.

**Responsabilidad:** Asegurar que las notificaciones `gbp_draft_ready` llegan correctamente al `lider_id` y que el worker de notificaciones las procesa.

**Archivos / componentes que tocas:**
- `automations/gbp-post-generator/supabase/functions/gbp-post-generator/index.ts` (función `notifyLider`)
- Tabla `notifications_outbox` en Supabase
- Worker de notificaciones (sistema externo a esta automatización)

**Decisiones tomadas que aplican aquí:** D-004 (lider_id como validador)

**Pendientes en esta área:**
- [ ] Verificar que el worker de `notifications_outbox` procesa el `type = 'gbp_draft_ready'` correctamente
- [ ] Confirmar canal de entrega: ¿Slack?, ¿WhatsApp?, ¿notificación in-app?
- [ ] El campo `channel_id` en `notifications_outbox` puede usar `proyectos_seo.slack_channel_id` si el líder prefiere Slack
- [ ] Verificar que el `dedupe_key = 'gbp_draft_<content_item_id>'` previene duplicados en re-ejecuciones

**Áreas con las que choca:** B (la notificación se inserta dentro de la Edge Function)

---

## Área F — Frontend: Panel de Validación del Líder

**Descripción:** Implementación de la vista en `/team/local-seo-hub` donde el SEO líder revisa, edita, aprueba o rechaza los borradores GBP.

**Responsabilidad:** Construir los componentes React/Next.js del panel de validación siguiendo la spec en `03-frontend-spec/frontend-spec.md`.

**Archivos / componentes que tocas:**
- Repo `ops-control-plane`: `/team/local-seo-hub` (frontend)
- `propuestas-ops-control-plane/03-frontend-spec/frontend-spec.md`
- Tabla `content_items` (PATCH: `gbp_status`, `gbp_post_content`, `gbp_notes`)

**Decisiones tomadas que aplican aquí:** D-004 (lider_id valida), D-001 (solo draft_ready visible)

**Pendientes en esta área:**
- [ ] Implementar listado de artículos con `gbp_status = 'draft_ready'` filtrado por `lider_id`
- [ ] Textarea editable para `gbp_post_content` con contador de palabras en tiempo real (límite: 70 palabras, bloquear guardar si > 80)
- [ ] Botón APROBAR → PATCH `gbp_status = 'seo_approved'`
- [ ] Botón RECHAZAR → campo `gbp_notes` obligatorio → PATCH `gbp_status = 'rejected'`
- [ ] Estado vacío cuando no hay borradores pendientes
- [ ] Invalidar query al aprobar/rechazar para actualizar la lista

**Áreas con las que choca:** G (ambas son frontend dentro de la misma sección)

---

## Área G — Frontend: Calendario Trimestral GBP

**Descripción:** Vista de calendario de publicaciones GBP de los próximos 90 días, agrupada por marca, visible para todo el equipo.

**Responsabilidad:** Construir el componente de calendario trimestral en `/team/local-seo-hub`.

**Archivos / componentes que tocas:**
- Repo `ops-control-plane`: `/team/local-seo-hub` (frontend)
- `propuestas-ops-control-plane/03-frontend-spec/frontend-spec.md`
- Tabla `content_items` (lectura: `gbp_status IN ('seo_approved','scheduled','published')`)

**Decisiones tomadas que aplican aquí:** D-002 (4 posts/mes como meta visible)

**Pendientes en esta área:**
- [ ] Listado de posts GBP agendados próximos 90 días (`gbp_scheduled_date >= TODAY AND < TODAY+90`)
- [ ] Agrupación por mes y dentro de cada mes por marca
- [ ] Badge de estado (`seo_approved`, `scheduled`, `published`) con colores diferenciados
- [ ] Botón "Confirmar en calendario" para `seo_approved` → PATCH `gbp_status = 'scheduled'`
- [ ] Sidebar con contador por marca (meta: 4/mes × 3 meses = 12 publicaciones trimestrales)
- [ ] Vista de solo lectura para roles que no son líder

**Áreas con las que choca:** F (ambas son frontend, deben coordinarse en la misma PR)

---

## Área H — Publicación Automática GBP API (Fase 2)

**Descripción:** Integración con Google My Business API para publicar automáticamente el post cuando llega la `gbp_scheduled_date`.

**Responsabilidad:** Diseñar e implementar el worker de publicación GBP.

**Archivos / componentes que tocas:**
- Nueva Edge Function: `gbp-publisher` (por crear)
- Tabla `content_items` (PATCH: `gbp_status = 'published'`)
- Google My Business API (OAuth2 con service account)
- `integration_secrets` (para almacenar tokens GBP)

**Decisiones tomadas que aplican aquí:** P-002 (pendiente de aprobación del owner)

**Pendientes en esta área:**
- [ ] Decisión del owner (P-002): ¿se implementa publicación automática?
- [ ] Configurar Google My Business API: OAuth2 + refresh token por proyecto
- [ ] Diseñar el cron job que procese artículos con `gbp_status = 'scheduled'` y `gbp_scheduled_date <= NOW()`
- [ ] Manejar rate limits de Google (máx. 1 post/perfil/día recomendado)
- [ ] Definir qué hacer si la publicación falla (reintentos, notificación al líder)

**Áreas con las que choca:** B (comparte el patrón de Edge Function), E (necesita notificar al líder del resultado)

---

## Área I — Monitoreo y Observabilidad

**Descripción:** Métricas, alertas y herramientas de diagnóstico para la automatización GBP.

**Responsabilidad:** Crear queries de monitoreo, dashboards básicos y alertas para detectar fallos.

**Archivos / componentes que tocas:**
- Tabla `content_items` (lectura de métricas `gbp_status`)
- Tabla `content_generation_alerts` (si se integra sistema de alertas existente)
- `propuestas-ops-control-plane/runbook.md`

**Decisiones tomadas que aplican aquí:** Ninguna específica aún

**Pendientes en esta área:**
- [ ] Query de health check semanal: artículos en `draft_ready` sin revisar por más de 7 días
- [ ] Alerta si `over_quota` supera el 20% de artículos validados en un mes (señal de cuota insuficiente)
- [ ] Dashboard simple: tasa de aprobación vs rechazo por proyecto
- [ ] Log en `content_action_history` cuando la Edge Function descarta un artículo (actualmente solo `RAISE WARNING` en PostgreSQL)

**Áreas con las que choca:** Ninguna (solo lectura y documentación)

---

## Matriz de colisiones

| Área | A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|---|
| **A** Trigger | — | 🔴 | 🟡 | 🟡 | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ |
| **B** Edge Function | 🔴 | — | 🔴 | 🟡 | 🔴 | ⚪ | ⚪ | 🟡 | ⚪ |
| **C** Slot Cálculo | 🟡 | 🔴 | — | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ |
| **D** Elegibilidad | 🟡 | 🟡 | ⚪ | — | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ |
| **E** Notificaciones | ⚪ | 🔴 | ⚪ | ⚪ | — | ⚪ | ⚪ | 🟡 | ⚪ |
| **F** Frontend Validación | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | — | 🔴 | ⚪ | ⚪ |
| **G** Frontend Calendario | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | 🔴 | — | ⚪ | ⚪ |
| **H** GBP API (Fase 2) | ⚪ | 🟡 | ⚪ | ⚪ | 🟡 | ⚪ | ⚪ | — | ⚪ |
| **I** Monitoreo | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | — |

**Leyenda:**
- 🔴 Alto riesgo — no trabajar en paralelo sin coordinación explícita
- 🟡 Riesgo medio — coordinarse antes de empezar
- ⚪ Seguro para trabajo paralelo

---

## Cómo elegir tu área

**Prioridad 1 (bloqueante para el equipo):**
- **F** y **G** — el cliente no puede ver el calendario ni el líder puede validar sin el frontend

**Prioridad 2 (mejora de calidad):**
- **B** — ajuste de prompts y manejo de errores en la Edge Function
- **E** — confirmación del canal de notificación al líder

**Prioridad 3 (operacional):**
- **I** — monitoreo para detectar borradores sin revisar

**Fase 2 (no empezar hasta que P-002 esté aprobado por el owner):**
- **H** — publicación automática via Google My Business API
