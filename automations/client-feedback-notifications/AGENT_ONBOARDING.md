# Agent Onboarding — Client Feedback Notifications

> Si tomas una sesión sobre esta automatización, lee este archivo entero antes de tocar nada. <2 minutos.

---

## 1. Qué es esto

Automatización que envía un correo de acuse al cliente cada vez que deja una observación sobre un artículo en Orbit Content Hub. Ver [`README.md`](README.md) para la descripción completa.

**Estado:** ✅ Productivo (v3, desplegado 2026-05-16).
**Edge Function:** `submit-client-article-feedback` en Light_House (`stjugsrkrweakvzmizpq`).

---

## 2. Lo que NO debes hacer

1. **No cambiar la lógica de validación de RLS** sin revisar [`automations/seo-content-swarm-engine/README.md`](../seo-content-swarm-engine/README.md) D-008 (Reviewer Section).
2. **No quitar la verificación de `cliente_users`.** Es el control de acceso. Si un usuario no está vinculado a un cliente, no puede enviar feedback.
3. **No hacer el envío de email bloqueante.** Debe permanecer en un `try/catch` y solo loguear errores. Si rompe, perdimos el feedback ante el cliente.
4. **No cambiar el remitente (`accesos@seolabagency.com`)** sin coordinar con producto — el dominio está autenticado en Mailjet.
5. **No agregar idiomas nuevos sin agregar las 4 plantillas (`aprobacion`, `rechazo`, `mejora`, `correccion`).**

---

## 3. Cómo está organizado el código

`submit-client-article-feedback/index.ts` está en una sola pieza:

```
import + env vars
APPROVAL_STATUS_MAP (tipo → status de content_items)
─── Language resolution ───
  normalizeLang(raw)
  resolveRecipientLanguage(adminClient, userId, clientId)
─── Email template ───
  esc(s)                       (XSS escape)
  buildFeedbackAckEmail(tipo, articleTitle, recipientName, lang)
  renderEmailHtml(data, feedbackId, lang)
  sendConfirmationEmail(...)   (llama Mailjet)
─── Main handler ───
  Deno.serve(async (req) => { ... })
```

El bloque "Main handler" es lineal: auth → validate body → resolve user → validate article → validate access → INSERT feedback → UPDATE content_items → resolve lang → send email → respond 201.

---

## 4. Cómo modificar

### 4.1. Cambiar texto de una plantilla

Editar `buildFeedbackAckEmail` en `index.ts`, dentro del bloque `PT`, `EN` o `ES` según el idioma. Cada bloque tiene los 4 `tipo`. Asegúrate de mantener consistencia de tono entre idiomas.

### 4.2. Agregar un idioma nuevo (ej. `fr`)

1. En `normalizeLang`, agregar el código en el `if`.
2. Cambiar el tipo de retorno de `"pt" | "en" | "es"` a `"pt" | "en" | "es" | "fr"`.
3. En `buildFeedbackAckEmail`, crear el objeto `FR: Record<string, FeedbackEmailData> = { ... }` con los 4 `tipo`.
4. En la línea `const dict = lang === "pt" ? PT : lang === "en" ? EN : ES`, agregar el branch para `fr`.

### 4.3. Cambiar la jerarquía de resolución de idioma

Editar `resolveRecipientLanguage` en `index.ts`. La función actual hace 2 queries en serie:
1. `cliente_users.language` para `(user_id, client_id)`
2. `clientes.language` para `client_id`
3. Default `"es"`.

Si quieres priorizar `clientes` sobre `cliente_users`, invierte el orden.

### 4.4. Cambiar el proveedor de email (ej. de Mailjet a Resend)

1. Editar `sendConfirmationEmail` para cambiar la URL del fetch y el body.
2. Cambiar las env vars que se leen (`MAILJET_*` → `RESEND_*`).
3. Verificar que el nuevo provider acepta el header `From: "Orbit Content Hub <accesos@seolabagency.com>"` o cambiar a un domain verificado.
4. Probar end-to-end con un cliente de staging.

---

## 5. Tablas que toca

Todas en Light_House (`stjugsrkrweakvzmizpq`, schema `public`).

| Tabla | Operación | Notas |
|---|---|---|
| `users` | SELECT | FK desde `auth.users.id` o lookup por email. |
| `content_items` | SELECT + UPDATE | UPDATE solo de `client_approval_status` y `fecha_aprobacion`. |
| `cliente_users` | SELECT | Control de acceso + idioma del usuario. |
| `clientes` | SELECT | Idioma default por marca. |
| `client_article_feedback` | INSERT | Persistir feedback. |

---

## 6. Variables de entorno

| Var | Origen | Para qué |
|---|---|---|
| `SUPABASE_URL` | Auto-inyectada por Supabase | API base |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-inyectada por Supabase | Cliente admin |
| `SUPABASE_ANON_KEY` | Auto-inyectada por Supabase | Cliente para verificar JWT |
| `MAILJET_API_KEY` | Vault / Edge Function secrets | API Key Mailjet |
| `MAILJET_SECRET_KEY` | Vault / Edge Function secrets | Secret Key Mailjet |

Si `MAILJET_*` faltan, la función NO falla — solo loguea warning y no envía email. El feedback queda guardado de todas formas.

---

## 7. Sesiones relacionadas

| Sesión | Automatización origen | Qué hizo |
|---|---|---|
| S-010 | `seo-content-swarm-engine` | QA del Reviewer Section interno (`content_feedback`) — diferente al feedback de cliente. |
| S-014 (reusada) | `seo-content-swarm-engine` | Webhook briefs n8n. No relacionada directamente. |
| S-015 | `seo-content-swarm-engine` | Migración de brand voices — no relacionada. |
| **S-016** | `seo-content-swarm-engine` | **Creó tabla `client_article_feedback` + RLS + Edge Function v1.** ← origen |
| **S-017** | **client-feedback-notifications** | **Email confirmación v2 (idioma desde artículo).** |
| **S-018** | **client-feedback-notifications** | **Email v3 (idioma desde cliente/usuario) + automatización documentada.** ← más reciente |

---

## 8. Riesgos conocidos

1. **`clientes.language = NULL` para varias marcas.** Hoy esos clientes reciben email en `es` por default. Ver "Pendientes" en README.
2. **Mailjet rate limit.** En modo gratis es ~6 emails/segundo. Si hay un pico de feedback, podría rebotar. No hay retry en cola — el feedback queda guardado pero el email se pierde.
3. **No hay opt-out de notificaciones.** Si un cliente envía 100 feedbacks en un día recibe 100 emails. Considerar agrupar si esto se vuelve problema.
4. **Hardcoded email del remitente.** `accesos@seolabagency.com` está en código. Si cambia el dominio, hay que editar y redeploy.

---

## 9. Cómo cerrar tu sesión

Mismo protocolo que [`automations/seo-content-swarm-engine/WORK_IN_PROGRESS.md`](../seo-content-swarm-engine/WORK_IN_PROGRESS.md): mueve tu fila a "cerradas", documenta el resultado, agrega bitácora si cambiaste código.

---

## 10. Atajos útiles

- **Logs de la Edge Function:** Supabase Dashboard → Light_House → Edge Functions → `submit-client-article-feedback` → Logs.
- **Verificar correos enviados:** Mailjet Dashboard → Statistics → API messages.
- **Listar feedbacks recientes:**

```sql
SELECT id, tipo, status, descripcion, created_at, submitted_by, client_id
FROM client_article_feedback
ORDER BY created_at DESC
LIMIT 20;
```

- **Verificar idiomas por cliente:**

```sql
SELECT name, language FROM clientes ORDER BY name;
SELECT client_id, user_id, language FROM cliente_users WHERE language IS NOT NULL;
```
