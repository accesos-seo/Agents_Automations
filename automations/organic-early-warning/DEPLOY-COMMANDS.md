# DEPLOY COMMANDS — Organic Early Warning V2

> Estos comandos los corre **el tecnico de configuracion** en su terminal local.
>
> Claude/Cursor NO los ejecuta porque PowerShell + OneDrive paths timeoutean
> (ver CONVENTIONS.md §12). El tooling ya esta listo y validado offline; lo que
> viene a continuacion son los pasos "online" (tocan Supabase, Slack, Google,
> Ahrefs, GitHub).
>
> Estructura del documento:
> - Pasos 0-2: preparacion (CLI, migraciones, secrets)
> - Paso 3: deploy de las 13 edge functions
> - Pasos 4-7: seeding, validacion E2E, backtest, activacion de crons
>
> Trabajamos en el clone `C:/Users/ceoel/temp/agents-automations-seo` (fuera de
> OneDrive a proposito; ver CONVENTIONS.md §12).

---

## 0. Pre-requisitos

### 0.1 Tooling local

```bash
# Supabase CLI (elegir uno)
npm install -g supabase
# o, alternativa (Scoop):
scoop install supabase

# Verificar
supabase --version
# Esperado: 1.x o 2.x

# Login (abre browser, copia/pega token)
supabase login
```

### 0.2 Acceso al proyecto

- Proyecto: **Light_House** (`stjugsrkrweakvzmizpq`)
- Dashboard: https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq
- Confirmar que tu user esta como Owner/Developer en la org.

### 0.3 Repo + branch

```bash
cd C:/Users/ceoel/temp/agents-automations-seo
git checkout feature/organic-early-warning-v2
git pull --ff-only origin feature/organic-early-warning-v2
git status                # debe estar limpio
```

### 0.4 Verificar Python

```bash
py -3 --version           # 3.10+ minimo
```

Si vas a correr `scripts/backtest_runner.py` con dataset grande:

```bash
pip install psycopg2-binary
```

(sin esto, el script usa REST API — funciona pero mas lento).

---

## 1. Aplicar migraciones SQL al Light_House

**Ya estan aplicadas via MCP por Claude durante la construccion.** Si necesitas
re-aplicar o verificar:

### 1.1 Verificar que estan aplicadas

Ir a https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/sql/new y
correr:

```sql
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='seo_data_hub')         AS hub_tables,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='organic_early_warning') AS oew_tables,
  (SELECT COUNT(*) FROM cron.job WHERE jobname LIKE 'hub-%' OR jobname LIKE 'oew-%')          AS cron_jobs;
```

Esperado:
- `hub_tables >= 12`
- `oew_tables >= 9`
- `cron_jobs >= 8` (5 hub + 3-4 oew)

### 1.2 Re-aplicar manualmente (solo si Paso 1.1 da numeros menores)

Abrir cada archivo de `00-data-hub/01-migrations/*.sql` y `01-organic-early-warning/01-migrations/*.sql`
en orden numerico y pegarlos en el SQL Editor uno por uno:

```
00-data-hub/01-migrations/
  001_seo_data_hub_schema.sql
  002_seo_data_hub_partitioning.sql
  003_seo_data_hub_watchdog.sql
  004_seo_data_hub_cron.sql

01-organic-early-warning/01-migrations/
  001_oew_schema.sql
  002_oew_signal_definitions_seed.sql
  003_oew_views.sql
  004_oew_watchdog.sql
  005_oew_cron.sql
```

Despues de cada migration, re-correr el SELECT del paso 1.1 para confirmar
incremento.

---

## 2. Cargar los 12 secretos en Vault

Lista completa: `SECRETS.md`. Resumen:

### 2.1 Generar los dos secretos internos

```bash
# Generar HUB_INTERNAL_SECRET (cualquiera de los dos):
openssl rand -hex 32
# o con Python si no tenes openssl:
py -3 -c "import secrets; print(secrets.token_hex(32))"

# Generar OEW_INTERNAL_SECRET (DEBE ser distinto del HUB):
openssl rand -hex 32
```

Anotar los dos en algun gestor de secretos local (1Password, KeePass) ANTES de
pegar en Vault — luego no se pueden recuperar en plano.

### 2.2 Cargar en Vault

URL: https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/settings/vault/secrets

Cargar **una por una** las 12 entries (algunas pueden ya existir si V1
seo-sentinel las cargo — NO duplicar, reusar):

| # | Name | Valor |
|---|---|---|
| 1 | `SUPABASE_FUNCTIONS_URL` | `https://stjugsrkrweakvzmizpq.functions.supabase.co` |
| 2 | `HUB_INTERNAL_SECRET` | el hex generado |
| 3 | `OEW_INTERNAL_SECRET` | el otro hex generado |
| 4 | `GSC_SERVICE_ACCOUNT_JSON` | JSON completo de la Service Account |
| 5 | `GA4_SERVICE_ACCOUNT_JSON` | mismo JSON (recomendado) o NULL |
| 6 | `PSI_API_KEY` | API key con PageSpeed Insights API habilitada |
| 7 | `CRUX_API_KEY` | (opcional) misma key si tiene CrUX habilitada |
| 8 | `AHREFS_API_TOKEN` | de https://app.ahrefs.com/api-settings |
| 9 | `AHREFS_CREDIT_BUDGET_MONTH` | int (ej. `500`) |
| 10 | `OPENROUTER_API_KEY` | `sk-or-...` |
| 11 | `OEW_MODEL` | `anthropic/claude-sonnet-4` |
| 12 | `SLACK_BOT_TOKEN` | `xoxb-...` del bot Orbit SeoLab (reusar V1 si existe) |

Tambien deben existir (ya cargados por V1, no duplicar):
- `SLACK_FALLBACK_CHANNEL` = `C0B1B3V4ZB5`
- `SLACK_ADMIN_CHANNEL`

### 2.3 Verificar carga completa

```sql
SELECT name FROM vault.decrypted_secrets
WHERE name IN (
  'SUPABASE_FUNCTIONS_URL','HUB_INTERNAL_SECRET','OEW_INTERNAL_SECRET',
  'GSC_SERVICE_ACCOUNT_JSON','GA4_SERVICE_ACCOUNT_JSON','PSI_API_KEY',
  'CRUX_API_KEY','AHREFS_API_TOKEN','AHREFS_CREDIT_BUDGET_MONTH',
  'OPENROUTER_API_KEY','OEW_MODEL','SLACK_BOT_TOKEN',
  'SLACK_FALLBACK_CHANNEL','SLACK_ADMIN_CHANNEL'
) ORDER BY name;
```

Esperado: **>= 12 filas**.

### 2.4 Permisos Service Account (CRITICO)

Para cada brand que vas a seedear:

1. **GSC** → Search Console del cliente → Settings → Users and permissions → Add
   user → pegar el `client_email` de la SA → Role: **Restricted**
2. **GA4** → Admin → Property Access Management → Add user → pegar el
   `client_email` → Role: **Viewer**

Sin esto, los ingestors devuelven 403 y el hub queda vacio.

---

## 3. Deployar las 13 edge functions

### 3.1 Smoke dry-run primero

```bash
cd C:/Users/ceoel/temp/agents-automations-seo/automations/organic-early-warning
py -3 deploy.py --target all --dry-run
```

Esperado: 13 lineas con `[OK] ... -> DRY_RUN`. Si alguna dice `MISSING_CLI` o
falla el stage, NO seguir.

### 3.2 Deploy real

```bash
py -3 deploy.py --target all
```

Esperado:
- 5 funciones `hub-*` deployadas (~30-60s cada una)
- 8 funciones `oew-*` deployadas (incluye `oew-outbox-worker` si existe)
- Output final `Todas las funciones se deployaron correctamente.`
- Archivos `deploy-log.txt` y `deploy-report.json` generados al lado del script.

Si una falla individual:

```bash
# Re-deployar solo una:
py -3 deploy.py --only oew-dispatcher
# o un grupo:
py -3 deploy.py --target oew
```

### 3.3 Verificacion post-deploy

Dashboard → Edge Functions:
https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/functions

Las 13 deben aparecer con status **Active** y version > 0. Click en cada una y
revisar que `Verify JWT` esta en **OFF** (`--no-verify-jwt` se aplico).

Test minimo de auth:

```bash
# Sin secret -> debe dar 401
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-orchestrator \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'
# Esperado: HTTP 401

# Con secret correcto -> debe dar 200 o 500 (segun config)
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-orchestrator \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'
# Esperado: HTTP 200 con {"ok":true,...} (puede fallar si no hay brands activas todavia)
```

---

## 4. Seedear `brands_registry` + `brand_routing`

### 4.1 Editar la plantilla

Abrir `automations/organic-early-warning/scripts/seed_brands_registry.sql` en
un editor y reemplazar TODOS los `PENDING_CONFIG: ...` con datos reales del
cliente:

- `name` interno de la marca
- `gsc_property_url` exacto (formato `sc-domain:` o URL prefix con slash final)
- `ga4_property_id` (numero) o NULL
- `ahrefs_domain` (sin https)
- `country_iso` (CO, AR, MX...)
- `team_lead_user_id` Slack (`U05...`) o NULL

Duplicar los bloques BRAND #1 / BRAND #2 / BRAND #3 segun cuantas brands tengas.

### 4.2 Aplicar

Pegar el SQL editado en https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/sql/new
y ejecutar. El script incluye los `SELECT` de validacion al final.

### 4.3 Verificar

```sql
-- Brands activas con routing completo:
SELECT br.name, br.gsc_property_url, brt.team_lead_user_id, brt.severity_threshold
FROM seo_data_hub.brands_registry br
JOIN organic_early_warning.brand_routing brt ON brt.brand_id = br.id
WHERE br.status='active' AND brt.active=true;

-- Brands activas SIN routing (bug a corregir):
SELECT br.id, br.name FROM seo_data_hub.brands_registry br
LEFT JOIN organic_early_warning.brand_routing brt ON brt.brand_id = br.id
WHERE br.status='active' AND brt.brand_id IS NULL;
```

El segundo query debe devolver **0 filas**.

---

## 5. Smoke test E2E

Seguir `handoff/02-validation-checklist.md` pasos 1-14. Resumen de los curls
criticos (sustituir `<HUB>`, `<OEW>`, `<BRAND_UUID>`, `<ISO_WEEK>`):

### 5.1 Forzar hub-gsc-weekly

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-gsc-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","brand_id":"<BRAND_UUID>","iso_week":"<ISO_WEEK>","force":true}'
```

Esperado: HTTP 200, `{"ok":true,"ingestion_run_id":"...","rows_inserted":N}` con N>0.

### 5.2 Verificar ingesta

```sql
SELECT status, rows_inserted, error_message
FROM seo_data_hub.ingestion_runs
ORDER BY started_at DESC LIMIT 5;

SELECT COUNT(*)
FROM seo_data_hub.gsc_search_analytics_weekly
WHERE brand_id='<BRAND_UUID>' AND iso_week='<ISO_WEEK>';
```

Esperado: `status='completed'`, `rows_inserted > 0`, count > 0.

### 5.3 Idem para GA4 y CWV

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-ga4-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","brand_id":"<BRAND_UUID>","iso_week":"<ISO_WEEK>","force":true}'

curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-cwv-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","brand_id":"<BRAND_UUID>","iso_week":"<ISO_WEEK>","force":true}'
```

### 5.4 Forzar baseline builder + orchestrator

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-baseline-builder \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","brand_id":"<BRAND_UUID>","force":true}'

curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-orchestrator \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'
```

### 5.5 Verificar pipeline E2E

```sql
-- run_events del ultimo run:
SELECT occurred_at, event_source, event_type, error_message
FROM organic_early_warning.run_events
ORDER BY occurred_at DESC LIMIT 30;

-- analysis_runs:
SELECT id, status, started_at, completed_at, error_message
FROM organic_early_warning.analysis_runs
ORDER BY started_at DESC LIMIT 5;

-- signal_events generados:
SELECT signal_id, severity_hint, deviation_sigma, confidence
FROM organic_early_warning.signal_events
ORDER BY created_at DESC LIMIT 20;

-- incidents creados:
SELECT id, severity, signal_count, status
FROM organic_early_warning.incidents
ORDER BY created_at DESC LIMIT 10;

-- outbox encolado:
SELECT id, target_type, status, retry_count, last_error
FROM public.notifications_outbox
WHERE source='oew_alert'
ORDER BY created_at DESC LIMIT 10;
```

Si los signal_events estan vacios y no hay errores: warmup natural (n_samples
< 4). Ver `handoff/02-validation-checklist.md` Paso 5 Camino C para reducir
warmup temporal durante validacion.

### 5.6 Digest semanal

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-digest-weekly \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'

# Pipeline health view:
# SELECT * FROM organic_early_warning.v_pipeline_health;
```

---

## 6. Backtest del motor estadistico (CRITICO antes de activar crons)

### 6.1 Preparar dataset historico

Ver `handoff/05-backtesting-guide.md` Paso 1. Opciones:
- **Opcion A:** migrar 8+ semanas de V1 (`seo_sentinel.traffic_daily`) al hub
- **Opcion C:** backfill manual via GSC API

### 6.2 Marcar ground truth

Crear tabla y poblarla (ver `handoff/05-backtesting-guide.md` Paso 2):

```sql
-- Si la tabla aun no existe:
CREATE TABLE IF NOT EXISTS organic_early_warning.backtest_ground_truth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES seo_data_hub.brands_registry(id) ON DELETE CASCADE,
  anomaly_date DATE NOT NULL,
  iso_week TEXT NOT NULL,
  signal_kind TEXT NOT NULL CHECK (signal_kind IN
    ('S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12','S13')),
  confirmed_real BOOLEAN NOT NULL,
  severity_observed TEXT CHECK (severity_observed IN ('WATCH','YELLOW','RED')),
  root_cause TEXT,
  notes TEXT,
  marked_by TEXT NOT NULL,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bgt_brand_week
  ON organic_early_warning.backtest_ground_truth (brand_id, iso_week);
```

Cargar al menos **10 entries reales** (anomalias confirmadas + falsos positivos
conocidos de V1) — sin esto el F1 no significa nada.

### 6.3 Configurar conexion para backtest_runner.py

Elegir UNA opcion:

**Opcion A (rapida, recomendada con dataset grande):**

```bash
pip install psycopg2-binary
# Obtener pwd desde Dashboard → Project Settings → Database → Connection string
export DATABASE_URL="postgresql://postgres:<PWD>@db.stjugsrkrweakvzmizpq.supabase.co:5432/postgres"
```

**Opcion B (sin deps, REST fallback):**

```bash
export SUPABASE_URL="https://stjugsrkrweakvzmizpq.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role_jwt_de_Dashboard_Settings_API>"
```

En PowerShell:

```powershell
$env:DATABASE_URL = "postgresql://postgres:<PWD>@db.stjugsrkrweakvzmizpq.supabase.co:5432/postgres"
```

### 6.4 Correr el backtest

```bash
cd C:/Users/ceoel/temp/agents-automations-seo/automations/organic-early-warning
py -3 scripts/backtest_runner.py \
  --brand <BRAND_UUID> \
  --weeks 8 \
  --output backtest-report.json
```

Output esperado:
- `[INFO] Conectado en modo: psycopg2` (o `rest`)
- `[INFO] Brand: <name>`
- `[INFO] GSC rows: N  GA4 rows: M`
- `[OK] Report escrito en backtest-report.json`

Si ground truth esta vacio: warning + report con metricas N/A — cargar entries
y re-correr.

### 6.5 Leer y calibrar

Abrir `backtest-report.json` y revisar:
- `summary.f1_global` → objetivo: **>= 0.7**
- `by_signal[].suggestion` → texto humano con que ajustar
- `top_false_positives` → 10 alertas que NO querias
- `top_missed_anomalies` → 10 caidas perdidas (mas grave que FPs)

Aplicar ajustes con UPDATE a `signal_definitions.config` (ver
`handoff/05-backtesting-guide.md` Paso 4). Re-correr hasta llegar al criterio
de aceptacion (F1 > 0.7 en al menos 8 de 13 senales).

**Nota:** el backtest_runner local solo evalua S8/S9/S11/S12/S13 (los 5 de
Fase A). Para las demas el report las lista en `signals_skipped` con motivo
"evaluator no implementado en backtest_runner — usar dry-run del evaluator
real". Eso es ESPERADO en Fase A.

---

## 7. Activar crons

Una vez backtest verde y E2E ok:

```sql
-- Activar las 5 crons del hub:
UPDATE cron.job SET active=true
WHERE jobname IN (
  'hub-gsc-weekly','hub-ga4-weekly','hub-cwv-weekly',
  'hub-ahrefs-monthly','hub-watchdog'
);

-- Activar las crons del oew:
UPDATE cron.job SET active=true
WHERE jobname IN (
  'oew-orchestrator','oew-digest-weekly','oew-watchdog','oew-outbox-worker'
);

-- Confirmar:
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname LIKE 'hub-%' OR jobname LIKE 'oew-%'
ORDER BY jobname;
```

Esperado: todas con `active=true`.

### Snapshot de config aprobada (para rollback)

```sql
CREATE TABLE IF NOT EXISTS organic_early_warning.signal_definitions_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  config_json JSONB NOT NULL,
  approved_by TEXT NOT NULL,
  notes TEXT
);

INSERT INTO organic_early_warning.signal_definitions_snapshots
  (config_json, approved_by, notes)
SELECT
  jsonb_agg(row_to_json(s.*)),
  '<tu_email>',
  'Backtest aprobado — F1 global <X.XX>, dataset <descripcion>'
FROM organic_early_warning.signal_definitions s;
```

---

## 8. Monitoreo post-activacion (primera semana)

Primer Martes 13:00 UTC despues de activar: validar que el `oew-orchestrator`
disparo solo:

```sql
SELECT id, status, started_at, completed_at, error_message
FROM organic_early_warning.analysis_runs
WHERE started_at >= NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC;

-- Vista de salud del pipeline:
SELECT * FROM organic_early_warning.v_pipeline_health;

-- Watchdog ultima corrida:
SELECT * FROM organic_early_warning.run_events
WHERE event_source = 'watchdog'
ORDER BY occurred_at DESC LIMIT 5;
```

Si algo falla, revisar `handoff/03-runbook.md`.

---

## 9. Rollback de emergencia

Si la primera semana hay tormenta de alertas o ruido inaceptable:

```sql
-- Pausar todos los crons del oew (el hub puede seguir cargando data):
UPDATE cron.job SET active=false
WHERE jobname IN ('oew-orchestrator','oew-digest-weekly');

-- Pausar todos los crons del hub si el problema es ingesta:
UPDATE cron.job SET active=false WHERE jobname LIKE 'hub-%';

-- Subir umbral global temporalmente (menos sensible):
UPDATE organic_early_warning.signal_definitions
SET config = jsonb_set(config, '{threshold_k}', '5.0'::jsonb);
```

Y abrir issue en el repo describiendo el sintoma para post-mortem.

---

## Apendice: comandos rapidos copy-paste

```bash
# Solo hub:
py -3 deploy.py --target hub

# Solo oew:
py -3 deploy.py --target oew

# Una funcion especifica:
py -3 deploy.py --only oew-dispatcher

# Backtest:
py -3 scripts/backtest_runner.py --brand <UUID> --weeks 8 --output report.json

# Reload secrets en una funcion sin re-deploy (forzar restart):
supabase functions deploy oew-orchestrator --project-ref stjugsrkrweakvzmizpq --no-verify-jwt
```

---

**Fin del documento.** Si algo falla durante la ejecucion de estos pasos,
consultar primero `handoff/03-runbook.md`. Si el problema es nuevo, abrir
ticket interno con: comando exacto + output + `deploy-log.txt` adjunto.
