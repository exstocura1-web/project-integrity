#Requires -Version 5.1
<#
  Migrates all Exsto workflows from n8n Cloud to self-hosted n8n.
  Reads C:\Exsto\.env for both source (cloud) and target (self-hosted) config.

  Prerequisites:
    1. Self-hosted n8n running (deploy.sh completed)
    2. Owner account created at https://n8n.exstocura.com
    3. API key generated: Settings > API > Create API Key
    4. Credentials created in self-hosted UI (Gmail, Anthropic, Notion, HoneyBook)
    5. .env updated with new N8N_URL, N8N_API_KEY, and N8N_CRED_* IDs

  Usage: .\migrate-to-selfhost.ps1
#>
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

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

$envMap = Read-EnvFile 'C:\Exsto\.env'

$n8nUrl = $envMap['N8N_URL']
$n8nKey = $envMap['N8N_API_KEY']

if (-not $n8nUrl) { throw 'N8N_URL missing from C:\Exsto\.env' }
if (-not $n8nKey -or $n8nKey -eq 'YOUR_N8N_API_KEY') { throw 'N8N_API_KEY missing from C:\Exsto\.env' }

$n8nUrl = $n8nUrl.TrimEnd('/')

Write-Host "`n== Exsto Cura - Workflow Migration ==" -ForegroundColor Yellow
Write-Host "  Target: $n8nUrl`n"

# Validate credential IDs are not cloud defaults (optional safety check)
$requiredCreds = @('N8N_CRED_GMAIL_ID', 'N8N_CRED_NOTION_ID', 'N8N_CRED_ANTHROPIC_LC_ID', 'N8N_CRED_ANTHROPIC_HTTP_ID')
$cloudDefaults = @{
    'N8N_CRED_GMAIL_ID'          = 'ulhDjv62tjLURSP5'
    'N8N_CRED_NOTION_ID'         = 'sHCYhXvTmtCNQPUU'
    'N8N_CRED_ANTHROPIC_LC_ID'   = 'u85U62dgbcEwpdkT'
    'N8N_CRED_ANTHROPIC_HTTP_ID' = '48RGxhjkOn6nkAnH'
}

$usingCloudCreds = $false
foreach ($cred in $requiredCreds) {
    $val = $envMap[$cred]
    if (-not $val -or $val -eq $cloudDefaults[$cred]) {
        $usingCloudCreds = $true
    }
}

if ($usingCloudCreds -and $n8nUrl -notlike '*n8n.cloud*') {
    Write-Host "  WARNING: .env still has cloud credential IDs but N8N_URL points to self-hosted." -ForegroundColor Yellow
    Write-Host "  Workflows will import but credentials won't bind until you:" -ForegroundColor Yellow
    Write-Host "    1. Create credentials in the self-hosted UI" -ForegroundColor Yellow
    Write-Host "    2. Update N8N_CRED_* values in .env with new IDs" -ForegroundColor Yellow
    Write-Host "    3. Re-run this script" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Proceeding with import (credentials can be reconnected in the UI)..." -ForegroundColor Yellow
}

$credGmail = [pscustomobject]@{
    id   = $(if ($envMap['N8N_CRED_GMAIL_ID']) { $envMap['N8N_CRED_GMAIL_ID'] } else { 'ulhDjv62tjLURSP5' })
    name = $(if ($envMap['N8N_CRED_GMAIL_NAME']) { $envMap['N8N_CRED_GMAIL_NAME'] } else { 'Gmail account' })
}
$credNotion = [pscustomobject]@{
    id   = $(if ($envMap['N8N_CRED_NOTION_ID']) { $envMap['N8N_CRED_NOTION_ID'] } else { 'sHCYhXvTmtCNQPUU' })
    name = $(if ($envMap['N8N_CRED_NOTION_NAME']) { $envMap['N8N_CRED_NOTION_NAME'] } else { 'Notion account' })
}
$credAnthropicLc = [pscustomobject]@{
    id   = $(if ($envMap['N8N_CRED_ANTHROPIC_LC_ID']) { $envMap['N8N_CRED_ANTHROPIC_LC_ID'] } else { 'u85U62dgbcEwpdkT' })
    name = $(if ($envMap['N8N_CRED_ANTHROPIC_LC_NAME']) { $envMap['N8N_CRED_ANTHROPIC_LC_NAME'] } else { 'Anthropic account' })
}
$credAnthropicHttp = [pscustomobject]@{
    id   = $(if ($envMap['N8N_CRED_ANTHROPIC_HTTP_ID']) { $envMap['N8N_CRED_ANTHROPIC_HTTP_ID'] } else { '48RGxhjkOn6nkAnH' })
    name = $(if ($envMap['N8N_CRED_ANTHROPIC_HTTP_NAME']) { $envMap['N8N_CRED_ANTHROPIC_HTTP_NAME'] } else { 'Anthropic API Key' })
}

$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Add('X-N8N-API-KEY', $n8nKey)

Write-Step "Testing API connection..."
try {
    $testResp = $client.GetAsync("$n8nUrl/api/v1/workflows").Result
    if ([int]$testResp.StatusCode -ne 200) {
        throw "HTTP $([int]$testResp.StatusCode)"
    }
    $existing = ($testResp.Content.ReadAsStringAsync().Result | ConvertFrom-Json).data
    Write-Ok "Connected ($($existing.Count) existing workflows)"
} catch {
    Write-Fail "Cannot reach $n8nUrl/api/v1/workflows - $($_.Exception.Message)"
    Write-Host "  Verify n8n is running, API key is valid, and URL is correct."
    exit 1
}

$byName = @{}
foreach ($w in $existing) { $byName[$w.name] = $w.id }

function Strip-Workflow([pscustomobject]$wf) {
    $remove = @('id','createdAt','updatedAt','active','versionId','activeVersionId','versionCounter','triggerCount',
        'tags','pinData','shared','meta','isArchived','activeVersion','description','staticData',
        'homeProject','usedCredentials')
    foreach ($p in $remove) { try { $wf.PSObject.Properties.Remove($p) } catch {} }
    foreach ($n in $wf.nodes) { try { $n.PSObject.Properties.Remove('id') } catch {} }
    $wf.settings = [pscustomobject]@{ executionOrder = 'v1' }
}

function Remap-Credentials([pscustomobject]$node) {
    if (-not $node.credentials) { return }
    $creds = $node.credentials

    if ($creds.PSObject.Properties['gmailOAuth2']) {
        $creds.gmailOAuth2 = $credGmail
    }
    if ($creds.PSObject.Properties['notionApi']) {
        $creds.notionApi = $credNotion
    }
    if ($creds.PSObject.Properties['anthropicApi']) {
        $creds.anthropicApi = $credAnthropicLc
    }
    if ($creds.PSObject.Properties['httpHeaderAuth']) {
        $creds.httpHeaderAuth = $credAnthropicHttp
    }
}

function Send-Workflow([pscustomobject]$body, [string]$existingId) {
    $json = $body | ConvertTo-Json -Depth 80 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $content = [System.Net.Http.ByteArrayContent]::new($bytes)
    $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new('application/json')
    if ($existingId) {
        $resp = $client.PutAsync("$n8nUrl/api/v1/workflows/$existingId", $content).Result
    } else {
        $resp = $client.PostAsync("$n8nUrl/api/v1/workflows", $content).Result
    }
    $code = [int]$resp.StatusCode
    $txt = $resp.Content.ReadAsStringAsync().Result
    if ($code -notin @(200, 201)) {
        throw "HTTP $code : $($txt.Substring(0, [Math]::Min(800, $txt.Length)))"
    }
    ($txt | ConvertFrom-Json).id
}

$wfDir = 'C:\Exsto\n8n-workflows'
$workflows = @(
    @{ file = 'workflow-1-v2-cursor.json';              label = 'Email Triage' }
    @{ file = 'workflow-2-monthly-report.json';         label = 'Monthly Report' }
    @{ file = 'workflow-3-prospect-intel.json';         label = 'Prospect Intel' }
    @{ file = 'workflow-4-invoice-agent.json';          label = 'Invoice Agent' }
    @{ file = 'workflow-5-smartpm-market-agent.json';   label = 'SmartPM Market Agent' }
)

$dbMap = @{
    'NOTION_EMAIL_INBOX_DB'    = $envMap['NOTION_EMAIL_INBOX_DB']
    'NOTION_MONTHLY_REPORTS_DB' = $envMap['NOTION_MONTHLY_REPORTS_DB']
    'NOTION_BD_INTEL_DB'       = $envMap['NOTION_BD_INTEL_DB']
    'NOTION_FINANCE_DB'        = $envMap['NOTION_FINANCE_DB']
}

$imported = @()
$failed = @()

foreach ($entry in $workflows) {
    $path = Join-Path $wfDir $entry.file
    if (-not (Test-Path $path)) {
        Write-Fail "$($entry.label) - file not found: $($entry.file)"
        $failed += $entry.label
        continue
    }

    Write-Step "Importing $($entry.label)..."
    try {
        $wf = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
        Strip-Workflow $wf

        foreach ($node in $wf.nodes) {
            Remap-Credentials $node

            # Model downgrade disabled — maintain Sonnet for all Exsto Cura workflows
            # if ($node.type -eq '@n8n/n8n-nodes-langchain.lmChatAnthropic' -and $node.parameters.model) {
            #     $node.parameters.model = $node.parameters.model -replace 'claude-sonnet-4-20250514', 'claude-haiku-3-20250307'
            # }
        }

        $body = [ordered]@{
            name        = $wf.name
            nodes       = $wf.nodes
            connections = $wf.connections
            settings    = $wf.settings
        }

        $existingId = $byName[$wf.name]
        $id = Send-Workflow ([pscustomobject]$body) $existingId
        $verb = 'created'; if ($existingId) { $verb = 'updated' }
        Write-Ok "$($entry.label) $verb -> $id"
        $imported += $entry.label
    } catch {
        Write-Fail "$($entry.label) - $($_.Exception.Message)"
        $failed += $entry.label
    }
}

$client.Dispose()

Write-Host "`n== Migration Summary ==" -ForegroundColor Yellow
$sumColor = 'Yellow'; if ($imported.Count -eq 5) { $sumColor = 'Green' }
Write-Host "  Imported: $($imported.Count)/5" -ForegroundColor $sumColor
foreach ($name in $imported) { Write-Host "    $name" -ForegroundColor Green }
if ($failed.Count -gt 0) {
    Write-Host "  Failed:" -ForegroundColor Red
    foreach ($name in $failed) { Write-Host "    $name" -ForegroundColor Red }
}

Write-Host "`n  POST-MIGRATION CHECKLIST:" -ForegroundColor Yellow
Write-Host "    [ ] Open each workflow in the n8n editor"
Write-Host "    [ ] Click each node with a warning icon - reconnect credential"
Write-Host "    [ ] Test Execute each workflow"
Write-Host "    [ ] Toggle Active for each workflow"
Write-Host "    [ ] Verify email triage processes a test email"
Write-Host "    [ ] Update DNS: cancel n8n Cloud after 1 week of stable self-host"
Write-Host ""
