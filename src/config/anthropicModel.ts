/**
 * Single source of truth for Anthropic models used in Project Integrity™.
 * All server-side Claude calls for logs, risk, BIR™/TIA-style analysis must use this ID.
 * @see docs/MODEL-GOVERNANCE.md
 */
export const ANTHROPIC_MODEL = "claude-sonnet-4-20250514" as const;
