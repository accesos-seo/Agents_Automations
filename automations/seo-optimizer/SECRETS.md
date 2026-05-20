# Secrets — seo-optimizer

Lista corta de secrets necesarios. Mucho más simple que antes — todo vive en Supabase ahora.

---

## En Supabase Vault (proyecto `Light_House`)

`pg_cron` lo lee desde aquí. Para setearlo: Dashboard → Project Settings → Vault → New Secret.

| Nombre | De dónde obtenerlo | Quién lo usa |
|---|---|---|
| `SEO_OPTIMIZER_INTERNAL_SECRET` | Generar: `openssl rand -hex 32` | `pg_cron` lo envía en header `x-internal-secret` a las Edge Functions; las funciones verifican que coincida. |

**Eso es todo lo que va en Vault.** Ya no necesitamos `SEO_OPTIMIZER_RAILWAY_URL` (deprecado).

---

## En Supabase Edge Functions — Secrets

Estos se setean para que cada Edge Function los reciba como `Deno.env.get(...)`.

**Cómo setearlos** — dos opciones:

### Opción A: Vía Supabase CLI (recomendado)

```bash
cd seo-optimizer
supabase secrets set --project-ref stjugsrkrweakvzmizpq \
  SEO_OPTIMIZER_INTERNAL_SECRET="<el mismo valor de Vault>" \
  OPENROUTER_API_KEY="<sk-or-v1-...>" \
  SLACK_BOT_TOKEN="<xoxb-...>" \
  SLACK_FALLBACK_CHANNEL="<C09...>" \
  SLACK_ADMIN_CHANNEL="<C09...>" \
  GSC_SERVICE_ACCOUNT_JSON='<JSON entero de la SA key como string>' \
  SEO_OPTIMIZER_MODEL="anthropic/claude-sonnet-4.5" \
  ORBIT_FRONTEND_URL="https://orbit.<tu-dominio>"
```

### Opción B: Dashboard Supabase

Dashboard → Edge Functions → tu función → Settings → Manage Secrets.
Setear los mismos valores uno por uno. Los secrets son compartidos entre todas las Edge Functions del proyecto.

---

## Tabla completa de variables

| Nombre | Tipo / Formato | De dónde |
|---|---|---|
| `SUPABASE_URL` | `https://stjugsrkrweakvzmizpq.supabase.co` | Inyectada automáticamente por Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT largo | Inyectada automáticamente por Supabase |
| `SEO_OPTIMIZER_INTERNAL_SECRET` | 64-char hex | Tu generación con `openssl rand -hex 32` (debe coincidir con Vault) |
| `GSC_SERVICE_ACCOUNT_JSON` | JSON string completo | Google Cloud Console → IAM → Service Accounts → Keys → JSON |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | <https://openrouter.ai/keys> |
| `SEO_OPTIMIZER_MODEL` | `anthropic/claude-sonnet-4.5` | Hardcoded por defecto, opcional |
| `SLACK_BOT_TOKEN` | `xoxb-...` | Slack app config → OAuth & Permissions |
| `SLACK_FALLBACK_CHANNEL` | `C09...` | ID del canal en Slack (Channel Details → Copy ID) |
| `SLACK_ADMIN_CHANNEL` | `C09...` | ID del canal admin para alertas del watchdog |
| `ORBIT_FRONTEND_URL` | `https://orbit.tu-dominio.com` | URL base del front de Orbit (para construir links en notifications) |

---

## Generación detallada de cada secret

### `SEO_OPTIMIZER_INTERNAL_SECRET`

```bash
openssl rand -hex 32
# Output ejemplo: 9f3b2e8c1a7d4f6e0b9c8a5d3e7f1b2a4c6d8e0f2a4b6c8d1e3f5a7b9c0d2e4f
```

Debe quedar **EXACTAMENTE el mismo valor** en:
1. Vault de Supabase (donde lo lee `pg_cron`)
2. Edge Function secrets (donde lo verifica cada función)

### `GSC_SERVICE_ACCOUNT_JSON`

1. **Si ya hay una Service Account creada** para `seo_sentinel`, reusarla. Sigue al paso 3.
2. **Si no existe**:
   - Google Cloud Console → IAM & Admin → Service Accounts → Create Service Account.
   - Roles necesarios: NINGUNO a nivel project (los permisos GSC se otorgan en cada propiedad).
   - Después de crear: Keys → Add Key → Create New Key → JSON → descargar.
3. Por cada cliente del que quieras pull data:
   - Google Search Console → la propiedad del cliente → Settings → Users and permissions
   - Add User → pega el email de la Service Account (algo como `xxx@yyy.iam.gserviceaccount.com`)
   - Permiso: **"Full"** (debe ser Full, no Restricted, para usar la API)
4. El contenido del archivo JSON descargado es el valor de la env var. Pégalo COMPLETO como string (mantiene los `\n`).

### `OPENROUTER_API_KEY`

1. <https://openrouter.ai/keys> → Sign up / login → Create new key.
2. Setear límite de gasto razonable (ej. $50/mes) en Settings → Credits.
3. Verificar que `anthropic/claude-sonnet-4.5` está disponible. Si dice "requires credits", agrega $5+ a la cuenta.

### `SLACK_BOT_TOKEN`

Si ya hay un bot Slack para `seo_sentinel` o Lighthouse, **reusarlo**.

Si no existe:
1. <https://api.slack.com/apps> → Create New App → From scratch → asigna nombre y workspace.
2. OAuth & Permissions → scroll a "Bot Token Scopes" → agrega:
   - `chat:write`
   - `chat:write.public`
3. Click "Install to Workspace" → autoriza.
4. Copia el `xoxb-...` token.
5. **Invita al bot a los canales** donde va a postear: `/invite @<nombre-del-bot>` dentro de cada canal.

### `SLACK_FALLBACK_CHANNEL`, `SLACK_ADMIN_CHANNEL`

En Slack: click en el canal → ver detalles → desplázate al final → "Channel ID" → Copy.
Formato: `C09XXXXXXXX`.

### `ORBIT_FRONTEND_URL`

La URL pública del front de Orbit (sin trailing slash). Si todavía no existe el front, déjalo en un placeholder como `https://orbit.local` y actualízalo cuando lo despliegues.

---

## Verificación

Después de setear todo, verifica que llegó al lugar correcto:

```sql
-- En SQL Editor de Supabase, verifica el Vault:
SELECT name FROM vault.secrets WHERE name LIKE 'SEO_OPTIMIZER_%';
-- Debe mostrar: SEO_OPTIMIZER_INTERNAL_SECRET
```

```bash
# Para verificar los secrets de Edge Functions:
supabase secrets list --project-ref stjugsrkrweakvzmizpq
# Debe listar las 8 vars (no muestra el valor, solo el nombre, lo cual es correcto)
```

---

## Rotación

| Secret | Frecuencia recomendada | Procedimiento |
|---|---|---|
| `SEO_OPTIMIZER_INTERNAL_SECRET` | 6 meses | Generar nuevo, actualizar Vault Y Edge Function secrets simultáneamente |
| `GSC_SERVICE_ACCOUNT_JSON` | Cuando se rote la SA | Crear nueva key, actualizar secrets, dejar la anterior activa 24h, luego revocar |
| `OPENROUTER_API_KEY` | Si se compromete | Crear nueva en dashboard, actualizar secrets |
| `SLACK_BOT_TOKEN` | Si se compromete | Slack app → Regenerate, actualizar secrets |

---

## ⚠️ NO commitear

- Los valores reales NUNCA en código, prompts o documentación.
- Si alguien comparte un secret por error en un commit, **regenerarlo inmediatamente** (no basta con git rm — el historial lo retiene).
