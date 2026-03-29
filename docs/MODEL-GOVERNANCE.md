# Model governance — Project Integrity™

This repository follows the same policy as `C:\Exsto\MODEL-GOVERNANCE.md` (Exsto Cura operations machine).

## Approved model

| Use case | Model |
|----------|--------|
| Log summarization, schedule risk analysis, BIR™ / TRIAGE-IMPACT™-style outputs | `claude-sonnet-4-20250514` |

## Implementation

- Import `ANTHROPIC_MODEL` from `src/config/anthropicModel.ts` in server code (`server.ts` and any future API modules).
- Do **not** switch to Haiku or undisclosed model IDs for client-facing or methodology-heavy paths without explicit written approval.

## Legacy / optional

- `src/services/geminiService.ts` is **not** used by the main Express AI routes; Anthropic is the supported path for production analysis.
