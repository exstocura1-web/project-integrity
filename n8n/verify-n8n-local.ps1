#Requires -Version 5.1
<#
  Strategic local verification (no secrets in repo):
  1) Regenerate workflow JSON from build scripts
  2) Parse-check all three workflow files
  3) Report REPLACE_* placeholders (expected until IDs are injected)
  4) If N8N_LINKEDIN_DRY is set, run smoke-linkedin-dry.ps1
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step { param([string]$Message) Write-Host "[*] $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Fail { param([string]$Message) Write-Host "[FAIL] $Message" -ForegroundColor Red }
function Write-Warn { param([string]$Message) Write-Host "[!] $Message" -ForegroundColor Yellow }

Set-Location $Root

Write-Step "Build linkedin_workflow (+ DRY) from source"
& node (Join-Path $Root "build-linkedin-workflow.mjs")
if ($LASTEXITCODE -ne 0) { Write-Fail "build-linkedin-workflow.mjs failed"; exit 1 }

Write-Step "Build linkedin_connections from source"
& node (Join-Path $Root "build-linkedin-connections.mjs")
if ($LASTEXITCODE -ne 0) { Write-Fail "build-linkedin-connections.mjs failed"; exit 1 }

$wfDir = Join-Path $Root "workflows"
$jsonFiles = @(
  "linkedin_workflow.json",
  "linkedin_workflow_dry.json",
  "linkedin_connections.json"
)

Write-Step "Parse-check workflow JSON"
foreach ($f in $jsonFiles) {
  $p = Join-Path $wfDir $f
  if (-not (Test-Path $p)) { Write-Fail "Missing $p"; exit 1 }
  $raw = Get-Content -LiteralPath $p -Raw -Encoding UTF8
  try {
    $null = $raw | ConvertFrom-Json
    Write-Ok "Valid JSON: $f"
  }
  catch {
    Write-Fail "Invalid JSON: $f - $($_.Exception.Message)"
    exit 1
  }
}

Write-Step "Scan for REPLACE_* placeholders"
$replaceHits = 0
foreach ($f in $jsonFiles) {
  $p = Join-Path $wfDir $f
  $n = (Select-String -LiteralPath $p -Pattern "REPLACE_" -AllMatches).Matches.Count
  $replaceHits += $n
  if ($n -gt 0) { Write-Warn "$f : $n REPLACE_* occurrences (inject real IDs in build scripts, then rebuild)" }
}
if ($replaceHits -eq 0) { Write-Ok "No REPLACE_* strings in exported workflows" }

if (-not [string]::IsNullOrWhiteSpace($env:N8N_LINKEDIN_DRY)) {
  Write-Step "Live DRY webhook smoke (N8N_LINKEDIN_DRY is set)"
  & (Join-Path $Root "smoke-linkedin-dry.ps1")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
else {
  Write-Warn "Skip live smoke: set N8N_LINKEDIN_DRY to run smoke-linkedin-dry.ps1"
}

Write-Ok "Local verification finished."
exit 0
