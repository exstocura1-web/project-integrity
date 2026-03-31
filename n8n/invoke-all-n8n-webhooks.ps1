#Requires -Version 5.1
<#
.SYNOPSIS
  POST each configured n8n webhook URL found in C:\Exsto\.env (process scope).

.DESCRIPTION
  Loads .env, then for each known env var that is set, POSTs default JSON {}.
  Add URLs in .env as you enable Test/Production webhooks in n8n Cloud.

  Supported vars (all optional):
    N8N_WEBHOOK_URL
    N8N_WEBHOOK_WEEKLY_DIGEST
    N8N_WEBHOOK_MONTHLY_REPORT
    N8N_WEBHOOK_PROSPECT_INTEL
    N8N_WEBHOOK_INVOICE_AGENT
    N8N_WEBHOOK_SMARTPM_OUTREACH
    N8N_WEBHOOK_EMAIL_TRIAGE
#>

$ErrorActionPreference = 'Stop'

function Write-Step { param([string]$Message) Write-Host "[*] $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Fail { param([string]$Message) Write-Host "[FAIL] $Message" -ForegroundColor Red }
function Write-Skip { param([string]$Message) Write-Host "[--] $Message" -ForegroundColor DarkGray }

function Import-ExstoDotEnv {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith('#')) { return }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $val, 'Process')
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Import-ExstoDotEnv -Path (Join-Path $repoRoot '.env')

$targets = @(
  @{ Label = 'generic';            Var = 'N8N_WEBHOOK_URL' }
  @{ Label = 'weekly_digest';       Var = 'N8N_WEBHOOK_WEEKLY_DIGEST' }
  @{ Label = 'monthly_report';      Var = 'N8N_WEBHOOK_MONTHLY_REPORT' }
  @{ Label = 'prospect_intel';      Var = 'N8N_WEBHOOK_PROSPECT_INTEL' }
  @{ Label = 'invoice_agent';       Var = 'N8N_WEBHOOK_INVOICE_AGENT' }
  @{ Label = 'smartpm_outreach';    Var = 'N8N_WEBHOOK_SMARTPM_OUTREACH' }
  @{ Label = 'email_triage';        Var = 'N8N_WEBHOOK_EMAIL_TRIAGE' }
)

$ran = 0
$failed = 0

foreach ($t in $targets) {
  $url = [Environment]::GetEnvironmentVariable($t.Var, 'Process')
  if ([string]::IsNullOrWhiteSpace($url)) {
    Write-Skip "$($t.Label): $($t.Var) unset"
    continue
  }
  Write-Step "$($t.Label): POST $url"
  try {
    $r = Invoke-WebRequest -Uri $url -Method POST -Body '{}' -ContentType 'application/json; charset=utf-8' -UseBasicParsing
    Write-Ok "$($t.Label): HTTP $([int]$r.StatusCode)"
    if ($r.Content) { Write-Host $r.Content }
    $ran++
  }
  catch {
    Write-Fail "$($t.Label): $($_.Exception.Message)"
    $failed++
  }
}

Write-Step "Done: invoked $ran webhook(s), $failed failure(s)."
if ($failed -gt 0) { exit 1 }
if ($ran -eq 0) {
  Write-Skip "No webhook env vars set — add URLs to .env (see script header)."
  exit 2
}
exit 0
