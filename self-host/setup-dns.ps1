#Requires -Version 5.1
<#
  Adds an A record for n8n.exstocura.com via cPanel API, then polls
  until DNS propagation confirms.

  Usage:
    .\setup-dns.ps1 -VpsIp 123.45.67.89
    .\setup-dns.ps1 -VpsIp 123.45.67.89 -Subdomain ops  # ops.exstocura.com
    .\setup-dns.ps1 -VpsIp 123.45.67.89 -CpanelUser myuser -CpanelPass mypass

  Reads SFTP_USER / SFTP_PASS from C:\Exsto\.env if not passed as params.
  cPanel API 2 ZoneEdit over HTTPS on port 2083.
#>
param(
    [Parameter(Mandatory)][string]$VpsIp,
    [string]$Subdomain = 'n8n',
    [string]$Domain = 'exstocura.com',
    [string]$CpanelUser,
    [string]$CpanelPass,
    [int]$Ttl = 300
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  OK $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  FAIL $msg" -ForegroundColor Red }

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

# ── Resolve cPanel credentials ──────────────────────────────────────
$envMap = Read-EnvFile 'C:\Exsto\.env'

if (-not $CpanelUser) { $CpanelUser = $envMap['SFTP_USER'] }
if (-not $CpanelPass) { $CpanelPass = $envMap['SFTP_PASS'] }

if (-not $CpanelUser -or $CpanelUser -eq 'YOUR_CPANEL_USERNAME') {
    $CpanelUser = Read-Host 'cPanel username'
}
if (-not $CpanelPass -or $CpanelPass -eq 'YOUR_CPANEL_PASSWORD') {
    $secure = Read-Host 'cPanel password' -AsSecureString
    $CpanelPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    )
}

$fqdn = "$Subdomain.$Domain"

Write-Host "`n── Exsto Cura · DNS Setup ──" -ForegroundColor Yellow
Write-Host "  Record: $fqdn -> $VpsIp"
Write-Host "  cPanel: $Domain (user: $CpanelUser)`n"

# ── Validate IP format ──────────────────────────────────────────────
if ($VpsIp -notmatch '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
    Write-Fail "Invalid IP address: $VpsIp"
    exit 1
}

# ── cPanel API setup ────────────────────────────────────────────────
$pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${CpanelUser}:${CpanelPass}"))
$cpanelBase = "https://${Domain}:2083"
$headers = @{ Authorization = "Basic $pair" }

# TLS 1.2 for cPanel
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Skip cert validation if cPanel uses a self-signed cert (common on shared hosting)
if (-not ([System.Management.Automation.PSTypeName]'TrustAll').Type) {
    Add-Type @"
using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
public class TrustAll : ICertificatePolicy {
    public bool CheckValidationResult(ServicePoint sp, X509Certificate cert,
        WebRequest req, int problem) { return true; }
}
"@
}
[System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAll

# ── Step 1: Check for existing record ───────────────────────────────
Write-Step "Checking existing DNS records..."

$fetchParams = @{
    Uri     = "$cpanelBase/json-api/cpanel?cpanel_jsonapi_apiversion=2&cpanel_jsonapi_module=ZoneEdit&cpanel_jsonapi_func=fetchzone&domain=$Domain&type=A"
    Headers = $headers
    Method  = 'GET'
}

try {
    $zoneResp = Invoke-RestMethod @fetchParams
} catch {
    Write-Fail "cPanel API unreachable: $($_.Exception.Message)"
    Write-Host "  Verify cPanel credentials and that port 2083 is accessible."
    Write-Host "  You can also add the record manually:"
    Write-Host "    cPanel > Zone Editor > Add A Record"
    Write-Host "    Name: $fqdn   Address: $VpsIp   TTL: $Ttl"
    exit 1
}

if ($zoneResp.cpanelresult.error) {
    Write-Fail "cPanel error: $($zoneResp.cpanelresult.error)"
    exit 1
}

$existingRecord = $zoneResp.cpanelresult.data | Where-Object {
    $_.name -eq "$fqdn." -and $_.type -eq 'A'
}

if ($existingRecord) {
    if ($existingRecord.address -eq $VpsIp) {
        Write-Ok "A record already exists: $fqdn -> $VpsIp (no change needed)"
    } else {
        Write-Step "Existing A record found ($($existingRecord.address)), updating to $VpsIp..."

        $editParams = @{
            Uri     = "$cpanelBase/json-api/cpanel?cpanel_jsonapi_apiversion=2&cpanel_jsonapi_module=ZoneEdit&cpanel_jsonapi_func=edit_zone_record&domain=$Domain&line=$($existingRecord.line)&type=A&name=$fqdn.&address=$VpsIp&ttl=$Ttl"
            Headers = $headers
            Method  = 'GET'
        }
        $editResp = Invoke-RestMethod @editParams

        if ($editResp.cpanelresult.data.result.status -eq 1 -or
            $editResp.cpanelresult.data.newserial) {
            Write-Ok "A record updated: $fqdn -> $VpsIp"
        } else {
            $errMsg = $editResp.cpanelresult.data.result.statusmsg
            Write-Fail "Update failed: $errMsg"
            exit 1
        }
    }
} else {
    # ── Step 2: Create the A record ─────────────────────────────────
    Write-Step "Creating A record: $fqdn -> $VpsIp (TTL $Ttl)..."

    $addParams = @{
        Uri     = "$cpanelBase/json-api/cpanel?cpanel_jsonapi_apiversion=2&cpanel_jsonapi_module=ZoneEdit&cpanel_jsonapi_func=add_zone_record&domain=$Domain&name=$fqdn.&type=A&address=$VpsIp&ttl=$Ttl"
        Headers = $headers
        Method  = 'GET'
    }
    $addResp = Invoke-RestMethod @addParams

    if ($addResp.cpanelresult.data.result.status -eq 1 -or
        $addResp.cpanelresult.data.newserial) {
        Write-Ok "A record created: $fqdn -> $VpsIp"
    } else {
        $errMsg = $addResp.cpanelresult.data.result.statusmsg
        if (-not $errMsg) { $errMsg = ($addResp | ConvertTo-Json -Depth 5) }
        Write-Fail "Creation failed: $errMsg"
        Write-Host "  Manual fallback: cPanel > Zone Editor > Add A Record"
        Write-Host "  Name: $fqdn   Address: $VpsIp   TTL: $Ttl"
        exit 1
    }
}

# ── Step 3: Poll for DNS propagation ────────────────────────────────
Write-Host ""
Write-Step "Waiting for DNS propagation..."

$maxAttempts = 24
$intervalSec = 15
$resolved = $false

for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
        $dns = Resolve-DnsName -Name $fqdn -Type A -DnsOnly -ErrorAction Stop
        $resolvedIp = ($dns | Where-Object { $_.Type -eq 'A' }).IPAddress

        if ($resolvedIp -eq $VpsIp) {
            $resolved = $true
            break
        }
        Write-Host "    Attempt $i/$maxAttempts — resolved to $resolvedIp, waiting for $VpsIp..." -ForegroundColor DarkGray
    } catch {
        Write-Host "    Attempt $i/$maxAttempts — not resolving yet..." -ForegroundColor DarkGray
    }

    Start-Sleep -Seconds $intervalSec
}

Write-Host ""
if ($resolved) {
    Write-Ok "DNS propagated: $fqdn -> $VpsIp"
    Write-Host ""
    Write-Host "  NEXT: Run setup-vps.ps1 to deploy n8n:" -ForegroundColor Yellow
    Write-Host "    cd C:\Exsto\self-host"
    Write-Host "    .\setup-vps.ps1 -VpsIp $VpsIp"
} else {
    Write-Host "  DNS not yet propagated after $($maxAttempts * $intervalSec / 60) minutes." -ForegroundColor Yellow
    Write-Host "  This is normal — propagation can take up to 30 minutes."
    Write-Host "  You can proceed with VPS setup now; Caddy will retry SSL automatically."
    Write-Host ""
    Write-Host "  To check manually:  Resolve-DnsName $fqdn -Type A"
}

Write-Host ""
