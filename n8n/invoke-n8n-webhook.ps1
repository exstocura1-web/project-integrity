#Requires -Version 5.1
<#
.SYNOPSIS
  Fire an n8n Cloud (or any) webhook from the shell.

.DESCRIPTION
  Loads KEY=value pairs from C:\Exsto\.env into the process (if the file exists),
  then sends one request. Prefer storing the full URL as N8N_WEBHOOK_URL in .env.

.EXAMPLE
  .\invoke-n8n-webhook.ps1 -Url 'https://exo-project-integrity.app.n8n.cloud/webhook/my-hook'
  $env:N8N_WEBHOOK_URL = 'https://.../webhook/test'; .\invoke-n8n-webhook.ps1
  .\invoke-n8n-webhook.ps1 -Method GET
#>

param(
  [string]$Url,
  [ValidateSet('GET', 'POST')]
  [string]$Method = 'POST',
  [string]$JsonBody = '{}'
)

$ErrorActionPreference = 'Stop'

function Write-Step { param([string]$Message) Write-Host "[*] n8n webhook | $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Fail { param([string]$Message) Write-Host "[FAIL] $Message" -ForegroundColor Red }

function Import-ExstoDotEnv {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Write-Step "Load $Path"
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith('#')) { return }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    if (
      ($val.StartsWith('"') -and $val.EndsWith('"')) -or
      ($val.StartsWith("'") -and $val.EndsWith("'"))
    ) { $val = $val.Substring(1, $val.Length - 2) }
    [Environment]::SetEnvironmentVariable($name, $val, 'Process')
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Import-ExstoDotEnv -Path (Join-Path $repoRoot '.env')

if ([string]::IsNullOrWhiteSpace($Url)) { $Url = $env:N8N_WEBHOOK_URL }
if ([string]::IsNullOrWhiteSpace($Url)) {
  Write-Fail "Pass -Url or set N8N_WEBHOOK_URL (e.g. in C:\Exsto\.env)."
  exit 1
}

Write-Step "$Method $Url"

try {
  if ($Method -eq 'GET') {
    $r = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing
    Write-Ok "HTTP $([int]$r.StatusCode)"
    if ($r.Content) { Write-Host $r.Content }
  }
  else {
    $r = Invoke-WebRequest -Uri $Url -Method POST -Body $JsonBody -ContentType 'application/json; charset=utf-8' -UseBasicParsing
    Write-Ok "HTTP $([int]$r.StatusCode)"
    if ($r.Content) { Write-Host $r.Content }
  }
}
catch {
  Write-Fail $_.Exception.Message
  if ($_.Exception.Response) {
    $code = [int]$_.Exception.Response.StatusCode
    Write-Fail "HTTP $code"
  }
  exit 1
}

exit 0
