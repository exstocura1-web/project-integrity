#Requires -Version 5.1
<#
  Syncs Exsto local workflows 2–5 to n8n Cloud: credentials, Notion DB IDs from .env,
  Haiku model, structural fixes (single Claude trigger, digest pairing, IF v2), optional Error Trigger.

  Reads: C:\Exsto\.env (NOTION_*_DB, NEWSAPI_KEY, N8N_URL, N8N_API_KEY)
  N8N API key fallback: C:\Exsto\cost-optimize.ps1 $n8nKey line
#>
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

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
$n8nKey = $envMap['N8N_API_KEY']
if (-not $n8nKey -or $n8nKey -eq 'YOUR_N8N_API_KEY') {
    $m = Select-String -Path 'C:\Exsto\cost-optimize.ps1' -Pattern '^\$n8nKey = "([^"]+)"'
    if ($m) { $n8nKey = $m.Matches.Groups[1].Value }
}
if (-not $n8nKey) { throw 'N8N API key missing: set N8N_API_KEY in C:\Exsto\.env or keep cost-optimize.ps1' }

$baseUrl = ($envMap['N8N_URL'], 'https://exo-project-integrity.app.n8n.cloud' | Where-Object { $_ } | Select-Object -First 1).TrimEnd('/')
$newsKey = $envMap['NEWSAPI_KEY']
$dbReports = ($envMap['NOTION_MONTHLY_REPORTS_DB'] -replace '-', '')
$dbBd = ($envMap['NOTION_BD_INTEL_DB'] -replace '-', '')
$dbFinance = ($envMap['NOTION_FINANCE_DB'] -replace '-', '')

# Credential IDs from .env (portable across cloud and self-hosted instances)
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

function Strip-Workflow([pscustomobject]$wf) {
    $remove = @('id','createdAt','updatedAt','active','versionId','activeVersionId','versionCounter','triggerCount',
        'tags','pinData','shared','meta','isArchived','activeVersion','description','staticData')
    foreach ($p in $remove) { try { $wf.PSObject.Properties.Remove($p) } catch {} }
    foreach ($n in $wf.nodes) { try { $n.PSObject.Properties.Remove('id') } catch {} }
    $wf.settings = [pscustomobject]@{ executionOrder = 'v1' }
}

function Ensure-ErrorPath([pscustomobject]$wf, [string]$label) {
    $has = $wf.nodes | Where-Object { $_.type -eq 'n8n-nodes-base.errorTrigger' }
    if ($has) { return }
    $y = 700
    $wf.nodes += [pscustomobject]@{
        name = 'Error Trigger'
        type = 'n8n-nodes-base.errorTrigger'
        typeVersion = 1
        position = @(-200, $y)
        parameters = [pscustomobject]@{}
    }
    $wf.nodes += [pscustomobject]@{
        name = 'Error Notify'
        type = 'n8n-nodes-base.gmail'
        typeVersion = 2
        position = @(80, $y)
        parameters = [pscustomobject]@{
            sendTo = 'mcraig@exstocura.com'
            subject = "=n8n error: $label"
            emailType = 'html'
            message = "=<p><b>Workflow</b>: $label</p><p><b>Error</b>: {{ `$json.execution?.error?.message || 'Unknown' }}</p><p><a href=`"$baseUrl`">Open n8n</a></p>"
            options = [pscustomobject]@{}
        }
        credentials = [pscustomobject]@{ gmailOAuth2 = $credGmail }
    }
    $connNames = @($wf.connections.PSObject.Properties | ForEach-Object { $_.Name })
    if ($connNames -notcontains 'Error Trigger') {
        $et = [pscustomobject]@{ main = @( , @([pscustomobject]@{ node = 'Error Notify'; type = 'main'; index = 0 })) }
        $wf.connections | Add-Member -MemberType NoteProperty -Name 'Error Trigger' -Value $et -Force
    }
}

function Normalize-LangChain([pscustomobject]$n) {
    if ($n.type -ne '@n8n/n8n-nodes-langchain.lmChatAnthropic') { return }
    if ($n.parameters.model) {
        # Model downgrade disabled — Exsto Cura requires Sonnet for client-facing analysis
        # $n.parameters.model = $n.parameters.model -replace 'claude-sonnet-4-20250514', 'claude-haiku-3-20250307'
    }
    $n.credentials = [pscustomobject]@{ anthropicApi = $credAnthropicLc }
}

function Normalize-NotionDbNode([pscustomobject]$n, [string]$dbId) {
    if ($n.type -ne 'n8n-nodes-base.notion') { return }
    if (-not $dbId) { return }
    $p = $n.parameters
    if (-not $p.resource) { $p | Add-Member -NotePropertyName resource -NotePropertyValue 'databasePage' -Force }
    $p.databaseId = [pscustomobject]@{ __rl = $true; value = $dbId; mode = 'id' }
    if ($p.PSObject.Properties['databaseId'] -and $p.databaseId -is [string]) { }
    $n.credentials = [pscustomobject]@{ notionApi = $credNotion }
}

function Normalize-Gmail([pscustomobject]$n) {
    if ($n.type -ne 'n8n-nodes-base.gmail') { return }
    $n.credentials = [pscustomobject]@{ gmailOAuth2 = $credGmail }
}

function Inject-NewsApi([pscustomobject]$n) {
    if ($n.type -ne 'n8n-nodes-base.httpRequest') { return }
    $u = $n.parameters.url
    if (-not $u) { return }
    if ($u -match 'YOUR_NEWSAPI_KEY' -and $newsKey -and $newsKey -ne 'YOUR_NEWSAPI_KEY') {
        $n.parameters.url = $u -replace 'YOUR_NEWSAPI_KEY', $newsKey
    }
}

$headers = @{ 'X-N8N-API-KEY' = $n8nKey; 'Accept' = 'application/json'; 'Content-Type' = 'application/json' }
$list = Invoke-RestMethod -Uri "$baseUrl/api/v1/workflows" -Headers @{ 'X-N8N-API-KEY' = $n8nKey }
$byName = @{}
foreach ($w in $list.data) { $byName[$w.name] = $w.id }

$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Add('X-N8N-API-KEY', $n8nKey)

function Send-Workflow([pscustomobject]$body, [string]$existingId) {
    $json = $body | ConvertTo-Json -Depth 80 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $content = [System.Net.Http.ByteArrayContent]::new($bytes)
    $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new('application/json')
    if ($existingId) {
        $resp = $client.PutAsync("$baseUrl/api/v1/workflows/$existingId", $content).Result
    } else {
        $resp = $client.PostAsync("$baseUrl/api/v1/workflows", $content).Result
    }
    $code = [int]$resp.StatusCode
    $txt = $resp.Content.ReadAsStringAsync().Result
    if ($code -notin @(200, 201)) {
        throw "HTTP $code : $($txt.Substring(0, [Math]::Min(800, $txt.Length)))"
    }
    ($txt | ConvertFrom-Json).id
}

# --- Workflow 2: Monthly Report ---
$wf2Path = Join-Path $PSScriptRoot 'workflow-2-monthly-report.json'
$wf2 = Get-Content -LiteralPath $wf2Path -Raw -Encoding UTF8 | ConvertFrom-Json
$w2Schedule = ($wf2.nodes | Where-Object { $_.type -eq 'n8n-nodes-base.scheduleTrigger' }).name
$w2Load = ($wf2.nodes | Where-Object { $_.name -like 'Load Client Roster' }).name
$w2Met = ($wf2.nodes | Where-Object { $_.name -like '*Schedule Metrics*' }).name
$w2Crit = ($wf2.nodes | Where-Object { $_.name -like '*Critical Path*' }).name
$w2Claude = ($wf2.nodes | Where-Object { $_.type -eq '@n8n/n8n-nodes-langchain.lmChatAnthropic' }).name
$wf2.connections.$w2Load.main = @( , @(@{ node = $w2Met; type = 'main'; index = 0 }))
$wf2.connections.$w2Met.main = @( , @(@{ node = $w2Crit; type = 'main'; index = 0 }))
$wf2.connections.$w2Crit.main = @( , @(@{ node = $w2Claude; type = 'main'; index = 0 }))
$cp = $wf2.nodes | Where-Object { $_.name -eq $w2Crit }
$cp.parameters.url = '=https://app.smartpm.com/api/v1/projects/{{ $(''Load Client Roster'').item.json.project_id }}/critical-path'
foreach ($n in $wf2.nodes) {
    Normalize-LangChain $n
    Normalize-Gmail $n
}
# Save Draft — Notion v2 property shape + paired item (multi-client safe)
$nd = $wf2.nodes | Where-Object { $_.name -like 'Save Draft*Notion*' }
if ($nd) {
    $nd.parameters.propertiesUi = [pscustomobject]@{
        propertyValues = @(
            [pscustomobject]@{ key = 'Client|rich_text'; textContent = '={{ $(''Load Client Roster'').item.json.name }}' }
            [pscustomobject]@{ key = 'Period|rich_text'; textContent = '={{ $(''Load Client Roster'').item.json.report_period }}' }
            [pscustomobject]@{ key = 'Status|select'; select = 'Draft — Awaiting Michael Review' }
            [pscustomobject]@{ key = 'Generated|date'; includeTime = $true; date = '={{ new Date().toISOString() }}' }
        )
    }
    Normalize-NotionDbNode $nd $dbReports
}

$st = $wf2.nodes | Where-Object { $_.name -like '*1st of Month*' }
if ($st) { $st.typeVersion = 1.2; $st.parameters = [pscustomobject]@{ rule = [pscustomobject]@{ interval = @([pscustomobject]@{ field = 'cronExpression'; expression = '0 8 1 * *' }) } } }

Ensure-ErrorPath $wf2 'Monthly Report'
Strip-Workflow $wf2
$post2 = [ordered]@{ name = $wf2.name; nodes = $wf2.nodes; connections = $wf2.connections; settings = $wf2.settings }
$id2 = Send-Workflow ([pscustomobject]$post2) $byName[$wf2.name]
Write-Host "OK Monthly Report -> $id2"

# --- Workflow 3: Prospect Intel ---
$wf3Path = Join-Path $PSScriptRoot 'workflow-3-prospect-intel.json'
$wf3 = Get-Content -LiteralPath $wf3Path -Raw -Encoding UTF8 | ConvertFrom-Json
$digest3 = $wf3.nodes | Where-Object { $_.name -eq 'Build Weekly Digest' }
$digest3.parameters.jsCode = @'
const allItems = $input.all();
const week = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
let digest = `<div style='font-family: Georgia, serif; max-width: 680px; padding: 20px; background: #0d0d0d; color: #e8e4dc;'>`;
digest += `<h2 style='color: #c9a96e; border-bottom: 1px solid #333; padding-bottom: 10px;'>📡 Weekly BD Intelligence Briefing</h2>`;
digest += `<p style='color: #666; font-size: 13px;'>${week}</p><br/>`;
allItems.forEach((item, i) => {
  const row = $('Load Prospect Watchlist').all()[i]?.json || {};
  const company = row.company || 'Unknown';
  const text = item.json.text || '';
  digest += `<div style='margin-bottom: 30px; padding: 15px; background: #1a1a1a; border-left: 3px solid #c9a96e;'>`;
  digest += `<h3 style='color: #c9a96e; margin-bottom: 10px;'>${company}</h3>`;
  digest += `<div style='white-space: pre-wrap; font-size: 13px; line-height: 1.6;'>${text.substring(0, 600)}...</div>`;
  digest += `</div>`;
});
digest += `<hr style='border-color: #333;'/><p style='color: #666; font-size: 11px;'>Exsto Cura Prospect Agent · Full briefings in Notion</p></div>`;
return [{ json: { digest, count: allItems.length, week } }];
'@
foreach ($n in $wf3.nodes) {
    Normalize-LangChain $n
    Normalize-Gmail $n
    Inject-NewsApi $n
    if ($n.name -eq 'Save Briefing to Notion BD') {
        Normalize-NotionDbNode $n $dbBd
        $n.parameters.title = '={{ $(''Load Prospect Watchlist'').item.json.company }} — Intel {{ new Date().toLocaleDateString() }}'
        $n.parameters.propertiesUi = [pscustomobject]@{
            propertyValues = @(
                [pscustomobject]@{ key = 'Company|rich_text'; textContent = '={{ $(''Load Prospect Watchlist'').item.json.company }}' }
                [pscustomobject]@{ key = 'Priority|select'; select = '={{ $(''Load Prospect Watchlist'').item.json.priority }}' }
                [pscustomobject]@{ key = 'Type|rich_text'; textContent = '={{ $(''Load Prospect Watchlist'').item.json.type }}' }
                [pscustomobject]@{ key = 'Week|date'; includeTime = $true; date = '={{ new Date().toISOString() }}' }
                [pscustomobject]@{ key = 'Status|select'; select = 'Briefing Ready' }
            )
        }
        $n.parameters.blockUi = [pscustomobject]@{
            blockValues = @([pscustomobject]@{ type = 'paragraph'; richText = [pscustomobject]@{ text = '={{ $json.text }}' } })
        }
    }
}
$sch = $wf3.nodes | Where-Object { $_.name -eq 'Schedule — Every Monday 7am' }
if ($sch) { $sch.typeVersion = 1.2; $sch.parameters = [pscustomobject]@{ rule = [pscustomobject]@{ interval = @([pscustomobject]@{ field = 'cronExpression'; expression = '0 7 * * 1' }) } } }

Ensure-ErrorPath $wf3 'Prospect Intel'
Strip-Workflow $wf3
$post3 = [ordered]@{ name = $wf3.name; nodes = $wf3.nodes; connections = $wf3.connections; settings = $wf3.settings }
$id3 = Send-Workflow ([pscustomobject]$post3) $byName[$wf3.name]
Write-Host "OK Prospect Intel -> $id3"

# --- Workflow 4: Invoice ---
$wf4Path = Join-Path $PSScriptRoot 'workflow-4-invoice-agent.json'
$wf4 = Get-Content -LiteralPath $wf4Path -Raw -Encoding UTF8 | ConvertFrom-Json
$ifn = $wf4.nodes | Where-Object { $_.name -eq 'Is ESCALATE (30+ days)?' }
$ifn.typeVersion = 2
$ifn.parameters = [pscustomobject]@{
    conditions = [pscustomobject]@{
        options = [pscustomobject]@{ caseSensitive = $true; typeValidation = 'strict' }
        conditions = @([pscustomobject]@{ id = 'esc1'; leftValue = '={{ $json.status }}'; rightValue = 'ESCALATE'; operator = [pscustomobject]@{ type = 'string'; operation = 'equals' } })
        combinator = 'and'
    }
    options = [pscustomobject]@{}
}
foreach ($n in $wf4.nodes) {
    Normalize-LangChain $n
    Normalize-Gmail $n
    if ($n.name -eq 'Log to Notion Finance Tracker') {
        Normalize-NotionDbNode $n $dbFinance
        $n.parameters.resource = 'databasePage'
        $n.parameters.title = '={{ $(''Calculate Days Outstanding'').item.json.client_name }} — Invoice #{{ $(''Calculate Days Outstanding'').item.json.invoice_number }}'
        $n.parameters.propertiesUi = [pscustomobject]@{
            propertyValues = @(
                [pscustomobject]@{ key = 'Client|rich_text'; textContent = '={{ $(''Calculate Days Outstanding'').item.json.client_name }}' }
                [pscustomobject]@{ key = 'Amount|number'; numberValue = '={{ $(''Calculate Days Outstanding'').item.json.amount }}' }
                [pscustomobject]@{ key = 'Days Outstanding|number'; numberValue = '={{ $(''Calculate Days Outstanding'').item.json.days_outstanding }}' }
                [pscustomobject]@{ key = 'Status|select'; select = '={{ $(''Calculate Days Outstanding'').item.json.status }}' }
                [pscustomobject]@{ key = 'Last Checked|date'; includeTime = $true; date = '={{ new Date().toISOString() }}' }
            )
        }
    }
}
$sch4 = $wf4.nodes | Where-Object { $_.name -eq 'Schedule — Mon, Wed, Fri 9am' }
if ($sch4) {
    $sch4.typeVersion = 1.2
    $sch4.parameters = [pscustomobject]@{ rule = [pscustomobject]@{ interval = @([pscustomobject]@{ field = 'cronExpression'; expression = '0 9 * * 1,3,5' }) } }
}

Ensure-ErrorPath $wf4 'Invoice Agent'
Strip-Workflow $wf4
$post4 = [ordered]@{ name = $wf4.name; nodes = $wf4.nodes; connections = $wf4.connections; settings = $wf4.settings }
$id4 = Send-Workflow ([pscustomobject]$post4) $byName[$wf4.name]
Write-Host "OK Invoice -> $id4"

# --- Workflow 5: SmartPM Market ---
$wf5Path = Join-Path $PSScriptRoot 'workflow-5-smartpm-market-agent.json'
$wf5 = Get-Content -LiteralPath $wf5Path -Raw -Encoding UTF8 | ConvertFrom-Json
$w5Load = ($wf5.nodes | Where-Object { $_.name -like 'Load Prospect Database' }).name
$w5News = ($wf5.nodes | Where-Object { $_.name -like 'News API*Scan for Signals*' }).name
$w5Sec = ($wf5.nodes | Where-Object { $_.name -like 'SEC EDGAR*' }).name
$w5ClaudeN = ($wf5.nodes | Where-Object { $_.type -eq '@n8n/n8n-nodes-langchain.lmChatAnthropic' }).name
$wf5.connections.$w5Load.main = @( , @(@{ node = $w5News; type = 'main'; index = 0 }))
$wf5.connections.$w5News.main = @( , @(@{ node = $w5Sec; type = 'main'; index = 0 }))
$wf5.connections.$w5Sec.main = @( , @(@{ node = $w5ClaudeN; type = 'main'; index = 0 }))
$sec = $wf5.nodes | Where-Object { $_.name -eq $w5Sec }
$sec.parameters.url = '=https://efts.sec.gov/LATEST/search-index?q=%22{{ encodeURIComponent($(''Load Prospect Database'').item.json.company) }}%22+%22project+loss%22&dateRange=custom&startdt=2024-01-01&enddt=2026-12-31&forms=10-K,10-Q,8-K'

$cl = $wf5.nodes | Where-Object { $_.name -eq $w5ClaudeN } | Select-Object -First 1
if (-not $cl) { throw 'Workflow 5: Claude node not found (check langchain type / name).' }
$msgVal = $cl.parameters.messages.values
if (-not $msgVal) { throw 'Workflow 5: Claude messages.values missing.' }
$firstMsg = if ($msgVal -is [System.Array]) { $msgVal[0] } else { $msgVal }
$c = [string]$firstMsg.content
$c = $c -replace "\$\('Load Prospect Database'\)\.first\(\)", '$(''Load Prospect Database'').item'
$c = $c -replace "\$\('News API - Scan for Signals'\)\.first\(\)", '$(''News API - Scan for Signals'').item'
$c = $c -replace "\$\('SEC EDGAR - Search Financial Filings'\)\.first\(\)", '$(''SEC EDGAR - Search Financial Filings'').item'
$firstMsg.content = $c

$dig5 = $wf5.nodes | Where-Object { $_.name -like '*Build Weekly Market Digest*' } | Select-Object -First 1
$dig5.parameters.jsCode = @'
const allItems = $input.all();
const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
let digest = `<div style='font-family: Georgia, serif; max-width: 700px; padding: 24px; background: #080808; color: #ede9e1;'>`;
digest += `<div style='border-bottom: 1px solid rgba(201,169,110,0.3); padding-bottom: 16px; margin-bottom: 24px;'>`;
digest += `<div style='font-family: monospace; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #c9a96e; margin-bottom: 8px;'>SmartPM Market Intelligence</div>`;
digest += `<h2 style='font-size: 22px; font-weight: 600; color: #ede9e1; margin: 0;'>Weekly Prospect Briefing</h2>`;
digest += `<p style='font-size: 12px; color: #666; margin: 6px 0 0;'>${today} · ${allItems.length} prospects · Exsto Cura Consilium</p></div>`;
allItems.forEach((item, i) => {
  const p = { ...($('Load Prospect Database').all()[i]?.json || {}), text: item.json.text || '' };
  const signalColor = p.signal === 'LOSS' ? '#e07070' : p.signal === 'DELAY' ? '#e0b870' : '#7dc89a';
  const fitColor = p.smartpm_fit === 'HIGH' ? '#7dc89a' : p.smartpm_fit === 'MEDIUM' ? '#e0b870' : '#888';
  digest += `<div style='margin-bottom: 28px; padding: 18px; background: #111; border-left: 3px solid #c9a96e;'>`;
  digest += `<div style='display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;'>`;
  digest += `<h3 style='font-size: 15px; font-weight: 600; color: #ede9e1; margin: 0;'>${p.company || ''}</h3>`;
  digest += `<span style='font-size: 10px; color: #c9a96e;'>${p.segment || ''}</span></div>`;
  digest += `<p style='font-size: 12px; color: #aaa; line-height: 1.6;'><strong style='color: #c9a96e;'>Signal:</strong> ${p.signal_detail || ''}</p>`;
  if (p.text) digest += `<div style='margin-top: 12px; font-size: 11px; color: #777;'>${String(p.text).substring(0, 280)}...</div>`;
  digest += `</div>`;
});
digest += `<p style='font-size: 11px; color: #555;'>Full briefings in Notion · Exsto Cura</p></div>`;
return [{ json: { digest, count: allItems.length, date: today } }];
'@

foreach ($n in $wf5.nodes) {
    Normalize-LangChain $n
    Normalize-Gmail $n
    Inject-NewsApi $n
    if ($n.name -eq 'Save to Notion BD') {
        Normalize-NotionDbNode $n $dbBd
        $n.parameters.title = '={{ $(''Load Prospect Database'').item.json.company }} - SmartPM Intel {{ new Date().toLocaleDateString() }}'
        $n.parameters.propertiesUi = [pscustomobject]@{
            propertyValues = @(
                [pscustomobject]@{ key = 'Company|rich_text'; textContent = '={{ $(''Load Prospect Database'').item.json.company }}' }
                [pscustomobject]@{ key = 'Segment|select'; select = '={{ $(''Load Prospect Database'').item.json.segment }}' }
                [pscustomobject]@{ key = 'Signal|select'; select = '={{ $(''Load Prospect Database'').item.json.signal }}' }
                [pscustomobject]@{ key = 'SmartPM Fit|select'; select = '={{ $(''Load Prospect Database'').item.json.smartpm_fit }}' }
                [pscustomobject]@{ key = 'BIR Fit|select'; select = '={{ $(''Load Prospect Database'').item.json.bir_fit }}' }
                [pscustomobject]@{ key = 'Status|select'; select = 'Brief Ready' }
                [pscustomobject]@{ key = 'Week|date'; includeTime = $true; date = '={{ new Date().toISOString() }}' }
            )
        }
        $n.parameters.blockUi = [pscustomobject]@{
            blockValues = @([pscustomobject]@{ type = 'paragraph'; richText = [pscustomobject]@{ text = '={{ $json.text }}' } })
        }
    }
}
$tg = $wf5.nodes | Where-Object { $_.name -like '*Monday 6am*' } | Select-Object -First 1
if ($tg) { $tg.typeVersion = 1.2; $tg.parameters = [pscustomobject]@{ rule = [pscustomobject]@{ interval = @([pscustomobject]@{ field = 'cronExpression'; expression = '0 6 * * 1' }) } } }

# Refresh name->id map (prior steps may have created workflows)
$list5 = Invoke-RestMethod -Uri "$baseUrl/api/v1/workflows" -Headers @{ 'X-N8N-API-KEY' = $n8nKey }
$byName5 = @{}
foreach ($w in $list5.data) { $byName5[$w.name] = $w.id }

Ensure-ErrorPath $wf5 'SmartPM Market Agent'
Strip-Workflow $wf5
$post5 = [ordered]@{ name = $wf5.name; nodes = $wf5.nodes; connections = $wf5.connections; settings = $wf5.settings }
$id5 = Send-Workflow ([pscustomobject]$post5) $byName5[$wf5.name]
Write-Host "OK SmartPM Market -> $id5"

# --- Weekly Digest: Sonnet -> Haiku (replace disabled; see MODEL-GOVERNANCE.md) ---
$wid = $byName5['Exsto Cura Weekly Digest']
if (-not $wid) { $wid = $byName['Exsto Cura Weekly Digest'] }
if ($wid) {
    $wd = Invoke-RestMethod -Uri "$baseUrl/api/v1/workflows/$wid" -Headers @{ 'X-N8N-API-KEY' = $n8nKey }
    $cn = $wd.nodes | Where-Object { $_.name -eq 'Claude Digest' }
    # Model downgrade disabled — Exsto Cura requires Sonnet for client-facing analysis
    # if ($cn.parameters.jsonBody) {
    #     $cn.parameters.jsonBody = $cn.parameters.jsonBody -replace 'claude-sonnet-4-20250514', 'claude-haiku-3-20250307'
    # }
    Strip-Workflow $wd
    $postw = [ordered]@{ name = $wd.name; nodes = $wd.nodes; connections = $wd.connections; settings = $wd.settings }
    $null = Send-Workflow ([pscustomobject]$postw) $wid
    Write-Host "OK Weekly Digest Haiku -> $wid"
}

$client.Dispose()
Write-Host 'All sync complete. Activate workflows in n8n UI if needed; assign SmartPM / HoneyBook credentials where missing.'
