# Guía de configuración — Google Calendar API

**Para:** el miembro del equipo encargado de la configuración de credenciales.
**Resultado al terminar:** la automatización del calendario podrá crear eventos de Google Calendar con enlace de Google Meet y enviar las invitaciones.
**Tiempo estimado:** 45–60 minutos.

> **Concepto clave:** se configura **una sola vez, con una sola cuenta de Google de la agencia**. NO se necesita una configuración por cliente. Los clientes solo reciben la invitación por correo como invitados; no necesitan cuenta de Google ni autorizar nada.

---

## 1. Qué vas a generar

Estos 4 valores se cargan como *secrets* en Supabase (`Light_House`):

| Secret | Qué es | ¿Obligatorio? |
|---|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` | Identifica la aplicación ante Google | Sí |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | La "contraseña" de esa aplicación | Sí |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | El permiso permanente de la cuenta de la agencia | Sí |
| `GOOGLE_CALENDAR_ID` | Qué calendario usar (default `primary`) | Opcional |

---

## 2. Antes de empezar

1. La **cuenta de Google de la agencia** que será dueña del calendario (recomendado: la cuenta corporativa).
2. Acceso para **crear un proyecto en Google Cloud Console** con esa cuenta.
3. Acceso al proyecto de **Supabase `Light_House`** para cargar los secrets.
4. Decisión: ¿calendario principal de la cuenta o un calendario dedicado nuevo? Recomendado: uno dedicado.

> **No reutilices las credenciales `GSC_*`** existentes (son de Search Console). No sirven para Calendar.

---

## 3. Paso a paso

### Paso 1 — Crear/elegir el proyecto en Google Cloud Console
Entra a https://console.cloud.google.com/ con la cuenta de la agencia. Crea un proyecto, ej. `seolab-orbit-calendar`. Asegúrate de tenerlo seleccionado.

### Paso 2 — Habilitar la Google Calendar API
**APIs y servicios → Biblioteca** → busca **"Google Calendar API"** → **Habilitar**.

### Paso 3 — Configurar la pantalla de consentimiento OAuth
**APIs y servicios → Pantalla de consentimiento de OAuth**.
- Si la agencia usa **Google Workspace**: elige **User Type: Internal** (lo mejor — sin verificación, sin caducidad).
- Si es **Gmail normal**: elige **External**, completa los datos, y **publica la app** ("In production").

> ⚠️ **Crítico:** si queda en estado **"Testing"**, el refresh token **caduca a los 7 días** y la automatización se rompe sola. Debe quedar **Internal** o **In production**.

### Paso 4 — Crear las credenciales OAuth 2.0
**APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
- **Tipo: Aplicación web.**
- En **URIs de redireccionamiento autorizados**, agrega exactamente:
  ```
  https://developers.google.com/oauthplayground
  ```
- Pulsa **Crear**. Copia el **Client ID** y el **Client Secret**.

### Paso 5 — Generar el Refresh Token
1. Entra a https://developers.google.com/oauthplayground/
2. Engranaje **⚙️** (arriba a la derecha) → marca **"Use your own OAuth credentials"** → pega Client ID y Client Secret.
3. En **Step 1**, en *"Input your own scopes"*, escribe exactamente:
   ```
   https://www.googleapis.com/auth/calendar.events
   ```
4. **"Authorize APIs"** → inicia sesión con la **cuenta de la agencia** → acepta.
5. En **Step 2**, pulsa **"Exchange authorization code for tokens"**.
6. Copia el valor de **`refresh_token`** → ese es el `GOOGLE_CALENDAR_REFRESH_TOKEN`.

> Si no aparece `refresh_token`: revoca el acceso en https://myaccount.google.com/permissions (con la cuenta de la agencia) y repite el paso 5.

### Paso 6 — (Opcional) Calendario dedicado y su ID
En https://calendar.google.com/ crea un calendario "Reuniones Clientes" → su configuración → **"Integrar calendario"** → copia el **ID del calendario**. Ese es `GOOGLE_CALENDAR_ID`. Si usas el principal, omite este secret.

### Paso 7 — Cargar los secrets en Supabase
Supabase Dashboard → proyecto **`Light_House`** → **Edge Functions → Secrets**. Agrega cada uno con su **nombre exacto** (respetando mayúsculas). No hace falta volver a desplegar nada.

### Paso 8 — Verificar
Disparar `orbit-meeting-notify` con una reunión de prueba:
```json
{ "meeting_id": "<id>", "create_google_meet": true, "send_email": false }
```
**Éxito si:** la respuesta trae `meet_link` y `orbit_meetings.external_video_url` queda con un enlace de Meet.

---

## 4. Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `"Meet no creado: configura GOOGLE_CALENDAR_..."` | Falta un secret o el nombre está mal | Revisa el paso 7: nombres exactos |
| El token muere a los ~7 días | Pantalla de consentimiento en "Testing" | Paso 3: ponla "Internal" o "In production" y regenera |
| No aparece `refresh_token` | La cuenta ya autorizó antes | Revoca en myaccount.google.com/permissions y repite paso 5 |
| `redirect_uri_mismatch` | Falta la URI de redirección | Paso 4: agrega la URI del Playground exacta |
| Error 403 al crear el evento | API no habilitada o scope incorrecto | Verifica paso 2 y el scope `calendar.events` del paso 5 |

---

## 5. Seguridad

El **Client Secret** y el **Refresh Token** equivalen a una llave de la cuenta de Google de la agencia. No los pegues en chats ni documentos compartidos — cárgalos directo en Supabase y borra las copias temporales. Solo se necesita el scope `calendar.events`, nada más.

---

## 6. Checklist de entrega

- [ ] Proyecto en Google Cloud Console + **Google Calendar API habilitada**
- [ ] Pantalla de consentimiento en **Internal** o **In production** (NO "Testing")
- [ ] Credencial OAuth 2.0 tipo **Aplicación web** con la redirect URI del Playground
- [ ] **Refresh token generado** con scope `calendar.events`
- [ ] (Opcional) Calendario dedicado y su ID
- [ ] Los **4 secrets cargados en Supabase** con nombres exactos
- [ ] **Prueba del paso 8 exitosa**

Reporta de vuelta con el resultado del paso 8.
