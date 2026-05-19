# Manejo de secretos — lighthouse-report-builder

Este documento explica **dónde vive cada secreto** y **cómo configurarlo**.

> **Regla:** ningún valor real aparece en este repositorio. Todo está parametrizado.

## Mapa de secretos

| Secreto | Dónde se usa | Dónde se configura | Por qué |
|---|---|---|---|
| `SUPABASE_URL` | Edge Function | Auto-inyectado por Supabase | Lo provee la plataforma. |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function | Auto-inyectado por Supabase | Lo provee la plataforma. |
| `OPENROUTER_API_KEY` | Edge Function | `supabase secrets set` | API key de OpenRouter para llamadas al LLM. |
| `LIGHTHOUSE_REPORT_INTERNAL_SECRET` | Edge Function + orquestador | `supabase secrets set` | Header `x-internal-secret` que protege la función contra invocación externa. |
| `LIGHTHOUSE_REPORT_MODEL` | Edge Function (opcional) | `supabase secrets set` | Modelo LLM a usar. Default `anthropic/claude-sonnet-4`. |
| `GOOGLE_CALENDAR_CLIENT_ID` | google-docs-exporter | `supabase secrets set` | OAuth client ID. Reusa el del proyecto freelancers. |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | google-docs-exporter | `supabase secrets set` | OAuth client secret. |
| `GOOGLE_DOCS_REFRESH_TOKEN` | google-docs-exporter | `supabase secrets set` | Refresh token para Drive API. |
| `LIGHTHOUSE_DRIVE_ROOT` | google-docs-exporter (opcional) | `supabase secrets set` | Carpeta raíz en Drive. Default `SeoLab Informes SEO`. |

## Cómo configurar

```bash
# Desde la carpeta local con la CLI de Supabase
supabase link --project-ref stjugsrkrweakvzmizpq

# Generar un secreto random fuerte
openssl rand -hex 32  # → copiá la salida

supabase secrets set \
  OPENROUTER_API_KEY="sk-or-v1-..." \
  LIGHTHOUSE_REPORT_INTERNAL_SECRET="<el-hex-de-arriba>" \
  LIGHTHOUSE_REPORT_MODEL="anthropic/claude-sonnet-4"
```

O desde el dashboard: **Project → Edge Functions → Manage secrets**.

## Validación post-deploy

Después de `supabase functions deploy lighthouse-report-builder --no-verify-jwt`:

```bash
# Debe responder 403 (forbidden) sin el header
curl -X POST https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/lighthouse-report-builder \
  -H "Content-Type: application/json" -d '{}'

# Debe responder 400 (missing orchestration_id) con el header correcto
curl -X POST https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/lighthouse-report-builder \
  -H "x-internal-secret: <tu-secreto>" \
  -H "Content-Type: application/json" -d '{}'
```

## Rotación

Si comprometemos `LIGHTHOUSE_REPORT_INTERNAL_SECRET`:

1. `openssl rand -hex 32` para el nuevo valor.
2. `supabase secrets set LIGHTHOUSE_REPORT_INTERNAL_SECRET=...`
3. Actualizar el mismo valor en `ahrefs-total-orchestrator` (que lo usa para invocar a este).
4. Redeploy ambos: `supabase functions deploy lighthouse-report-builder ahrefs-total-orchestrator`.

`OPENROUTER_API_KEY` se rota desde el dashboard de OpenRouter y se actualiza con `supabase secrets set`.
