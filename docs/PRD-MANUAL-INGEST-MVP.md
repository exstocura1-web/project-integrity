# PRD — Manual ingest MVP (Project Integrity™)

## Persona

Michael Craig / internal Exsto Cura analyst (authenticated Google user in-app).

## Goal

Support **enterprise-realistic** intake: no dependency on client IT opening webhooks. Analyst selects **client** and **project**, uploads **XER** (required path for schedule) and optionally **CSV**, sees **upload history** with integrity metadata.

## User flow

1. Open **Filing Cabinet** (or equivalent ingest surface).
2. Enter **Client ID** (Firestore slug, e.g. `tdi` or `default`).
3. Enter / confirm **Project name**; system derives **project document ID** (URL-safe slug).
4. Drop or browse **.xer** and/or **.csv**.
5. Server stores **raw file** in Firebase Storage (when configured), writes **`uploads`** subdocument with `sha256`, size, timestamps, parse status.
6. For `.xer`, existing **XER parser** runs; summary metrics merge into `projects/{projectId}` as today.
7. Analyst views **last N uploads** for that client/project via API-backed list.

## Non-goals (MVP)

- Full P6 relationship graph analytics in UI.
- Inbound Primavera / SmartPM / Jira **webhooks** as the primary enterprise path.
- External client self-service portal login.

## Security

- **Max upload size:** 52 MB (server enforced).
- **Allowed extensions:** `.xer`, `.csv` only (content sniffing: reject other extensions).
- **Virus/malware:** Files are stored as blobs; **do not execute** uploaded content. Recommend periodic bucket scanning via GCS/Firebase enterprise controls (out of scope for code MVP).
- **Secrets:** Anthropic and Firebase Admin keys **server-only**; browser uses `VITE_*` public Firebase config + API base URL only.

## Data model (Firestore)

Logical hierarchy (Admin SDK writes):

- `clients/{clientId}`
- `clients/{clientId}/projects/{projectId}` — schedule summary, KPIs, `sourceFile`, etc.
- `clients/{clientId}/projects/{projectId}/uploads/{uploadId}`

### `uploads` document fields

| Field | Type | Notes |
|-------|------|--------|
| `originalName` | string | Client filename |
| `storagePath` | string \| null | GCS object path if Storage write succeeded |
| `sha256` | string | Hex digest of raw bytes |
| `mimeType` | string | From multer / client |
| `sizeBytes` | number | |
| `uploadedAt` | timestamp | |
| `uploadedBy` | string | Placeholder until auth context wired on API (`system` or email) |
| `status` | string | e.g. `stored`, `parsed`, `parse_failed` |
| `parserVersion` | string \| null | e.g. `xerParser-v1` when XER parsed |
| `activityCount` | number \| null | From parser summary when applicable |

Optional later: `organizations` collection above `clients` for multi-tenant SaaS.

## Success criteria

- Upload + metadata persisted when Firebase Admin + Storage are configured.
- History API returns recent uploads for a client/project pair.
- UI shows client/project fields and a refreshable history list.
