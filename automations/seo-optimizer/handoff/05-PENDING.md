# PENDING — lo que falta para que el sistema funcione end-to-end

**Última actualización**: 2026-05-20

---

## Estado actual: el esqueleto está vivo, faltan credenciales externas

✅ **Funcionando ahora mismo:**
- DB en Light_House: 9 tablas + 6 vistas + 4 cron jobs activos
- Schema `seo_optimizer` expuesto al API de PostgREST (vía migración 007)
- 9 Edge Functions desplegadas y respondiendo
- Auth `x-internal-secret` operativa
- Cron mensual (día 1 de cada mes, 09:00 CO) intentará disparar al orquestador automáticamente
- Verificado manualmente: `seo-optimizer-orchestrator` crea row en `runs` correctamente

❌ **No hace nada útil aún porque faltan:**
1. Credenciales de Google Search Console
2. Credenciales de OpenRouter (para el agente LLM Redactor)
3. Bot de Slack (para notificaciones)
4. Al menos 1 cliente en `seo_optimizer.client_config`

Sin estos, el cron correrá el día 1, intentará pull GSC, fallará por falta de credenciales, y el run quedará marcado como `failed` en la tabla `runs`. Nadie se entera (Slack tampoco está configurado).

---

## Pendientes — paso a paso para terminar

Todos requieren acción tuya en interfaces externas (Google Cloud, Slack, OpenRouter). Yo no puedo crearlos desde aquí. Te dejo los comandos exactos para que después de crearlos cargues los valores en Supabase de un solo paso.

### Pendiente 1: Crear Service Account de Google Cloud + dar acceso a GSC

**Tiempo estimado: 15-20 minutos**

1. Ir a <https://console.cloud.google.com/iam-admin/serviceaccounts>
2. Si no hay proyecto, crear uno (ej. "orbit-seo-optimizer")
3. Click "Create Service Account"
   - Name: `seo-optimizer-gsc`
   - Description: "Service Account para leer GSC desde Edge Functions de seo-optimizer"
   - Roles a nivel proyecto: **NINGUNO** (los permisos GSC se otorgan por property)
4. Después de crear, click en la SA → Tab "Keys" → Add Key → Create new key → JSON
5. Descarga el archivo JSON (algo como `orbit-seo-optimizer-abc123.json`)
6. **Por cada cliente** que quieras procesar:
   - Ir a Google Search Console
   - Seleccionar la propiedad del cliente
   - Settings → Users and permissions → Add user
   - Pega el email de la SA (formato: `seo-optimizer-gsc@orbit-seo-optimizer.iam.gserviceaccount.com`)
   - Permiso: **"Full"** (obligatorio para usar API; "Restricted" no funciona)
   - Save

**Resultado**: tienes el contenido del JSON (es el valor de `GSC_SERVICE_ACCOUNT_JSON`)

### Pendiente 2: Crear API key en OpenRouter

**Tiempo estimado: 5 minutos**

1. Ir a <https://openrouter.ai/keys>
2. Sign up / login (puedes usar la cuenta de Google que ya tienes)
3. Click "Create Key" → asígnale un nombre (ej. "orbit-seo-optimizer")
4. Copia el token (`sk-or-v1-...`)
5. Settings → Credits → cargar $10-20 USD (el modelo Claude Sonnet 4.5 cobra ~$3/MTok input, ~$15/MTok output; 1 run mensual con 10 aprobaciones cuesta ~$1-3 USD)

**Resultado**: el token (es el valor de `OPENROUTER_API_KEY`)

### Pendiente 3: Crear bot de Slack (o reusar uno existente)

**Tiempo estimado: 10 minutos**

#### Opción A — Reusar bot existente (recomendado si ya tienes uno)
Si la agencia ya tiene un bot Slack (de seo_sentinel, Lighthouse, etc.):
1. Buscar el `xoxb-...` token en la doc del bot existente
2. Verificar que tenga estos scopes: `chat:write`, `chat:write.public`
3. Si le falta alguno, agregarlo en la Slack app config + reinstalar al workspace

#### Opción B — Crear bot nuevo
1. Ir a <https://api.slack.com/apps> → Create New App → From scratch
2. App Name: `Orbit SEO Optimizer` (o el que prefieras)
3. Pick the workspace
4. Una vez creada: OAuth & Permissions → scroll a "Bot Token Scopes" → Add:
   - `chat:write`
   - `chat:write.public`
5. Click "Install to Workspace" → autoriza
6. Copia el `xoxb-...` token (es el valor de `SLACK_BOT_TOKEN`)
7. **Invita al bot a los canales** donde notificará:
   - En Slack: ir al canal → "/invite @Orbit SEO Optimizer"
   - Repetir para cada canal de marca + el canal de admin

**También necesitas dos channel IDs:**
- `SLACK_FALLBACK_CHANNEL`: el canal default cuando un cliente no tiene canal específico (ej. #seo-optimizer-general)
- `SLACK_ADMIN_CHANNEL`: el canal de alertas del watchdog (ej. #seo-optimizer-admin)

Para obtener un channel ID: en Slack, click en el canal → "View channel details" → scroll abajo → "Channel ID" → copy. Formato: `C09XXXXXXXX`.

### Pendiente 4: Cargar todos los secrets a Supabase Edge Functions

**Tiempo estimado: 2 minutos** (una vez tengas todos los valores de pasos 1-3)

```bash
cd /c/Users/ceoel/temp/agents-automations-seo/automations/seo-optimizer

supabase secrets set --project-ref stjugsrkrweakvzmizpq \
  OPENROUTER_API_KEY="<sk-or-v1-...del paso 2>" \
  SLACK_BOT_TOKEN="<xoxb-...del paso 3>" \
  SLACK_FALLBACK_CHANNEL="<C09...del paso 3>" \
  SLACK_ADMIN_CHANNEL="<C09...del paso 3>" \
  GSC_SERVICE_ACCOUNT_JSON="$(cat /ruta/al/archivo-json-descargado.json)" \
  ORBIT_FRONTEND_URL="https://orbit.tu-dominio-de-orbit"
```

**Nota sobre `GSC_SERVICE_ACCOUNT_JSON`**: el `$(cat ...)` lee el archivo JSON completo y lo pasa como string. Asegúrate que la ruta apunte al archivo que descargaste de Google Cloud.

Si prefieres setearlos uno por uno via Dashboard de Supabase:
Dashboard → Project Settings → Edge Functions → Manage secrets.

### Pendiente 5: Onboard del primer cliente

**Tiempo estimado: 30 segundos**

En SQL Editor de Supabase (Dashboard → SQL Editor):

```sql
-- 1. Encontrar el client_id del cliente que quieras procesar
SELECT id, name FROM public.clientes WHERE name ILIKE '%tu-cliente%' LIMIT 5;

-- 2. Insertar config (reemplaza valores)
INSERT INTO seo_optimizer.client_config (
    client_id,                     -- UUID que sacaste arriba
    gsc_property_url,              -- 'sc-domain:tu-cliente.com' o 'https://tu-cliente.com/'
    is_active,
    slack_channel_id               -- canal donde quieres notificaciones para ESTE cliente (puede ser NULL para usar fallback)
) VALUES (
    'aquí-el-uuid-del-cliente',
    'sc-domain:dominio-del-cliente.com',
    TRUE,
    'C09XXXXXXX'
);

-- 3. Verificar
SELECT * FROM seo_optimizer.v_active_clients;
-- Debe mostrar el cliente que acabas de cargar.
```

### Pendiente 6: Smoke test end-to-end

**Tiempo estimado: 2 minutos**

```bash
# El internal secret está guardado localmente — alternativamente, copialo de:
# Dashboard → Vault → SEO_OPTIMIZER_INTERNAL_SECRET (decryptable)

SECRET=$(cat /tmp/seo_optimizer_secret.txt)
# O directamente:
# SECRET="89f57725e14b2cc40155de6df8f22b65a4588a7ee621c010afb233cab4c5b5a8"

curl -X POST "https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/seo-optimizer-orchestrator" \
  -H "x-internal-secret: $SECRET" \
  -H "content-type: application/json" \
  -d '{"trigger":"manual","period_days":90}'
```

Esperar 1-3 minutos. Después, verificar en SQL Editor:

```sql
-- ¿Se creó el run?
SELECT id, status, clients_total, clients_processed, clients_failed
FROM seo_optimizer.runs ORDER BY started_at DESC LIMIT 1;

-- ¿Hubo eventos?
SELECT event_source, event_type, COUNT(*)
FROM seo_optimizer.run_events
WHERE run_id = (SELECT id FROM seo_optimizer.runs ORDER BY started_at DESC LIMIT 1)
GROUP BY 1, 2;

-- ¿Aparecieron oportunidades?
SELECT category, COUNT(*) FROM seo_optimizer.opportunities
WHERE run_id = (SELECT id FROM seo_optimizer.runs ORDER BY started_at DESC LIMIT 1)
GROUP BY category;

-- ¿Llegó la notificación al outbox?
SELECT source, status, channel_id, sent_at
FROM public.notifications_outbox
WHERE source='seo_optimizer' ORDER BY created_at DESC LIMIT 5;
```

**Si todo OK:** verás un row en `runs` con status=`completed` o `partial`, eventos en `run_events`, oportunidades en `opportunities`, y la notificación llegando a Slack en ~1 minuto.

**Si hay errores:** mira `handoff/03-runbook.md` sección "Síntomas comunes y soluciones".

### Pendiente 7: Frontend (las 2 pestañas en Orbit)

**Tiempo estimado: depende del técnico de frontend (~1-2 días de trabajo)**

Pasarle al técnico el archivo `handoff/04-frontend-superprompt.md`. Es un brief completo y autocontenido — construye las pestañas de "SEO Review" (donde el especialista aprueba/rechaza) y "Redactor Inbox" (donde el redactor copia el HTML al CMS) sin más contexto.

---

## Resumen del progreso

| Paso | Quién | Estado |
|---|---|---|
| Schema en DB | Claude (yo, vía MCP) | ✅ |
| Cron jobs agendados | Claude | ✅ |
| Edge Functions desplegadas | Claude | ✅ (9/9) |
| `SEO_OPTIMIZER_INTERNAL_SECRET` en Vault + Edge Function secrets | Claude | ✅ |
| Schema expuesto a PostgREST | Claude | ✅ (migración 007) |
| Smoke test del orchestrator (sin clientes) | Claude | ✅ — responde "no_active_clients" como se espera |
| **Service Account de Google + acceso GSC** | Tú | ❌ pendiente |
| **OpenRouter API key** | Tú | ❌ pendiente |
| **Slack bot + channel IDs** | Tú | ❌ pendiente |
| **Cargar 4 secrets restantes a Edge Functions** | Tú (1 comando) | ❌ pendiente |
| **Onboard primer cliente** | Tú (1 SQL) | ❌ pendiente |
| **Smoke test end-to-end** | Tú (1 curl) | ❌ pendiente |
| **Frontend** | Tu técnico front | ❌ pendiente (super-prompt listo en `04-frontend-superprompt.md`) |

---

## Notas para no perderte

- El valor de `SEO_OPTIMIZER_INTERNAL_SECRET` que generé está guardado en `/tmp/seo_optimizer_secret.txt` (de tu sesión bash), pero también está en el Vault de Supabase y como secret de Edge Functions. **Si pierdes el archivo, lo puedes recuperar de Vault** con: `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='SEO_OPTIMIZER_INTERNAL_SECRET';` (desde SQL Editor de Supabase).

- Una vez que cargues los 4 secrets restantes y onboardes 1 cliente, **el cron del día 1 funcionará solo**. No tienes que dispararlo manualmente — es automático.

- Si quieres probar antes del día 1, simplemente corre el comando del paso 6 (smoke test) — dispara un run inmediato.

- Si algo falla durante el smoke test, **el watchdog del sistema** lo detecta y limpia automáticamente. Tu única intervención sería revisar logs en `seo_optimizer.run_events`.
