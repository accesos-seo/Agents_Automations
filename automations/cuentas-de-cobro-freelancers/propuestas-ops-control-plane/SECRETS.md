# Manejo de secretos

Este documento explica **dónde vive cada secreto** y **cómo configurarlo**. Es lo único que necesitas leer para desplegar la automatización en un proyecto Supabase nuevo.

> **Regla:** ningún valor real aparece en este repositorio. Todo está parametrizado.

---

## Mapa de secretos

| Secreto | Dónde se usa | Dónde se configura | Por qué |
|---|---|---|---|
| `SUPABASE_URL` | Edge Functions | Auto-inyectado por Supabase | Lo provee la plataforma. |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Auto-inyectado por Supabase | Lo provee la plataforma. |
| `MAILJET_API_KEY` | `outbox-worker` | `supabase secrets set` | API key pública de Mailjet. |
| `MAILJET_SECRET_KEY` | `outbox-worker` | `supabase secrets set` | API secret de Mailjet. |
| `GOOGLE_CALENDAR_CLIENT_ID` | `document-builder` | `supabase secrets set` | OAuth client ID. |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | `document-builder` | `supabase secrets set` | OAuth client secret. |
| `GOOGLE_DOCS_REFRESH_TOKEN` | `document-builder` | `supabase secrets set` | Refresh token para Drive API. |
| `FREELANCER_INVOICE_INTERNAL_SECRET` | Edge Functions + **pg_cron** | `supabase secrets set` **y** Supabase Vault | Header `x-internal-secret` que protege las funciones. |
| `FREELANCER_INVOICE_PROJECT_URL` | **pg_cron** | Supabase Vault | URL base usada por los cron jobs SQL. |
| `FREELANCER_INVOICE_FROM_EMAIL` | `outbox-worker` (opcional) | `supabase secrets set` | Remitente. Default `accesos@seolabagency.com`. |
| `FREELANCER_INVOICE_FROM_NAME` | `outbox-worker` (opcional) | `supabase secrets set` | Nombre del remitente. |
| `FREELANCER_INVOICE_APP_BASE_URL` | `outbox-worker` (opcional) | `supabase secrets set` | URL base de la app para los links de los correos. |
| `FREELANCER_INVOICE_DRIVE_ROOT` | `document-builder` (opcional) | `supabase secrets set` | Carpeta raíz en Drive. |

---

## Dos sistemas de secretos, ¿por qué?

Supabase ofrece dos lugares para guardar secretos, y los dos hacen falta:

### 1. Supabase Functions Secrets

Los lee el **código TypeScript** de las Edge Functions vía `Deno.env.get('NOMBRE')`. Se configuran con la CLI:

```bash
supabase secrets set MAILJET_API_KEY=xxx \
                     MAILJET_SECRET_KEY=xxx \
                     GOOGLE_CALENDAR_CLIENT_ID=xxx \
                     GOOGLE_CALENDAR_CLIENT_SECRET=xxx \
                     GOOGLE_DOCS_REFRESH_TOKEN=xxx \
                     FREELANCER_INVOICE_INTERNAL_SECRET=xxx
```

O desde el dashboard: **Project → Edge Functions → Manage secrets**.

### 2. Supabase Vault

Los lee el **código SQL** que corre dentro de Postgres (las funciones `pg_cron`). Vault los guarda cifrados en una tabla del sistema. Se configuran:

- **Opción A — Dashboard:** Project → Project Settings → Vault → Add new secret.
- **Opción B — SQL:**
  ```sql
  SELECT vault.create_secret('valor_real', 'FREELANCER_INVOICE_INTERNAL_SECRET');
  SELECT vault.create_secret('https://TU_PROJECT.supabase.co', 'FREELANCER_INVOICE_PROJECT_URL');
  ```
- **Opción C — Archivo:** edita `db/migrations/005_secrets_setup.sql`, reemplaza los `REPLACE_ME_*` y ejecútalo **una sola vez** en el SQL Editor (no lo commitees con los valores reales).

### ¿Por qué `FREELANCER_INVOICE_INTERNAL_SECRET` aparece en los dos?

Porque pg_cron (lado SQL) llama a las Edge Functions (lado TypeScript) y el secret tiene que coincidir. Pones el **mismo valor** en ambos sitios.

---

## Setup inicial paso a paso

Al desplegar la automatización por primera vez en un proyecto nuevo:

1. **Aplicar migraciones SQL en orden:**
   ```bash
   psql "$DATABASE_URL" -f db/migrations/001_schema.sql
   psql "$DATABASE_URL" -f db/migrations/002_functions.sql
   psql "$DATABASE_URL" -f db/migrations/004_policy_and_seed.sql
   ```

2. **Configurar Vault** — abre `db/migrations/005_secrets_setup.sql`, reemplaza los placeholders, y ejecútalo en el SQL Editor de Supabase. *No commitees el archivo con los valores reales.*

3. **Programar los cron jobs:**
   ```bash
   psql "$DATABASE_URL" -f db/migrations/003_cron_jobs.sql
   ```

4. **Desplegar las Edge Functions:**
   ```bash
   supabase functions deploy freelancer-invoice-document-builder --no-verify-jwt
   supabase functions deploy freelancer-invoice-outbox-worker     --no-verify-jwt
   ```

5. **Configurar los Function Secrets:**
   ```bash
   supabase secrets set FREELANCER_INVOICE_INTERNAL_SECRET=<el-mismo-valor-que-pusiste-en-Vault>
   supabase secrets set MAILJET_API_KEY=... MAILJET_SECRET_KEY=...
   supabase secrets set GOOGLE_CALENDAR_CLIENT_ID=... GOOGLE_CALENDAR_CLIENT_SECRET=... GOOGLE_DOCS_REFRESH_TOKEN=...
   ```

6. **Cargar montos mensuales** de los freelancers en `freelancer_invoice_settings` (ver `docs/runbook.md`).

¡Listo! La próxima vez que sea el último día del mes − 2, todo arrancará solo.

---

## Rotar un secreto

Si una clave se compromete (filtrada, ex-empleado, etc.):

```bash
# 1) Generar nuevo valor
new_value=$(openssl rand -base64 32)

# 2) Actualizar en Function Secrets
supabase secrets set FREELANCER_INVOICE_INTERNAL_SECRET="$new_value"

# 3) Actualizar en Vault (SQL Editor)
# UPDATE vault.secrets
#   SET secret = '$new_value'
#   WHERE name = 'FREELANCER_INVOICE_INTERNAL_SECRET';

# 4) Verificar la próxima corrida del cron en logs.
```

---

## Qué hacer si **ya** subiste un secreto al repo por error

1. **Considéralo comprometido** desde ese momento.
2. Rota el valor en Supabase (paso anterior).
3. Borra el archivo del repo con `git rm` y commitea.
4. (Opcional, paranoico) reescribe la historia con `git filter-repo` o `git filter-branch`.
5. Si el repo es público, asume que bots lo escanearon en minutos. Rotar es obligatorio, no opcional.
