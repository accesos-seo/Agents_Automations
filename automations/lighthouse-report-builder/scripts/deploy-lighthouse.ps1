# deploy-lighthouse.ps1
# Despliega las 4 edge functions de Lighthouse en el proyecto Supabase Light_House.
#
# Uso (desde la raíz del repo Agents_Automations):
#   .\automations\lighthouse-report-builder\scripts\deploy-lighthouse.ps1
#
# Lo que hace, en orden:
#   1. Verifica que Supabase CLI esté instalada
#   2. git pull para tener el último código de la rama
#   3. Copia las 4 edge functions a supabase/functions/ (estructura que Supabase espera)
#   4. Linkea el proyecto Light_House (si no está linkeado)
#   5. Pide secretos faltantes y los carga
#   6. Despliega las 4 funciones
#   7. Muestra los pasos SQL pendientes (Vault + cron)
#
# Requiere: PowerShell 5.1+ o PowerShell Core 7+

$ErrorActionPreference = "Stop"

# ─── Configuración ───────────────────────────────────────────────────────────
$ProjectRef = "stjugsrkrweakvzmizpq"
$ProjectName = "Light_House"
$Functions = @(
  "lighthouse-report-builder",
  "lighthouse-google-docs-exporter",
  "lighthouse-slack-notifier",
  "lighthouse-outbox-worker"
)

# Carpeta fuente: donde están realmente los archivos en el repo
$SourceBase = "automations/lighthouse-report-builder/02-edge-functions"
# Carpeta destino: estructura que Supabase CLI espera
$TargetBase = "supabase/functions"

# ─── Helpers de impresión ────────────────────────────────────────────────────
function Write-Step($msg) {
  Write-Host ""
  Write-Host "━━━ $msg" -ForegroundColor Cyan
}
function Write-Ok($msg) { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "⚠ $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "✗ $msg" -ForegroundColor Red }

# ─── 1. Prerequisitos ────────────────────────────────────────────────────────
Write-Step "Verificando prerequisitos"

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Write-Err "Supabase CLI no está instalada."
  Write-Host "  Instalá con: npm install -g supabase"
  Write-Host "  O bajá desde: https://github.com/supabase/cli/releases"
  exit 1
}
Write-Ok "Supabase CLI detectada: $(supabase --version)"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Err "Git no está instalado."
  exit 1
}
Write-Ok "Git detectado: $(git --version)"

# Confirmamos que estamos en la raíz del repo
if (-not (Test-Path "automations/lighthouse-report-builder")) {
  Write-Err "Este script debe correrse desde la raíz del repo Agents_Automations."
  Write-Host "  cd al directorio raíz y reintentá."
  exit 1
}
Write-Ok "Repo detectado correctamente"

# ─── 2. Pull último código ───────────────────────────────────────────────────
Write-Step "Actualizando código (git pull)"
$CurrentBranch = git rev-parse --abbrev-ref HEAD
Write-Host "  Branch actual: $CurrentBranch"
git pull origin $CurrentBranch
if ($LASTEXITCODE -ne 0) {
  Write-Warn "git pull falló. Si tenés cambios locales, commiteá o stash antes."
  $continue = Read-Host "¿Continuar igual? [s/N]"
  if ($continue -notmatch "^[sS]") { exit 1 }
}

# ─── 3. Preparar estructura supabase/functions/ ──────────────────────────────
Write-Step "Preparando estructura supabase/functions/"

if (-not (Test-Path $TargetBase)) {
  New-Item -ItemType Directory -Force -Path $TargetBase | Out-Null
  Write-Ok "Creada carpeta $TargetBase"
}

foreach ($fn in $Functions) {
  $src = Join-Path $SourceBase $fn
  $dst = Join-Path $TargetBase $fn

  if (-not (Test-Path "$src/index.ts")) {
    Write-Err "Falta archivo fuente: $src/index.ts"
    exit 1
  }

  # Copiar (siempre, para que esté sincronizado con la fuente)
  if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
  Copy-Item -Recurse -Path $src -Destination $dst
  Write-Ok "Copiado $fn → $dst"
}

# ─── 4. Linkear proyecto Supabase ────────────────────────────────────────────
Write-Step "Linkeando proyecto Supabase $ProjectName"

# Verificamos si ya está linkeado
$linkedRef = $null
if (Test-Path ".supabase/project-ref") {
  $linkedRef = (Get-Content ".supabase/project-ref" -ErrorAction SilentlyContinue).Trim()
}
if (-not $linkedRef -and (Test-Path "supabase/.temp/project-ref")) {
  $linkedRef = (Get-Content "supabase/.temp/project-ref" -ErrorAction SilentlyContinue).Trim()
}

if ($linkedRef -eq $ProjectRef) {
  Write-Ok "Ya linkeado a $ProjectName ($ProjectRef)"
} else {
  Write-Host "  Linkeando a project-ref: $ProjectRef"
  Write-Host "  Te va a pedir la DB password del proyecto Light_House."
  Write-Host "  La encontrás en: Dashboard → Settings → Database → Connection string"
  supabase link --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) {
    Write-Err "supabase link falló."
    exit 1
  }
  Write-Ok "Proyecto linkeado"
}

# ─── 5. Configurar secretos ──────────────────────────────────────────────────
Write-Step "Configurando secretos en Supabase"

Write-Host "  Listando secretos actuales..."
$existingSecrets = supabase secrets list 2>&1 | Out-String

function Test-Secret($name) {
  return $existingSecrets -match "(?m)^\s*$name\b"
}

# Diccionario de secretos a setear { nombre = valor }
$secretsToSet = @{}

# 5.1 — LIGHTHOUSE_REPORT_INTERNAL_SECRET (generar si no existe)
if (Test-Secret "LIGHTHOUSE_REPORT_INTERNAL_SECRET") {
  Write-Ok "LIGHTHOUSE_REPORT_INTERNAL_SECRET ya existe"
} else {
  Write-Host "  Generando LIGHTHOUSE_REPORT_INTERNAL_SECRET..."
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $internalSecret = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  $secretsToSet["LIGHTHOUSE_REPORT_INTERNAL_SECRET"] = $internalSecret
  Write-Ok "Internal secret generado (64 chars hex)"
  Write-Warn "GUARDÁ ESTE VALOR — lo vas a necesitar para el paso de Vault:"
  Write-Host "    $internalSecret" -ForegroundColor Yellow
  Write-Host ""
  Read-Host "Apretá Enter cuando lo hayas copiado a un lugar seguro"
}

# 5.2 — LIGHTHOUSE_REPORT_MODEL (default)
if (-not (Test-Secret "LIGHTHOUSE_REPORT_MODEL")) {
  $secretsToSet["LIGHTHOUSE_REPORT_MODEL"] = "anthropic/claude-sonnet-4"
  Write-Ok "LIGHTHOUSE_REPORT_MODEL → anthropic/claude-sonnet-4"
}

# 5.3 — LIGHTHOUSE_SLACK_CHANNEL (default)
if (-not (Test-Secret "LIGHTHOUSE_SLACK_CHANNEL")) {
  $secretsToSet["LIGHTHOUSE_SLACK_CHANNEL"] = "informes-seo"
  Write-Ok "LIGHTHOUSE_SLACK_CHANNEL → informes-seo"
}

# 5.4 — LIGHTHOUSE_DRIVE_ROOT (default)
if (-not (Test-Secret "LIGHTHOUSE_DRIVE_ROOT")) {
  $secretsToSet["LIGHTHOUSE_DRIVE_ROOT"] = "SeoLab Informes SEO"
  Write-Ok "LIGHTHOUSE_DRIVE_ROOT → SeoLab Informes SEO"
}

# 5.5 — OPENROUTER_API_KEY (requerido, preguntar si falta)
if (-not (Test-Secret "OPENROUTER_API_KEY")) {
  Write-Host ""
  $val = Read-Host "OpenRouter API key (sk-or-v1-...)"
  if (-not $val) { Write-Err "OPENROUTER_API_KEY es requerido"; exit 1 }
  $secretsToSet["OPENROUTER_API_KEY"] = $val.Trim()
} else {
  Write-Ok "OPENROUTER_API_KEY ya existe"
}

# 5.6 — SLACK_BOT_TOKEN (requerido)
if (-not (Test-Secret "SLACK_BOT_TOKEN")) {
  Write-Host ""
  $val = Read-Host "Slack Bot Token (xoxb-...)"
  if (-not $val) { Write-Err "SLACK_BOT_TOKEN es requerido"; exit 1 }
  $secretsToSet["SLACK_BOT_TOKEN"] = $val.Trim()
} else {
  Write-Ok "SLACK_BOT_TOKEN ya existe"
}

# 5.7 — Google OAuth (deberían existir del invoice-document-builder)
foreach ($g in @("GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET", "GOOGLE_DOCS_REFRESH_TOKEN")) {
  if (Test-Secret $g) {
    Write-Ok "$g ya existe (reuso del invoice-document-builder)"
  } else {
    Write-Warn "$g NO existe. Sin esto el exporter no funciona."
    $val = Read-Host "Pegá el valor de $g (Enter para skip y configurar después)"
    if ($val) { $secretsToSet[$g] = $val.Trim() }
  }
}

# Aplicar los secretos
if ($secretsToSet.Count -gt 0) {
  Write-Host ""
  Write-Step "Aplicando $($secretsToSet.Count) secreto(s) nuevos"
  $args = @()
  foreach ($k in $secretsToSet.Keys) {
    $args += "$k=$($secretsToSet[$k])"
  }
  supabase secrets set @args
  if ($LASTEXITCODE -ne 0) {
    Write-Err "supabase secrets set falló."
    exit 1
  }
  Write-Ok "Secretos cargados"
} else {
  Write-Ok "Todos los secretos ya estaban configurados"
}

# ─── 6. Deploy de las 4 funciones ────────────────────────────────────────────
Write-Step "Desplegando las $($Functions.Count) edge functions"

$deployed = @()
$failed = @()
foreach ($fn in $Functions) {
  Write-Host ""
  Write-Host "  → Deployando $fn..." -ForegroundColor White
  supabase functions deploy $fn --no-verify-jwt --project-ref $ProjectRef
  if ($LASTEXITCODE -eq 0) {
    Write-Ok "$fn desplegada"
    $deployed += $fn
  } else {
    Write-Err "$fn falló"
    $failed += $fn
  }
}

# ─── 7. Resumen y siguientes pasos ───────────────────────────────────────────
Write-Step "Resumen"
Write-Host ""
Write-Host "  Desplegadas (" -NoNewline
Write-Host "$($deployed.Count)" -ForegroundColor Green -NoNewline
Write-Host "/$($Functions.Count)):"
foreach ($fn in $deployed) { Write-Host "    ✓ $fn" -ForegroundColor Green }
if ($failed.Count -gt 0) {
  foreach ($fn in $failed) { Write-Host "    ✗ $fn" -ForegroundColor Red }
}

if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Err "Hay funciones que fallaron. Revisá los errores arriba."
  exit 1
}

Write-Host ""
Write-Step "Pasos manuales que faltan"
Write-Host ""
Write-Host "  Andá al SQL Editor del Dashboard de Light_House:"
Write-Host "    https://supabase.com/dashboard/project/$ProjectRef/sql/new" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Y corré estos 2 bloques:"
Write-Host ""
Write-Host "  ── A) Cargar secretos en Vault (para el watchdog) ──────────────"
Write-Host ""
Write-Host "  SELECT vault.create_secret(" -ForegroundColor Yellow
Write-Host "    '<EL_LIGHTHOUSE_REPORT_INTERNAL_SECRET>'," -ForegroundColor Yellow
Write-Host "    'LIGHTHOUSE_REPORT_INTERNAL_SECRET'" -ForegroundColor Yellow
Write-Host "  );" -ForegroundColor Yellow
Write-Host "  SELECT vault.create_secret(" -ForegroundColor Yellow
Write-Host "    'https://$ProjectRef.supabase.co'," -ForegroundColor Yellow
Write-Host "    'LIGHTHOUSE_PROJECT_URL'" -ForegroundColor Yellow
Write-Host "  );" -ForegroundColor Yellow
Write-Host ""
Write-Host "  ── B) Activar cron jobs ────────────────────────────────────────"
Write-Host ""
Write-Host "  SELECT cron.schedule(" -ForegroundColor Yellow
Write-Host "    'lighthouse-watchdog-full', '*/2 * * * *'," -ForegroundColor Yellow
Write-Host "    `$`$ SELECT ahrefs_web_analysis.watchdog_full_pipeline(); `$`$" -ForegroundColor Yellow
Write-Host "  );" -ForegroundColor Yellow
Write-Host "  SELECT cron.schedule(" -ForegroundColor Yellow
Write-Host "    'lighthouse-outbox-worker', '30 seconds'," -ForegroundColor Yellow
Write-Host "    `$`$ SELECT ahrefs_web_analysis.dispatch_outbox_worker(); `$`$" -ForegroundColor Yellow
Write-Host "  );" -ForegroundColor Yellow
Write-Host ""
Write-Host "  ── C) Test end-to-end (opcional) ───────────────────────────────"
Write-Host ""
Write-Host "  Disparar el agent_6 manualmente para Mercado Libre:"
Write-Host ""
Write-Host "  curl -X POST https://$ProjectRef.supabase.co/functions/v1/lighthouse-report-builder ``" -ForegroundColor Cyan
Write-Host "    -H 'x-internal-secret: <EL_INTERNAL_SECRET>' ``" -ForegroundColor Cyan
Write-Host "    -H 'Content-Type: application/json' ``" -ForegroundColor Cyan
Write-Host "    -d '{`"orchestration_id`":`"599b2811-8c26-4d8d-bd88-43f6dd9e8704`",`"force`":true}'" -ForegroundColor Cyan
Write-Host ""

Write-Step "Listo"
Write-Host ""
Write-Ok "Edge functions desplegadas. Falta solo el paso SQL en el Dashboard."
Write-Host ""
