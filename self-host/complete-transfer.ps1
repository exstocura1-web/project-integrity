#Requires -Version 5.1
<#
  Completes Hostinger domain transfer and configures DNS for n8n.
  1. Polls Hostinger portfolio until transfer completes
  2. Adds A records: @ -> cPanel IP, n8n -> VPS IP
  3. Verifies DNS propagation

  Usage: .\complete-transfer.ps1
#>
$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  OK $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  FAIL $msg" -ForegroundColor Red }

$envPath = 'C:\Exsto\.env'
$envMap = @{}
if (Test-Path $envPath) {
    Get-Content -LiteralPath $envPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -match '^\s*#' -or $line -eq '') { return }
        if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $envMap[$matches[1]] = $matches[2].Trim()
        }
    }
}

$domain   = 'exstocura.com'
$vpsIp    = $envMap['N8N_VPS_IP']
if (-not $vpsIp) { $vpsIp = '72.62.83.136' }

$hostingerToken = 'fDWOUfcersS3dupbqdJ5RtLnnxS36nnWMPOep2eU32b2c21d'
$headers = @{
    'Authorization' = "Bearer $hostingerToken"
    'Content-Type'  = 'application/json'
}

Write-Host "`n== Hostinger Transfer + DNS Setup ==" -ForegroundColor Yellow
Write-Host "  Domain : $domain"
Write-Host "  VPS IP : $vpsIp"
Write-Host ""

# Step 1: Check current transfer status
Write-Step "Checking domain portfolio..."
try {
    $portfolio = Invoke-RestMethod -Uri "https://developers.hostinger.com/api/domains/v1/portfolio" -Headers $headers -Method Get
    $entry = $portfolio | Where-Object { $_.domain -eq $domain }
    if (-not $entry) {
        Write-Fail "Domain $domain not found in Hostinger portfolio."
        exit 1
    }
    Write-Ok "Found: status = $($entry.status), type = $($entry.type)"
} catch {
    Write-Fail "Cannot reach Hostinger API: $($_.Exception.Message)"
    exit 1
}

if ($entry.status -eq 'active') {
    Write-Ok "Transfer already complete. Proceeding to DNS setup."
} else {
    Write-Host ""
    Write-Host "  Transfer status: $($entry.status)" -ForegroundColor Yellow
    Write-Host "  The EPP code must be submitted on the Hostinger transfer page." -ForegroundColor Yellow
    Write-Host "  URL: https://hpanel.hostinger.com/transfer/$domain" -ForegroundColor Yellow
    Write-Host ""

    Write-Step "Polling for transfer completion (Ctrl+C to stop)..."
    Write-Host "  Transfers typically take 1-5 days after EPP submission."
    Write-Host ""

    $pollInterval = 300
    while ($true) {
        Start-Sleep -Seconds $pollInterval
        try {
            $portfolio = Invoke-RestMethod -Uri "https://developers.hostinger.com/api/domains/v1/portfolio" -Headers $headers -Method Get
            $entry = $portfolio | Where-Object { $_.domain -eq $domain }
            $now = Get-Date -Format 'HH:mm:ss'
            if ($entry.status -eq 'active') {
                Write-Ok "[$now] Transfer complete!"
                break
            }
            Write-Host "  [$now] Still $($entry.status)... checking again in ${pollInterval}s" -ForegroundColor DarkGray
        } catch {
            Write-Host "  [$now] API error: $($_.Exception.Message) - retrying..." -ForegroundColor DarkGray
        }
    }
}

# Step 2: Configure DNS records
Write-Step "Configuring DNS records..."

$cpanelIp = $null
try {
    $resolved = [System.Net.Dns]::GetHostAddresses($domain) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1
    $cpanelIp = $resolved.IPAddressToString
    Write-Ok "Current @ record resolves to $cpanelIp"
} catch {
    Write-Host "  Could not resolve current $domain A record. Using VPS IP for @." -ForegroundColor Yellow
    $cpanelIp = $vpsIp
}

$dnsBody = @{
    overwrite = $false
    zone = @(
        @{
            name    = '@'
            type    = 'A'
            ttl     = 3600
            records = @(@{ content = $cpanelIp })
        },
        @{
            name    = 'n8n'
            type    = 'A'
            ttl     = 3600
            records = @(@{ content = $vpsIp })
        },
        @{
            name    = 'www'
            type    = 'CNAME'
            ttl     = 3600
            records = @(@{ content = $domain })
        }
    )
} | ConvertTo-Json -Depth 5

try {
    $resp = Invoke-RestMethod -Uri "https://developers.hostinger.com/api/dns/v1/zones/$domain" -Headers $headers -Method Put -Body $dnsBody
    Write-Ok "DNS records configured:"
    Write-Host "    @    -> A    -> $cpanelIp"
    Write-Host "    n8n  -> A    -> $vpsIp"
    Write-Host "    www  -> CNAME -> $domain"
} catch {
    $errBody = ''
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $errBody = $reader.ReadToEnd()
    }
    Write-Fail "DNS update failed: $($_.Exception.Message)"
    Write-Host "  $errBody" -ForegroundColor Red
    exit 1
}

# Step 3: Verify DNS propagation
Write-Step "Verifying DNS propagation for n8n.$domain..."
$maxWait = 120
$elapsed = 0
while ($elapsed -lt $maxWait) {
    try {
        $check = [System.Net.Dns]::GetHostAddresses("n8n.$domain") | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1
        if ($check.IPAddressToString -eq $vpsIp) {
            Write-Ok "n8n.$domain resolves to $vpsIp"
            break
        }
    } catch {}
    Start-Sleep -Seconds 10
    $elapsed += 10
    Write-Host "  Waiting for propagation... (${elapsed}s)" -ForegroundColor DarkGray
}

if ($elapsed -ge $maxWait) {
    Write-Host "  DNS hasn't propagated yet (may take up to 48h). n8n will work once it does." -ForegroundColor Yellow
}

Write-Host "`n  DONE. https://n8n.exstocura.com should remain accessible." -ForegroundColor Green
Write-Host ""
