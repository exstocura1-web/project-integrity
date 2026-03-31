import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadLocalSecrets, pick } from "./load-local-secrets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const L = loadLocalSecrets();

const CONN_SYSTEM = `You are a business development assistant for Michael Craig, founder of Exsto Cura Consilium — an AI-enabled project controls consultancy in Houston TX.
Michael has 25+ years in energy infrastructure (HVDC, offshore wind, power transmission). His anchor proof of concept is CO-015, a $27M settlement on the Champlain Hudson Power Express project. He is a SmartPM consulting partner.
His BD targets are Owners, claims counsel, surety professionals, and lenders in energy infrastructure. He communicates as a peer — direct, specific, no marketing language. Every message must sound like it came from a senior practitioner, not a vendor.`;

const TIER_CONTEXT = `TIER 1 — Owners/Developers (capital project leads, VP Engineering, VP Projects, Director of Project Controls at energy companies: transmission, offshore wind, LNG, nuclear, heavy industrial); claims counsel / construction litigation attorneys in energy EPC disputes; surety/bonding underwriters and claims professionals; lenders / project finance (infrastructure debt, construction monitoring).
TIER 2 — Partner/referral: AI project controls vendors (Doxel, ALICE, Reconstruct, Rhumbix) BD roles; schedule consultants and forensic delay analysts; AACE chapter officers; PMI/CMAA board members in energy/infrastructure.
TIER 3 — Visibility/influence: policy, trade press editors, academic researchers — connection-only audience for identify list purposes.`;

const normalizeConn = `const j = $input.first().json;
const body = (j.body !== undefined && j.body !== null && typeof j.body === 'object' && !Array.isArray(j.body)) ? j.body : j;
const mode = String(body.mode || '').toLowerCase().trim();
const tier = String(body.tier ?? '').trim();
const sector = String(body.sector ?? '').trim();
const role_keywords = String(body.role_keywords ?? '').trim();
const notion_record_id = String(body.notion_record_id ?? '').trim();
const followup_number = String(body.followup_number ?? '1').trim();
const signal = String(body.signal ?? '').trim();
let _valid = true;
let _error = '';
if (mode === 'identify') {
  if (!tier || !['1','2','3'].includes(tier)) { _valid = false; _error = 'identify requires tier 1, 2, or 3'; }
  if (!sector) { _valid = false; _error = _error || 'identify requires sector'; }
  if (!role_keywords) { _valid = false; _error = _error || 'identify requires role_keywords'; }
} else if (mode === 'connect') {
  if (!notion_record_id) { _valid = false; _error = 'connect requires notion_record_id'; }
} else if (mode === 'followup') {
  if (!notion_record_id) { _valid = false; _error = 'followup requires notion_record_id'; }
  if (!['1','2','3'].includes(followup_number)) { _valid = false; _error = _error || 'followup_number must be 1, 2, or 3'; }
} else {
  _valid = false;
  _error = 'mode must be identify, connect, or followup';
}
return [{ json: { mode, tier, sector, role_keywords, notion_record_id, followup_number, signal, _valid, _error } }];`;

const buildIdentifyPrompt = `const v = $('Code: Normalize Connections').first().json;
const user = \`You are researching LinkedIn connection targets (hypothetical prospect list for BD planning — you do not have live LinkedIn API access). Produce 5-10 plausible target profiles matching the criteria.

Tier filter (focus the list on this tier): \${v.tier}
Sector focus: \${v.sector}
Role / keyword focus: \${v.role_keywords}

Tier reference:
${TIER_CONTEXT.replace(new RegExp("`", "g"), "\\`")}

Return a JSON array ONLY (no markdown fences), each object:
{"Name":"Full Name","Title":"Current title","Company":"Company","Tier":"1|2|3","Sector":"short sector tag","LinkedInURL":""}
Use Tier matching the request. LinkedInURL empty string if unknown.
\`;
return [{ json: { ...v, anthropic_system: ${JSON.stringify(CONN_SYSTEM)}, anthropic_user: user } }];`;

const parseIdentifyJson = `const http = $input.first().json;
const row = http.body !== undefined ? http.body : http;
const block = (row.content || []).find((c) => c.type === 'text');
let text = (block && block.text) ? String(block.text).trim() : '';
const fence = text.match(/\\\`\\\`\\\`(?:json)?\\s*([\\s\\S]*?)\\\`\\\`\\\`/i);
if (fence) text = fence[1].trim();
let arr = [];
try {
  const m = text.match(/\\[[\\s\\S]*\\]/);
  arr = JSON.parse(m ? m[0] : text);
} catch (e) {
  return [{ json: { targets: [], parse_error: String(e.message), raw: text.substring(0, 500) } }];
}
if (!Array.isArray(arr)) arr = [];
const sector = $('Code: Normalize Connections').first().json.sector;
const targets = arr.map((t) => ({
  Name: String(t.Name || t.name || '').trim(),
  Title: String(t.Title || t.title || '').trim(),
  Company: String(t.Company || t.company || '').trim(),
  Tier: String(t.Tier || t.tier || '2').replace(/[^123]/g, '') || '2',
  Sector: String(t.Sector || t.sector || sector).trim(),
  LinkedInURL: String(t.LinkedInURL || t.linkedinURL || t.linkedin_url || '').trim(),
})).filter((t) => t.Name);
const counts = { '1': 0, '2': 0, '3': 0 };
for (const t of targets) { if (counts[t.Tier] !== undefined) counts[t.Tier]++; }
const summary = 'Identified ' + targets.length + ' targets. Tier breakdown — 1: ' + counts['1'] + ', 2: ' + counts['2'] + ', 3: ' + counts['3'] + '.';
return [{ json: { targets, tier_counts: counts, summary, sector } }];`;

const unpackTargets = `const { targets, sector } = $input.first().json;
return (targets || []).map((t) => ({ json: { ...t, sector_fallback: sector } }));`;

const notionConnDb = {
  __rl: true,
  value: pick(L, "CONNECTION_QUEUE_DB_ID", "REPLACE_CONNECTION_QUEUE_DATABASE_ID"),
  mode: "id",
};

const notionFlatPage = `const j = $input.first().json;
const props = j.properties || j;
function pt(p) {
  if (!p || typeof p !== 'object') return '';
  if (p.type === 'title') return (p.title || []).map((x) => x.plain_text).join('');
  if (p.type === 'rich_text') return (p.rich_text || []).map((x) => x.plain_text).join('');
  if (p.type === 'select') return (p.select && p.select.name) ? p.select.name : '';
  if (p.type === 'url') return p.url || '';
  if (p.type === 'date') return (p.date && p.date.start) ? p.date.start : '';
  return '';
}
const name = pt(props.Name) || j.name || '';
const title = pt(props.Title) || '';
const company = pt(props.Company) || '';
const tier = pt(props.Tier) || '2';
const sector = pt(props.Sector) || '';
const linkedInURL = pt(props.LinkedInURL) || '';
return [{ json: { notion_page_id: j.id || $('Code: Normalize Connections').first().json.notion_record_id, name, title, company, tier, sector, linkedInURL } }];`;

const buildConnectPrompt = `const v = $('Code: Flatten Notion Target').first().json;
const tier = String(v.tier || '2').replace(/[^123]/g, '') || '2';
if (tier === '3') {
  return [{ json: { ...v, skip_claude: true, connection_note: '', ambiguous: false, variant_a: '', variant_b: '' } }];
}
const user = \`Generate a LinkedIn connection request note for this person (max 200 characters — hard limit).

Target:
Name: \${v.name}
Title: \${v.title}
Company: \${v.company}
Tier: \${tier}
Sector: \${v.sector}

Rules:
- Tier 1: lead with specific value (owner-side forensic scheduling, AI-enabled delay/TIA, CO-015 only if claims-adjacent).
- Tier 2: lead with shared domain (AACE, schedule analytics, SmartPM ecosystem, forensic scheduling practice).
- Never say "I'd love to connect" or "I came across your profile".
- Sound like a peer, not a vendor.
- If the role is ambiguous, return JSON with two options: {"ambiguous":true,"variant_a":"...","variant_b":"..."} each variant max 200 chars.
- If clear, return JSON {"ambiguous":false,"note":"..."} with note max 200 chars.
Return JSON only, no markdown.
\`;
return [{ json: { ...v, skip_claude: false, anthropic_system: ${JSON.stringify(CONN_SYSTEM)}, anthropic_user: user } }];`;

const parseConnectNote = `const http = $input.first().json;
const row = http.body !== undefined ? http.body : http;
const block = (row.content || []).find((c) => c.type === 'text');
let text = (block && block.text) ? String(block.text).trim() : '';
const fence = text.match(/\\\`\\\`\\\`(?:json)?\\s*([\\s\\S]*?)\\\`\\\`\\\`/i);
if (fence) text = fence[1].trim();
let out = { connection_note: '', ambiguous: false, variant_a: '', variant_b: '' };
try {
  const m = text.match(/\\{[\\s\\S]*\\}/);
  const o = JSON.parse(m ? m[0] : text);
  if (o.ambiguous) {
    out.ambiguous = true;
    out.variant_a = String(o.variant_a || '').substring(0, 220);
    out.variant_b = String(o.variant_b || '').substring(0, 220);
    out.connection_note = 'VARIANT A: ' + out.variant_a + '\\n---\\nVARIANT B: ' + out.variant_b;
  } else {
    out.connection_note = String(o.note || o.connection_note || '').substring(0, 220);
  }
} catch (e) {
  out.connection_note = text.substring(0, 200);
}
const base = $('Code: Flatten Notion Target').first().json;
return [{ json: { ...base, ...out, skip_claude: false } }];`;

const buildFollowupPrompt = `const v = $('Code: Flatten Notion Target').first().json;
const n = $('Code: Normalize Connections').first().json;
const num = n.followup_number;
const signal = n.signal || '';
const user = \`Generate a LinkedIn DM-style follow-up for this prospect (Michael will paste manually — not auto-sent).

Target:
Name: \${v.name}
Title: \${v.title}
Company: \${v.company}
Tier: \${v.tier}
Sector: \${v.sector}

Follow-up sequence number: \${num}
Optional signal (what they did): \${signal || '(none)'}

Rules:
- Message 1: one specific insight or question relevant to their work. No pitch. No ask. Max 3 sentences.
- Message 2: share one relevant result/framework angle + at most one soft CTA like "Happy to walk through how we approached it."
- Message 3: if signal is non-empty, a direct ask tailored to the signal. If signal is empty, a nurture message (no hard ask) and explain in a final line: FLAG: no direct ask — no signal provided.

Return JSON only: {"message":"..."} no markdown.
\`;
return [{ json: { ...v, followup_number: num, signal, anthropic_system: ${JSON.stringify(CONN_SYSTEM)}, anthropic_user: user } }];`;

const codeFollowupNotionPatch = `const p = $input.first().json;
const num = String(p.followup_number || '1');
const prop = num === '1' ? 'FollowUp1' : num === '2' ? 'FollowUp2' : 'FollowUp3';
const statusName = num === '1' ? 'Follow-up 1 Sent' : num === '2' ? 'Follow-up 2 Sent' : 'Follow-up 3 Sent';
const text = String(p.followup_message || '').slice(0, 2000);
return [{ json: {
  notion_page_id: p.notion_page_id,
  name: p.name,
  followup_number: p.followup_number,
  signal: p.signal,
  followup_message: p.followup_message,
  notion_patch: {
    properties: {
      [prop]: { rich_text: [{ type: 'text', text: { content: text } }] },
      Status: { select: { name: statusName } },
    },
  },
}}];`;

const codePrepareConnectEmail = `let src = {};
try {
  src = $('Code: Parse Connection Note').first().json;
} catch (e) {
  src = $('Code: Build Connect Prompt').first().json;
}
const flat = $('Code: Flatten Notion Target').first().json;
const tier3 = src.skip_claude === true;
return [{ json: {
  notion_page_id: flat.notion_page_id,
  email_name: flat.name,
  email_tier: flat.tier,
  connection_note: String(src.connection_note || ''),
  ambiguous: !!src.ambiguous,
  tier3_skip: tier3,
}}];`;

const parseFollowupMessage = `const http = $input.first().json;
const row = http.body !== undefined ? http.body : http;
const block = (row.content || []).find((c) => c.type === 'text');
let text = (block && block.text) ? String(block.text).trim() : '';
const fence = text.match(/\\\`\\\`\\\`(?:json)?\\s*([\\s\\S]*?)\\\`\\\`\\\`/i);
if (fence) text = fence[1].trim();
let message = '';
try {
  const m = text.match(/\\{[\\s\\S]*\\}/);
  const o = JSON.parse(m ? m[0] : text);
  message = String(o.message || '').trim();
} catch (e) {
  message = text;
}
const base = $('Code: Flatten Notion Target').first().json;
const n = $('Code: Normalize Connections').first().json;
return [{ json: { ...base, followup_message: message, followup_number: n.followup_number, signal: n.signal } }];`;

const anthropicBody = (maxTok) =>
  `={{ JSON.stringify({
  model: 'claude-opus-4-5-20251101',
  max_tokens: ${maxTok},
  temperature: 0.7,
  system: $json.anthropic_system,
  messages: [{ role: 'user', content: $json.anthropic_user }]
}) }}`;

const nodes = [
  {
    parameters: {
      httpMethod: "POST",
      path: "linkedin-connections-webhook",
      responseMode: "responseNode",
      options: {},
    },
    id: "b2000002-0002-4000-8000-000000000001",
    name: "Webhook Connections In",
    type: "n8n-nodes-base.webhook",
    typeVersion: 2,
    position: [240, 400],
    webhookId: "linkedin-connections-exsto",
  },
  {
    parameters: { jsCode: normalizeConn },
    id: "b2000002-0002-4000-8000-000000000002",
    name: "Code: Normalize Connections",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [460, 400],
  },
  {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [
          {
            id: "c1",
            leftValue: "={{ $json._valid }}",
            rightValue: true,
            operator: { type: "boolean", operation: "equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    id: "b2000002-0002-4000-8000-000000000003",
    name: "IF Payload Valid",
    type: "n8n-nodes-base.if",
    typeVersion: 2,
    position: [680, 400],
  },
  {
    parameters: {
      rules: {
        values: [
          {
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict" },
              conditions: [
                {
                  id: "m1",
                  leftValue: "={{ $json.mode }}",
                  rightValue: "identify",
                  operator: { type: "string", operation: "equals" },
                },
              ],
              combinator: "and",
            },
            renameOutput: true,
            outputKey: "identify",
          },
          {
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict" },
              conditions: [
                {
                  id: "m2",
                  leftValue: "={{ $json.mode }}",
                  rightValue: "connect",
                  operator: { type: "string", operation: "equals" },
                },
              ],
              combinator: "and",
            },
            renameOutput: true,
            outputKey: "connect",
          },
          {
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict" },
              conditions: [
                {
                  id: "m3",
                  leftValue: "={{ $json.mode }}",
                  rightValue: "followup",
                  operator: { type: "string", operation: "equals" },
                },
              ],
              combinator: "and",
            },
            renameOutput: true,
            outputKey: "followup",
          },
        ],
      },
      options: { fallbackOutput: "extra" },
    },
    id: "b2000002-0002-4000-8000-000000000004",
    name: "Switch: Connection Mode",
    type: "n8n-nodes-base.switch",
    typeVersion: 3.2,
    position: [900, 320],
  },
  {
    parameters: { jsCode: buildIdentifyPrompt },
    id: "b2000002-0002-4000-8000-000000000005",
    name: "Code: Build Identify Prompt",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1120, 160],
  },
  {
    parameters: {
      method: "POST",
      url: "https://api.anthropic.com/v1/messages",
      authentication: "predefinedCredentialType",
      nodeCredentialType: "anthropicApi",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "anthropic-version", value: "2023-06-01" },
          { name: "content-type", value: "application/json" },
        ],
      },
      sendBody: true,
      specifyBody: "json",
      jsonBody: anthropicBody(4096),
      options: { response: { response: { fullResponse: true, neverError: true } } },
    },
    id: "b2000002-0002-4000-8000-000000000006",
    name: "Claude: Identify Targets",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [1340, 160],
    credentials: { anthropicApi: { id: pick(L, "ANTHROPIC_N8N_CREDENTIAL_ID", "REPLACE_ANTHROPIC"), name: "anthropicApi" } },
  },
  {
    parameters: { jsCode: parseIdentifyJson },
    id: "b2000002-0002-4000-8000-000000000007",
    name: "Code: Parse Identify Targets",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1560, 160],
  },
  {
    parameters: {
      resource: "message",
      operation: "send",
      fromEmail: "mcraig@exstocura.com",
      toEmail: "mcraig@exstocura.com",
      subject: "=LinkedIn connections: identify run — {{ $json.targets.length }} targets",
      message:
        "={{ $json.summary + '\\n\\nTier counts: ' + JSON.stringify($json.tier_counts) + ( $json.parse_error ? ('\\nParse issue: ' + $json.parse_error) : '' ) + '\\n\\n--- Notion schema (LinkedIn Connection Queue) ---\\nName (Title), Title (Text), Company (Text), Tier (Select 1|2|3), Sector (Text), LinkedInURL (URL), Status (Select: Pending | Note Ready | Connected | Follow-up 1 Sent | Follow-up 2 Sent | Follow-up 3 Sent | Closed), ConnectionNote (Text), FollowUp1-3 (Text), IdentifiedAt, ConnectedAt, PublishedAt, Signal (Text).\\n\\nPages are being created in Notion for each target (see database). Review before any outreach. Nothing is auto-sent to LinkedIn.' }}",
      options: {},
    },
    id: "b2000002-0002-4000-8000-000000000008",
    name: "Email: Identify Summary",
    type: "n8n-nodes-base.emailSend",
    typeVersion: 2.1,
    position: [1780, 80],
    credentials: { smtp: { id: pick(L, "SMTP_N8N_CREDENTIAL_ID", "REPLACE_SMTP"), name: "smtp" } },
  },
  {
    parameters: {
      respondWith: "json",
      responseBody:
        "={{ JSON.stringify({ ok: true, mode: 'identify', count: ($('Code: Parse Identify Targets').first().json.targets || []).length, tier_counts: $('Code: Parse Identify Targets').first().json.tier_counts }) }}",
      options: {},
    },
    id: "b2000002-0002-4000-8000-000000000009",
    name: "Respond: Identify OK",
    type: "n8n-nodes-base.respondToWebhook",
    typeVersion: 1.1,
    position: [2000, 80],
  },
  {
    parameters: { jsCode: unpackTargets },
    id: "b2000002-0002-4000-8000-00000000000a",
    name: "Code: Unpack Targets For Notion",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1780, 240],
  },
  {
    parameters: {
      resource: "databasePage",
      databaseId: notionConnDb,
      title: "={{ $json.Name }}",
      propertiesUi: {
        propertyValues: [
          { key: "Title|rich_text", textContent: "={{ $json.Title }}" },
          { key: "Company|rich_text", textContent: "={{ $json.Company }}" },
          { key: "Tier|select", select: "={{ $json.Tier }}" },
          { key: "Sector|rich_text", textContent: "={{ $json.Sector }}" },
          { key: "LinkedInURL|url", urlValue: "={{ $json.LinkedInURL || '' }}" },
          { key: "Status|select", select: "Pending" },
          {
            key: "IdentifiedAt|date",
            includeTime: true,
            date: "={{ new Date().toISOString() }}",
          },
        ],
      },
      options: {},
    },
    id: "b2000002-0002-4000-8000-00000000000b",
    name: "Notion: Create Connection Row",
    type: "n8n-nodes-base.notion",
    typeVersion: 2,
    position: [2000, 240],
    credentials: { notionApi: { id: pick(L, "NOTION_N8N_CREDENTIAL_ID", "REPLACE_NOTION"), name: "notionApi" } },
    notesInFlow: true,
    notes:
      "Map property keys to your Notion database. Title property for person name is the page title; column Title is job title.",
  },
  {
    parameters: {
      resource: "databasePage",
      operation: "get",
      pageId: {
        __rl: true,
        value: "={{ $('Code: Normalize Connections').first().json.notion_record_id }}",
        mode: "id",
      },
      options: {},
    },
    id: "b2000002-0002-4000-8000-00000000000c",
    name: "Notion: Get Target Page",
    type: "n8n-nodes-base.notion",
    typeVersion: 2,
    position: [1120, 400],
    credentials: { notionApi: { id: pick(L, "NOTION_N8N_CREDENTIAL_ID", "REPLACE_NOTION"), name: "notionApi" } },
  },
  {
    parameters: { jsCode: notionFlatPage },
    id: "b2000002-0002-4000-8000-00000000000d",
    name: "Code: Flatten Notion Target",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1340, 400],
  },
  {
    parameters: { jsCode: buildConnectPrompt },
    id: "b2000002-0002-4000-8000-00000000000e",
    name: "Code: Build Connect Prompt",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1560, 400],
  },
  {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [
          {
            id: "sk1",
            leftValue: "={{ $json.skip_claude }}",
            rightValue: true,
            operator: { type: "boolean", operation: "equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    id: "b2000002-0002-4000-8000-00000000002a",
    name: "IF Skip Claude (Tier 3 connect)",
    type: "n8n-nodes-base.if",
    typeVersion: 2,
    position: [1680, 400],
  },
  {
    parameters: {
      method: "POST",
      url: "https://api.anthropic.com/v1/messages",
      authentication: "predefinedCredentialType",
      nodeCredentialType: "anthropicApi",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "anthropic-version", value: "2023-06-01" },
          { name: "content-type", value: "application/json" },
        ],
      },
      sendBody: true,
      specifyBody: "json",
      jsonBody: anthropicBody(1024),
      options: { response: { response: { fullResponse: true, neverError: true } } },
    },
    id: "b2000002-0002-4000-8000-00000000000f",
    name: "Claude: Connection Note",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [1780, 400],
    credentials: { anthropicApi: { id: pick(L, "ANTHROPIC_N8N_CREDENTIAL_ID", "REPLACE_ANTHROPIC"), name: "anthropicApi" } },
  },
  {
    parameters: { jsCode: parseConnectNote },
    id: "b2000002-0002-4000-8000-000000000010",
    name: "Code: Parse Connection Note",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [2000, 400],
  },
  {
    parameters: {
      resource: "databasePage",
      operation: "update",
      pageId: {
        __rl: true,
        value: "={{ $json.notion_page_id }}",
        mode: "id",
      },
      propertiesUi: {
        propertyValues: [
          { key: "ConnectionNote|rich_text", textContent: "={{ $json.connection_note }}" },
          {
            key: "Status|select",
            select: "={{ $json.skip_claude ? 'Pending' : 'Note Ready' }}",
          },
        ],
      },
      options: {},
    },
    id: "b2000002-0002-4000-8000-000000000011",
    name: "Notion: Update Connection Note",
    type: "n8n-nodes-base.notion",
    typeVersion: 2,
    position: [2220, 400],
    credentials: { notionApi: { id: pick(L, "NOTION_N8N_CREDENTIAL_ID", "REPLACE_NOTION"), name: "notionApi" } },
  },
  {
    parameters: { jsCode: codePrepareConnectEmail },
    id: "b2000002-0002-4000-8000-00000000002b",
    name: "Code: Prepare Connect Email",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [2440, 400],
  },
  {
    parameters: {
      resource: "message",
      operation: "send",
      fromEmail: "mcraig@exstocura.com",
      toEmail: "mcraig@exstocura.com",
      subject: "=LinkedIn connection note — {{ $json.email_name }} (review before sending)",
      message:
        "={{ ($json.tier3_skip ? 'Tier 3: send connection with NO note (leave message blank).\\n\\n' : '') + 'Tier: ' + $json.email_tier + '\\n\\nNote (manual paste only; not auto-sent):\\n' + $json.connection_note + ($json.ambiguous ? '\\n\\n(Two variants in note — pick one.)' : '') }}",
      options: {},
    },
    id: "b2000002-0002-4000-8000-000000000012",
    name: "Email: Connection Note Review",
    type: "n8n-nodes-base.emailSend",
    typeVersion: 2.1,
    position: [2660, 400],
    credentials: { smtp: { id: pick(L, "SMTP_N8N_CREDENTIAL_ID", "REPLACE_SMTP"), name: "smtp" } },
  },
  {
    parameters: {
      respondWith: "json",
      responseBody:
        "={{ JSON.stringify({ ok: true, mode: 'connect', notion_page_id: $('Code: Prepare Connect Email').first().json.notion_page_id, ambiguous: $('Code: Prepare Connect Email').first().json.ambiguous, tier3_skip: $('Code: Prepare Connect Email').first().json.tier3_skip }) }}",
      options: {},
    },
    id: "b2000002-0002-4000-8000-000000000013",
    name: "Respond: Connect OK",
    type: "n8n-nodes-base.respondToWebhook",
    typeVersion: 1.1,
    position: [2880, 400],
  },
  {
    parameters: {
      resource: "databasePage",
      operation: "get",
      pageId: {
        __rl: true,
        value: "={{ $('Code: Normalize Connections').first().json.notion_record_id }}",
        mode: "id",
      },
      options: {},
    },
    id: "b2000002-0002-4000-8000-000000000014",
    name: "Notion: Get Target Page (followup)",
    type: "n8n-nodes-base.notion",
    typeVersion: 2,
    position: [1120, 560],
    credentials: { notionApi: { id: pick(L, "NOTION_N8N_CREDENTIAL_ID", "REPLACE_NOTION"), name: "notionApi" } },
  },
  {
    parameters: { jsCode: notionFlatPage },
    id: "b2000002-0002-4000-8000-000000000015",
    name: "Code: Flatten Notion Target (followup)",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1340, 560],
  },
  {
    parameters: { jsCode: buildFollowupPrompt },
    id: "b2000002-0002-4000-8000-000000000016",
    name: "Code: Build Followup Prompt",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1560, 560],
  },
  {
    parameters: {
      method: "POST",
      url: "https://api.anthropic.com/v1/messages",
      authentication: "predefinedCredentialType",
      nodeCredentialType: "anthropicApi",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "anthropic-version", value: "2023-06-01" },
          { name: "content-type", value: "application/json" },
        ],
      },
      sendBody: true,
      specifyBody: "json",
      jsonBody: anthropicBody(1024),
      options: { response: { response: { fullResponse: true, neverError: true } } },
    },
    id: "b2000002-0002-4000-8000-000000000017",
    name: "Claude: Follow-up Message",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [1780, 560],
    credentials: { anthropicApi: { id: pick(L, "ANTHROPIC_N8N_CREDENTIAL_ID", "REPLACE_ANTHROPIC"), name: "anthropicApi" } },
  },
  {
    parameters: { jsCode: parseFollowupMessage },
    id: "b2000002-0002-4000-8000-000000000018",
    name: "Code: Parse Followup Message",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [2000, 560],
  },
  {
    parameters: { jsCode: codeFollowupNotionPatch },
    id: "b2000002-0002-4000-8000-000000000019",
    name: "Code: Build Followup Notion Patch",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [2220, 560],
  },
  {
    parameters: {
      method: "PATCH",
      url: "={{ 'https://api.notion.com/v1/pages/' + $json.notion_page_id }}",
      authentication: "predefinedCredentialType",
      nodeCredentialType: "notionApi",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "Notion-Version", value: "2022-06-28" },
          { name: "Content-Type", value: "application/json" },
        ],
      },
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify($json.notion_patch) }}",
      options: { response: { response: { fullResponse: true, neverError: true } } },
    },
    id: "b2000002-0002-4000-8000-00000000002c",
    name: "HTTP: Notion Patch Follow-up",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [2440, 560],
    credentials: { notionApi: { id: pick(L, "NOTION_N8N_CREDENTIAL_ID", "REPLACE_NOTION"), name: "notionApi" } },
    notesInFlow: true,
    notes:
      "Property names FollowUp1, FollowUp2, FollowUp3, Status must match your LinkedIn Connection Queue database exactly.",
  },
  {
    parameters: {
      resource: "message",
      operation: "send",
      fromEmail: "mcraig@exstocura.com",
      toEmail: "mcraig@exstocura.com",
      subject: "=LinkedIn follow-up {{ $('Code: Build Followup Notion Patch').first().json.followup_number }} draft — {{ $('Code: Build Followup Notion Patch').first().json.name }}",
      message:
        "={{ 'Review before sending (manual paste only):\\n\\n' + $('Code: Build Followup Notion Patch').first().json.followup_message + '\\n\\nSignal field was: ' + ($('Code: Build Followup Notion Patch').first().json.signal || '(empty)') }}",
      options: {},
    },
    id: "b2000002-0002-4000-8000-00000000001a",
    name: "Email: Follow-up Review",
    type: "n8n-nodes-base.emailSend",
    typeVersion: 2.1,
    position: [2660, 560],
    credentials: { smtp: { id: pick(L, "SMTP_N8N_CREDENTIAL_ID", "REPLACE_SMTP"), name: "smtp" } },
  },
  {
    parameters: {
      respondWith: "json",
      responseBody:
        "={{ JSON.stringify({ ok: true, mode: 'followup', followup_number: $('Code: Build Followup Notion Patch').first().json.followup_number }) }}",
      options: {},
    },
    id: "b2000002-0002-4000-8000-00000000001b",
    name: "Respond: Followup OK",
    type: "n8n-nodes-base.respondToWebhook",
    typeVersion: 1.1,
    position: [2880, 560],
  },
  {
    parameters: {
      respondWith: "json",
      responseCode: 400,
      responseBody: "={{ JSON.stringify({ ok: false, error: $json._error || 'invalid_payload' }) }}",
      options: {},
    },
    id: "b2000002-0002-4000-8000-00000000001c",
    name: "Respond: Validation Error",
    type: "n8n-nodes-base.respondToWebhook",
    typeVersion: 1.1,
    position: [900, 560],
  },
  {
    parameters: {
      respondWith: "json",
      responseCode: 400,
      responseBody: "={{ JSON.stringify({ ok: false, error: 'unknown_mode' }) }}",
      options: {},
    },
    id: "b2000002-0002-4000-8000-00000000001d",
    name: "Respond: Unknown Mode",
    type: "n8n-nodes-base.respondToWebhook",
    typeVersion: 1.1,
    position: [1120, 720],
  },
];

const connections = {
  "Webhook Connections In": { main: [[{ node: "Code: Normalize Connections", type: "main", index: 0 }]] },
  "Code: Normalize Connections": { main: [[{ node: "IF Payload Valid", type: "main", index: 0 }]] },
  "IF Payload Valid": {
    main: [
      [{ node: "Switch: Connection Mode", type: "main", index: 0 }],
      [{ node: "Respond: Validation Error", type: "main", index: 0 }],
    ],
  },
  "Switch: Connection Mode": {
    main: [
      [{ node: "Code: Build Identify Prompt", type: "main", index: 0 }],
      [
        { node: "Notion: Get Target Page", type: "main", index: 0 },
      ],
      [
        { node: "Notion: Get Target Page (followup)", type: "main", index: 0 },
      ],
      [{ node: "Respond: Unknown Mode", type: "main", index: 0 }],
    ],
  },
  "Code: Build Identify Prompt": { main: [[{ node: "Claude: Identify Targets", type: "main", index: 0 }]] },
  "Claude: Identify Targets": { main: [[{ node: "Code: Parse Identify Targets", type: "main", index: 0 }]] },
  "Code: Parse Identify Targets": {
    main: [
      [
        { node: "Email: Identify Summary", type: "main", index: 0 },
        { node: "Code: Unpack Targets For Notion", type: "main", index: 0 },
      ],
    ],
  },
  "Email: Identify Summary": { main: [[{ node: "Respond: Identify OK", type: "main", index: 0 }]] },
  "Code: Unpack Targets For Notion": { main: [[{ node: "Notion: Create Connection Row", type: "main", index: 0 }]] },
  "Notion: Create Connection Row": { main: [[]] },
  "Notion: Get Target Page": { main: [[{ node: "Code: Flatten Notion Target", type: "main", index: 0 }]] },
  "Code: Flatten Notion Target": { main: [[{ node: "Code: Build Connect Prompt", type: "main", index: 0 }]] },
  "Code: Build Connect Prompt": { main: [[{ node: "IF Skip Claude (Tier 3 connect)", type: "main", index: 0 }]] },
  "IF Skip Claude (Tier 3 connect)": {
    main: [
      [{ node: "Notion: Update Connection Note", type: "main", index: 0 }],
      [{ node: "Claude: Connection Note", type: "main", index: 0 }],
    ],
  },
  "Claude: Connection Note": { main: [[{ node: "Code: Parse Connection Note", type: "main", index: 0 }]] },
  "Code: Parse Connection Note": { main: [[{ node: "Notion: Update Connection Note", type: "main", index: 0 }]] },
  "Notion: Update Connection Note": { main: [[{ node: "Code: Prepare Connect Email", type: "main", index: 0 }]] },
  "Code: Prepare Connect Email": { main: [[{ node: "Email: Connection Note Review", type: "main", index: 0 }]] },
  "Email: Connection Note Review": { main: [[{ node: "Respond: Connect OK", type: "main", index: 0 }]] },
  "Notion: Get Target Page (followup)": {
    main: [[{ node: "Code: Flatten Notion Target (followup)", type: "main", index: 0 }]],
  },
  "Code: Flatten Notion Target (followup)": {
    main: [[{ node: "Code: Build Followup Prompt", type: "main", index: 0 }]],
  },
  "Code: Build Followup Prompt": { main: [[{ node: "Claude: Follow-up Message", type: "main", index: 0 }]] },
  "Claude: Follow-up Message": { main: [[{ node: "Code: Parse Followup Message", type: "main", index: 0 }]] },
  "Code: Parse Followup Message": { main: [[{ node: "Code: Build Followup Notion Patch", type: "main", index: 0 }]] },
  "Code: Build Followup Notion Patch": { main: [[{ node: "HTTP: Notion Patch Follow-up", type: "main", index: 0 }]] },
  "HTTP: Notion Patch Follow-up": { main: [[{ node: "Email: Follow-up Review", type: "main", index: 0 }]] },
  "Email: Follow-up Review": { main: [[{ node: "Respond: Followup OK", type: "main", index: 0 }]] },
};

const workflow = {
  name: "LinkedIn Connection Intelligence (Exsto Cura)",
  nodes,
  connections,
  pinData: {},
  settings: {
    executionOrder: "v1",
    saveManualExecutions: true,
    timezone: "America/Chicago",
    callerPolicy: "workflowsFromSameOwner",
    errorWorkflow: "",
  },
  staticData: null,
  meta: { templateCredsSetupCompleted: false },
  tags: ["linkedin", "exsto-cura", "connections"],
};

const out = path.join(__dirname, "workflows", "linkedin_connections.json");
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), "utf8");
console.log("Wrote", out);
