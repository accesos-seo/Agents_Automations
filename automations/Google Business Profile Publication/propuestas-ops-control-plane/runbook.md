# Runbook — Google Business Profile Publication

Procedimientos operacionales para diagnosticar, depurar y mantener la automatización GBP.

---

## 1. Verificar que la automatización está activa

```sql
-- Confirmar que el trigger existe en producción
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'content_items'
  AND trigger_name = 'trg_gbp_draft_on_validated';
-- Resultado esperado: 1 fila con event_manipulation='UPDATE', action_timing='AFTER'

-- Confirmar que la función trigger existe
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'fn_gbp_draft_on_validated';
-- Resultado esperado: 1 fila con routine_type='FUNCTION'
```

Verificar la Edge Function en Supabase Dashboard → `stjugsrkrweakvzmizpq` → Edge Functions → `gbp-post-generator` → debe mostrar Status: **ACTIVE**.

---

## 2. Monitorear el estado del pipeline GBP

```sql
-- Distribución actual de gbp_status
SELECT gbp_status, COUNT(*) as total
FROM content_items
WHERE content_type = 'blog_post'
GROUP BY gbp_status
ORDER BY total DESC;

-- Borradores pendientes de validación por más de 7 días (alerta de backlog)
SELECT ci.id, ci.title, ps.nombremarca, ci.gbp_scheduled_date, ci.updated_at
FROM content_items ci
JOIN proyectos_seo ps ON ps.id = ci.proyecto_id
WHERE ci.content_type = 'blog_post'
  AND ci.gbp_status = 'draft_ready'
  AND ci.updated_at < NOW() - INTERVAL '7 days'
ORDER BY ci.updated_at ASC;

-- Posts GBP agendados próximos 30 días
SELECT ci.title, ps.nombremarca, ci.gbp_scheduled_date, ci.gbp_status
FROM content_items ci
JOIN proyectos_seo ps ON ps.id = ci.proyecto_id
WHERE ci.content_type = 'blog_post'
  AND ci.gbp_status IN ('seo_approved', 'scheduled')
  AND ci.gbp_scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
ORDER BY ci.gbp_scheduled_date ASC;

-- Artículos over_quota (sin cupo trimestral)
SELECT ci.id, ci.title, ps.nombremarca, ci.gbp_notes
FROM content_items ci
JOIN proyectos_seo ps ON ps.id = ci.proyecto_id
WHERE ci.gbp_status = 'over_quota'
ORDER BY ci.updated_at DESC;
```

---

## 3. Verificar notificaciones pendientes al líder

```sql
-- Notificaciones GBP en cola (pendientes de envío)
SELECT id, user_id, target_id, status, attempts, created_at
FROM notifications_outbox
WHERE type = 'gbp_draft_ready'
  AND status = 'pending'
ORDER BY created_at DESC;

-- Notificaciones con error
SELECT id, user_id, target_id, status, attempts, error_message, created_at
FROM notifications_outbox
WHERE type = 'gbp_draft_ready'
  AND status NOT IN ('pending', 'sent')
ORDER BY created_at DESC;
```

---

## 4. Diagnosticar por qué un artículo no generó GBP

**Paso 1:** Verificar el estado del artículo:
```sql
SELECT id, title, content_type, status, gbp_status, gbp_post_content, proyecto_id
FROM content_items
WHERE id = '<content_item_id>';
```

**Paso 2:** Verificar si el proyecto tiene GBP habilitado:
```sql
SELECT proyecto_id, is_active,
  services -> 'seo_local' as seo_local_entry
FROM project_services
WHERE proyecto_id = '<proyecto_id>'
  AND is_active = true;

-- O directamente:
SELECT jsonb_path_exists(services, '$[*] ? (@.service_type == "seo_local" && @.is_active == true)')
FROM project_services
WHERE proyecto_id = '<proyecto_id>';
```

**Paso 3:** Verificar cuota mensual:
```sql
SELECT COUNT(*) as gbp_posts_este_mes
FROM content_items
WHERE proyecto_id = '<proyecto_id>'
  AND content_type = 'blog_post'
  AND gbp_status IN ('draft_ready', 'seo_approved', 'scheduled', 'published')
  AND gbp_scheduled_date >= date_trunc('month', CURRENT_DATE)
  AND gbp_scheduled_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';
-- Si es >= 4, el artículo quedará over_quota
```

**Paso 4:** Revisar logs de la Edge Function en Supabase Dashboard → Logs → Edge Functions → `gbp-post-generator`.

---

## 5. Forzar generación GBP para un artículo específico

Si un artículo quedó en `pending` y necesitas forzar la generación (por ejemplo, porque el trigger no corrió):

```sql
-- Opción 1: Resetear el gbp_status y volver a validar el artículo
-- (esto re-dispara el trigger si el status ya estaba en validated_by_content_manager)
UPDATE content_items
SET gbp_status = 'pending',
    gbp_post_content = NULL,
    gbp_scheduled_date = NULL,
    updated_at = NOW()
WHERE id = '<content_item_id>';

-- Luego hacer un UPDATE que dispare el trigger:
UPDATE content_items
SET status = 'draft',
    updated_at = NOW()
WHERE id = '<content_item_id>';

UPDATE content_items
SET status = 'validated_by_content_manager',
    updated_at = NOW()
WHERE id = '<content_item_id>';
```

**Opción 2:** Llamar directamente a la Edge Function desde el Supabase Dashboard o via curl:
```bash
curl -X POST 'https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/gbp-post-generator' \
  -H 'Content-Type: application/json' \
  -d '{
    "content_item_id": "<uuid>",
    "proyecto_id": "<uuid>",
    "client_id": "<uuid>"
  }'
```

---

## 6. Reprocesar artículos over_quota

Cuando haya cupo disponible en un mes futuro, reprocesar artículos `over_quota`:

```sql
-- Ver cuántos artículos over_quota hay por proyecto
SELECT ps.nombremarca, COUNT(*) as total_over_quota
FROM content_items ci
JOIN proyectos_seo ps ON ps.id = ci.proyecto_id
WHERE ci.gbp_status = 'over_quota'
GROUP BY ps.nombremarca
ORDER BY total_over_quota DESC;

-- Resetear un lote de over_quota para que la EF los re-intente
-- (hazlo manualmente uno por uno, verificando cupo primero)
UPDATE content_items
SET gbp_status = 'pending',
    gbp_notes = NULL,
    updated_at = NOW()
WHERE id = '<content_item_id>'
  AND gbp_status = 'over_quota';
-- Luego disparar el trigger con el UPDATE de status descrito en paso 5
```

---

## 7. Verificar que `business_calendar` tiene datos futuros

```sql
-- ¿Cuántos días hábiles tiene el calendar en los próximos 90 días?
SELECT COUNT(*) as dias_habiles
FROM business_calendar
WHERE calendar_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
  AND is_working_day = true;
-- Resultado esperado: ~65 días hábiles en 90 días

-- ¿Hasta qué fecha llega el calendar?
SELECT MAX(calendar_date) as ultimo_dia FROM business_calendar;
-- Si el último día es menor a CURRENT_DATE + 90, la EF puede fallar en slots futuros
```

---

## 8. Checklist de health check semanal

- [ ] `gbp_status = 'draft_ready'` sin revisar por más de 7 días → notificar al líder
- [ ] `notifications_outbox` tipo `gbp_draft_ready` con `status != 'sent'` → revisar worker
- [ ] `over_quota` > 20% de artículos validados ese mes → evaluar aumentar cuota
- [ ] `business_calendar` tiene datos >= próximos 90 días → si no, cargar más datos
- [ ] Edge Function `gbp-post-generator` → Status: ACTIVE en Supabase Dashboard
- [ ] `ANTHROPIC_API_KEY` configurado en Edge Function Secrets → verificar en Dashboard
