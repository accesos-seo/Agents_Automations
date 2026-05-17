# SECRETS — Google Business Profile Publication

Mapa de todos los secrets requeridos por esta automatización y dónde deben estar configurados.

---

## Secrets en Supabase Edge Functions (Light\_House)

Configurar en: Supabase Dashboard → Project `stjugsrkrweakvzmizpq` → Edge Functions → Secrets

| Secret | Descripción | Auto-inyectado | Manual |
|---|---|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase | ✅ Sí | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key del proyecto | ✅ Sí | — |
| `ANTHROPIC_API_KEY` | API key de Anthropic para Claude Haiku | ❌ No | ✅ Requerido |

> **Acción requerida:** Verificar que `ANTHROPIC_API_KEY` está configurado en los secrets de la Edge Function `gbp-post-generator`. Si no está, la función fallará con error 500 al intentar generar el post.

---

## Secrets en el trigger SQL

El trigger `fn_gbp_draft_on_validated()` usa la anon key del proyecto (clave pública) hardcodeada para llamar a la Edge Function vía `pg_net`. Esto es el mismo patrón que todos los triggers del sistema (`trigger_article_generation`, `fn_trigger_seo_investigation`, etc.).

| Variable | Valor | Dónde |
|---|---|---|
| `v_anon_key` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Hardcodeada en `fn_gbp_draft_on_validated()` |
| `v_edge_url` | `https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/gbp-post-generator` | Hardcodeada en `fn_gbp_draft_on_validated()` |

> La anon key es una clave pública (JWT con rol `anon`). No es un secret sensible — es el mismo patrón usado en todos los triggers del proyecto Light\_House.

---

## Secrets para Fase 2 (Google My Business API — no implementado aún)

Cuando se implemente la publicación automática, se necesitarán:

| Secret | Descripción | Dónde configurar |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth2 client ID de Google Cloud | Supabase Edge Function Secrets |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth2 client secret | Supabase Edge Function Secrets |
| `GBP_REFRESH_TOKEN_<proyecto_id>` | Refresh token por proyecto/marca | `integration_secrets` table (una fila por proyecto) |
