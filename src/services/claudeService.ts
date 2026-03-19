import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
  dangerouslyAllowBrowser: false,
});

const MODEL = "claude-sonnet-4-6";

/**
 * Summarize workflow logs with Claude.
 * Drop-in replacement for summarizeLogs() from geminiService.ts.
 */
export async function summarizeLogs(logs: any[]): Promise<string> {
  const logText = logs
    .map(
      (l) =>
        `[${l.time}] ${l.source} | Project: ${l.projectName || "Global"} | ${l.action} — ${l.status} (${l.result})`
    )
    .join("\n");

  const prompt = `You are a senior project controls analyst reviewing automated workflow logs for a construction project governance system.

Analyse the following workflow logs and provide a concise professional summary (3–5 sentences). 
- Highlight any failures, timeouts, or anomalies
- Note which data sources are active vs. failing
- Flag any patterns that suggest a data pipeline issue
- End with one recommended action if any issues exist

Logs:
${logText}`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    return block.type === "text" ? block.text : "No summary generated.";
  } catch (error) {
    console.error("Claude Log Summarization Error:", error);
    return "Failed to summarize logs. Please check your Anthropic API key.";
  }
}

/**
 * Perform schedule risk analysis with Claude.
 * Drop-in replacement for analyzeScheduleRisk() from geminiService.ts.
 */
export async function analyzeScheduleRisk(
  tasks: any[],
  metrics: any
): Promise<string> {
  const taskText = tasks
    .map(
      (t) =>
        `- ${t.name}: Start ${t.startDate}, Duration ${t.duration}d, Type: ${t.type}, Dependencies: [${t.dependencies.join(", ") || "none"}]`
    )
    .join("\n");

  const metricsText = JSON.stringify(metrics, null, 2);

  const prompt = `You are a certified planning engineer (PMI-SP) and earned value management specialist with 15 years of AEC industry experience.

Perform a schedule risk analysis on the following project data. Structure your response with these sections:

**Critical Path Assessment**
Identify the critical path from the task list and any near-critical paths (total float < 5 days).

**EVM Performance Interpretation**
Interpret the SPI and CPI trends. Flag any variance thresholds that require corrective action (SPI < 0.95 or CPI < 0.95).

**Top 3 Schedule Risks**
List the three highest-priority risks with predicted impact in days and cost.

**Recommended Recovery Actions**
Provide 2–3 specific, actionable recovery strategies appropriate for the current schedule position.

Keep the analysis concise and specific — avoid generic advice. Write as if presenting to a project owner.

Schedule Tasks:
${taskText}

EVM & Performance Metrics:
${metricsText}`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    return block.type === "text" ? block.text : "No analysis generated.";
  } catch (error) {
    console.error("Claude Risk Analysis Error:", error);
    return "Failed to perform risk analysis. Please check your Anthropic API key.";
  }
}

/**
 * NEW — Generate an agentic action recommendation from live project data.
 * Call this when new data is ingested to auto-populate the Action Queue.
 */
export async function generateAgenticInsight(
  projectData: {
    tasks: any[];
    metrics: any;
    recentLogs: any[];
    governanceRules?: any[];
  }
): Promise<{
  type: "risk" | "optimize" | "automate";
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
}[]> {
  const prompt = `You are an AI project governance agent for a construction project. 
Analyse the project data below and generate up to 3 actionable insights for the project controls team.

Return ONLY a valid JSON array with this exact structure — no markdown, no preamble:
[
  {
    "type": "risk" | "optimize" | "automate",
    "title": "Short title (max 8 words)",
    "description": "One or two sentences describing the issue and its impact. Be specific — include activity names, dates, or metric values where relevant.",
    "severity": "high" | "medium" | "low"
  }
]

Types:
- "risk" = a threat to schedule, cost, or quality requiring immediate attention
- "optimize" = an opportunity to improve performance or recover time/cost  
- "automate" = a repetitive task or data sync that the system can handle automatically

Project Data:
Tasks: ${JSON.stringify(projectData.tasks, null, 2)}
Metrics: ${JSON.stringify(projectData.metrics, null, 2)}
Recent Logs: ${projectData.recentLogs.slice(0, 10).map(l => `${l.source}: ${l.action} — ${l.status}`).join(", ")}`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== "text") return [];

    const clean = block.text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (error) {
    console.error("Claude Agentic Insight Error:", error);
    return [];
  }
}

/**
 * NEW — Parse and interpret a SmartPM exported report (PDF text or CSV string).
 * Feed the raw export text in, get structured SQI metrics back.
 */
export async function parseSmartPMExport(rawText: string): Promise<{
  sqi: number | null;
  dcmaMetrics: Record<string, number>;
  summary: string;
}> {
  const prompt = `You are parsing a SmartPM schedule quality report export.

Extract the following from the raw text and return ONLY valid JSON — no markdown:
{
  "sqi": <overall Schedule Quality Index as a number 0-100, or null if not found>,
  "dcmaMetrics": {
    "missingLogic": <percentage or null>,
    "negativeLag": <percentage or null>,
    "highDuration": <percentage or null>,
    "hardConstraints": <percentage or null>,
    "totalFloat": <percentage or null>,
    "criticalPath": <percentage or null>
  },
  "summary": "<2-3 sentence plain English summary of schedule health>"
}

Raw export text:
${rawText.slice(0, 8000)}`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== "text") throw new Error("No text response");

    const clean = block.text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (error) {
    console.error("Claude SmartPM Parse Error:", error);
    return { sqi: null, dcmaMetrics: {}, summary: "Failed to parse SmartPM export." };
  }
}
