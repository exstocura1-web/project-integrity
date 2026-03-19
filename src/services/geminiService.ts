import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function summarizeLogs(logs: any[]) {
  const model = "gemini-3-flash-preview";
  const logText = logs.map(l => `[${l.time}] ${l.source}: ${l.action} - ${l.status} (${l.result})`).join("\n");
  
  const prompt = `Summarize the following project workflow logs. Highlight any failures or critical bottlenecks. Keep it concise and professional.\n\nLogs:\n${logText}`;
  
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Summarization Error:", error);
    return "Failed to summarize logs. Please check your Gemini API key.";
  }
}

export async function analyzeScheduleRisk(tasks: any[], metrics: any) {
  const model = "gemini-3.1-pro-preview";
  const taskText = tasks.map(t => `${t.name}: Start ${t.startDate}, Duration ${t.duration}d, Deps: ${t.dependencies.join(", ")}`).join("\n");
  const metricsText = JSON.stringify(metrics, null, 2);
  
  const prompt = `Perform a schedule risk analysis based on the following tasks and project metrics. Identify the critical path risks and suggest mitigation strategies.\n\nTasks:\n${taskText}\n\nMetrics:\n${metricsText}`;
  
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Risk Analysis Error:", error);
    return "Failed to perform risk analysis. Please check your Gemini API key.";
  }
}
