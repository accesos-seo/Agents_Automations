# SECRETS — `seo_sentinel`

Secretos requeridos en **Supabase Vault** del proyecto Light_House (project ref `stjugsrkrweakvzmizpq`). Estos NO se ponen en `.env` ni quedan en el código — los inyecta Supabase a las edge functions vía `Deno.env.get(...)`.

## Cómo configurarlos

1. Ir al [Dashboard Light_House → Settings → Vault](https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/settings/vault/secrets)
2. Por cada entry de la tabla, click "New Secret" → ingresar `name` y `value`
3. Después del primer deploy, las edge functions tendrán acceso automático

## Entries

| Nombre | Tipo | Cómo se obtiene | Notas |
|---|---|---|---|
| `SEO_SENTINEL_INTERNAL_SECRET` | hex 64 chars | `openssl rand -hex 32` | Header `x-internal-secret` entre fns. NO debe filtrarse fuera de Supabase. |
| `SUPABASE_FUNCTIONS_URL` | URL | `https://stjugsrkrweakvzmizpq.functions.supabase.co` (sin slash final) | Usado por watchdog SQL para POST a edge fns |
| `GSC_SERVICE_ACCOUNT_JSON` | JSON | Google Cloud Console → IAM → Service Accounts → Create → keys → Add JSON key. Pegar TODO el JSON. | Necesita scope `https://www.googleapis.com/auth/webmasters.readonly`. **La SA debe estar agregada como Owner/Restricted user en CADA propiedad GSC.** |
| `GA4_SERVICE_ACCOUNT_JSON` | JSON (opcional) | Mismo método que GSC. Puede ser misma SA. | Si no se setea, se reusa `GSC_SERVICE_ACCOUNT_JSON`. Scope: `analytics.readonly`. La SA debe ser Viewer en cada GA4 property. |
| `OPENROUTER_API_KEY` | `sk-or-...` | https://openrouter.ai/keys → Create Key | Para LLM (Claude Sonnet) en detective y dispatcher. |
| `SEO_SENTINEL_MODEL` | string | default: `anthropic/claude-sonnet-4` | Modelo OpenRouter. Cambiar si querés probar otro. |
| `SLACK_BOT_TOKEN` | `xoxb-...` | Slack App → OAuth & Permissions → Bot User OAuth Token | Scopes mínimos: `chat:write`, `chat:write.public`, `im:write`. Invitar al bot a TODOS los canales destino. |
| `CEO_SLACK_USER_ID` | `U05ABC...` | Slack: profile del CEO → More → Copy member ID | Recibe DM en TODA alerta. Si está vacío, el dispatcher falla loudly (intencional). |
| `SLACK_FALLBACK_CHANNEL` | `C09ABC...` | ID del canal fallback en Slack | Se usa cuando una brand no tiene `brand_team_routing` configurado. |
| `SLACK_ADMIN_CHANNEL` | `C09ABC...` | ID del canal admin/dev en Slack | Recibe alertas del watchdog (runs huérfanos, sistema caído). |

## SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY

Estos **NO** se cargan al Vault — los inyecta automáticamente Supabase a las edge functions:
- `Deno.env.get("SUPABASE_URL")` → URL del proyecto
- `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` → service role key (acceso total)

Si por alguna razón fallan al leer, podés setearlos explícitamente como Vault entries.

## Setup del Service Account (GSC + GA4)

### 1. Crear Service Account en Google Cloud

```bash
# En GCP Console:
# - Crear proyecto (o usar uno existente)
# - Habilitar las APIs:
#   · Google Search Console API
#   · Google Analytics Data API
# - IAM → Service Accounts → Create
# - Asignar role "Owner" o crear custom role con permisos mínimos
# - Keys → Add Key → JSON → descargar
```

### 2. Agregar SA como usuario en GSC

Por **cada propiedad GSC** (cada cliente):
1. Search Console → seleccionar propiedad
2. Settings → Users and permissions → Add user
3. Email: el `client_email` del JSON de la SA (ej: `seo-sentinel@my-project.iam.gserviceaccount.com`)
4. Permission: **Restricted** (read-only es suficiente)

### 3. Agregar SA como Viewer en GA4

Por **cada propiedad GA4**:
1. Analytics → Admin → Property → Property Access Management
2. Add user: email de la SA
3. Role: **Viewer**

### 4. Pegar el JSON en Vault

```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "...",
  "client_id": "...",
  "auth_uri": "...",
  "token_uri": "..."
}
```

Pegar como string en Vault. El módulo `_shared/gsc-api.ts` hace `JSON.parse` y firma JWT internamente.

## Setup del Slack Bot

### 1. Crear Slack App

1. https://api.slack.com/apps → Create New App → From scratch
2. Nombre: `seo-sentinel` (o el que prefieras), workspace: SeoLab Agency

### 2. Scopes mínimos

OAuth & Permissions → Bot Token Scopes:
- `chat:write` — enviar mensajes a canales donde está invitado
- `chat:write.public` — enviar a canales públicos sin invitación
- `im:write` — abrir DM con usuarios

### 3. Install to Workspace

OAuth & Permissions → Install to Workspace → copiar el "Bot User OAuth Token" (`xoxb-...`)

### 4. Invitar el bot a los canales destino

En cada canal del routing:
```
/invite @seo-sentinel
```

Sin esto, `chat.postMessage` devuelve `not_in_channel` y la alerta queda en outbox failed.

### 5. CEO Slack User ID

Para encontrar el ID de un usuario:
- Slack → profile del CEO → More (⋮) → Copy member ID
- Formato: `U05ABC123XYZ`

El bot necesita poder hacer DM al CEO. Con `im:write` scope debería poder; si no, el CEO tiene que escribirle primero al bot.

## Verificación

Una vez todo seteado, podés probar manualmente:

```bash
# Test del orchestrator (fuerza un run sin esperar al cron):
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/seo-sentinel-orchestrator \
  -H "x-internal-secret: <SEO_SENTINEL_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'
```

Verificar en SQL Editor:
```sql
SELECT * FROM seo_sentinel.analysis_runs ORDER BY started_at DESC LIMIT 1;
SELECT * FROM seo_sentinel.run_events ORDER BY occurred_at DESC LIMIT 20;
SELECT * FROM seo_sentinel.v_pipeline_health;
```
