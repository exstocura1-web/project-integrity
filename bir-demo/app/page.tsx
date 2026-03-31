import { LayoutShell } from "@/components/LayoutShell";
import { GateForm } from "@/components/GateForm";

export default function Home() {
  return (
    <LayoutShell>
      <div style={{ maxWidth: 720, margin: "0 auto 2rem" }}>
        <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", marginBottom: "0.5rem" }}>
          Bid Schedule Intelligence Review™
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "1.05rem", marginTop: 0 }}>
          Client demo: upload a bidder / baseline schedule extract, get a fast pre-award integrity screen — logic
          density, float posture, constraint proxy, and milestone gating heuristics.
        </p>
      </div>
      <GateForm />
      <section style={{ maxWidth: 720, margin: "2.5rem auto 0", fontSize: 14, color: "var(--muted)" }}>
        <h2 style={{ color: "var(--chalk)", fontSize: "1.05rem" }}>How this works</h2>
        <ol style={{ paddingLeft: "1.25rem", lineHeight: 1.6 }}>
          <li>Enter the demo key you received from Exsto Cura Consilium.</li>
          <li>Upload an <code>.xer</code> (Primavera) or <code>.csv</code> export — use anonymized sample data only.</li>
          <li>
            The service shallow-parses the file, runs a <strong>BIR™</strong> subset, and returns a scored dashboard you
            can show in a live review.
          </li>
        </ol>
        <p style={{ marginBottom: 0 }}>
          Output is <strong>illustrative</strong>. Formal owner IMS position, CO / TIA work, and TRIAGE-IMPACT™
          alignment are outside this demo.
        </p>
      </section>
    </LayoutShell>
  );
}
