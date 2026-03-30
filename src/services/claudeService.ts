type SummarizeResponse = { summary: string };
type AnalyzeRiskResponse = { analysis: string };
type BirResponse = { analysis: string; model: string; methodology: string };
type TriageResponse = { report: string; model: string; methodology: string };
type PortfolioResponse = { engagements: any[]; generatedAt?: string; note?: string };

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  ""
).replace(/\/$/, "");

function apiUrl(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let details = "";
    try {
      details = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`Request failed (${res.status}): ${details || res.statusText}`);
  }

  return (await res.json()) as T;
}

/**
 * Browser-safe wrapper that forwards to the server route.
 * Server route: POST /api/ai/summarize
 */
export async function summarizeLogs(logs: any[]): Promise<string> {
  try {
    const data = await postJson<SummarizeResponse>("/api/ai/summarize", { logs });
    return data.summary || "No summary generated.";
  } catch (error) {
    console.error("Claude Log Summarization Error:", error);
    return "Failed to summarize logs. Please check your Anthropic API key.";
  }
}

/**
 * Browser-safe wrapper that forwards to the server route.
 * Server route: POST /api/ai/analyze-risk
 */
export async function analyzeScheduleRisk(tasks: any[], metrics: any): Promise<string> {
  try {
    const data = await postJson<AnalyzeRiskResponse>("/api/ai/analyze-risk", { tasks, metrics });
    return data.analysis || "No analysis generated.";
  } catch (error) {
    console.error("Claude Risk Analysis Error:", error);
    return "Failed to perform risk analysis. Please check your Anthropic API key.";
  }
}

/** GET /api/portfolio/summary — all client/project engagements with schedule health. */
export async function fetchPortfolioEngagements(): Promise<PortfolioResponse> {
  const res = await fetch(apiUrl("/api/portfolio/summary"), { credentials: "include" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Portfolio request failed (${res.status}): ${t || res.statusText}`);
  }
  return (await res.json()) as PortfolioResponse;
}

/** POST /api/ai/bir — BIR™ analysis from Firestore XER snapshot (uses claude-sonnet-4-20250514 on server). */
export async function runBirAnalysis(params: {
  clientId: string;
  projectId: string;
  clientContext?: string;
}): Promise<BirResponse> {
  return postJson<BirResponse>("/api/ai/bir", params);
}

/** POST /api/ai/triage-impact-report — TRIAGE-IMPACT™ TIA-style Markdown report. */
export async function runTriageImpactReport(body: {
  projectName: string;
  scheduleFacts: Record<string, unknown>;
  impactingEvents: Array<{ description: string; date?: string; source?: string }>;
  ownerNarrative?: string;
  reliefSought?: string;
  analysisWindow?: { start?: string; end?: string };
}): Promise<TriageResponse> {
  return postJson<TriageResponse>("/api/ai/triage-impact-report", body);
}

