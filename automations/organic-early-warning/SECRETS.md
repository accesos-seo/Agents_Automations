# SECRETS — Organic Early Warning + Data Hub

> Convenciones de secretos: ver `~/.claude/conventions/agentic-automations.md` §7.

Secretos requeridos en **Supabase Vault** del proyecto Light_House (`stjugsrkrweakvzmizpq`). Cargar todos antes del primer deploy.

URL del Vault: https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/settings/vault/secrets

## Lista completa (12 entries)

### Compartidos / infraestructura

| # | Name | Tipo | Valor / cómo obtener |
|---|---|---|---|
| 1 | `SUPABASE_FUNCTIONS_URL` | URL | `https://stjugsrkrweakvzmizpq.functions.supabase.co` (sin slash final). Si ya existe en Vault (V1 lo cargó), reusar. |
| 2 | `HUB_INTERNAL_SECRET` | hex 64 chars | Generar nuevo con `openssl rand -hex 32`. Header `x-internal-secret` entre fns del hub. |
| 3 | `OEW_INTERNAL_SECRET` | hex 64 chars | Generar nuevo con `openssl rand -hex 32`. Header `x-internal-secret` entre fns del oew. **Distinto del HUB_INTERNAL_SECRET** para aislar permisos. |

### Google (GSC + GA4 + CrUX/PSI)

| # | Name | Tipo | Valor / cómo obtener |
|---|---|---|---|
| 4 | `GSC_SERVICE_ACCOUNT_JSON` | JSON completo | Google Cloud Console → IAM → Service Accounts → Create. Habilitar Search Console API y Analytics Data API. Crear key JSON. Pegar contenido completo. Si V1 ya tiene esta entry, reusar. |
| 5 | `GA4_SERVICE_ACCOUNT_JSON` | JSON (opcional) | Mismo método. Puede ser la misma SA que GSC (recomendado: 1 SA para ambas). Si vacío, código fallback usa `GSC_SERVICE_ACCOUNT_JSON`. |
| 6 | `PSI_API_KEY` | string | Google Cloud Console → APIs → Credentials → Create API key. Restringir a "PageSpeed Insights API". |
| 7 | `CRUX_API_KEY` | string (opcional) | Misma key de Google Cloud sirve si está habilitada. Si no se setea, todo CWV se obtiene de PSI lab (más caro). |

**IMPORTANTE Service Account:** la SA debe estar agregada como:
- **Restricted user** en cada propiedad GSC del cliente (Search Console → Settings → Users → Add user con el `client_email`)
- **Viewer** en cada propiedad GA4 del cliente (Admin → Property Access Management → Add user)

Sin esto, GSC/GA4 devuelven 403.

### Ahrefs

| # | Name | Tipo | Valor / cómo obtener |
|---|---|---|---|
| 8 | `AHREFS_API_TOKEN` | string | https://app.ahrefs.com/api-settings → Generate token. **Confirmar plan con créditos suficientes para 1 corrida mensual por brand × ~50 keywords por brand.** |
| 9 | `AHREFS_CREDIT_BUDGET_MONTH` | int | Límite mensual de créditos para protegerse de overruns. Recomendado: presupuesto Ahrefs × 0.8 (deja 20% buffer). Ej: `500`. |

### LLM (OpenRouter)

| # | Name | Tipo | Valor / cómo obtener |
|---|---|---|---|
| 10 | `OPENROUTER_API_KEY` | `sk-or-...` | https://openrouter.ai/keys → Create Key. Recargar saldo (~$20/mes con uso típico de oew-detective + oew-digest). Si V1 ya tiene esta entry, reusar. |
| 11 | `OEW_MODEL` | string | Default: `anthropic/claude-sonnet-4`. Override si querés probar otro modelo. |

### Slack (reusar V1 — NO crear app nueva)

| # | Name | Tipo | Valor / cómo obtener |
|---|---|---|---|
| 12 | `SLACK_BOT_TOKEN` | `xoxb-...` | Del bot existente **Orbit SeoLab** (`D0A4NMACLPP`). https://api.slack.com/apps → "Orbit SeoLab" → OAuth & Permissions → Bot User OAuth Token. **NO crear app nueva.** Si V1 ya tiene esta entry, reusar el mismo valor. |
| — | `SLACK_FALLBACK_CHANNEL` | `C0B1B3V4ZB5` | Ya cargado por V1. Valor: canal `#alerts-operaciones`. |
| — | `SLACK_ADMIN_CHANNEL` | string | Ya cargado por V1. Canal donde el watchdog notifica problemas del sistema. |

## Scopes mínimos del bot Slack

Verificar en https://api.slack.com/apps → "Orbit SeoLab" → OAuth & Permissions:

- `chat:write` ✓
- `chat:write.public` ✓
- `im:write` ✓

Si alguno falta, agregar y **Reinstall to Workspace** (el token cambia — actualizar `SLACK_BOT_TOKEN` en Vault).

## Verificación post-carga

```sql
-- Confirmar que todas las entries críticas existen
SELECT name FROM vault.decrypted_secrets
WHERE name IN (
  'SUPABASE_FUNCTIONS_URL',
  'HUB_INTERNAL_SECRET',
  'OEW_INTERNAL_SECRET',
  'GSC_SERVICE_ACCOUNT_JSON',
  'PSI_API_KEY',
  'AHREFS_API_TOKEN',
  'AHREFS_CREDIT_BUDGET_MONTH',
  'OPENROUTER_API_KEY',
  'OEW_MODEL',
  'SLACK_BOT_TOKEN',
  'SLACK_FALLBACK_CHANNEL',
  'SLACK_ADMIN_CHANNEL'
)
ORDER BY name;
```

Esperado: 12 filas.

## Test de un secreto desde edge function

```bash
# Forzar corrida manual del orchestrator después de cargar secrets:
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-orchestrator \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'
```

Si devuelve 401 → `OEW_INTERNAL_SECRET` mal cargado o no coincide.
Si devuelve 500 con `Slack 401` → `SLACK_BOT_TOKEN` mal cargado o expirado.
Si devuelve 500 con `OpenRouter 401` → `OPENROUTER_API_KEY` mal cargado o sin saldo.

## Política de rotación

| Secret | Frecuencia recomendada |
|---|---|
| `HUB_INTERNAL_SECRET`, `OEW_INTERNAL_SECRET` | Cada 6 meses (proactiva) |
| Service Account JSON | Solo si se filtra; Google permite rotar la key sin renombrar la SA |
| `SLACK_BOT_TOKEN` | Solo si se filtra o si se cambian scopes (reinstall genera nuevo) |
| `OPENROUTER_API_KEY`, `AHREFS_API_TOKEN` | Cada 12 meses o cambio de plan |
| `PSI_API_KEY` | Solo si se filtra |
