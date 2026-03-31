# BIR™ Client Demo

Bid Schedule Intelligence Review™ — Next.js demo on **Vercel** with optional **Firebase** (Storage + Firestore).

## Features

- Dark UI aligned with Exsto brand (Cormorant Garamond + DM Sans, gold / ink / chalk).
- Light auth: HTTP-only JWT cookie after passphrase (`DEMO_ACCESS_KEY`).
- Upload `.xer` or `.csv` → shallow parse → **BIR™** demo scoring → results dashboard.
- If Firebase env vars are set, files and findings persist; otherwise results load from `sessionStorage` after redirect.

## Local development

```bash
cd bir-demo
cp .env.example .env.local
# Set AUTH_SECRET (16+ chars) and DEMO_ACCESS_KEY; optional Firebase block
npm install
npm run dev
```

- Default passphrase in **development** if `DEMO_ACCESS_KEY` is unset: **`bir-demo`** (see `lib/demo-passphrase.ts`).
- Default `AUTH_SECRET` fallback exists only in development (`lib/auth-jwt.ts` / `middleware.ts`).

## Deploy on Vercel

1. Create a Vercel project from this folder / repo root `bir-demo`.
2. Set environment variables (Production + Preview as needed):
   - `AUTH_SECRET`
   - `DEMO_ACCESS_KEY`
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET` (optional)
3. **Firebase console**
   - Enable **Firestore** (Native) and **Storage**.
   - Create a service account with **Firebase Admin** / appropriate roles; use its JSON key fields in Vercel env.
4. Deploy: `vercel` or Git integration.

### Smoke test after deploy

1. Open site root → enter demo key → **Upload** a small `.csv` or `.xer`.
2. Confirm redirect to `/results/{runId}` with scorecards and charts.
3. With Firebase configured, open the same URL in a fresh browser session after re-authing; results should load via `GET /api/runs/{runId}`.

## Limits

- Demo upload cap: **15 MB** (see `app/api/upload/route.ts`).
- XER handling is **heuristic** for this demo — production BIR™ uses full XER forensics.

## Disclaimer

Illustrative output only — not formal advisory. Do not upload confidential client data.
