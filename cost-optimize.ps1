# ⚠️ WARNING: This script downgrades Claude models to Haiku. DO NOT RUN on production workflows. Exsto Cura client-facing analysis requires claude-sonnet-4-20250514 for defensible BIR™ and TRIAGE-IMPACT™ outputs.

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
    throw 'N8N_API_KEY missing from C:\Exsto\.env'
}
$baseUrl = ($envMap['N8N_URL'], 'https://exo-project-integrity.app.n8n.cloud' | Where-Object { $_ } | Select-Object -First 1).TrimEnd('/')

$workflowId = "5ZJ1NEIYpIUg2qDy"
$senderDbId = "332a905692cc81fb8c4fe804343b8f36"

$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Add("X-N8N-API-KEY", $n8nKey)

Write-Host "Fetching current workflow from $baseUrl ..." -ForegroundColor Cyan
$resp = $client.GetAsync("$baseUrl/api/v1/workflows/$workflowId").Result
$raw = $resp.Content.ReadAsStringAsync().Result
$wf = $raw | ConvertFrom-Json
Write-Host "  Got $($wf.nodes.Count) nodes" -ForegroundColor Green

# ── 1. Model Downgrade ──────────────────────────────────────────────
# DISABLED — was Sonnet→Haiku; see C:\Exsto\MODEL-GOVERNANCE.md
# $claude = $wf.nodes | Where-Object { $_.name -eq "Claude Classify" }
# $claude.parameters.jsonBody = $claude.parameters.jsonBody -replace "claude-sonnet-4-20250514", "claude-haiku-3-20250307"
# Write-Host "1. Model downgraded to Haiku" -ForegroundColor Green

# ── 2. Body Truncation ──────────────────────────────────────────────
$extract = $wf.nodes | Where-Object { $_.name -eq "Extract Fields" }
$extract.parameters.jsCode = $extract.parameters.jsCode -replace "substring\(0,\s*2000\)", "substring(0, 500)"
Write-Host "2. Body truncated to 500 chars" -ForegroundColor Green

# ── 2b. Dedup Check: thread TTL + sender classification cache (plan §3) ─
$dedupCheckCode = @'
const staticData = $getWorkflowStaticData('global');
if (!staticData.seenThreads) staticData.seenThreads = {};
if (!staticData.senderCache) staticData.senderCache = {};
const item = $input.first().json;
const threadId = item.threadId;
const now = Date.now();
for (const [k, v] of Object.entries(staticData.seenThreads)) {
  if (now - v > 86400000) delete staticData.seenThreads[k];
}
if (threadId && staticData.seenThreads[threadId]) {
  item.isDuplicate = true;
} else {
  if (threadId) staticData.seenThreads[threadId] = now;
  item.isDuplicate = false;
}
const fl = (item.from||'').toLowerCase();
const sk = fl.replace(/[^a-z0-9@.]/g,'');
const c = staticData.senderCache[sk];
if (c && c.count >= 3 && (Date.now() - c.lastSeen) < 604800000) {
  item.skipClaude = true;
  item.cachedResult = c.result;
} else {
  item.skipClaude = false;
  delete item.cachedResult;
}
return [{json: item}];
'@
($wf.nodes | Where-Object { $_.name -eq "Dedup Check" }).parameters.jsCode = $dedupCheckCode
Write-Host "2b. Dedup Check extended (sender cache)" -ForegroundColor Green

# ── 3. Update node positions (shift downstream right by 400px) ──────
$shiftNodes = @{
    "Claude Classify" = @(-360, 1408)
    "Parse Response"  = @(-140, 1408)
    "Is High Priority?" = @(140, 1100)
    "Is BD?"          = @(140, 1400)
    "Is JUNK?"        = @(140, 1700)
    "Alert Michael"   = @(380, 1000)
    "Star BD Email"   = @(380, 1300)
    "Log to Notion"   = @(380, 1600)
    "Archive JUNK"    = @(380, 1800)
    "Star Email"      = @(140, 1900)
    "Has Draft Reply?" = @(140, 2100)
    "Save Draft Reply" = @(380, 2100)
    "Error Trigger"   = @(-1900, 2600)
    "Error Notification" = @(-1680, 2600)
}
foreach ($entry in $shiftNodes.GetEnumerator()) {
    $node = $wf.nodes | Where-Object { $_.name -eq $entry.Key }
    if ($node) { $node.position = $entry.Value }
}
Write-Host "3. Positions updated" -ForegroundColor Green

# ── 4. Build new nodes ──────────────────────────────────────────────

$preFilterCode = @'
const staticData = $getWorkflowStaticData('global');
const item = $input.first().json;
if (!staticData.batchQueue) staticData.batchQueue = [];
const hour = new Date().getHours();
if (hour < 7 || hour >= 20) {
  staticData.batchQueue.push({from:item.from,subject:item.subject,body:item.body,emailId:item.emailId,threadId:item.threadId,storedAt:Date.now()});
  return [];
}
const fl = (item.from||'').toLowerCase();
const sl = (item.subject||'').toLowerCase();
const spamFrom = ['noreply','no-reply','newsletter','marketing','unsubscribe','mailer-daemon','postmaster'];
const spamSubj = ['unsubscribe','sale','% off','deal','discount','free trial','limited time','act now'];
const spamDom = ['mailchimp.com','sendgrid.net','constantcontact.com'];
if (spamFrom.some(s=>fl.includes(s))||spamSubj.some(s=>sl.includes(s))||spamDom.some(d=>fl.includes(d))) {
  return [{json:{...item,skipClaude:true,cachedResult:{classification:'JUNK',priority_score:1,summary:'Automated/marketing email',suggested_action:'Archive',draft_reply:''}}}];
}
if (item.skipClaude && item.cachedResult) {
  return [{json: item}];
}
return [{json:{...item,skipClaude:false}}];
'@

$formatCachedCode = @'
const item = $input.first().json;
const r = item.cachedResult||{classification:'ROUTINE',priority_score:3,summary:'Unknown',suggested_action:'Review',draft_reply:''};
return [{json:{...r,original_from:item.from,original_subject:item.subject,email_id:item.emailId,thread_id:item.threadId,timestamp:new Date().toISOString()}}];
'@

$updateSenderCode = @'
const staticData = $getWorkflowStaticData('global');
if (!staticData.senderCache) staticData.senderCache = {};
const item = $input.first().json;
const from = item.original_from||'';
const sk = from.toLowerCase().replace(/[^a-z0-9@.]/g,'');
const domain = (from.match(/@([^\s>]+)/)||[])[1]||'';
const ex = staticData.senderCache[sk]||{count:0,totalPriority:0,classifications:{}};
ex.count++;
ex.totalPriority += (item.priority_score||3);
const cls = item.classification||'ROUTINE';
ex.classifications[cls] = (ex.classifications[cls]||0)+1;
ex.lastSeen = Date.now();
let maxC=0,topCls='ROUTINE';
for (const [c,n] of Object.entries(ex.classifications)){if(n>maxC){maxC=n;topCls=c;}}
ex.result = {classification:topCls,priority_score:Math.round(ex.totalPriority/ex.count),summary:'Cached: '+topCls,suggested_action:topCls==='JUNK'?'Archive':'Review',draft_reply:''};
staticData.senderCache[sk] = ex;
return [{json:{sender:from,domain:domain,emailCount:ex.count,lastClassification:cls,averagePriority:Math.round(ex.totalPriority/ex.count),lastSeen:new Date().toISOString()}}];
'@

$replayBatchCode = @'
const staticData = $getWorkflowStaticData('global');
const queue = staticData.batchQueue||[];
if (queue.length===0) return [];
const emails = [...queue];
staticData.batchQueue = [];
const promptBody = emails.map((e,i)=>'---'+i+'---FROM:'+(e.from||'')+' SUBJECT:'+(e.subject||'')+' BODY:'+String(e.body||'').substring(0,500)).join('\n');
return [{json:{batchEmails:emails,promptBody}}];
'@

# Single Anthropic call for entire off-hours queue (plan §6)
# DISABLED — Haiku batch template; use Sonnet assignment below per MODEL-GOVERNANCE.md
# $claudeBatchJsonBody = @'
# ={{ JSON.stringify({model:'claude-haiku-3-20250307',max_tokens:8192,messages:[{role:'user',content:'You triage emails for Michael Craig, CEO of Exsto Cura (construction consulting). Multiple emails below; each starts with ---N---. Return ONLY a JSON array with one object per email IN THE SAME ORDER and SAME COUNT. Each object: {"classification":"URGENT|BD|ROUTINE|VENDOR|JUNK","priority_score":1-5,"summary":"brief","suggested_action":"brief","draft_reply":"or empty"}\n\n'+$json.promptBody}]}) }}
# '@
$claudeBatchJsonBody = @'
={{ JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:8192,messages:[{role:'user',content:'You triage emails for Michael Craig, CEO of Exsto Cura (construction consulting). Multiple emails below; each starts with ---N---. Return ONLY a JSON array with one object per email IN THE SAME ORDER and SAME COUNT. Each object: {"classification":"URGENT|BD|ROUTINE|VENDOR|JUNK","priority_score":1-5,"summary":"brief","suggested_action":"brief","draft_reply":"or empty"}\n\n'+$json.promptBody}]}) }}
'@

$parseBatchCode = @'
const r = $input.first().json;
const rb = $('Replay Batch').first().json;
const emails = rb.batchEmails||[];
let t='';
try{t=r.content[0].text;}catch(e){t='[]';}
let arr;
try{
  arr = JSON.parse(t.replace(/```json|```/g,'').trim());
  if (!Array.isArray(arr)) arr = [];
}catch(e){arr=[];}
while(arr.length<emails.length){
  arr.push({classification:'ROUTINE',priority_score:3,summary:'Parse gap',suggested_action:'Check Gmail',draft_reply:''});
}
return emails.map((e,i)=>({json:{...arr[i],original_from:e.from,original_subject:e.subject,email_id:e.emailId,thread_id:e.threadId,timestamp:new Date().toISOString()}}));
'@

$newNodes = @(
    [PSCustomObject]@{
        name = "Pre-Filter"
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @(-800, 1408)
        parameters = [PSCustomObject]@{ jsCode = $preFilterCode }
    },
    [PSCustomObject]@{
        name = "Needs Claude?"
        type = "n8n-nodes-base.if"
        typeVersion = 2
        position = @(-600, 1408)
        parameters = [PSCustomObject]@{
            conditions = [PSCustomObject]@{
                options = [PSCustomObject]@{ caseSensitive = $true; typeValidation = "loose" }
                conditions = @(
                    [PSCustomObject]@{
                        id = "needsclaude1"
                        leftValue = '={{ $json.skipClaude }}'
                        rightValue = ""
                        operator = [PSCustomObject]@{ type = "boolean"; operation = "false" }
                    }
                )
                combinator = "and"
            }
            options = [PSCustomObject]@{}
        }
    },
    [PSCustomObject]@{
        name = "Format Cached"
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @(-360, 1208)
        parameters = [PSCustomObject]@{ jsCode = $formatCachedCode }
    },
    [PSCustomObject]@{
        name = "Update Sender"
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @(140, 1408)
        parameters = [PSCustomObject]@{ jsCode = $updateSenderCode }
    },
    [PSCustomObject]@{
        name = "Write Sender DB"
        type = "n8n-nodes-base.notion"
        typeVersion = 2
        position = @(380, 1408)
        parameters = [PSCustomObject]@{
            resource = "databasePage"
            databaseId = [PSCustomObject]@{ __rl = $true; value = $senderDbId; mode = "id" }
            title = '={{ $json.sender }}'
            propertiesUi = [PSCustomObject]@{
                propertyValues = @(
                    [PSCustomObject]@{ key = "Domain|rich_text"; textContent = '={{ $json.domain }}' },
                    [PSCustomObject]@{ key = "Email Count|number"; numberValue = '={{ $json.emailCount }}' },
                    [PSCustomObject]@{ key = "Last Classification|select"; select = '={{ $json.lastClassification }}' },
                    [PSCustomObject]@{ key = "Average Priority|number"; numberValue = '={{ $json.averagePriority }}' },
                    [PSCustomObject]@{ key = "Last Seen|date"; includeTime = $true; date = '={{ $json.lastSeen }}' }
                )
            }
            options = [PSCustomObject]@{}
        }
        credentials = [PSCustomObject]@{
            notionApi = [PSCustomObject]@{
                id   = $(if ($envMap['N8N_CRED_NOTION_ID']) { $envMap['N8N_CRED_NOTION_ID'] } else { 'sHCYhXvTmtCNQPUU' })
                name = $(if ($envMap['N8N_CRED_NOTION_NAME']) { $envMap['N8N_CRED_NOTION_NAME'] } else { 'Notion account' })
            }
        }
    },
    [PSCustomObject]@{
        name = "7am Batch Trigger"
        type = "n8n-nodes-base.scheduleTrigger"
        typeVersion = 1.2
        position = @(-1900, 2300)
        parameters = [PSCustomObject]@{
            rule = [PSCustomObject]@{
                interval = @(
                    [PSCustomObject]@{ field = "cronExpression"; expression = "0 7 * * *" }
                )
            }
        }
    },
    [PSCustomObject]@{
        name = "Replay Batch"
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @(-1680, 2300)
        parameters = [PSCustomObject]@{ jsCode = $replayBatchCode }
    },
    [PSCustomObject]@{
        name = "Claude Batch"
        type = "n8n-nodes-base.httpRequest"
        typeVersion = 4
        position = @(-1460, 2300)
        parameters = [PSCustomObject]@{
            method = "POST"
            url = "https://api.anthropic.com/v1/messages"
            authentication = "genericCredentialType"
            genericAuthType = "httpHeaderAuth"
            sendHeaders = $true
            headerParameters = [PSCustomObject]@{
                parameters = @(
                    [PSCustomObject]@{ name = "x-api-key"; value = '={{ $credentials.httpHeaderAuth.value }}' },
                    [PSCustomObject]@{ name = "anthropic-version"; value = "2023-06-01" },
                    [PSCustomObject]@{ name = "content-type"; value = "application/json" }
                )
            }
            sendBody = $true
            specifyBody = "json"
            jsonBody = $claudeBatchJsonBody
            options = [PSCustomObject]@{}
        }
        credentials = [PSCustomObject]@{
            httpHeaderAuth = [PSCustomObject]@{
                id   = $(if ($envMap['N8N_CRED_ANTHROPIC_HTTP_ID']) { $envMap['N8N_CRED_ANTHROPIC_HTTP_ID'] } else { '48RGxhjkOn6nkAnH' })
                name = $(if ($envMap['N8N_CRED_ANTHROPIC_HTTP_NAME']) { $envMap['N8N_CRED_ANTHROPIC_HTTP_NAME'] } else { 'Anthropic API Key' })
            }
        }
    },
    [PSCustomObject]@{
        name = "Parse Batch"
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @(-1240, 2300)
        parameters = [PSCustomObject]@{ jsCode = $parseBatchCode }
    }
)

$hasPreFilter = $null -ne ($wf.nodes | Where-Object { $_.name -eq "Pre-Filter" })
if (-not $hasPreFilter) {
    foreach ($n in $newNodes) { $wf.nodes += $n }
    Write-Host "4. Added $($newNodes.Count) new nodes (total: $($wf.nodes.Count))" -ForegroundColor Green
} else {
    Write-Host "4. Idempotent skip: Pre-Filter exists - patching code + Claude Batch only" -ForegroundColor Yellow
    ($wf.nodes | Where-Object { $_.name -eq "Pre-Filter" }).parameters.jsCode = $preFilterCode
    ($wf.nodes | Where-Object { $_.name -eq "Replay Batch" }).parameters.jsCode = $replayBatchCode
    ($wf.nodes | Where-Object { $_.name -eq "Parse Batch" }).parameters.jsCode = $parseBatchCode
    ($wf.nodes | Where-Object { $_.name -eq "Claude Batch" }).parameters.jsonBody = $claudeBatchJsonBody
}

# ── 5. Rebuild all connections ──────────────────────────────────────
function C($node, $idx) { [PSCustomObject]@{node=$node;type="main";index=$idx} }

$downstream = @(
    (C "Is High Priority?" 0),
    (C "Is BD?" 0),
    (C "Is JUNK?" 0),
    (C "Log to Notion" 0),
    (C "Star Email" 0),
    (C "Has Draft Reply?" 0),
    (C "Update Sender" 0)
)

if (-not $hasPreFilter) {
    $wf.connections = [PSCustomObject]@{
        "Gmail Trigger1"   = [PSCustomObject]@{main=@(,@((C "Get Full Email" 0)))}
        "Get Full Email"   = [PSCustomObject]@{main=@(,@((C "Extract Fields" 0)))}
        "Extract Fields"   = [PSCustomObject]@{main=@(,@((C "Dedup Check" 0)))}
        "Dedup Check"      = [PSCustomObject]@{main=@(,@((C "Is New Thread?" 0)))}
        "Is New Thread?"   = [PSCustomObject]@{main=@(@((C "Pre-Filter" 0)),@())}
        "Pre-Filter"       = [PSCustomObject]@{main=@(,@((C "Needs Claude?" 0)))}
        "Needs Claude?"    = [PSCustomObject]@{main=@(@((C "Claude Classify" 0)),@((C "Format Cached" 0)))}
        "Claude Classify"  = [PSCustomObject]@{main=@(,@((C "Parse Response" 0)))}
        "Format Cached"    = [PSCustomObject]@{main=@(,$downstream)}
        "Parse Response"   = [PSCustomObject]@{main=@(,$downstream)}
        "Update Sender"    = [PSCustomObject]@{main=@(,@((C "Write Sender DB" 0)))}
        "Is High Priority?"= [PSCustomObject]@{main=@(@((C "Alert Michael" 0)),@())}
        "Is JUNK?"         = [PSCustomObject]@{main=@(@((C "Archive JUNK" 0)),@())}
        "Is BD?"           = [PSCustomObject]@{main=@(@((C "Star BD Email" 0)),@())}
        "Has Draft Reply?" = [PSCustomObject]@{main=@(@((C "Save Draft Reply" 0)),@())}
        "7am Batch Trigger"= [PSCustomObject]@{main=@(,@((C "Replay Batch" 0)))}
        "Replay Batch"     = [PSCustomObject]@{main=@(,@((C "Claude Batch" 0)))}
        "Claude Batch"     = [PSCustomObject]@{main=@(,@((C "Parse Batch" 0)))}
        "Parse Batch"      = [PSCustomObject]@{main=@(,$downstream)}
        "Error Trigger"    = [PSCustomObject]@{main=@(,@((C "Error Notification" 0)))}
    }
    Write-Host "5. Connections rebuilt" -ForegroundColor Green
} else {
    Write-Host "5. Connections unchanged (idempotent)" -ForegroundColor Yellow
}

# ── 6. Clean settings, strip metadata, strip node IDs ───────────────
$wf.settings = [PSCustomObject]@{executionOrder = "v1"}
$removeWfProps = @('id','createdAt','updatedAt','active','versionId','activeVersionId','versionCounter',
    'triggerCount','tags','pinData','shared','homeProject','usedCredentials','meta','isArchived',
    'activeVersion','description','staticData')
foreach ($prop in $removeWfProps) {
    try { $wf.PSObject.Properties.Remove($prop) } catch {}
}
foreach ($node in $wf.nodes) {
    try { $node.PSObject.Properties.Remove('id') } catch {}
}
Write-Host "6. Metadata stripped (active is read-only on PUT - use n8n UI if toggling)" -ForegroundColor Green

# ── 7. Serialize and PUT ────────────────────────────────────────────
$json = $wf | ConvertTo-Json -Depth 50 -Compress
Write-Host "7. Serialized ($($json.Length) chars)" -ForegroundColor Cyan

$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$content = [System.Net.Http.ByteArrayContent]::new($bytes)
$content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("application/json")

Write-Host "   Sending PUT to $baseUrl ..." -ForegroundColor Cyan
$putResp = $client.PutAsync("$baseUrl/api/v1/workflows/$workflowId", $content).Result
$status = [int]$putResp.StatusCode
$body = $putResp.Content.ReadAsStringAsync().Result

if ($status -eq 200) {
    $result = $body | ConvertFrom-Json
    Write-Host "SUCCESS! Workflow updated: $($result.nodes.Count) nodes" -ForegroundColor Green
} else {
    Write-Host "ERROR $status" -ForegroundColor Red
    Write-Host $body.Substring(0, [Math]::Min(2000, $body.Length))
}

# Activation: included in main PUT via active=true

$client.Dispose()
Write-Host "`nDone!" -ForegroundColor Green
