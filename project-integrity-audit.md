# Project Integrity™ — Strategic Technical Audit

**Prepared for:** Michael Craig, Exsto Cura Consilium  
**Date:** 29 March 2026  
**Scope:** Read-only review of the `C:\Exsto` workspace. **No code or config was modified.**

---

## 1. Scope and critical caveat

### 1.1 What this audit actually covered

This workspace contains:

| Area | Contents |
|------|----------|
| **Project Integrity (product)** | `project-integrity/drop-into-your-build/` — copy constants (`copy-for-react.tsx`), static `index.html`, `document-head-snippet.html`, and `apply-branding.ps1` (branding pass for a Vercel / Google AI Studio-style export). |
| **Automation stack** | `n8n-workflows/` — JSON workflow definitions and PowerShell importers/updaters (`import-all-exsto-workflows.ps1`, `import-n8n-email-triage.ps1`, `migrate-to-selfhost.ps1` references). |
| **Ops / hosting** | `self-host/` — Docker Compose (Caddy + n8n), migration doc, DNS/deploy scripts. |
| **Cost / tuning** | `cost-optimize.ps1` — programmatic n8n workflow mutation (model downgrade, truncation, dedup). |
| **Root** | `package.json` (only `ssh2` devDependency), `.gitignore`, and a local `.env` file **present on disk** (see security section). |

### 1.2 What is **not** in this workspace

There is **no** checked-in React application tree, **no** Firebase SDK usage, **no** Firestore security rules, **no** Railway/Vercel serverless handlers, and **no** implementation of XER parsing, portfolio APIs, or client portals in this folder.

References in `index.html` to `https://project-integrity.vercel.app/` and `apply-branding.ps1`’s comment about a “cloned Vercel / AI Studio export” indicate the **live platform likely lives in a separate repository or deployment**.  

**Implication:** Firebase schema, multi-client data models, XER ingestion performance, and in-app BIR™ / TRIAGE-IMPACT™ flows **cannot be audited from this workspace**. Sections below separate **evidence from this repo** from **inferred gaps** relative to your stated strategy.

---

## 2. Strategic reality vs. what is built (this repo)

### 2.1 Primary value you defined

1. Multi-client portfolio dashboard  
2. Proprietary methodology (BIR™, TRIAGE-IMPACT™)  
3. Branded report generation  
4. *(Future)* Client portal + SaaS for small firms  

### 2.2 What is built and plausibly working (automation layer)

| Capability | Evidence | Notes |
|------------|----------|--------|
| **Email triage** | `workflow-1-email-triage.json`, v2 variants, `cost-optimize.ps1` | Gmail trigger + Claude; JSON parse + routing. |
| **Monthly schedule narrative** | `workflow-2-monthly-report.json` | Cron → client roster (JS) → SmartPM HTTP (two calls) → Claude → Notion + Gmail notify. |
| **Prospect / BD intel** | `workflow-3-prospect-intel.json` | News API + Claude briefing → Notion. |
| **Invoice / collections** | `workflow-4-invoice-agent.json` | HoneyBook API + Claude drafts + Notion + Gmail. |
| **SmartPM market agent** | `workflow-5-smartpm-market-agent.json` | Hardcoded prospect DB in Code node + Claude + digest email; BIR™ / SmartPM fit fields in prompts/Notion. |
| **n8n sync / normalization** | `import-all-exsto-workflows.ps1` | Pushes workflows via n8n API; rewrites connections, Notion DB IDs from `.env`, **forces LangChain Anthropic nodes to Haiku** (see §5). |
| **Self-hosted n8n path** | `self-host/docker-compose*.yml`, `MIGRATION.md` | Caddy TLS, encryption key env, webhook base URL. |
| **Branded shell copy** | `PROJECT_INTEGRITY_COPY`, static `index.html` | Messaging aligns with governance, XER, TIA/CO traceability; **aspirational** (“as engagement artifacts are connected in-product”) vs. implemented here. |

### 2.3 What is built but **blocked or fragile** in enterprise context

| Item | Why |
|------|-----|
| **SmartPM API pulls in Workflow 2** | Requires **your** (or partner) API access and **project IDs** in n8n. Enterprise owners often will not allow vendor cloud pull of their schedule metrics into your automation account; even when allowed, it is **your integration**, not “their systems calling you.” |
| **Monthly report content** | Narrative is only as good as SmartPM JSON fidelity + Claude; no TRIAGE-IMPACT™ or BIR™ **structured** outputs (fragnets, windows, causation hooks) in workflow — generic “schedule intelligence” sections. |
| **HoneyBook / Gmail / Notion** | Fine for **your** ops; irrelevant to client-facing Project Integrity value. |

### 2.4 What is **missing** for highest value fastest (relative to strategy)

Assuming the Vercel/Firebase app is still thin or AI-Studio-derived:

1. **First-class manual ingest:** XER (and CSV) upload, virus/size limits, job queue, parsed artifact store, version lineage per client/project.  
2. **Portfolio data model:** `organization` → `client` → `project` → `baseline` / `period` / `upload` with RBAC — **not visible in this repo**.  
3. **BIR™ workflow objects:** Bid packages, scenario definitions, stress-test results, finding register with links to schedule evidence — **not in n8n or static HTML here**.  
4. **TRIAGE-IMPACT™ workflow objects:** TIA narratives tied to AACE-style structure, date windows, methodology steps, exhibit index — **not implemented in repo**.  
5. **Branded PDF / DOCX report export** from structured data + human-approved blocks — Notion paragraphs are a **drafting sink**, not deliverable-grade branded output.  

### 2.5 Over-engineered or misaligned **for current stage** (this repo)

| Item | Assessment |
|------|------------|
| **Dual model policy (Sonnet in JSON vs Haiku after sync)** | Source workflows specify `claude-sonnet-4-20250514`; `import-all-exsto-workflows.ps1` **replaces** LangChain model with `claude-haiku-3-20250307`. `cost-optimize.ps1` also downgrades email triage to Haiku and truncates body. This is **cost optimization** at the expense of **reasoning depth** for nuanced mail and reports — reasonable for triage, **risky** for anything resembling forensic or methodology-heavy output. |
| **Large prospect DB inside a workflow JSON** | `workflow-5` embeds a long static array — hard to maintain, no CRM source of truth, duplicate of BD strategy in multiple places. |
| **Self-host + Cloud + import scripts** | Understandable for cost control, but operational surface area (API keys, encryption key, DNS, Caddy) before core product IP is fully in code. |
| **Multiple email triage workflow variants** | `workflow-1-email-triage.json`, `workflow-1-email-triage-v2.json`, `workflow-1-v2-cursor.json`, `workflow-1-email.triage-v2.json` — consolidation debt. |

---

## 3. Webhook integrations — realistic **now** vs aspirational

### 3.1 Inbound webhooks (P6, Acumen Fuse, ALICE, SmartPM, Jira)

**Finding:** In this workspace there are **no** n8n Webhook trigger nodes, no Railway/Vercel route handlers, and no JSON referencing Primavera P6, Acumen Fuse, ALICE, or Jira **as webhook producers**.

The only “webhook” configuration is **n8n’s own** `WEBHOOK_URL` in Docker Compose files — the base URL n8n uses when **it** registers webhooks (e.g., if you added webhook triggers in the UI but did not export them here).

| Integration | In this repo | Realistic now (your strategy) |
|-------------|--------------|-------------------------------|
| **Primavera P6 → you** | Not implemented | **Aspirational** for enterprise; **possible** for small partners if they can expose URLs. |
| **Acumen Fuse / ALICE / Jira → you** | Not implemented | Same as P6. |
| **SmartPM → you** | Not implemented | Workflow 2 is **outbound** SmartPM **REST pull**, not inbound webhook. |

**Conclusion:** Treat **all enterprise “live connector” stories as future or partner-only** until manual ingest + portfolio UX exist. Align roadmap copy with: **manual upload and exports first**; webhooks optional for unconstrained tenants.

### 3.2 Outbound / polling (already patterned)

- **SmartPM API** (HTTP Request) — works **if** you retain API rights and accept data leaving SmartPM into your stack.  
- **Gmail, Notion, HoneyBook, News API** — internal automation; not Project Integrity client product.

---

## 4. Firebase schema and data models

**Verdict from this workspace:** **Not auditable.** No `firebase.json`, Firestore rules, indexes, or TypeScript types appear under `C:\Exsto`.

**Design questions to answer in the real app repo** (recommended checklist):

| Question | Why it matters |
|----------|----------------|
| Is there a top-level **tenant / org** and **client** separation? | Multi-client portfolio and future SaaS. |
| Are **uploads** first-class (`storagePath`, `sha256`, `uploadedBy`, `parsedAt`, `parserVersion`)? | XER replay, defensibility, reproducing BIR™ runs. |
| Is **parsed schedule data** normalized (activities, relationships, calendars) vs. only LLM text? | BIR™ and TRIAGE-IMPACT™ need structured evidence, not summaries alone. |
| Are **methodology runs** stored as entities (inputs, prompts version, model, output JSON, human sign-off)? | Claims support, methodology licensing narrative. |

**XER efficiency:** Without schema, only general guidance: store **raw file + parsed graph**; avoid storing duplicate megabyte blobs per analysis; use **incremental parse** when possible; index by `projectId` + `dataDate`.

**BIR™ support:** You likely need entities such as: `bidOpportunity`, `scenario` (acceleration, weather, supply chain), `stressTestRun`, `finding` (severity, WBS/path reference, recommendation), linked to **activity IDs** from XER.

---

## 5. Claude / AI integration audit

### 5.1 How Claude is called (this repo)

| Path | Mechanism | Model in source JSON |
|------|-----------|----------------------|
| Email triage (classic) | HTTP `POST https://api.anthropic.com/v1/messages` | `claude-sonnet-4-20250514` |
| Email triage (optimized) | Same API via `cost-optimize.ps1` mutation | Downgraded to **`claude-haiku-3-20250307`** |
| Monthly report, invoice, prospect intel, SmartPM market | n8n LangChain node `lmChatAnthropic` | `claude-sonnet-4-20250514` in files |
| After `import-all-exsto-workflows.ps1` | `Normalize-LangChain` | **All LangChain Anthropic nodes → Haiku** |

**Critical inconsistency:** Your stated target model is **`claude-sonnet-4-20250514`**. The **import sync script systematically replaces Sonnet with Haiku** on LangChain nodes. That means deployed n8n workflows may **not** match the JSON on disk for model ID.

### 5.2 Is prompt architecture aligned with BIR™ and TRIAGE-IMPACT™?

| Workflow | BIR™ / TRIAGE-IMPACT™ alignment |
|----------|----------------------------------|
| **Workflow 5 (SmartPM market)** | Strong **BD positioning**: mentions BIR™, TRIAGE-IMPACT™, CO-015 narrative — appropriate for **sales intel**, not methodology execution. |
| **Workflow 2 (monthly report)** | **Operational schedule commentary** only; no AACE TIA structure, no bid-phase stress test rubric, no explicit traceability to exhibits or fragnets. |
| **Workflow 3** | BD / news — mentions BIR as offering, not methodology. |
| **Static product copy** | Mentions TIA & CO traceability and XER — **product vision**, not enforced in automation. |

### 5.3 Prompt improvements for more **defensible** analysis output

Apply these in the **Firebase app** and any **methodology-specific** n8n flows (not generic email):

1. **Structured output schema** — Require JSON or typed sections: `facts_from_source`, `assumptions`, `findings[]` with `{ claim, evidence_refs, confidence, counterfactual }`.  
2. **Evidence anchoring** — Pass **parsed activity IDs, dates, float, driving path** from XER/SmartPM JSON; instruct model to **cite only those IDs** for schedule assertions.  
3. **Methodology headers** — For TRIAGE-IMPACT™, mirror AACE-style steps in the prompt (e.g., causation, window, concurrency) so outputs read as **framework-grounded**, not generic narrative.  
4. **Separation of roles** — One pass for **fact extraction** (minimal interpretation), second pass for **owner advisory** — reduces hallucinated metrics.  
5. **Version stamping** — Persist `prompt_id`, `model`, `temperature`, `input_hash` with every run.  
6. **Unify model policy** — Decide: Haiku for **classification** only; Sonnet (or Opus for high-stakes) for **forensic/methodology** chains. Remove accidental downgrades on methodology paths.

---

## 6. Prioritized build list

### P0 — Do this week (highest value, lowest effort)

1. **Reconcile model deployment** — Confirm live n8n LangChain nodes: if methodology or client-facing narrative matters, **stop blanket Sonnet→Haiku** on those nodes; keep Haiku only for high-volume classification.  
2. **Single source of truth for workflows** — Pick one email triage variant; document which file is canonical; avoid silent drift between `cost-optimize.ps1` and repo JSON.  
3. **Clarify product vs. automation** — Naming: “Project Integrity (app)” vs. “Exsto internal n8n agents” so enterprise positioning does not promise webhook connectivity you do not ship.  
4. **Secrets hygiene** — Ensure `C:\Exsto\.env` is never copied into repos or tickets; rotate keys if ever leaked (see §8).  
5. **Manual ingest MVP spec** — One-page PRD: XER upload → parse → store → list by client/project (even if UI is minimal) — **unblocks** enterprise reality.

### P1 — Do this month (high value, medium effort)

1. **Portfolio dashboard** in the **actual** React/Firebase app: clients, projects, last upload, health indicators.  
2. **XER pipeline**: parser integration, error reporting, retention policy, **no** dependency on inbound webhooks.  
3. **BIR™ v1 data model + UI**: upload → run checklist → stored findings linked to activities.  
4. **Report export**: branded template (PDF/DOCX) populated from **structured** fields + approved narrative block — reduce reliance on Notion as final deliverable.  
5. **SmartPM path**: Keep **outbound** API where **you** have keys; for owner data, assume **CSV/export handoff** unless contract says otherwise.

### P2 — Do next quarter (strategic, not urgent)

1. **Client portal** with login, read-only portfolio, download reports.  
2. **Optional webhooks** for small-firm tier; feature-flagged.  
3. **SaaS tenancy**: billing, org isolation, audit logs.  
4. **ALICE / Fuse / Jira**: only after manual path and revenue justify integration cost.

### Backlog — Deprioritize or remove

1. **Expanding static prospect arrays** inside n8n — move to Notion/CRM + sync.  
2. **Multiple duplicate triage workflow JSONs** — archive extras.  
3. **Enterprise webhook demos** without legal/IT path — do not sell until partner-tier packaging exists.  
4. **Heavy self-host migration** until core app IP is stable and worth locking to your VPS footprint.

---

## 7. Security, exposed keys, and production risks

| Risk | Detail |
|------|--------|
| **Local `.env`** | Present under `C:\Exsto`; `.gitignore` lists `.env` — **good**, but verify no historical commit, backup, or sync tool (OneDrive, etc.) exposes it. |
| **n8n API key in scripts** | `import-all-exsto-workflows.ps1` and `cost-optimize.ps1` read `N8N_API_KEY` from `.env` — correct pattern; **do not** hardcode. |
| **Hardcoded operational IDs in `cost-optimize.ps1`** | Workflow ID and Notion-related ID strings are embedded — not secret like passwords, but **identify your automation**; prefer env-driven. |
| **Public IP in `docker-compose-ip.yml`** | `72.62.83.136` as `WEBHOOK_URL` — confirms infrastructure fingerprint; ensure firewall and TLS story match (HTTP + `N8N_SECURE_COOKIE=false` in that file is **appropriate only** for private/testing). |
| **`n8nio/n8n:latest`** | Pin image digest or minor version for reproducibility and CVE control. |
| **No Firebase rules in repo** | Cannot verify RLS; in the real app, enforce **server-side** validation and Firestore rules for multi-tenant data. |
| **Client data in LLM prompts** | Any schedule content sent to Anthropic must match **contract + DPA**; log retention and subprocessors should be explicit for enterprise sales. |

---

## 8. Honest assessment: continue investing vs. lighter stack?

**Continue the platform concept** — the positioning (portfolio + BIR™ + TRIAGE-IMPACT™ + branded deliverables) matches **high-margin advisory** and differentiates from generic “AI schedule chat.”  

**Simplify the execution layer until the core is real:**

- **This workspace** is weighted toward **n8n ops automation** (email, BD, invoices) and **branding snippets**, not toward the **defensible methodology engine** you described.  
- If the Vercel/Firebase app is still mostly shell, **narrow scope**: manual XER + structured methodology storage + report export beats more webhook or n8n surface area.  
- **Keep n8n** for what it does well (internal VA, optional SmartPM pull where permitted); **do not** let it substitute for Firestore-backed Project Integrity IP.

**Bottom line:** Worth continuing **if** the next engineering cycles go to **structured ingest, portfolio model, and methodology-linked outputs**. If not, you risk maintaining a **branded AI Studio shell + brittle automation** while enterprise work stays in Excel, P6, and Word — in which case a **lighter stack** (e.g., curated prompts + scripts + templates) could match revenue with less ops drag until you re-commit to the full product.

---

*End of audit — review only; no repository changes were made.*
