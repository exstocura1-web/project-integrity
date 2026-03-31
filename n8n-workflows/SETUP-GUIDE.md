# Exsto Cura Consilium — Agentic VA Stack
## n8n Setup & Operations Guide

---

## What This Stack Does For You

| Workflow | Runs | What It Handles |
|---|---|---|
| 1 — Email Triage | Every 5 min | Classifies all inbound email, drafts replies, alerts on urgent |
| 2 — Monthly Report | 1st of month | Pulls SmartPM data, writes report narrative, saves to Notion |
| 3 — Prospect Intel | Every Monday 7am | News scan on all prospects, writes BD briefings, weekly digest |
| 4 — Invoice Agent | Mon/Wed/Fri 9am | Monitors unpaid invoices, drafts follow-ups, escalates 30+ days |

**Estimated time recovered: 12–18 hours/month**
**Total stack cost: ~$50–80/month** (n8n cloud + API costs)

---

## Step 1 — Sign Up for n8n (15 minutes)

1. Go to **n8n.io** → Start Free Trial
2. Choose **n8n Cloud** (easiest — no server management)
   - Starter plan: ~$20/month, handles all 4 workflows easily
3. Note your n8n instance URL (e.g. `your-name.app.n8n.cloud`)

---

## Step 2 — Set Up Credentials (30 minutes)

You need to connect n8n to your tools. In n8n:
**Settings → Credentials → Add Credential**

### Gmail (OAuth2)
1. Add Credential → Gmail OAuth2
2. Follow Google OAuth flow — sign in as mcraig@exstocura.com
3. Name it: `Gmail — mcraig@exstocura.com`

### Anthropic (Claude API)
1. Add Credential → HTTP Header Auth
2. Name: `Anthropic — Exsto Cura`
3. Header Name: `x-api-key`
4. Header Value: Your Anthropic API key (console.anthropic.com → API Keys)

### Notion
1. Go to notion.so → Settings → Connections → Develop integrations
2. Create new integration named "Exsto Cura n8n"
3. Copy the Internal Integration Token
4. Add Credential in n8n → Notion API → paste token
5. Name it: `Notion — Exsto Cura`
6. In each Notion database you want to use:
   → Share → Invite → select "Exsto Cura n8n" integration

### HoneyBook API (Workflow 4)
1. HoneyBook → Account Settings → Integrations → API
2. Copy your API key
3. Add Credential in n8n → HTTP Header Auth
4. Header Name: `Authorization`  |  Header Value: `Bearer YOUR_KEY`
5. Name it: `HoneyBook API Key`

### News API (Workflow 3)
1. Go to **newsapi.org** → Get API Key (free tier)
2. Replace `YOUR_NEWSAPI_KEY` in Workflow 3 code node with your key

---

## Step 3 — Set Up Notion Databases (20 minutes)

Create these four databases in Notion. In each workflow JSON,
replace `YOUR_NOTION_*_DATABASE_ID` with the actual database ID.

**To find database ID:**
Open the Notion database → copy URL
`https://notion.so/YOUR-DATABASE-ID?v=...`
The long string before `?v=` is your database ID.

### Database 1 — Email Inbox
Properties needed:
- Title (default)
- From (Text)
- Classification (Select: URGENT, BD, ROUTINE, VENDOR, JUNK)
- Priority (Number)
- Summary (Text)
- Action (Text)
- Draft Reply (Text)
- Status (Select: Pending Review, Actioned, Archived)
- Date (Date)

### Database 2 — Monthly Reports
Properties needed:
- Title (default)
- Client (Text)
- Period (Text)
- Status (Select: Draft — Awaiting Michael Review, Reviewed, Delivered)
- Generated (Date)

### Database 3 — BD Intelligence
Properties needed:
- Title (default)
- Company (Text)
- Priority (Select: ANCHOR, HIGH, MEDIUM, LOW)
- Type (Text)
- Week (Date)
- Status (Select: Briefing Ready, Outreach Sent, Meeting Booked, Closed)

### Database 4 — Finance Tracker
Properties needed:
- Title (default)
- Client (Text)
- Amount (Number)
- Days Outstanding (Number)
- Status (Select: FOLLOW_UP, OVERDUE, ESCALATE, PAID)
- Last Checked (Date)

---

## Step 4 — Import Workflows (10 minutes)

For each workflow JSON file:

1. In n8n → **Workflows → Add Workflow → Import from File**
2. Select the JSON file
3. Review the imported workflow
4. Update any placeholder values (database IDs, etc.)
5. Test with **Execute Workflow** button
6. Once confirmed working → toggle **Active** to ON

Import order:
1. `workflow-1-email-triage.json`
2. `workflow-2-monthly-report.json`
3. `workflow-3-prospect-intel.json`
4. `workflow-4-invoice-agent.json`

---

## Step 5 — Customize Before Activating

### Workflow 1 — Email Triage
In the Claude node system prompt, update:
- Client names (TDI, SmartPM contacts, etc.)
- Anyone who should always be flagged URGENT

### Workflow 2 — Monthly Report
In the `Load Client Roster` code node:
- Replace `SMARTPM_PROJECT_ID_TDI` with your actual SmartPM project ID
- Add additional clients as you onboard them
- Confirm SmartPM API endpoint with Billy Upchurch

### Workflow 3 — Prospect Intel
In the `Load Prospect Watchlist` code node:
- Update the prospects array with your current pipeline
- Add/remove companies as your BD focus shifts
- Update contact names as you identify them

### Workflow 4 — Invoice Agent
- Confirm HoneyBook API endpoint (check HoneyBook developer docs)
- Adjust day thresholds if your payment terms differ

---

## Ongoing Operations — Your Weekly Rhythm

**Monday morning (15 min):**
- BD Intel digest arrives in inbox
- Review prospect briefings
- Pick 1-2 outreach messages to send

**Daily (5 min):**
- Check email triage alerts
- Approve any urgent draft replies
- Notion inbox shows classified emails

**1st of each month (30 min):**
- Report draft arrives in inbox
- Open in Notion
- Add your forensic judgment layer
- Deliver to client

**As invoices age:**
- Follow-up drafts arrive automatically
- Review, edit if needed, send
- Escalation alerts flag 30+ day situations immediately

---

## Troubleshooting Common Issues

**Workflow won't activate:**
→ Check all credentials are connected (green checkmark)
→ Test each node individually using the Execute Node button

**Claude returning unexpected output:**
→ Check the Claude node — view the raw output
→ Adjust the prompt in the message field
→ The JSON parse node handles malformed responses gracefully

**Gmail not connecting:**
→ OAuth tokens expire — re-authenticate in Credentials
→ Check Google hasn't restricted the app

**SmartPM API not responding (Workflow 2):**
→ Confirm API endpoint URL with Billy
→ Check your API key hasn't expired
→ n8n will log the error in execution history

---

## Cost Summary

| Service | Plan | Monthly Cost |
|---|---|---|
| n8n Cloud | Starter | ~$20 |
| Anthropic API | Pay per use | ~$10–20 |
| News API | Free tier | $0 |
| HoneyBook | Existing | $19–39 |
| Notion | Free/Plus | $0–16 |
| **Total** | | **~$50–75/month** |

---

## Next Evolution — When You're Ready

Once all 4 workflows are stable (4-6 weeks):

**Add Workflow 5 — LinkedIn Content Agent**
Monitors your Buffer schedule, suggests post topics based on
prospect news and project controls trends, drafts posts for approval.

**Add Workflow 6 — XER Intake Agent**
Contractor submits XER → n8n receives email attachment →
extracts file → triggers SmartPM API ingestion →
notifies you that BIR analysis is ready to run.

**Add Workflow 7 — Podcast Production Agent**
You record episode → upload to Descript →
n8n detects new file → Claude generates show notes,
LinkedIn post, and email newsletter from transcript.

---

*Exsto Cura Consilium · Agentic Operations Stack · 2026*
*Built with n8n + Claude Sonnet · Designed for solo practitioner scale*
