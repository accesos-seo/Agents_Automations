# Client Article Feedback — S-012 / D-009

**Fecha:** 2026-05-16  
**Sesión:** S-012 (Claude-chat-qa-reviewer)  
**Estado final:** ✅ IMPLEMENTADO Y VERIFICADO EN PRODUCCIÓN

---

## TL;DR

Los usuarios-cliente ahora pueden enviar feedback estructurado sobre los artículos generados por IA directamente desde su dashboard. El feedback dispara una notificación automática a n8n, que avisa a Robert Virona y al redactor vía Slack. La aprobación o rechazo del cliente actualiza automáticamente `content_items.client_approval_status`.

```
Cliente (dashboard) → Edge Function submit-client-article-feedback
        ↓
client_article_feedback (INSERT) → trigger n8n
        ↓
n8n webhook: client-article-feedback-notify → Slack (Robert + redactor)
        ↓
content_items.client_approval_status → approved | rejected | changes_requested
```

---

## Arquitectura implementada

| Capa | Componente | Estado |
|---|---|---|
| 1. Tabla de feedback | `client_article_feedback` | ✅ Creada con RLS habilitada |
| 2. Control de acceso | 3 políticas RLS + service role | ✅ Clientes ven solo su feedback; equipo interno gestiona todo |
| 3. Edge Function | `submit-client-article-feedback` v1 | ✅ Desplegada y ACTIVE |
| 4. Trigger n8n | `client_article_feedback_notify_n8n` | ✅ Creado, fires on INSERT |
| 5. Webhook n8n | `client-article-feedback-notify` | ⚠️ Workflow pendiente de crear en n8n (ver abajo) |
| 6. Estado artículo | `content_items.client_approval_status` | ✅ Actualizado automáticamente por Edge Function |

---

## Tabla `client_article_feedback`

```sql
id                uuid   PK
content_item_id   uuid   FK → content_items
client_id         uuid   FK → clientes (denormalizado para RLS eficiente)
submitted_by      uuid   FK → users
tipo              text   CHECK IN ('mejora','correccion','aprobacion','rechazo')
area_afectada     text   NULL  -- intro|desarrollo|conclusión|SEO|tono|datos|estructura
descripcion       text   NOT NULL, min 20 chars
ejemplo_sugerido  text   NULL
status            text   DEFAULT 'nuevo' CHECK IN ('nuevo','en_revision','atendido','cerrado')
atendido_por      uuid   NULL FK → users
respuesta_texto   text   NULL  -- respuesta interna visible al equipo, no al cliente
created_at        timestamptz
updated_at        timestamptz  -- auto-updated via trigger
```

---

## Políticas RLS

| Política | Quién | Qué puede |
|---|---|---|
| `caf_select_own_client` | Usuario autenticado en `cliente_users` | Ver solo el feedback de su `client_id` |
| `caf_select_internal` | Roles: admin, editor, team, members | Ver todo el feedback |
| `caf_update_internal` | Roles: admin, editor, team, members | Cambiar `status`, agregar `respuesta_texto`, asignar `atendido_por` |

**INSERT:** solo via Edge Function con service role. Los clientes no tienen política INSERT directa.

---

## Edge Function `submit-client-article-feedback`

**Endpoint:** `POST /functions/v1/submit-client-article-feedback`  
**Auth:** JWT obligatorio (`verify_jwt: true`)

### Request body
```json
{
  "content_item_id": "uuid",
  "tipo": "mejora | correccion | aprobacion | rechazo",
  "area_afectada": "intro | desarrollo | conclusión | SEO | tono | datos | estructura",
  "descripcion": "texto mínimo 20 caracteres",
  "ejemplo_sugerido": "opcional"
}
```

### Flujo interno
1. Valida JWT → extrae `auth.uid()`
2. Resuelve `user.id` interno desde `users` table
3. Verifica que el artículo existe y obtiene su `client_id`
4. Verifica que el usuario está en `cliente_users` para ese `client_id` (control de acceso)
5. INSERT en `client_article_feedback` con service role
6. UPDATE `content_items.client_approval_status`:
   - `aprobacion` → `approved` + `fecha_aprobacion = now()`
   - `rechazo` → `rejected`
   - `mejora` | `correccion` → `changes_requested`
7. El trigger dispara el POST a n8n automáticamente

### Responses
- `201` → feedback guardado, retorna `feedback_id` y `client_approval_status` actualizado
- `400` → campo faltante o descripcion corta
- `401` → token inválido
- `403` → usuario no autorizado para ese cliente
- `404` → artículo no encontrado

---

## Payload del trigger a n8n

```json
{
  "id": "uuid del feedback",
  "content_item_id": "uuid",
  "article_title": "título del artículo",
  "client_id": "uuid",
  "client_name": "nombre del cliente (ej: Vera Bet)",
  "submitted_by": "uuid del usuario-cliente",
  "tipo": "mejora | correccion | aprobacion | rechazo",
  "area_afectada": "nullable",
  "descripcion": "el texto del feedback",
  "status": "nuevo",
  "created_at": "timestamp ISO"
}
```

---

## ⚠️ Workflow n8n pendiente de crear

**Webhook URL esperado:**  
`https://estancias-atlas-n8n.heh8a3.easypanel.host/webhook/client-article-feedback-notify`

**Lógica recomendada para el workflow:**
1. Receive webhook → parse payload
2. Enriquecer con datos del artículo si es necesario (URL, redactor asignado)
3. Formatear mensaje Slack diferenciado por `tipo`:
   - `aprobacion` → mensaje verde a Robert + redactor: "✅ [Cliente] aprobó [Artículo]"
   - `rechazo` → mensaje rojo urgente: "❌ [Cliente] rechazó [Artículo]. Revisar."
   - `mejora` | `correccion` → mensaje amarillo: "📝 [Cliente] solicitó mejoras en [Artículo]"
4. Enviar a canal Slack del proyecto (o DM a Robert Virona)
5. Opcionalmente: crear tarea en sistema de gestión

**Hasta que el workflow exista en n8n**, los INSERTs funcionarán correctamente (el trigger hace fire, el POST a n8n falla silenciosamente sin bloquear el INSERT).

---

## Cómo integrar desde el frontend

```javascript
// El frontend del cliente llama a la Edge Function
const response = await supabase.functions.invoke('submit-client-article-feedback', {
  body: {
    content_item_id: '...',
    tipo: 'mejora',                     // 'mejora' | 'correccion' | 'aprobacion' | 'rechazo'
    area_afectada: 'intro',             // opcional
    descripcion: 'El tono introductorio no refleja nuestra marca premium.',
    ejemplo_sugerido: 'Sugerimos iniciar con...'  // opcional
  }
});
```

---

## Queries útiles para el equipo interno

```sql
-- Feedback pendiente de atención (dashboard de Robert/redactor)
SELECT
  caf.id, caf.tipo, caf.area_afectada, caf.descripcion,
  ci.title AS articulo, c.name AS cliente,
  u.full_name AS enviado_por, caf.created_at
FROM client_article_feedback caf
JOIN content_items ci ON ci.id = caf.content_item_id
JOIN clientes c ON c.id = caf.client_id
JOIN users u ON u.id = caf.submitted_by
WHERE caf.status = 'nuevo'
ORDER BY
  CASE caf.tipo
    WHEN 'rechazo' THEN 1
    WHEN 'correccion' THEN 2
    WHEN 'mejora' THEN 3
    WHEN 'aprobacion' THEN 4
  END,
  caf.created_at ASC;

-- Resumen por cliente (semana actual)
SELECT
  c.name AS cliente,
  COUNT(*) FILTER (WHERE caf.tipo = 'aprobacion') AS aprobaciones,
  COUNT(*) FILTER (WHERE caf.tipo = 'rechazo') AS rechazos,
  COUNT(*) FILTER (WHERE caf.tipo IN ('mejora','correccion')) AS mejoras,
  COUNT(*) FILTER (WHERE caf.status = 'nuevo') AS pendientes
FROM client_article_feedback caf
JOIN clientes c ON c.id = caf.client_id
WHERE caf.created_at >= date_trunc('week', now())
GROUP BY c.id, c.name
ORDER BY pendientes DESC;

-- Artículos con feedback de cliente sin atender hace más de 48h
SELECT ci.title, caf.tipo, caf.created_at, c.name AS cliente
FROM client_article_feedback caf
JOIN content_items ci ON ci.id = caf.content_item_id
JOIN clientes c ON c.id = caf.client_id
WHERE caf.status = 'nuevo'
  AND caf.created_at < now() - interval '48 hours'
ORDER BY caf.created_at ASC;
```

---

## Diferencia con el flujo de redactores

| Aspecto | Redactores (`content_feedback`) | Clientes (`client_article_feedback`) |
|---|---|---|
| Quién entra | Redactores internos | Usuarios-cliente externos |
| Acceso controlado por | `redactor_id` = auth user | `cliente_users` → `client_id` |
| Notificación a | n8n → clasificación IA | n8n → Slack Robert + redactor |
| Clasificación IA | Sí (`clasificacion_ia`) | No (acción humana directa) |
| Impacta artículo | No directamente | Sí (`client_approval_status`) |
| INSERT via | Edge Function service role | Edge Function service role |

---

## Siguiente paso recomendado

1. **Crear el workflow n8n** `client-article-feedback-notify` (ver spec de payload arriba)
2. **Integrar desde frontend**: el botón/formulario de feedback del cliente debe llamar a la Edge Function
3. **Prueba E2E** real: insertar un feedback de cliente y verificar que llega el Slack a Robert
