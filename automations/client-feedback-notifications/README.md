# Client Feedback Notifications

> **automation_key:** `client-feedback-notifications`
> **Estado:** ✅ Productivo (v3)
> **Owner producto:** Accesos SEO
> **Última actualización:** 2026-05-16

Automatización que **acusa recibo por correo electrónico** cada vez que un cliente deja una observación (aprobación, rechazo, sugerencia de mejora o corrección) sobre un artículo en la plataforma Orbit Content Hub.

---

## 1. Qué hace

Cuando un cliente envía un feedback sobre un artículo desde la interfaz de Orbit:

1. La función `submit-client-article-feedback` (Edge Function de Supabase) recibe el payload con JWT del cliente.
2. Valida que el usuario tenga acceso al artículo (RLS a nivel de `cliente_users`).
3. Inserta la fila en `client_article_feedback`.
4. Actualiza `content_items.client_approval_status` según el tipo de feedback.
5. **Envía un correo de confirmación al cliente** vía Mailjet, en su idioma preferido.

El envío de correo es **no-fatal**: si Mailjet falla, el feedback queda guardado en base de datos y el error se loguea sin romper la respuesta HTTP.

---

## 2. Flujo end-to-end

```
[Cliente en UI Orbit]
      │
      │ POST /functions/v1/submit-client-article-feedback
      │ { content_item_id, tipo, descripcion, ... }
      ▼
[submit-client-article-feedback v3] ──► JWT auth + RLS check
      │
      ├─► INSERT INTO client_article_feedback
      │
      ├─► UPDATE content_items.client_approval_status
      │
      ├─► resolveRecipientLanguage(userId, clientId)
      │     ├─ 1. cliente_users.language    (preferencia usuario+marca)
      │     ├─ 2. clientes.language          (default por marca)
      │     └─ 3. "es"                       (default sistema)
      │
      ├─► buildFeedbackAckEmail(tipo, lang)  ──► HTML bilingüe/trilingüe
      │
      └─► POST https://api.mailjet.com/v3.1/send
            │ From: "Orbit Content Hub" <accesos@seolabagency.com>
            │ To:   <email del cliente>
            ▼
       [Cliente recibe email de acuse]
```

---

## 3. Componentes

### 3.1. Edge Function — `submit-client-article-feedback`

- **Proyecto Supabase:** Light_House (`stjugsrkrweakvzmizpq`)
- **Slug:** `submit-client-article-feedback`
- **Versión productiva:** v3 (2026-05-16)
- **`verify_jwt`:** true (requiere autenticación)
- **Variables de entorno requeridas:**
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
  - `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`

### 3.2. Tablas que consume

| Tabla | Lectura | Escritura | Para qué |
|---|---|---|---|
| `users` | ✅ (`email`, `full_name`) | ✗ | Resolver destinatario del correo |
| `content_items` | ✅ (`title`, `client_id`) | ✅ (`client_approval_status`, `fecha_aprobacion`) | Validar artículo + actualizar estado |
| `cliente_users` | ✅ (`language`) | ✗ | Verificar acceso del cliente + idioma usuario |
| `clientes` | ✅ (`language`) | ✗ | Idioma default de la marca |
| `client_article_feedback` | ✗ | ✅ (INSERT) | Persistir feedback |

### 3.3. Proveedor de email

- **Mailjet API v3.1** (`https://api.mailjet.com/v3.1/send`)
- **Remitente:** `Orbit Content Hub <accesos@seolabagency.com>`
- **Credenciales:** ya configuradas en Light_House (`MAILJET_API_KEY` + `MAILJET_SECRET_KEY`)

---

## 4. Idiomas soportados

| Código resuelto | Plantilla | Marcas típicas |
|---|---|---|
| `pt` | Português (pt-BR) | Cassino Bet, Vera Bet |
| `en` | English | Doug Construction, Armor Corp¹ |
| `es` | Español (default) | Floty, Leasy, Educa College Prep, Vozy AI¹ |

¹ Pendiente: marcas con `clientes.language = NULL`. Hasta que se setee, el sistema usa el default `"es"`. Ver sección **Pendientes**.

### Lógica de resolución (3 pasos en cascada)

```
1. SELECT language FROM cliente_users WHERE user_id = ? AND client_id = ?
   └─ Si está poblado → ese es el idioma final.

2. SELECT language FROM clientes WHERE id = ?
   └─ Si está poblado → idioma final = ese.

3. "es"
   └─ Default cuando ambos están NULL.
```

Normalización: cualquier variante (`"pt-BR"`, `"PT"`, `"en_US"`) se reduce a su código base (`pt`, `en`, `es`).

---

## 5. Tipos de feedback y plantillas

Cada plantilla tiene 4 variantes según `tipo`, con badge de color distinto:

| `tipo` | Badge color | ES | PT | EN |
|---|---|---|---|---|
| `aprobacion` | 🟢 verde | Aprobación | Aprovação | Approval |
| `rechazo` | 🔴 rojo | Rechazo | Rejeição | Rejection |
| `mejora` | 🟡 ámbar | Mejora | Melhoria | Improvement |
| `correccion` | 🟣 índigo | Corrección | Correção | Correction |

Ver muestras renderizadas en [`templates/`](templates/).

---

## 6. Cómo se invoca

### Desde la UI de Orbit (caso real)

```http
POST https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/submit-client-article-feedback
Authorization: Bearer <client_jwt>
Content-Type: application/json

{
  "content_item_id": "uuid-del-articulo",
  "tipo": "mejora",
  "area_afectada": "introduccion",
  "descripcion": "Sería mejor abrir con un dato cuantitativo del mercado.",
  "ejemplo_sugerido": "Ej: 'En 2025, el 78% de los apostadores...'"
}
```

**Respuesta exitosa (201):**

```json
{
  "success": true,
  "feedback_id": "uuid-del-feedback",
  "tipo": "mejora",
  "client_approval_status": "changes_requested",
  "message": "Feedback submitted successfully"
}
```

El correo de confirmación se envía **después** de la respuesta HTTP (asíncrono) — si falla, el cliente igual ve éxito.

---

## 7. Reglas de negocio

1. **`descripcion` debe tener ≥ 20 caracteres.** Si no, devuelve `400`.
2. **`tipo` debe ser uno de:** `mejora`, `correccion`, `aprobacion`, `rechazo`.
3. **El usuario debe estar en `cliente_users` para el `client_id` del artículo.** Si no, devuelve `403`.
4. **El email de confirmación es no-fatal.** Si Mailjet retorna error, el feedback ya quedó guardado y la respuesta es `201` igual.
5. **El idioma del correo nunca depende del idioma del artículo** — solo del cliente/usuario.

---

## 8. Pendientes (acción requerida)

| Item | Quién | Cómo |
|---|---|---|
| Setear `clientes.language = 'en'` para **Doug Construction** | producto | `UPDATE clientes SET language='en' WHERE name='Doug Construction';` |
| Setear `clientes.language` para Armor Corp, Holisteek, Vozy.ai | producto | Confirmar idioma por marca y actualizar |
| Backfill `cliente_users.language` para los 43 registros con `NULL` | producto | Decidir si default por marca o pedir al usuario |

**Estado actual de `clientes.language`** (consultado 2026-05-16):

| Marca | language |
|---|---|
| Cassino Bet | `pt` ✅ |
| Vera Bet | `pt` ✅ |
| Educa College Prep | `es` ✅ |
| Floty | `es` ✅ |
| Leasy | `es` ✅ |
| Armor Corp | `NULL` ⚠️ |
| Doug Construction | `NULL` ⚠️ |
| Holisteek | `NULL` ⚠️ |
| Vozy.ai | `NULL` ⚠️ |

---

## 9. Pruebas

### 9.1. Verificar resolución de idioma sin enviar correo

```sql
-- ¿Qué idioma resolvería para un usuario X en cliente Y?
SELECT
  COALESCE(
    cu.language,
    c.language,
    'es'
  ) AS resolved_lang,
  cu.language AS user_lang,
  c.language AS client_lang,
  c.name AS client_name
FROM clientes c
LEFT JOIN cliente_users cu
  ON cu.client_id = c.id AND cu.user_id = '<uuid-usuario>'
WHERE c.id = '<uuid-cliente>';
```

### 9.2. Prueba end-to-end (recomendado en staging)

1. Crear un cliente de prueba con `clientes.language = 'en'`.
2. Asociar un usuario a ese cliente vía `cliente_users` (dejar `cliente_users.language = NULL`).
3. Llamar la función con un JWT del usuario.
4. Verificar:
   - Fila nueva en `client_article_feedback`.
   - `content_items.client_approval_status` actualizado.
   - Correo recibido **en inglés** (badge "Improvement" si `tipo=mejora`).
5. Ahora setear `cliente_users.language = 'pt'` y repetir → correo debe llegar en portugués.

### 9.3. Verificar logs

```
[submit-client-article-feedback] Confirmation email sent to: <email> lang: <pt|en|es> | MessageID: <id>
```

Si ves `Mailjet error` en logs, revisar credenciales y formato del payload.

---

## 10. Bitácora

| Fecha | Versión | Cambio |
|---|---|---|
| 2026-05-16 | v1 | Función original creada por `Claude-chat-qa-reviewer` (S-016): insert + update sin email. |
| 2026-05-16 | v2 | Email de confirmación añadido (D-010). Idioma desde `content_items.language`, soporte pt/es. |
| 2026-05-16 | v3 | **Idioma resuelto desde `cliente_users.language` → `clientes.language` → `"es"`.** Plantilla en inglés añadida. Independiente del idioma del artículo. |

---

## 11. Áreas y responsables

| Área | Responsable | Archivos |
|---|---|---|
| Edge Function | Equipo Plataforma | `submit-client-article-feedback` v3 |
| Plantillas email | Producto | `templates/` (HTML estático de referencia) |
| Datos `clientes.language` | Producto | UPDATEs manuales según pendientes (sección 8) |
| Provider email | Equipo Plataforma | Credenciales Mailjet en Light_House |

---

## 12. Glosario rápido

- **Orbit Content Hub:** plataforma de la agencia donde los clientes revisan y aprueban artículos.
- **`tipo` del feedback:** clasificación que dispara el flujo (aprueba / rechaza / sugiere / corrige).
- **No-fatal:** una operación que, si falla, no rompe el flujo principal.
- **JWT:** token que identifica al cliente al hacer la petición.
- **RLS:** Row Level Security de Postgres (Supabase) — permisos a nivel de fila.
