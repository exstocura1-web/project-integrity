#Requires -Version 5.1
<#
  Provisions n8n self-hosted on a fresh Ubuntu VPS.
  Run from your Windows machine. Requires SSH access to the VPS.

  Usage: .\setup-vps.ps1 -VpsIp 123.45.67.89 [-Domain n8n.exstocura.com] [-User root]
#>
param(
    [Parameter(Mandatory)][string]$VpsIp,
    [string]$Domain = 'n8n.exstocura.com',
    [string]$User = 'root'
)

$ErrorActionPreference = 'Stop'
$selfHostDir = $PSScriptRoot

function Write-Step($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  OK $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  FAIL $msg" -ForegroundColor Red }

Write-Host "`n── Exsto Cura · VPS Setup ──" -ForegroundColor Yellow
Write-Host "  Target: $User@$VpsIp"
Write-Host "  Domain: $Domain`n"

$envContent = Get-Content "$selfHostDir\.env" -Raw
$envContent = $envContent -replace 'N8N_DOMAIN=.*', "N8N_DOMAIN=$Domain"
$tempEnv = Join-Path $env:TEMP "n8n-deploy-env-$(Get-Random).tmp"
$envContent | Set-Content $tempEnv -NoNewline

Write-Step "Creating /opt/n8n on VPS..."
ssh "${User}@${VpsIp}" "mkdir -p /opt/n8n"

Write-Step "Copying deployment files..."
scp "$selfHostDir\docker-compose.yml" "${User}@${VpsIp}:/opt/n8n/"
scp "$selfHostDir\Caddyfile" "${User}@${VpsIp}:/opt/n8n/"
scp "$selfHostDir\deploy.sh" "${User}@${VpsIp}:/opt/n8n/"
scp "$tempEnv" "${User}@${VpsIp}:/opt/n8n/.env"
Remove-Item $tempEnv -Force

Write-Step "Running deploy.sh..."
ssh "${User}@${VpsIp}" "chmod +x /opt/n8n/deploy.sh && cd /opt/n8n && ./deploy.sh"

Write-Ok "VPS provisioned"
Write-Host ""
Write-Host "  NEXT:" -ForegroundColor Yellow
Write-Host "  1. Point DNS A record: $Domain -> $VpsIp"
Write-Host "  2. Visit https://$Domain — create owner account (mcraig@exstocura.com)"
Write-Host "  3. Settings > Credentials — create Gmail OAuth2, Anthropic, Notion, HoneyBook"
Write-Host "  4. Copy each credential ID from the URL bar"
Write-Host "  5. Update C:\Exsto\.env with new credential IDs and N8N_URL"
Write-Host "  6. Run: .\migrate-to-selfhost.ps1"
Write-Host ""
