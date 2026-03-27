type SummarizeResponse = { summary: string };
type AnalyzeRiskResponse = { analysis: string };

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

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

