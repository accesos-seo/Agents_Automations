# deploy-lighthouse.ps1
# Despliega las 4 edge functions de Lighthouse en el proyecto Supabase Light_House.
#
# Uso (desde la raiz del repo Agents_Automations):
#   .\automations\lighthouse-report-builder\scripts\deploy-lighthouse.ps1
#
# Funciona en PowerShell 5.1+ y PowerShell Core 7+ (Windows).

$ErrorActionPreference = "Stop"

# === Configuracion ===========================================================
$ProjectRef = "stjugsrkrweakvzmizpq"
$ProjectName = "Light_House"
$Functions = @(
  "lighthouse-report-builder",
  "lighthouse-google-docs-exporter",
  "lighthouse-slack-notifier",
  "lighthouse-outbox-worker"
)

# Carpeta fuente: donde estan realmente los archivos en el repo
$SourceBase = "automations/lighthouse-report-builder/02-edge-functions"
# Carpeta destino: estructura que Supabase CLI espera
$TargetBase = "supabase/functions"

# === Helpers de impresion ====================================================
function Write-Step($msg) {
  Write-Host ""
  Write-Host "=== $msg ===" -ForegroundColor Cyan
}
function Write-Ok($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[!]  $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[X]  $msg" -ForegroundColor Red }

# === 1. Prerequisitos ========================================================
Write-Step "Verificando prerequisitos"

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Write-Err "Supabase CLI no esta instalada."
  Write-Host "  Instala con: npm install -g supabase"
  exit 1
}
Write-Ok ("Supabase CLI detectada: " + (supabase --version))

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Err "Git no esta instalado."
  exit 1
}
Write-Ok ("Git detectado: " + (git --version))

if (-not (Test-Path "automations/lighthouse-report-builder")) {
  Write-Err "Este script debe correrse desde la raiz del repo Agents_Automations."
  exit 1
}
Write-Ok "Repo detectado correctamente"

# === 2. Pull ultimo codigo ===================================================
Write-Step "Actualizando codigo (git pull)"
$CurrentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "  Branch actual: $CurrentBranch"
git pull origin $CurrentBranch
if ($LASTEXITCODE -ne 0) {
  Write-Warn "git pull fallo. Si tenes cambios locales, commitea o stash antes."
  $continue = Read-Host "Continuar igual? [s/N]"
  if ($continue -notmatch "^[sS]") { exit 1 }
}

# === 3. Preparar estructura supabase/functions/ ==============================
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

  if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
  Copy-Item -Recurse -Path $src -Destination $dst
  Write-Ok "Copiado $fn"
}

# === 4. Linkear proyecto Supabase ============================================
Write-Step "Linkeando proyecto Supabase $ProjectName"

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
  Write-Host "  La encontras en: Dashboard > Settings > Database > Connection string"
  supabase link --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) {
    Write-Err "supabase link fallo."
    exit 1
  }
  Write-Ok "Proyecto linkeado"
}

# === 5. Configurar secretos ==================================================
Write-Step "Configurando secretos en Supabase"

Write-Host "  Listando secretos actuales..."
$existingSecrets = supabase secrets list 2>&1 | Out-String

function Test-Secret($name) {
  return $existingSecrets -match "(?m)^\s*$name\b"
}

$secretsToSet = @{}
$generatedInternalSecret = $null

# 5.1 - LIGHTHOUSE_REPORT_INTERNAL_SECRET (generar si no existe)
if (Test-Secret "LIGHTHOUSE_REPORT_INTERNAL_SECRET") {
  Write-Ok "LIGHTHOUSE_REPORT_INTERNAL_SECRET ya existe"
} else {
  Write-Host "  Generando LIGHTHOUSE_REPORT_INTERNAL_SECRET..."
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $generatedInternalSecret = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  $secretsToSet["LIGHTHOUSE_REPORT_INTERNAL_SECRET"] = $generatedInternalSecret
  Write-Ok "Internal secret generado (64 chars hex)"
  Write-Warn "GUARDA ESTE VALOR - lo vas a necesitar para el paso de Vault:"
  Write-Host "    $generatedInternalSecret" -ForegroundColor Yellow
  Write-Host ""
  Read-Host "Apreta Enter cuando lo hayas copiado a un lugar seguro"
}

# 5.2 - LIGHTHOUSE_REPORT_MODEL (default)
if (-not (Test-Secret "LIGHTHOUSE_REPORT_MODEL")) {
  $secretsToSet["LIGHTHOUSE_REPORT_MODEL"] = "anthropic/claude-sonnet-4"
  Write-Ok "LIGHTHOUSE_REPORT_MODEL -> anthropic/claude-sonnet-4"
}

# 5.3 - LIGHTHOUSE_SLACK_CHANNEL (default)
if (-not (Test-Secret "LIGHTHOUSE_SLACK_CHANNEL")) {
  $secretsToSet["LIGHTHOUSE_SLACK_CHANNEL"] = "informes-seo"
  Write-Ok "LIGHTHOUSE_SLACK_CHANNEL -> informes-seo"
}

# 5.4 - LIGHTHOUSE_DRIVE_ROOT (default)
if (-not (Test-Secret "LIGHTHOUSE_DRIVE_ROOT")) {
  $secretsToSet["LIGHTHOUSE_DRIVE_ROOT"] = "SeoLab Informes SEO"
  Write-Ok "LIGHTHOUSE_DRIVE_ROOT -> SeoLab Informes SEO"
}

# 5.5 - OPENROUTER_API_KEY (requerido)
if (-not (Test-Secret "OPENROUTER_API_KEY")) {
  Write-Host ""
  $val = Read-Host "OpenRouter API key (sk-or-v1-...)"
  if (-not $val) { Write-Err "OPENROUTER_API_KEY es requerido"; exit 1 }
  $secretsToSet["OPENROUTER_API_KEY"] = $val.Trim()
} else {
  Write-Ok "OPENROUTER_API_KEY ya existe"
}

# 5.6 - SLACK_BOT_TOKEN (requerido)
if (-not (Test-Secret "SLACK_BOT_TOKEN")) {
  Write-Host ""
  $val = Read-Host "Slack Bot Token (xoxb-...)"
  if (-not $val) { Write-Err "SLACK_BOT_TOKEN es requerido"; exit 1 }
  $secretsToSet["SLACK_BOT_TOKEN"] = $val.Trim()
} else {
  Write-Ok "SLACK_BOT_TOKEN ya existe"
}

# 5.7 - Google OAuth (deberian existir del invoice-document-builder)
foreach ($g in @("GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET", "GOOGLE_DOCS_REFRESH_TOKEN")) {
  if (Test-Secret $g) {
    Write-Ok "$g ya existe (reuso del invoice-document-builder)"
  } else {
    Write-Warn "$g NO existe. Sin esto el exporter no funciona."
    $val = Read-Host "Pega el valor de $g (Enter para skip)"
    if ($val) { $secretsToSet[$g] = $val.Trim() }
  }
}

# Aplicar los secretos
if ($secretsToSet.Count -gt 0) {
  Write-Host ""
  Write-Step ("Aplicando " + $secretsToSet.Count + " secreto(s) nuevos")
  $args = @()
  foreach ($k in $secretsToSet.Keys) {
    $args += ($k + "=" + $secretsToSet[$k])
  }
  supabase secrets set @args
  if ($LASTEXITCODE -ne 0) {
    Write-Err "supabase secrets set fallo."
    exit 1
  }
  Write-Ok "Secretos cargados"
} else {
  Write-Ok "Todos los secretos ya estaban configurados"
}

# === 6. Deploy de las 4 funciones ============================================
Write-Step ("Desplegando las " + $Functions.Count + " edge functions")

$deployed = @()
$failed = @()
foreach ($fn in $Functions) {
  Write-Host ""
  Write-Host "  -> Deployando $fn..." -ForegroundColor White
  supabase functions deploy $fn --no-verify-jwt --project-ref $ProjectRef
  if ($LASTEXITCODE -eq 0) {
    Write-Ok "$fn desplegada"
    $deployed += $fn
  } else {
    Write-Err "$fn fallo"
    $failed += $fn
  }
}

# === 7. Resumen y siguientes pasos ===========================================
Write-Step "Resumen"
Write-Host ""
Write-Host ("  Desplegadas (" + $deployed.Count + "/" + $Functions.Count + "):")
foreach ($fn in $deployed) { Write-Host ("    [OK] " + $fn) -ForegroundColor Green }
if ($failed.Count -gt 0) {
  foreach ($fn in $failed) { Write-Host ("    [X]  " + $fn) -ForegroundColor Red }
}

if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Err "Hay funciones que fallaron. Revisa los errores arriba."
  exit 1
}

# === 8. Instrucciones SQL finales (here-string para evitar parsing issues) ===
Write-Step "Pasos manuales que faltan"

$dashboardUrl = "https://supabase.com/dashboard/project/$ProjectRef/sql/new"
$projectUrl = "https://$ProjectRef.supabase.co"

Write-Host ""
Write-Host "  Anda al SQL Editor del Dashboard de Light_House:"
Write-Host "    $dashboardUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Y corre estos 3 bloques (en orden):"
Write-Host ""

$secretReplace = if ($generatedInternalSecret) { $generatedInternalSecret } else { "PEGAR_EL_INTERNAL_SECRET_AQUI" }

$blockA = @'

-- A) Cargar secretos en Vault (para el watchdog)
SELECT vault.create_secret(
  'INTERNAL_SECRET_PLACEHOLDER',
  'LIGHTHOUSE_REPORT_INTERNAL_SECRET'
);
SELECT vault.create_secret(
  'PROJECT_URL_PLACEHOLDER',
  'LIGHTHOUSE_PROJECT_URL'
);

'@
$blockA = $blockA.Replace('INTERNAL_SECRET_PLACEHOLDER', $secretReplace)
$blockA = $blockA.Replace('PROJECT_URL_PLACEHOLDER', $projectUrl)
Write-Host $blockA -ForegroundColor Yellow

$blockB = @'

-- B) Activar cron jobs
SELECT cron.schedule(
  'lighthouse-watchdog-full',
  '*/2 * * * *',
  'SELECT ahrefs_web_analysis.watchdog_full_pipeline();'
);
SELECT cron.schedule(
  'lighthouse-outbox-worker',
  '30 seconds',
  'SELECT ahrefs_web_analysis.dispatch_outbox_worker();'
);

'@
Write-Host $blockB -ForegroundColor Yellow

Write-Host ""
Write-Host "  -- C) Test end-to-end (opcional, desde PowerShell) --"
Write-Host ""
$curlExample = @"

curl -X POST $projectUrl/functions/v1/lighthouse-report-builder ^
  -H "x-internal-secret: $secretReplace" ^
  -H "Content-Type: application/json" ^
  -d "{\"orchestration_id\":\"599b2811-8c26-4d8d-bd88-43f6dd9e8704\",\"force\":true}"

"@
Write-Host $curlExample -ForegroundColor Cyan

Write-Step "Listo"
Write-Host ""
Write-Ok "Edge functions desplegadas. Falta solo el paso SQL en el Dashboard."
Write-Host ""
