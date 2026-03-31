# Cursor Agent Prompt — Project Integrity™ P0 (Week 1 execution)

Copy everything below the line into a **new Cursor chat** with the **Project Integrity app repository** opened as the workspace (see “Open this codebase”).

---

You are implementing **P0 (highest value, lowest effort)** items for **Project Integrity™**, Exsto Cura Consilium’s internal AI-enabled project controls platform.

## Business context (non-negotiable)

- **Founder:** Michael Craig; practice: Exsto Cura Consilium (exstocura.com).
- **Primary product value:** Multi-client portfolio view, **BIR™** and **TRIAGE-IMPACT™** methodology support, branded / defensible report outputs.
- **Enterprise reality:** Large clients will **not** allow inbound webhooks to their P6/SmartPM/etc. All enterprise data paths assume **manual** XER upload, CSV export, or handoff — design for that first.
- **Secondary:** n8n-based internal automation exists separately; do not conflate it with the client-facing app in positioning or architecture.

## Technical stack (this repo)

Use what you find in the repo; the canonical app under active development matches roughly:

- **Frontend:** React 19, Vite 6, TypeScript, Tailwind 4.
- **Backend:** Node **Express** (`server.ts` / API routes), `tsx` for dev.
- **Data / auth:** **Firebase** client SDK + **firebase-admin** on the server.
- **AI:** `@anthropic-ai/sdk` — model governance is **`claude-sonnet-4-20250514`** for any client-facing or methodology-heavy output (see governance file below).
- **Hosting intent:** Frontend on **Vercel**, API on **Railway** (env-driven URLs; custom domains `app.exstocura.com` + `api.exstocura.com`).

If the opened workspace differs, adapt paths but keep the same deliverables.

## External reference docs (read if present)

On the same machine, these files provide audit conclusions and policy (open or paste summaries if the agent workspace is only the Git repo):

- `C:\Exsto\project-integrity-audit.md` — strategic audit: gaps (no XER pipeline in ops repo, Firebase not in `C:\Exsto`, webhook story vs manual ingest, P0/P1 list).
- `C:\Exsto\MODEL-GOVERNANCE.md` — **approved model = Sonnet** for BIR™, TRIAGE-IMPACT™, reports, BD intel, email triage; no silent Haiku downgrades on production paths.
- `C:\Exsto\n8n-workflows\` — n8n JSON + `import-all-exsto-workflows.ps1` / `cost-optimize.ps1` (ops only; **do not** downgrade models; governance already applied in those scripts as of March 2026).

## Audit-derived P0 scope (execute in this session)

### 1. Model & workflow governance (code + docs in **this** repo)

- Ensure **no** server or client code path defaults to Haiku for BIR™ / TIA / client narratives. Centralize model ID in one config (e.g. `const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'`) and use it for all Anthropic calls that touch schedule/methodology/reporting.
- Add a short `docs/MODEL-GOVERNANCE.md` **in this repo** (or link to the Exsto copy) stating the same policy for contributors.

### 2. Single source of truth for “product” vs “automation”

- In README (or `docs/ARCHITECTURE.md`): one paragraph that **Project Integrity** = Firebase/React app; **n8n** = internal VA stack — so enterprise stakeholders are not promised webhook connectivity that does not exist in the app.

### 3. Manual ingest MVP — **spec + thin vertical slice**

Deliver **both**:

**A. One-page PRD** (Markdown): `docs/PRD-MANUAL-INGEST-MVP.md`

- Persona: Michael / internal analyst.
- Flow: choose **client** → **project** → upload **XER** (and optional CSV) → store metadata + file reference → show upload history list.
- Non-goals for MVP: full P6 graph analytics, auto webhooks, client portal login.
- Security: max file size, allowed MIME/types, virus scan note, no execution of uploaded content.
- Firestore-oriented entities: e.g. `organizations`, `clients`, `projects`, `uploads` (with `storagePath`, `sha256`, `uploadedAt`, `uploadedBy`, `status`, `parserVersion` placeholder).

**B. Minimal implementation** (only if the repo already has auth + Firebase wired; otherwise stub with clear TODOs):

- API route(s) for signed upload or server-side upload to **Firebase Storage** + Firestore doc.
- UI: simple upload form + list last N uploads per project.
- Do **not** implement full XER parser in P0 unless already present; if parser exists, wire one field (e.g. activity count) as proof.

### 4. Secrets & config hygiene (this repo only)

- Confirm `.env` / `.env.example` document required vars (`ANTHROPIC_API_KEY`, Firebase keys, `VITE_*` public config, API base URL for Railway) **without** committing secrets.
- Add `.env.example` if missing.
- No API keys in client bundle except public Firebase config.

### 5. Optional: n8n alignment (documentation only in this repo)

- If you touch cross-repo docs, note: canonical email triage workflow file should be one of `workflow-1-*.json` under `C:\Exsto\n8n-workflows\` — do **not** duplicate logic inside the Firebase app for P0.

## Explicit non-goals for this P0 pass

- Do **not** add Primavera/SmartPM/Jira **inbound** webhooks.
- Do **not** change n8n cloud/self-hosted instances (no JSON push from this task).
- Do **not** expand scope to full BIR™ engine or TRIAGE-IMPACT™ UI beyond the PRD hooks.

## Deliverables checklist

- [ ] Centralized Anthropic model constant + scan for stray Haiku usage in methodology/report paths.
- [ ] `docs/MODEL-GOVERNANCE.md` in repo (or equivalent).
- [ ] `docs/ARCHITECTURE.md` or README section: product vs n8n.
- [ ] `docs/PRD-MANUAL-INGEST-MVP.md`.
- [ ] Thin upload + list slice **or** clearly marked stubs with next-step comments.
- [ ] `.env.example` updated.

## Verification

- `npm run lint` / `tsc --noEmit` (or repo equivalent) passes.
- No secrets in diff.

When done, summarize changed files and any follow-ups for P1 (portfolio dashboard, XER parse pipeline, BIR™ data model).

---

_End of paste-ready prompt._
