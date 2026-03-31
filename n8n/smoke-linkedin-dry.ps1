#Requires -Version 5.1
<#
.SYNOPSIS
  Smoke-test the DRY LinkedIn workflow (linkedin_workflow_dry.json) via webhook.

.DESCRIPTION
  Expects N8N_LINKEDIN_DRY = full URL, e.g. https://YOUR.app.n8n.cloud/webhook/linkedin-webhook-dry
  No secrets in this file. Activate the DRY workflow in n8n before running.

.EXAMPLE
  $env:N8N_LINKEDIN_DRY = 'https://example.app.n8n.cloud/webhook/linkedin-webhook-dry'
  .\smoke-linkedin-dry.ps1
#>

$ErrorActionPreference = "Stop"

function Write-Step { param([string]$Message) Write-Host "[*] $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Fail { param([string]$Message) Write-Host "[FAIL] $Message" -ForegroundColor Red }

function Invoke-WebhookJson {
  param(
    [Parameter(Mandatory)][string]$Uri,
    [Parameter(Mandatory)][string]$JsonBody
  )
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($JsonBody)
  $req = [System.Net.HttpWebRequest]::Create($Uri)
  $req.Method = "POST"
  $req.ContentType = "application/json; charset=utf-8"
  $req.ContentLength = $bytes.Length
  $stream = $req.GetRequestStream()
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Close()
  try {
    $resp = $req.GetResponse()
    $code = [int]$resp.StatusCode
    $rstream = $resp.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($rstream)
    $text = $reader.ReadToEnd()
    $reader.Close()
    $resp.Close()
    return @{ StatusCode = $code; Raw = $text }
  }
  catch [System.Net.WebException] {
    $resp = $_.Exception.Response
    if (-not $resp) { throw }
    $code = [int]$resp.StatusCode
    $rstream = $resp.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($rstream)
    $text = $reader.ReadToEnd()
    $reader.Close()
    $resp.Close()
    return @{ StatusCode = $code; Raw = $text }
  }
}

function Parse-JsonSafe {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
  try { return ($Text | ConvertFrom-Json) } catch { return $null }
}

$url = $env:N8N_LINKEDIN_DRY
if ([string]::IsNullOrWhiteSpace($url)) {
  Write-Fail "Set environment variable N8N_LINKEDIN_DRY to the full DRY webhook URL (.../webhook/linkedin-webhook-dry)."
  exit 1
}

$failed = 0

# --- Test 1: happy post (quality gate passes) ---
Write-Step "Test 1 - post mode, long topic (expect 200, ok, dry_run)"
$body1 = @{
  mode  = "post"
  topic = "Why twenty-seven million dollar change orders do not vanish; they surface late when forensic schedule analysis catches causation the team missed."
} | ConvertTo-Json -Compress
$r1 = Invoke-WebhookJson -Uri $url -JsonBody $body1
$j1 = Parse-JsonSafe -Text $r1.Raw
if ($r1.StatusCode -eq 200 -and $j1 -and $j1.ok -eq $true -and $j1.dry_run -eq $true) {
  Write-Ok "Test 1 - post happy path"
}
else {
  Write-Fail "Test 1 - expected HTTP 200 and ok=true dry_run=true; got $($r1.StatusCode) raw=$($r1.Raw.Substring(0, [Math]::Min(400, $r1.Raw.Length)))"
  $failed++
}

# --- Test 2: quality gate (empty topic) ---
Write-Step "Test 2 - post mode, empty topic (expect 422)"
$body2 = @{ mode = "post"; topic = "" } | ConvertTo-Json -Compress
$r2 = Invoke-WebhookJson -Uri $url -JsonBody $body2
if ($r2.StatusCode -eq 422) {
  Write-Ok "Test 2 - quality rejection 422"
}
else {
  Write-Fail "Test 2 - expected HTTP 422; got $($r2.StatusCode) raw=$($r2.Raw.Substring(0, [Math]::Min(400, $r2.Raw.Length)))"
  $failed++
}

# --- Test 3: reply mode ---
Write-Step "Test 3 - reply mode (expect 200, reply_ready, dry_run)"
$body3 = @{
  mode           = "reply"
  post_id        = "urn:li:ugcPost:SMOKE_TEST"
  comment_text   = "How did you treat downstream causation in the schedule forensics?"
  comment_author = "Smoke Test User"
  topic          = "CHPE forensic schedule analysis and owner-side controls"
} | ConvertTo-Json -Compress
$r3 = Invoke-WebhookJson -Uri $url -JsonBody $body3
$j3 = Parse-JsonSafe -Text $r3.Raw
if ($r3.StatusCode -eq 200 -and $j3 -and $j3.status -eq "reply_ready" -and $j3.dry_run -eq $true) {
  Write-Ok "Test 3 - reply_ready"
}
else {
  Write-Fail "Test 3 - expected HTTP 200 status=reply_ready dry_run=true; got $($r3.StatusCode) raw=$($r3.Raw.Substring(0, [Math]::Min(400, $r3.Raw.Length)))"
  $failed++
}

Write-Step "Done. Failures: $failed"
if ($failed -gt 0) { exit 1 }
Write-Ok "All smoke tests passed."
exit 0
