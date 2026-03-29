/**
 * Exsto Cura Consilium — BIR™ and TRIAGE-IMPACT™ prompt scaffolding.
 * Server sends these strings to Claude with ANTHROPIC_MODEL (see src/config/anthropicModel.ts).
 */

export type BirSchedulePayload = {
  projectName: string;
  dataDate: string;
  summary: Record<string, unknown>;
  activitiesSample: Array<{
    id: string;
    name: string;
    startDate: string;
    finishDate: string;
    totalFloat: number;
    isCritical: boolean;
    dependencies: string[];
    type: string;
  }>;
  clientContext?: string;
};

export function buildBirPrompt(payload: BirSchedulePayload): string {
  const ctx = payload.clientContext?.trim() || "Internal Exsto Cura engagement — pre-award / bid schedule stress review.";
  return `You are a senior Primavera P6 practitioner executing Exsto Cura's **BIR™ (Bid Schedule Intelligence Review)** — pre-award schedule stress testing for defensible owner/advisor use.

## Rules
- Base findings **only** on the structured schedule metrics and activity sample below. If data is missing, say so explicitly.
- When citing activities, use **task id** from the sample (e.g. task id 1042) — do not invent IDs.
- Output **Markdown** with these sections:
  1. **Executive summary** (3–5 bullets)
  2. **Logic & sequencing stress** (open ends, negative float drivers, near-critical chain)
  3. **Calendar / duration / constraint risk** (what could invalidate the bid path)
  4. **BIR™ findings register** — table: | Finding | Severity (L/M/H) | Evidence (task ids / metrics) | Recommended bid clarification |
  5. **Questions for the bidder** (numbered, specific)

## Engagement context
${ctx}

## Project
- **Name:** ${payload.projectName}
- **Data date:** ${payload.dataDate}

## Parser-derived summary (XER pipeline)
\`\`\`json
${JSON.stringify(payload.summary, null, 2)}
\`\`\`

## Activity sample (low float / criticality-biased; from XER parser)
\`\`\`json
${JSON.stringify(payload.activitiesSample, null, 2)}
\`\`\`
`;
}

export type TriageImpactPayload = {
  projectName: string;
  scheduleFacts: Record<string, unknown>;
  impactingEvents: Array<{ description: string; date?: string; source?: string }>;
  ownerNarrative?: string;
  analysisWindow?: { start?: string; end?: string };
  reliefSought?: string;
};

export function buildTriageImpactPrompt(payload: TriageImpactPayload): string {
  return `You are drafting a **TRIAGE-IMPACT™** time-impact style narrative aligned with **AACE International** practice (causation, period analysis framing, concurrent impacts). This is for Exsto Cura Consilium — authoritative, direct, no filler.

## Rules
- Separate **facts supported by the schedule snapshot** from **assumptions** clearly.
- Reference SPI/CPI/SQI or activity-level evidence only where provided in scheduleFacts.
- Do not assert legal conclusions; frame as schedule analysis support for claims / CO dialogue.
- Output **Markdown** with these sections:
  1. **Cover** — Project, analysis window, data date reference
  2. **Chronology of impacting events** (table: Date | Event | Source)
  3. **Causation narrative** — tie events to schedule drivers using TRIAGE-IMPACT™ framing (cause → effect on critical / near-critical work)
  4. **Period impact discussion** — what changed in the schedule position vs baseline / pre-impact (use facts given)
  5. **Concurrent delay / pacing** — flag if data is insufficient to conclude
  6. **Exhibits index** — list what a full submission would attach (fragnets, curves, correspondence) as placeholders
  7. **Summary opinion** — 2–3 sentences suitable for executive read

## Owner / counsel narrative (optional)
${payload.ownerNarrative?.trim() || "_None provided._"}

## Relief / CO context (optional)
${payload.reliefSought?.trim() || "_Not specified._"}

## Analysis window (optional)
${payload.analysisWindow ? JSON.stringify(payload.analysisWindow) : "_Not specified._"}

## Project
**${payload.projectName}**

## Schedule facts (from XER / dashboard — JSON)
\`\`\`json
${JSON.stringify(payload.scheduleFacts, null, 2)}
\`\`\`

## Impacting events (user-supplied)
\`\`\`json
${JSON.stringify(payload.impactingEvents, null, 2)}
\`\`\`
`;
}
