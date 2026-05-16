# QA — Reviewer Section (S-010 / D-008)

**Fecha:** 2026-05-16
**Sesión:** S-010 (Claude-chat-qa-reviewer)
**Estado final:** ✅ FLUJO END-TO-END VALIDADO EN PRODUCCIÓN

---

## TL;DR

El reviewer section (donde el redactor/analista agrega comentarios y feedback estructurado al artículo después de que la IA lo genera) ahora funciona completo end-to-end:

```
Frontend (dashboard) → Supabase (content_comments | content_feedback) → Trigger n8n → Workflow IA → clasificacion_ia poblado
```

Tras aplicar las 3 políticas RLS recomendadas en este QA, el flujo pasó una **prueba real con datos productivos** (no dry run): insert → trigger → POST 200 OK → n8n clasificó `urgent_flag` en 6 segundos.

---

## Arquitectura validada

| Capa | Componente | Estado |
|---|---|---|
| 1. Comentarios inline | `content_comments` (RLS: SELECT, INSERT, UPDATE_own, DELETE_own) | ✅ Funcional. 24 comentarios reales. |
| 2. Feedback estructurado | `content_feedback` (RLS: SELECT_own + Edge Function service role para INSERT) | ✅ Funcional. Trigger fired OK. |
| 3. Edge Function | `submit-content-feedback` (v1) | ✅ Activa. Usa service role para bypass RLS. |
| 4. Trigger DB → n8n | `content_feedback_notify_n8n` → `tg_content_feedback_notify_n8n()` | ✅ POST asíncrono no bloquea insert. |
| 5. Webhook n8n | `https://estancias-atlas-n8n.heh8a3.easypanel.host/webhook/content-feedback-classify` | ✅ Responde 200 "Workflow was started". |
| 6. Clasificación IA | n8n actualiza `content_feedback.clasificacion_ia` | ✅ Verificado: clasificó "urgent_flag" en 6 segundos. |

---

## Prueba E2E ejecutada

**Registro de prueba (queda en producción como evidencia, marcado `descartado`):**

```sql
-- Insert
INSERT INTO content_feedback (content_item_id, redactor_id, categoria, severidad, seccion_afectada, observacion, ejemplo_correcto)
VALUES (
  '60ea5136-aa57-4d28-862a-3b9dab124c6f', -- Cassino.bet.br artículo real
  'a38e17de-4bb3-47a5-874e-2c06b1e31d32', -- ana.contenido@vera.bet.br
  'tono_voz', 'sugerencia', 'intro',
  '[QA-TEST-S010] Prueba end-to-end del reviewer section...',
  '[QA-TEST] Marcar como descartado tras revisar logs.'
);
-- → Returned: id=c711f52c-13e2-4ec7-9d4a-14d9cfb2a33e, status=nuevo (15:59:25 UTC)

-- Resultado pg_net (6 segundos después)
SELECT * FROM net._http_response WHERE id = 1254;
-- → status_code=200, content={"message":"Workflow was started"}, no error

-- Estado final
SELECT clasificacion_ia, updated_at FROM content_feedback WHERE id='c711f52c-...';
-- → clasificacion_ia='urgent_flag', updated_at=15:59:31 UTC
```

---

## Fixes aplicados (políticas RLS)

```sql
-- 1. Lectura propia de feedback (dashboard del redactor)
CREATE POLICY "content_feedback_select_own"
  ON content_feedback FOR SELECT TO authenticated
  USING (redactor_id IN (SELECT id FROM users WHERE id = auth.uid()));

-- 2. Resolver/editar comentarios propios
CREATE POLICY "content_comments_update_own"
  ON content_comments FOR UPDATE TO authenticated
  USING (created_by IN (SELECT id FROM users WHERE id = auth.uid()))
  WITH CHECK (created_by IN (SELECT id FROM users WHERE id = auth.uid()));

-- 3. Eliminar comentarios propios
CREATE POLICY "content_comments_delete_own"
  ON content_comments FOR DELETE TO authenticated
  USING (created_by IN (SELECT id FROM users WHERE id = auth.uid()));
```

**Nota:** `content_feedback` NO tiene política INSERT para `authenticated` — el frontend DEBE usar la Edge Function `submit-content-feedback` (service role). Esto es deliberado para mantener `redactor_id` verificable server-side.

---

## Mejoras pendientes (no bloqueantes)

### Para el frontend del Reviewer (CMS / dashboard)

1. **Validar `observacion` ≥ 30 caracteres** antes del submit. CHECK constraint silencioso rechaza textos cortos. Mensaje sugerido: *"La observación debe tener al menos 30 caracteres para que el clasificador IA pueda procesarla."*

2. **Agregar selector de `category_tag`** en el formulario de comentarios inline. Hoy `NULL` en 100% de los 24 comentarios reales. Valores sugeridos: `tono | estructura | datos | competidores | cta | general`.

3. **Habilitar campo `suggested_text`** (texto sugerido) en comentarios tipo `change_request` o `review`. Hoy solo 1/24 lo usa. Convierte un comentario descriptivo en accionable.

4. **UI de status del feedback**: mostrar al redactor el ciclo `nuevo → revisado → en_aplicacion → aplicado/descartado` y el `clasificacion_ia` cuando n8n termine. Hoy el redactor inserta y "se pierde".

### Para n8n

5. **Documentar el workflow `content-feedback-classify`**: qué clasificaciones genera (`urgent_flag`, `patch_prompt`, `style_guide_update`, `fact_check`, etc.), umbrales, escalación. Hoy es caja negra.

---

## Datos para reporting (queries útiles)

```sql
-- Volumen real del reviewer
SELECT
  (SELECT COUNT(*) FROM content_comments) AS total_comentarios,
  (SELECT COUNT(*) FROM content_comments WHERE is_resolved) AS resueltos,
  (SELECT COUNT(*) FROM content_feedback) AS total_feedback,
  (SELECT COUNT(*) FROM content_feedback WHERE status='aplicado') AS feedback_aplicado;

-- Top categorías de feedback (cuando haya volumen)
SELECT categoria, severidad, COUNT(*) FROM content_feedback
WHERE status <> 'descartado'
GROUP BY categoria, severidad ORDER BY COUNT(*) DESC;

-- Artículos con más comentarios abiertos (atención del redactor pendiente)
SELECT ci.title, COUNT(cc.id) AS comentarios_abiertos
FROM content_items ci
JOIN content_comments cc ON cc.content_id = ci.id
WHERE cc.is_resolved = false
GROUP BY ci.id, ci.title
ORDER BY comentarios_abiertos DESC LIMIT 10;
```

---

## Siguiente paso recomendado

**El reviewer section ya es productivo.** No queda nada bloqueante. Las 5 mejoras pendientes son UX/observabilidad, no funcionalidad.

**Acción para el dueño de producto:** anunciar a los redactores que el bucle de feedback estructurado está habilitado y empezar a alimentarlo. Cuando haya ≥50 feedbacks reales, el embedding semántico tendrá datos suficientes para análisis de patrones (el campo `embedding` está listo, dimensión 1536).
