# n8n Cloud stress test + publish — reads C:\Exsto\.env (N8N_CLOUD_URL, N8N_CLOUD_API_KEY)
$ErrorActionPreference = 'Stop'

function Write-Ok($m) { Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Fail($m) { Write-Host "[FAIL] $m" -ForegroundColor Red }
function Write-Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }

$envPath = 'C:\Exsto\.env'
if (-not (Test-Path $envPath)) { throw ".env not found at $envPath" }
Get-Content $envPath -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if ($line -match '^([^#=]+)=(.*)$') {
    $k = $matches[1].Trim()
    $v = $matches[2].Trim()
    Set-Item -Path "env:$k" -Value $v
  }
}

$base = $env:N8N_CLOUD_URL
if (-not $base) { throw 'N8N_CLOUD_URL missing from .env' }
$base = $base.TrimEnd('/')
$key = $env:N8N_CLOUD_API_KEY
if (-not $key) { throw 'N8N_CLOUD_API_KEY missing from .env' }

$headers = @{
  'X-N8N-API-KEY' = $key
  'Accept'          = 'application/json'
  'Content-Type'    = 'application/json'
}

function Invoke-N8n {
  param([string]$Method, [string]$Uri, [object]$Body = $null)
  $params = @{ Uri = $Uri; Method = $Method; Headers = $headers }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 30 -Compress) }
  try {
    return Invoke-RestMethod @params
  } catch {
    $r = $_.Exception.Response
    if ($r) {
      $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
      $txt = $sr.ReadToEnd()
      throw "HTTP error: $($r.StatusCode) $txt"
    }
    throw
  }
}

Write-Step "GET /workflows"
$list = Invoke-N8n -Method Get -Uri "$base/api/v1/workflows"
$rows = @()
# API may return { data: [...] } or array
$items = $list.data
if (-not $items) { $items = @($list) }
foreach ($w in $items) {
  $rows += [pscustomobject]@{ id = $w.id; name = $w.name; active = $w.active }
}
$rows | Format-Table -AutoSize
$rows | ConvertTo-Json -Depth 3 | Set-Content -Path 'C:\Exsto\n8n-workflows\_stress_workflow_list.json' -Encoding UTF8
Write-Ok "Saved list to _stress_workflow_list.json"

# --- Phase 1 detail: triggers, nodes, credentials ---
function Get-TriggerSummary {
  param([object[]]$nodes)
  $types = @(
    'n8n-nodes-base.webhook',
    'n8n-nodes-base.scheduleTrigger',
    'n8n-nodes-base.manualTrigger',
    'n8n-nodes-base.gmailTrigger',
    'n8n-nodes-base.emailReadImap',
    'n8n-nodes-base.formTrigger',
    'n8n-nodes-base.executeWorkflowTrigger'
  )
  $found = @()
  foreach ($n in $nodes) {
    if ($types -contains $n.type) { $found += $n.type }
  }
  if ($found.Count -eq 0) { return 'unknown/other' }
  return ($found -join ', ')
}

function Get-CredentialRefs {
  param([object[]]$nodes)
  $refs = [System.Collections.Generic.HashSet[string]]::new()
  foreach ($n in $nodes) {
    if ($null -eq $n.credentials) { continue }
    $n.credentials.PSObject.Properties | ForEach-Object {
      [void]$refs.Add("$($_.Name):$($_.Value.id)")
    }
  }
  return ($refs | Sort-Object) -join '; '
}

$audit = @()
foreach ($r in $rows) {
  $wd = Invoke-N8n -Method Get -Uri "$base/api/v1/workflows/$($r.id)"
  $nodes = @($wd.nodes)
  $trigger = Get-TriggerSummary -nodes $nodes
  $credStr = Get-CredentialRefs -nodes $nodes
  $typeCounts = $nodes | Group-Object type | ForEach-Object { "$($_.Name)=$($_.Count)" }
  $audit += [pscustomobject]@{
    Workflow              = $r.name
    Id                    = $r.id
    Trigger               = $trigger
    NodeCount             = $nodes.Count
    CredentialsNeeded     = $credStr
    Status                = if ($r.active) { 'Published (active)' } else { 'Draft (inactive)' }
    NodeTypesSummary      = ($typeCounts -join ', ')
  }
}
$audit | ConvertTo-Json -Depth 5 | Set-Content 'C:\Exsto\n8n-workflows\_stress_audit.json' -Encoding UTF8
Write-Step "Phase 1 audit saved (_stress_audit.json)"
$audit | Format-Table Workflow, Id, Trigger, NodeCount, Status -AutoSize

# --- Test payloads (match user templates) ---
$payloads = @{
  'Exsto Cura Email Triage v2' = @{
    subject = 'URGENT: CO-015 Settlement Follow-up'
    from    = 'scott@tdi-hvdc.com'
    body    = 'Michael, need your forensic schedule summary by EOD Friday.'
    date    = '2026-03-29T09:00:00Z'
    labels  = @('INBOX')
  }
  'Exsto Cura - Invoice & Payment Agent' = @{
    vendor         = 'NKT Cables GmbH'
    invoice_number = 'NKT-2026-0441'
    amount         = 142500.00
    currency       = 'USD'
    due_date       = '2026-04-15'
    project        = 'CHPE'
  }
  'Exsto Cura - Prospect Intelligence Agent' = @{
    company          = 'Transmission Developers Inc'
    contact          = 'Scott [TDI]'
    source           = 'Direct Referral'
    engagement_type  = 'AI Project Controls Demo'
    priority         = 'HIGH'
  }
  'Exsto Cura - Monthly Report Pipeline Agent' = @{
    reporting_period = 'March 2026'
    project          = 'CHPE'
    trigger          = 'month_end'
    include_tia      = $true
  }
  'Exsto Cura - SmartPM Market Intelligence & Outreach Agent' = @{
    signal_type     = 'competitor_activity'
    entity          = 'SmartPM Technologies'
    event           = 'New HVDC case study published'
    source          = 'LinkedIn'
    relevance_score = 0.92
  }
  'Exsto Cura Weekly Digest' = @{
    week        = '2026-W13'
    trigger     = 'scheduled_digest'
    include_bd  = $true
    include_ops = $true
  }
}

# --- Phase 2: execute (skip if no manual/webhook-style trigger) ---
$execResults = @()
$skipTriggers = @('n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.gmailTrigger')

function Wait-Execution {
  param([string]$execId, [int]$maxSec = 60)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $maxSec) {
    Start-Sleep -Milliseconds 800
    try {
      $ex = Invoke-N8n -Method Get -Uri "$base/api/v1/executions/$execId"
    } catch {
      continue
    }
    $st = $ex.status
    if ($st -in @('success', 'error', 'canceled', 'crashed')) {
      return $ex
    }
  }
  return $null
}

foreach ($r in $rows) {
  $wd = Invoke-N8n -Method Get -Uri "$base/api/v1/workflows/$($r.id)"
  $nodes = @($wd.nodes)
  $triggerTypes = ($nodes | Where-Object {
      $_.type -in @(
        'n8n-nodes-base.webhook',
        'n8n-nodes-base.manualTrigger',
        'n8n-nodes-base.scheduleTrigger',
        'n8n-nodes-base.gmailTrigger',
        'n8n-nodes-base.formTrigger',
        'n8n-nodes-base.executeWorkflowTrigger'
      )
    } | Select-Object -ExpandProperty type)

  $hasManual = $triggerTypes -contains 'n8n-nodes-base.manualTrigger'
  $hasWebhook = $triggerTypes -contains 'n8n-nodes-base.webhook'
  $onlySchedule = ($triggerTypes.Count -gt 0) -and ($triggerTypes | Where-Object { $_ -ne 'n8n-nodes-base.scheduleTrigger' }).Count -eq 0

  if (-not ($hasManual -or $hasWebhook)) {
    $execResults += [pscustomobject]@{
      Workflow   = $r.name
      Skipped    = $true
      Reason     = if ($onlySchedule) { 'Schedule-only trigger - API test skipped (use UI or wait for cron)' } else { "No manual/webhook trigger ($($triggerTypes -join ', '))" }
      ExecId     = $null
      Status     = 'skipped'
      DurationMs = $null
      Error      = $null
      LastNode   = $null
    }
    continue
  }

  $payload = $payloads[$r.name]
  if (-not $payload) { $payload = @{} }

  # n8n execute API: wrap input for manual/webhook runs
  $body = @{ data = @{ main = @( , @( @{ json = $payload } ) ) } }

  $execId = $null
  $errMsg = $null
  try {
    $resp = Invoke-N8n -Method Post -Uri "$base/api/v1/workflows/$($r.id)/execute" -Body $body
    $execId = $resp.data.executionId
    if (-not $execId) { $execId = $resp.executionId }
  } catch {
    $errMsg = $_.Exception.Message
    if ($errMsg -match '429') {
      Start-Sleep -Seconds 5
      try {
        $resp = Invoke-N8n -Method Post -Uri "$base/api/v1/workflows/$($r.id)/execute" -Body $body
        $execId = $resp.data.executionId
        if (-not $execId) { $execId = $resp.executionId }
        $errMsg = $null
      } catch {
        $errMsg = $_.Exception.Message
      }
    }
  }

  if (-not $execId) {
    $execResults += [pscustomobject]@{
      Workflow   = $r.name
      Skipped    = $false
      Reason     = 'Execute API failed'
      ExecId     = $null
      Status     = 'error'
      DurationMs = $null
      Error      = $errMsg
      LastNode   = $null
    }
    continue
  }

  $ex = Wait-Execution -execId $execId
  $lastNode = $null
  $failNode = $null
  $failMsg = $null
  if ($ex) {
    $st = $ex.status
    if ($ex.data -and $ex.data.resultData -and $ex.data.resultData.runData) {
      $rd = $ex.data.resultData.runData
      $names = $rd.PSObject.Properties.Name
      if ($names.Count -gt 0) { $lastNode = $names[-1] }
    }
    if ($st -eq 'error' -and $ex.data -and $ex.data.resultData -and $ex.data.resultData.error) {
      $e = $ex.data.resultData.error
      $failMsg = $e.message
      if ($e.node) { $failNode = $e.node.name }
    }
  }

  $execResults += [pscustomobject]@{
    Workflow   = $r.name
    Skipped    = $false
    Reason     = $null
    ExecId     = $execId
    Status     = if ($ex) { $ex.status } else { 'timeout' }
    DurationMs = if ($ex -and $ex.startedAt -and $ex.stoppedAt) {
      try {
        ([datetime]$ex.stoppedAt - [datetime]$ex.startedAt).TotalMilliseconds
      } catch { $null }
    } else { $null }
    Error      = if ($failMsg) { "$failNode | $failMsg" } elseif (-not $ex) { 'Poll timeout (60s)' } else { $null }
    LastNode   = $lastNode
  }
}

# Probe: n8n Cloud may not expose POST /workflows/{id}/execute (405 on exo-project-integrity as of 2026-03-29)
$probeId = ($rows | Where-Object { $_.name -eq 'Exsto Cura Weekly Digest' }).id
if ($probeId) {
  try {
    $null = Invoke-WebRequest -Uri "$base/api/v1/workflows/$probeId/execute" -Method Post -Headers $headers -Body '{}' -UseBasicParsing
    $execResults += [pscustomobject]@{ Workflow = 'API probe (Weekly Digest execute)'; Skipped = $false; Reason = $null; ExecId = $null; Status = 'unexpected success'; DurationMs = $null; Error = $null; LastNode = $null }
  } catch {
    $code = $null
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $execResults += [pscustomobject]@{ Workflow = 'API probe (POST .../execute)'; Skipped = $false; Reason = 'Platform capability check'; ExecId = $null; Status = 'not available'; DurationMs = $null; Error = "HTTP $code"; LastNode = $null }
  }
}

$execResults | ConvertTo-Json -Depth 6 | Set-Content 'C:\Exsto\n8n-workflows\_stress_executions.json' -Encoding UTF8
Write-Step "Phase 2 execution log (_stress_executions.json)"
$execResults | Format-Table Workflow, Status, ExecId, Error -AutoSize

# --- Phase 3: credentials (if any execution error) ---
$needCredAudit = $execResults | Where-Object { $_.Status -eq 'error' -or $_.Status -eq 'crashed' }
$credReport = @()
if ($needCredAudit) {
  try {
    $creds = Invoke-N8n -Method Get -Uri "$base/api/v1/credentials"
    $credList = @($creds.data)
    if (-not $credList -and $creds) { $credList = @($creds) }
    foreach ($f in $needCredAudit) {
      $wid = ($rows | Where-Object { $_.name -eq $f.Workflow }).id
      if (-not $wid) { continue }
      $wd = Invoke-N8n -Method Get -Uri "$base/api/v1/workflows/$wid"
      foreach ($n in $wd.nodes) {
        if ($null -eq $n.credentials) { continue }
        $n.credentials.PSObject.Properties | ForEach-Object {
          $cid = $_.Value.id
          $ctype = $_.Name
          $exists = $credList | Where-Object { $_.id -eq $cid }
          if (-not $exists) {
            $credReport += [pscustomobject]@{
              Workflow           = $f.Workflow
              MissingCredential  = $_.Value.name
              CredentialType     = $ctype
              FixRequired        = "Create or re-link credential id $cid"
            }
          }
        }
      }
    }
  } catch {
    Write-Fail "GET /credentials failed: $($_.Exception.Message)"
  }
}
$credReport | ConvertTo-Json -Depth 4 | Set-Content 'C:\Exsto\n8n-workflows\_stress_cred_gaps.json' -Encoding UTF8

# --- Phase 4: activate all inactive ---
Write-Step "Phase 4 activate drafts"
$activateLog = @()
foreach ($r in $rows) {
  if ($r.active) {
    $activateLog += [pscustomobject]@{ Id = $r.id; Name = $r.name; AlreadyActive = $true; HttpStatus = 'n/a' }
    continue
  }
  $code = 'err'
  try {
    $resp = Invoke-WebRequest -Uri "$base/api/v1/workflows/$($r.id)/activate" -Method Post -Headers $headers -Body '{}' -UseBasicParsing
    $code = [int]$resp.StatusCode
  } catch {
    $resp2 = $_.Exception.Response
    if ($resp2) { $code = [int]$resp2.StatusCode }
    else { $code = $_.Exception.Message }
  }
  $activateLog += [pscustomobject]@{ Id = $r.id; Name = $r.name; AlreadyActive = $false; HttpStatus = $code }
}
$activateLog | ConvertTo-Json -Depth 4 | Set-Content 'C:\Exsto\n8n-workflows\_stress_activate.json' -Encoding UTF8
$activateLog | Format-Table -AutoSize

# --- Verify all active ---
$list2 = Invoke-N8n -Method Get -Uri "$base/api/v1/workflows"
$items2 = $list2.data; if (-not $items2) { $items2 = @($list2) }
$verify = $items2 | ForEach-Object { [pscustomobject]@{ name = $_.name; active = $_.active } }
$verify | ConvertTo-Json | Set-Content 'C:\Exsto\n8n-workflows\_stress_verify_active.json' -Encoding UTF8
Write-Step "Post-activation active flags"
$verify | Format-Table -AutoSize

Write-Ok "Stress test run complete. See _stress_*.json for machine output."
