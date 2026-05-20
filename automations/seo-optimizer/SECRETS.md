# Secrets — seo-optimizer

Lista exhaustiva de secrets que el sistema necesita. Algunos se setean en **Supabase Vault** (porque `pg_cron` los lee), otros como **env vars en Railway** (porque los lee el container Python).

---

## En Supabase Vault (proyecto `Light_House`)

`pg_cron` consulta estos via `vault.decrypted_secrets`. Para setearlos: Dashboard → Project Settings → Vault → New Secret.

| Nombre | Tipo / Formato | De dónde obtenerlo | Quién lo usa |
|---|---|---|---|
| `SEO_OPTIMIZER_INTERNAL_SECRET` | 64-char hex random | Generar: `openssl rand -hex 32` | `pg_cron` lo envía en header `x-internal-secret` a Railway; los handlers Python lo verifican |
| `SEO_OPTIMIZER_RAILWAY_URL` | URL `https://...railway.app` | Railway dashboard → Settings → Domains | `pg_cron` lo usa para `net.http_post(url := ...)` |

Estos dos secrets se leen vía:
```sql
SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SEO_OPTIMIZER_INTERNAL_SECRET';
```

---

## En Railway (env vars del container)

Settings del proyecto Railway → Variables. Estos se inyectan como `os.environ` en Python.

| Nombre | Tipo / Formato | De dónde obtenerlo | Quién lo usa |
|---|---|---|---|
| `SUPABASE_URL` | `https://stjugsrkrweakvzmizpq.supabase.co` | Dashboard Supabase → Settings → API | `supabase_client.py` |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT largo | Dashboard Supabase → Settings → API → `service_role` (NO el `anon`) | `supabase_client.py` — bypass RLS para escritura desde agentes |
| `SEO_OPTIMIZER_INTERNAL_SECRET` | mismo valor que en Vault | El que generaste arriba | Verificación de header `x-internal-secret` |
| `GSC_SERVICE_ACCOUNT_JSON` | JSON string (toda la key file de la SA) | Google Cloud Console → IAM → Service Accounts → Keys | `gsc_api.py` — autenticación con GSC |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | <https://openrouter.ai/keys> | `llm_client.py` — llamadas a Claude Sonnet |
| `SEO_OPTIMIZER_MODEL` | `anthropic/claude-sonnet-4.5` (o el más reciente) | OpenRouter model list | `llm_client.py` |
| `SLACK_BOT_TOKEN` | `xoxb-...` | Slack app config → OAuth & Permissions | `slack_blockkit.py` |
| `SLACK_FALLBACK_CHANNEL` | `C09...` (channel ID) | Slack channel link → ID al final | Fallback cuando no hay routing por cliente |
| `SLACK_ADMIN_CHANNEL` | `C09...` | Slack | Alertas del watchdog (pipeline failures) |
| `LOG_LEVEL` | `INFO` (default) o `DEBUG` | n/a | logging |

---

## Generación de cada secret — pasos detallados

### `SEO_OPTIMIZER_INTERNAL_SECRET`

```bash
openssl rand -hex 32
# pegar el output en Vault (Supabase) Y en Railway env var
```

Debe ser **exactamente el mismo valor** en los dos lugares.

### `GSC_SERVICE_ACCOUNT_JSON`

1. Si ya existe la Service Account del `seo_sentinel` y tiene permisos sobre las propiedades GSC de los clientes, **reusar esa**.
2. Si no:
   - Google Cloud Console → IAM & Admin → Service Accounts → Create.
   - Roles necesarios: ninguno a nivel project. Los permisos GSC se otorgan en cada propiedad.
   - Keys → Add Key → JSON → descargar.
   - Por cada cliente, en Search Console → Settings → Users and permissions → Add user → email de la SA → permiso "Full" (necesita "Full" para usar API, no "Restricted").
   - Copiar el contenido JSON entero como string a la env var (incluye saltos de línea — Railway maneja bien).

### `OPENROUTER_API_KEY`

1. <https://openrouter.ai/keys> → Create new key.
2. Setear límite de gasto razonable (ej. $50/mes) para evitar sorpresas.
3. Verificar que el modelo `anthropic/claude-sonnet-4.5` está disponible (a veces requiere top-up de saldo primero).

### `SLACK_BOT_TOKEN`

Si ya hay un bot Slack para `seo_sentinel` o Lighthouse, **reusarlo**. Los scopes mínimos:
- `chat:write` — para postMessage
- `chat:write.public` — para canales públicos sin invitación
- `users:read` — para resolver user IDs si los DM van por handle

Si no existe:
1. Slack API → Create New App → From scratch.
2. OAuth & Permissions → Bot Token Scopes (los de arriba).
3. Install to Workspace.
4. Copiar `xoxb-...` token.

---

## Verificación

Después de setear todo, validar con:

```bash
# Desde el container Railway (Railway shell o local con mismas vars):
python -c "
import os
required = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SEO_OPTIMIZER_INTERNAL_SECRET','GSC_SERVICE_ACCOUNT_JSON','OPENROUTER_API_KEY','SLACK_BOT_TOKEN','SLACK_FALLBACK_CHANNEL','SLACK_ADMIN_CHANNEL']
missing = [k for k in required if not os.environ.get(k)]
print('Missing:', missing if missing else 'NONE — all set')
"
```

Y desde Supabase SQL Editor:

```sql
SELECT name FROM vault.secrets WHERE name LIKE 'SEO_OPTIMIZER_%';
-- Debe mostrar: SEO_OPTIMIZER_INTERNAL_SECRET, SEO_OPTIMIZER_RAILWAY_URL
```

---

## Rotación

| Secret | Frecuencia recomendada | Procedimiento |
|---|---|---|
| `SEO_OPTIMIZER_INTERNAL_SECRET` | 6 meses | Generar nuevo, actualizar Vault Y Railway simultáneamente (ventana de downtime de segundos) |
| `GSC_SERVICE_ACCOUNT_JSON` | Cuando se rote la SA | Crear nueva key, actualizar Railway, dejar la anterior activa 24h, luego revocar |
| `OPENROUTER_API_KEY` | Si se compromete | Crear nueva en dashboard, actualizar Railway |
| `SLACK_BOT_TOKEN` | Si se compromete | Slack app → Regenerate, actualizar Railway |

---

## ⚠️ NO commitear

- **`.env`** (local) — está en `.gitignore`.
- Nunca pegar valores reales en código, prompts, o documentación.
- Si alguien comparte un secret por error en un commit, **regenerarlo inmediatamente** (no basta con git rm — el historial lo retiene).
