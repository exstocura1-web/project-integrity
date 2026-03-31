"use client";

import Link from "next/link";
import type { BirFindings } from "@/lib/bir/types";
import { CategoryStripChart } from "./CategoryStripChart";

function statusColor(s: string) {
  if (s === "pass") return "var(--pass)";
  if (s === "warn") return "var(--warn)";
  return "var(--fail)";
}

const grid: React.CSSProperties = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

export function ResultsDashboard({
  runId,
  fileName,
  findings,
}: {
  runId: string;
  fileName?: string;
  findings: BirFindings;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>BIR™ readiness view</h1>
          <p style={{ color: "var(--muted)", margin: "0.35rem 0 0", fontSize: 14 }}>
            Run <code>{runId}</code>
            {fileName ? (
              <>
                {" "}
                · <strong>{fileName}</strong>
              </>
            ) : null}{" "}
            · scenario: <strong>{findings.scenario}</strong>
          </p>
        </div>
        <Link
          href="/upload"
          style={{
            display: "inline-block",
            padding: "0.5rem 1rem",
            borderRadius: 8,
            border: "1px solid var(--gold)",
            color: "var(--gold)",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Another schedule
        </Link>
      </div>

      <section
        style={{
          background: "linear-gradient(135deg, var(--surface) 0%, #181612 100%)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "1.75rem",
          marginBottom: "1.5rem",
        }}
      >
        <p style={{ margin: 0, fontSize: 14, color: "var(--gold)", fontWeight: 600 }}>Overall score</p>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "3.25rem",
            margin: "0.25rem 0",
            color: "var(--chalk)",
          }}
        >
          {findings.overallScore}
          <span style={{ fontSize: "1.25rem", color: "var(--muted)" }}>/100</span>
        </p>
        <p style={{ margin: 0, color: "var(--muted)", maxWidth: 640 }}>
          Pre-award screen only: combines logic density, float posture, constraint proxy, and milestone gating
          heuristics on this extract — not a substitute for full forensic review or TRIAGE-IMPACT™.
        </p>
      </section>

      <h2 style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>Category scores</h2>
      <div style={{ ...grid, marginBottom: "2rem" }}>
        {findings.categoryScores.map((c) => (
          <div
            key={c.id}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1rem",
              background: "var(--surface)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ color: "var(--chalk)" }}>{c.label}</strong>
              <span style={{ color: statusColor(c.status), fontWeight: 700, fontSize: 14 }}>{c.status.toUpperCase()}</span>
            </div>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "2rem",
                margin: "0.35rem 0",
                color: "var(--chalk)",
              }}
            >
              {c.score}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{c.detail}</p>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gap: "1.5rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          marginBottom: "2rem",
        }}
      >
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.25rem" }}>
          <CategoryStripChart title="Issue tilt (100 − category score)" items={findings.chartIssueByCategory} />
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.25rem" }}>
          <CategoryStripChart title="Float band mix (heuristic)" items={findings.chartFloatBands} />
        </div>
      </div>

      <h2 style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>Headline findings</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem" }}>
        {findings.keyFindings.map((f) => (
          <li
            key={f.id}
            style={{
              borderLeft: `3px solid ${statusColor(f.severity)}`,
              paddingLeft: "1rem",
              marginBottom: "1rem",
              borderBottom: "1px solid var(--border)",
              paddingBottom: "1rem",
            }}
          >
            <strong style={{ color: "var(--chalk)" }}>{f.title}</strong>
            <span style={{ marginLeft: "0.5rem", fontSize: 12, color: statusColor(f.severity) }}>
              {f.severity}
            </span>
            <p style={{ margin: "0.35rem 0", color: "var(--chalk)" }}>{f.description}</p>
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
              <span style={{ color: "var(--gold)" }}>Commercial: </span>
              {f.commercialImpact}
            </p>
          </li>
        ))}
      </ul>

      <h2 style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>Recommendations</h2>
      <ol style={{ color: "var(--muted)", paddingLeft: "1.25rem" }}>
        {findings.recommendations.map((r, i) => (
          <li key={i} style={{ marginBottom: "0.5rem" }}>
            {r}
          </li>
        ))}
      </ol>

      <section style={{ marginTop: "2rem", fontSize: 14, color: "var(--muted)" }}>
        <h3 style={{ color: "var(--chalk)", fontSize: "1rem" }}>Methodology</h3>
        <p>
          This URL runs a <strong>BIR™</strong> demo-weighted ruleset on a shallow parse of your upload. Production BIR™
          works with native XER forensics, logic tracing, and owner evaluation narratives aligned to your IMS.
        </p>
      </section>
    </div>
  );
}
