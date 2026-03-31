#Requires -Version 5.1
<#
.SYNOPSIS
  Fire Email Triage v2 test webhook (same shape as Extract Fields output).

.DESCRIPTION
  Reads N8N_CLOUD_URL from C:\Exsto\.env, POSTs JSON to /webhook/email-triage-test.
  Workflow must be ACTIVE. Requires webhook + code branch on Cloud (ensure_email_triage_test_webhook.py).

.EXAMPLE
  .\test-email-triage-webhook.ps1
  .\test-email-triage-webhook.ps1 -Subject 'Client escalation' -Body 'TDI needs IMS export by 5pm.'
#>

param(
  [string]$From = 'QA Exsto <qa@exstocura.com>',
  [string]$Subject = 'SITREP triage webhook test',
  [string]$Body = 'Confirm triage path: routine note re schedule risk narrative before owner workshop.'
)

$ErrorActionPreference = 'Stop'

function Write-Ok { param([string]$m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Fail { param([string]$m) Write-Host "[FAIL] $m" -ForegroundColor Red }

$repo = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repo '.env'
if (-not (Test-Path -LiteralPath $envFile)) { Write-Fail "Missing $envFile"; exit 1 }
Get-Content -LiteralPath $envFile -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if ($line.Length -eq 0 -or $line.StartsWith('#')) { return }
  $eq = $line.IndexOf('=')
  if ($eq -lt 1) { return }
  $k = $line.Substring(0, $eq).Trim()
  $v = $line.Substring($eq + 1).Trim()
  [Environment]::SetEnvironmentVariable($k, $v, 'Process')
}

$base = ($env:N8N_CLOUD_URL).TrimEnd('/')
if ([string]::IsNullOrWhiteSpace($base)) { Write-Fail 'N8N_CLOUD_URL not set in .env'; exit 1 }

$emailId = "ps-test-$([DateTime]::UtcNow.Ticks)"
$payload = @{
  from    = $From
  subject = $Subject
  body    = $Body
  emailId = $emailId
} | ConvertTo-Json -Compress

$url = "$base/webhook/email-triage-test"
try {
  $r = Invoke-WebRequest -Uri $url -Method POST -Body $payload -ContentType 'application/json; charset=utf-8' -UseBasicParsing
  Write-Ok "HTTP $([int]$r.StatusCode). Check n8n Executions (Email Triage v2, webhook) and your notification inbox."
  if ($r.Content) { Write-Host $r.Content }
}
catch {
  Write-Fail $_.Exception.Message
  exit 1
}
