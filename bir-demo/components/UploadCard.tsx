"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "1.75rem",
};

export function UploadCard() {
  const router = useRouter();
  const [scenario, setScenario] = useState<"baseline" | "current" | "other">("current");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setMsg("Select an .xer or .csv file.");
      return;
    }
    setMsg(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("scenario", scenario);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = (await res.json()) as {
        runId?: string;
        findings?: unknown;
        error?: string;
        persisted?: boolean;
      };
      if (!res.ok) {
        setMsg(data.error || "Upload failed.");
        return;
      }
      if (data.runId && data.findings) {
        sessionStorage.setItem(
          `bir_demo_${data.runId}`,
          JSON.stringify({
            findings: data.findings,
            fileName: file.name,
            persisted: data.persisted,
          }),
        );
        router.push(`/results/${data.runId}`);
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form style={card} onSubmit={onSubmit}>
      <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Upload schedule</h2>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
        Primavera <strong>.xer</strong> or tabular <strong>.csv</strong> export. Demo parse — use
        non-sensitive sample data only.
      </p>

      <label style={{ display: "block", marginBottom: "0.35rem", fontWeight: 600 }}>Scenario tag</label>
      <select
        value={scenario}
        onChange={(e) => setScenario(e.target.value as typeof scenario)}
        style={{
          width: "100%",
          maxWidth: 320,
          padding: "0.5rem",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--ink)",
          color: "var(--chalk)",
          marginBottom: "1.25rem",
        }}
      >
        <option value="current">Current / update</option>
        <option value="baseline">Baseline / bid</option>
        <option value="other">Other (generic)</option>
      </select>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${drag ? "var(--gold)" : "var(--border)"}`,
          borderRadius: 12,
          padding: "2rem 1rem",
          textAlign: "center",
          background: drag ? "rgba(201,169,110,0.06)" : "transparent",
          marginBottom: "1rem",
        }}
      >
        <p style={{ margin: "0 0 0.75rem", color: "var(--chalk)" }}>Drag & drop here, or choose file</p>
        <input
          type="file"
          accept=".xer,.csv,application/octet-stream,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <p style={{ marginTop: "0.75rem", fontSize: 14, color: "var(--muted)" }}>
            Selected: <strong>{file.name}</strong> ({Math.round(file.size / 1024)} KB)
          </p>
        ) : null}
      </div>

      {msg ? <p style={{ color: "var(--fail)", marginBottom: "0.75rem" }}>{msg}</p> : null}

      <button
        type="submit"
        disabled={busy || !file}
        style={{
          padding: "0.75rem 1.5rem",
          borderRadius: 8,
          border: "none",
          background: "var(--gold)",
          color: "var(--ink)",
          fontWeight: 700,
        }}
      >
        {busy ? "Running BIR™…" : "Run BIR™ scan"}
      </button>
    </form>
  );
}
