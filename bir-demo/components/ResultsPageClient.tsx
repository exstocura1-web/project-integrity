"use client";

import { useEffect, useState } from "react";
import type { BirFindings } from "@/lib/bir/types";
import { LayoutShell } from "./LayoutShell";
import { ResultsDashboard } from "./ResultsDashboard";
import Link from "next/link";

type Loaded = {
  findings: BirFindings;
  fileName?: string;
};

export function ResultsPageClient({ runId }: { runId: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cacheKey = `bir_demo_${runId}`;
    const raw = typeof window !== "undefined" ? sessionStorage.getItem(cacheKey) : null;
    if (raw) {
      try {
        setData(JSON.parse(raw) as Loaded);
        return;
      } catch {
        /* fall through */
      }
    }
    (async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok) {
          if (res.status === 503) {
            setError(
              "This run is not in server storage. Upload again in this browser session, or configure Firebase.",
            );
            return;
          }
          setError("Run not found.");
          return;
        }
        const json = (await res.json()) as { findings?: BirFindings; fileName?: string };
        if (json.findings) {
          setData({ findings: json.findings, fileName: json.fileName });
        } else {
          setError("Invalid response.");
        }
      } catch {
        setError("Could not load run.");
      }
    })();
  }, [runId]);

  if (error) {
    return (
      <LayoutShell>
        <p style={{ color: "var(--fail)" }}>{error}</p>
        <p style={{ marginTop: "1rem" }}>
          <Link href="/upload" style={{ color: "var(--gold)" }}>
            Back to upload
          </Link>
        </p>
      </LayoutShell>
    );
  }

  if (!data) {
    return (
      <LayoutShell>
        <p style={{ color: "var(--muted)" }}>Loading results…</p>
      </LayoutShell>
    );
  }

  return (
    <LayoutShell>
      <ResultsDashboard runId={runId} fileName={data.fileName} findings={data.findings} />
    </LayoutShell>
  );
}
