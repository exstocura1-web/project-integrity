#Requires -Version 5.1
<#
  Runs as a scheduled task. Checks Hostinger transfer status.
  When transfer completes, configures DNS and removes the scheduled task.
#>
$ErrorActionPreference = 'Stop'
$logFile = 'C:\Exsto\self-host\transfer-log.txt'

function Log($msg) {
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] $msg"
    Add-Content -Path $logFile -Value $line
}

$domain       = 'exstocura.com'
$vpsIp        = '72.62.83.136'
$token        = 'fDWOUfcersS3dupbqdJ5RtLnnxS36nnWMPOep2eU32b2c21d'
$taskName     = 'ExstoTransferCheck'

$headers = @{
    'Authorization' = "Bearer $token"
    'Content-Type'  = 'application/json'
}

try {
    $portfolio = Invoke-RestMethod -Uri "https://developers.hostinger.com/api/domains/v1/portfolio" -Headers $headers -Method Get
    $entry = $portfolio | Where-Object { $_.domain -eq $domain }

    if (-not $entry) {
        Log "Domain not found in portfolio. Skipping."
        exit 0
    }

    Log "Status: $($entry.status)"

    if ($entry.status -ne 'active') {
        Log "Transfer not yet complete. Will check again next run."
        exit 0
    }

    Log "Transfer COMPLETE. Configuring DNS..."

    $cpanelIp = $null
    try {
        $resolved = [System.Net.Dns]::GetHostAddresses($domain) |
            Where-Object { $_.AddressFamily -eq 'InterNetwork' } |
            Select-Object -First 1
        $cpanelIp = $resolved.IPAddressToString
        Log "Current @ resolves to $cpanelIp"
    } catch {
        $cpanelIp = $vpsIp
        Log "Could not resolve @, defaulting to $vpsIp"
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

    $resp = Invoke-RestMethod -Uri "https://developers.hostinger.com/api/dns/v1/zones/$domain" -Headers $headers -Method Put -Body $dnsBody
    Log "DNS configured: @ -> $cpanelIp, n8n -> $vpsIp, www -> CNAME $domain"

    # Remove the scheduled task
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Log "Scheduled task '$taskName' removed. Migration DNS complete."

} catch {
    Log "ERROR: $($_.Exception.Message)"
}
