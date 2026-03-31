#Requires -Version 5.1
<#
  Adds the n8n A record to Hostinger's DNS zone for exstocura.com.
  Run this AFTER adding the domain to Hostinger hPanel.

  Usage: .\add-dns-record.ps1
#>
$ErrorActionPreference = 'Stop'

function Read-EnvFile([string]$path) {
    if (-not (Test-Path $path)) { return @{} }
    $map = @{}
    Get-Content -LiteralPath $path | ForEach-Object {
        $line = $_.Trim()
        if ($line -match '^\s*#' -or $line -eq '') { return }
        if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $map[$matches[1]] = $matches[2].Trim()
        }
    }
    $map
}

$env = Read-EnvFile 'C:\Exsto\.env'
$token = $env['HOSTINGER_API_TOKEN']
if (-not $token) { throw 'HOSTINGER_API_TOKEN missing from C:\Exsto\.env' }

$domain = 'exstocura.com'
$vpsIp = $env['N8N_VPS_IP']
if (-not $vpsIp) { $vpsIp = '72.62.83.136' }

$headers = @{
    'Authorization' = "Bearer $token"
    'Content-Type'  = 'application/json'
}
$apiBase = 'https://developers.hostinger.com'

Write-Host "`n-- Hostinger DNS: Add n8n A Record --" -ForegroundColor Yellow

$body = @{
    overwrite = $false
    zone = @(
        @{
            name    = 'n8n'
            type    = 'A'
            ttl     = 300
            records = @(
                @{ content = $vpsIp }
            )
        }
    )
} | ConvertTo-Json -Depth 4

Write-Host "  PUT /api/dns/v1/zones/$domain"
Write-Host "  Record: n8n.$domain -> $vpsIp"

try {
    $resp = Invoke-WebRequest -Uri "$apiBase/api/dns/v1/zones/$domain" `
        -Headers $headers -Method PUT -Body $body -TimeoutSec 15 -UseBasicParsing
    Write-Host "  OK ($($resp.StatusCode))" -ForegroundColor Green
    Write-Host "  $($resp.Content)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    $errBody = ""
    try {
        $sr = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $errBody = $sr.ReadToEnd()
    } catch {}

    if ($errBody -like '*Domain not found*') {
        Write-Host "`n  Domain not yet added to Hostinger." -ForegroundColor Red
        Write-Host "  Complete this one-time step first:" -ForegroundColor Yellow
        Write-Host "    1. Go to https://hpanel.hostinger.com"
        Write-Host "    2. Click 'Domains' in the left sidebar"
        Write-Host "    3. Click 'Add Website or Domain'"
        Write-Host "    4. Select 'Add an existing domain'"
        Write-Host "    5. Enter: exstocura.com"
        Write-Host "    6. Then re-run this script"
    } else {
        Write-Host "  FAILED ($code): $errBody" -ForegroundColor Red
    }
}

# Verify
Write-Host "`n  Verifying zone..." -ForegroundColor Cyan
try {
    $check = Invoke-RestMethod -Uri "$apiBase/api/dns/v1/zones/$domain" `
        -Headers $headers -TimeoutSec 10
    $aRecords = $check | Where-Object { $_.type -eq 'A' -and $_.name -eq 'n8n' }
    if ($aRecords) {
        Write-Host "  CONFIRMED: n8n.$domain -> $($aRecords.records.content -join ', ')" -ForegroundColor Green
        Write-Host "`n  Now change nameservers at HostPapa to:" -ForegroundColor Yellow
        Write-Host "    ns1.dns-parking.com"
        Write-Host "    ns2.dns-parking.com"
    } else {
        Write-Host "  A record for 'n8n' not found in zone yet."
    }
} catch {
    Write-Host "  Could not verify: $($_.Exception.Message)"
}

Write-Host ""
