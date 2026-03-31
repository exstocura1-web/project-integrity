#Requires -Version 5.1
<#
  Deletes existing Email Triage workflows by name and imports workflow-1-v2-cursor.json,
  then activates the new workflow. Requires a valid n8n API key.

  Reads N8N_API_KEY and N8N_URL from C:\Exsto.env first, then C:\Exsto\.env

  If GET /api/v1/workflows returns 404, your plan may not expose the public API (common on
  trial). Use the UI: Import from File, then activate.
#>
$ErrorActionPreference = 'Stop'

function Read-EnvFile($path) {
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

$envExsto = Read-EnvFile 'C:\Exsto.env'
$envDot = Read-EnvFile 'C:\Exsto\.env'
$apiKey = $envExsto['N8N_API_KEY']
if (-not $apiKey) { $apiKey = $envDot['N8N_API_KEY'] }
$baseUrl = ($envExsto['N8N_URL'], $envDot['N8N_URL'] | Where-Object { $_ } | Select-Object -First 1).TrimEnd('/')
if (-not $baseUrl) { $baseUrl = 'https://exo-project-integrity.app.n8n.cloud' }

if (-not $apiKey -or $apiKey -eq 'YOUR_N8N_API_KEY') {
  Write-Host 'N8N_API_KEY is missing or still set to YOUR_N8N_API_KEY.'
  Write-Host '1) Open https://exo-project-integrity.app.n8n.cloud/settings/api'
  Write-Host '2) Create an API key, paste it into C:\Exsto.env or C:\Exsto\.env as N8N_API_KEY=...'
  Write-Host '3) Re-run this script.'
  exit 1
}

$wfPath = Join-Path $PSScriptRoot 'workflow-1-v2-cursor.json'
if (-not (Test-Path $wfPath)) {
  Write-Error "Workflow file not found: $wfPath"
  exit 1
}

$headers = @{
  'X-N8N-API-KEY' = $apiKey
  'Accept'        = 'application/json'
  'Content-Type'  = 'application/json'
}

$namesToRemove = @(
  'Exsto Cura Email Triage v2',
  'Exsto Cura — Email Triage Agent'
)

function Invoke-N8nGet([string]$uri) {
  Invoke-RestMethod -Uri $uri -Headers $headers -Method GET
}

function Invoke-N8nDelete([string]$uri) {
  Invoke-RestMethod -Uri $uri -Headers $headers -Method DELETE
}

function Invoke-N8nPost([string]$uri, [object]$body) {
  $json = $body | ConvertTo-Json -Depth 100 -Compress
  Invoke-RestMethod -Uri $uri -Headers $headers -Method POST -Body ([System.Text.Encoding]::UTF8.GetBytes($json))
}

$apiV1 = "$baseUrl/api/v1"
$listUri = "$apiV1/workflows"

try {
  $list = Invoke-N8nGet $listUri
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "GET $listUri failed with HTTP $code."
  Write-Host 'If this is 404, the public API may be disabled on your n8n Cloud plan (often during trial).'
  Write-Host 'Import workflow-1-v2-cursor.json manually: Editor ... menu > Import from File, then activate.'
  exit 1
}

$workflows = @()
if ($list.PSObject.Properties.Name -contains 'data') { $workflows = @($list.data) }
elseif ($list -is [array]) { $workflows = $list }

foreach ($n in $namesToRemove) {
  $hits = @($workflows | Where-Object { $_.name -eq $n })
  foreach ($h in $hits) {
    $id = $h.id
    Write-Host "Deleting workflow $id ($($h.name))..."
    try {
      Invoke-N8nDelete "$apiV1/workflows/$id"
    } catch {
      Write-Warning "Delete failed for $id : $($_.Exception.Message)"
    }
  }
}

$raw = Get-Content -LiteralPath $wfPath -Raw -Encoding UTF8 | ConvertFrom-Json
$createBody = [ordered]@{
  name        = $raw.name
  nodes       = $raw.nodes
  connections = $raw.connections
  settings    = $raw.settings
}
if ($null -ne $raw.staticData) { $createBody['staticData'] = $raw.staticData }
if ($raw.tags) { $createBody['tags'] = $raw.tags }

Write-Host 'Creating workflow...'
$created = Invoke-N8nPost "$apiV1/workflows" ([pscustomobject]$createBody)
$newId = $created.id
Write-Host "Created workflow id $newId"

Write-Host 'Activating...'
try {
  $null = Invoke-N8nPost "$apiV1/workflows/$newId/activate" (@{})
  Write-Host 'Activate request sent (POST .../activate).'
} catch {
  Write-Warning "Activate via POST failed: $($_.Exception.Message). Try PATCH update with active:true or activate in UI."
}

Write-Host 'Done.'
