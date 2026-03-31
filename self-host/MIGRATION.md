# n8n Self-Host Migration — Exsto Cura

## Cost Comparison

| Item | n8n Cloud (current) | Self-Hosted |
|---|---|---|
| n8n platform | $20/mo (Starter) | $0 (MIT license) |
| Hosting | included | $4-6/mo VPS |
| Anthropic API | ~$5-10/mo | ~$5-10/mo (unchanged) |
| Domain/SSL | N/A | $0 (Caddy auto-cert) |
| **Total** | **$25-30/mo** | **$9-16/mo** |

## VPS Options (Ubuntu 22.04+)

| Provider | Plan | Monthly | RAM | Notes |
|---|---|---|---|---|
| Hetzner CX22 | Shared | €3.99 (~$4.50) | 4 GB | EU/US datacenters, best value |
| DigitalOcean | Basic | $6 | 1 GB | NYC datacenter, simple |
| Vultr | Cloud Compute | $5 | 1 GB | Houston datacenter available |

n8n Community with 5 workflows runs comfortably on 1 GB RAM + 1 vCPU.

---

## Step 1 — Provision VPS (15 min)

1. Create account at hetzner.com (or provider of choice)
2. Create server: Ubuntu 22.04, cheapest shared plan, US-East region
3. Add your SSH key during creation
4. Note the public IP address

## Step 2 — DNS (5 min)

```powershell
cd C:\Exsto\self-host
.\setup-dns.ps1 -VpsIp <YOUR_VPS_IP>
```

Creates the A record via cPanel API and polls until propagation confirms.
Prompts for cPanel credentials if not set in `.env` (`SFTP_USER` / `SFTP_PASS`).

**Manual fallback** (if cPanel API is blocked):
1. Log in to cPanel at exstocura.com
2. Zone Editor → Add A Record:
   - Name: `n8n`
   - Value: `<VPS_IP>`
   - TTL: 300
3. Wait for propagation (~5 min)

## Step 3 — Deploy (10 min)

From PowerShell on your Windows machine:

```powershell
cd C:\Exsto\self-host
.\setup-vps.ps1 -VpsIp <YOUR_VPS_IP>
```

This copies files, installs Docker, generates encryption key, and starts n8n.

## Step 4 — Create Owner Account (5 min)

1. Visit `https://n8n.exstocura.com`
2. Create account: mcraig@exstocura.com
3. Complete the setup wizard

## Step 5 — Create Credentials (15 min)

In n8n → Settings → Credentials → Add Credential:

### Gmail OAuth2
- Same Google OAuth flow as before
- **Important**: Update the OAuth redirect URI in Google Cloud Console to:
  `https://n8n.exstocura.com/rest/oauth2-credential/callback`
- Note the credential ID from the URL bar

### Anthropic (HTTP Header Auth)
- Header Name: `x-api-key`
- Header Value: your Anthropic API key
- Note the credential ID

### Anthropic (LangChain)
- Add Credential → Anthropic API
- Paste API key
- Note the credential ID

### Notion
- Internal Integration Token (same as before)
- Note the credential ID

### HoneyBook (if using Workflow 4)
- HTTP Header Auth: `Authorization` / `Bearer YOUR_KEY`
- Note the credential ID

## Step 6 — Update .env (5 min)

Edit `C:\Exsto\.env`:

```
N8N_URL=https://n8n.exstocura.com
N8N_API_KEY=<new API key from Settings > API>

N8N_CRED_GMAIL_ID=<new ID>
N8N_CRED_GMAIL_NAME=Gmail account
N8N_CRED_NOTION_ID=<new ID>
N8N_CRED_NOTION_NAME=Notion account
N8N_CRED_ANTHROPIC_LC_ID=<new ID>
N8N_CRED_ANTHROPIC_LC_NAME=Anthropic account
N8N_CRED_ANTHROPIC_HTTP_ID=<new ID>
N8N_CRED_ANTHROPIC_HTTP_NAME=Anthropic API Key
```

## Step 7 — Migrate Workflows (5 min)

```powershell
cd C:\Exsto
.\migrate-to-selfhost.ps1
```

The script imports all 5 workflows, remaps credentials, and downgrades models to Haiku.

## Step 8 — Validate (15 min)

For each workflow in the n8n editor:
1. Open the workflow
2. Click any node with a warning icon → reconnect the credential
3. Click **Test Workflow**
4. If successful, toggle **Active**

## Step 9 — Parallel Run (1 week)

Keep both instances running for one week:
- Cloud: active (current production)
- Self-hosted: active (validation)
- Compare: execution logs, email delivery, Notion writes

## Step 10 — Cutover

Once self-hosted is stable:
1. Deactivate all workflows on n8n Cloud
2. Cancel n8n Cloud subscription ($20/mo saved)
3. Delete the cloud instance API key

---

## Maintenance

### Backups
```bash
ssh root@<VPS_IP> "docker compose -f /opt/n8n/docker-compose.yml exec n8n n8n export:workflow --all --output=/home/node/.n8n/backups/"
```

### Updates
```bash
ssh root@<VPS_IP> "cd /opt/n8n && docker compose pull && docker compose up -d"
```

### Monitoring
Check n8n health: `https://n8n.exstocura.com/healthz`

---

*Exsto Cura Consilium · Self-Host Migration Guide · 2026*
