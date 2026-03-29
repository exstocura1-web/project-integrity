# Project Integrity™

Internal AI-enabled project controls workspace for **Exsto Cura Consilium** — schedule intelligence, governance workflows, and manual **XER / CSV** ingest backed by **Firebase** (Firestore + optional Storage) with **Claude** analysis on the server.

**Remote:** [github.com/exstocura1-web/project-integrity](https://github.com/exstocura1-web/project-integrity)

## Product vs internal automation

**This app** (Firebase + React + Express) is the **Project Integrity** product surface: portfolio-oriented UI, file ingest, Firestore artifacts, and `/api/ai/*` routes using Anthropic. **n8n** workflows on your ops machine (`C:\Exsto\n8n-workflows\`) are a **separate** internal VA stack (email, reports, BD). Do not describe n8n as built-in live connectors inside this app for enterprise stakeholders; enterprise paths assume **manual** file handoff unless you ship optional webhooks later.

See `docs/ARCHITECTURE.md` and `docs/MODEL-GOVERNANCE.md`.

## Prerequisites

- Node.js (see `.nvmrc`)
- Firebase project with Firestore (and **Storage** enabled for raw upload blobs)
- Anthropic API key

## Run locally

```bash
npm install
cp .env.example .env
# Fill ANTHROPIC_API_KEY, Firebase Admin fields, VITE_* URLs for split dev if needed
npm run dev
```

- **Single origin:** `server.ts` serves Vite middleware in development on one port (default **3000**).
- **Split:** Build frontend with `npm run build`, deploy API to Railway and static `dist` to Vercel; set `VITE_API_BASE_URL` and `VITE_SOCKET_URL` to the Railway host.

## Production deploy

- **Frontend (Vercel):** `npm run build` → output `dist`.
- **Backend (Railway):** `tsx server.ts` with `NODE_ENV=production`, `APP_URL`, `FRONTEND_URL`, Firebase Admin env vars, `FIREBASE_STORAGE_BUCKET` if non-default.
- Env vars are documented in **`.env.example`** (no secrets committed).

## Manual ingest MVP

See `docs/PRD-MANUAL-INGEST-MVP.md`. Filing Cabinet tab: **Client ID**, **Project name**, upload **.xer** / **.csv**, **Recent uploads** list via `GET /api/ingest/uploads`.

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Dev server (Vite + API + Socket.IO) |
| `npm run build` | Production SPA build |
| `npm run lint` | `tsc --noEmit` |

## Legacy

This repo was bootstrapped from an AI Studio export; branding and governance are now Exsto Cura–specific.
