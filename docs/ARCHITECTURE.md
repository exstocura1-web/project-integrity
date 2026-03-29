# Architecture — Project Integrity™ vs internal automation

**Project Integrity** (this repository) is the **Firebase + React + Express** application: portfolio-oriented UI, manual file ingest, Firestore/Storage-backed artifacts, and server-side Claude analysis. It is what you deploy to **Vercel** (static SPA) and **Railway** (Node API + Socket.IO), with optional custom domains such as `app.exstocura.com` and `api.exstocura.com`.

**n8n** workflows under `C:\Exsto\n8n-workflows\` on your ops machine are a **separate internal stack**: email triage, monthly report drafts, BD intel, invoices, SmartPM market agent. They are **not** part of this repo and **must not** be described to enterprise stakeholders as built-in “live connectors” inside Project Integrity. Enterprise data paths assume **manual** XER/CSV upload or export handoff unless a future release adds optional webhooks for small-firm tenants.

Canonical email triage workflow exports: `workflow-1-*.json` in `C:\Exsto\n8n-workflows\`. Do not duplicate that logic in the Firebase app for routine P0 work.

## P1 API (in-app)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/portfolio/summary` | All `clients/*/projects/*` rows with `summary` health fields + `summarySnapshot` for methodology |
| POST | `/api/ai/bir` | BIR™ Markdown from Firestore XER snapshot (`clientId` + `projectId`) or inline `parsedPayload` |
| POST | `/api/ai/triage-impact-report` | TRIAGE-IMPACT™ TIA-style Markdown (`projectName`, `scheduleFacts`, `impactingEvents[]`) |

All Anthropic calls use `ANTHROPIC_MODEL` from `src/config/anthropicModel.ts` (`claude-sonnet-4-20250514`). Prompt scaffolding: `src/prompts/methodologyPrompts.ts`.
