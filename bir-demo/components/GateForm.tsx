"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "1.75rem",
  maxWidth: 420,
  margin: "0 auto",
};

export function GateForm() {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (!res.ok) {
        setError("Access denied. Check your demo key.");
        return;
      }
      router.push("/upload");
      router.refresh();
    } catch {
      setError("Could not reach server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form style={card} onSubmit={onSubmit}>
      <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--chalk)", fontWeight: 600 }}>
        Demo access key
      </label>
      <input
        type="password"
        autoComplete="off"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="Enter key provided by Exsto"
        style={{
          width: "100%",
          padding: "0.65rem 0.75rem",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--ink)",
          color: "var(--chalk)",
          marginBottom: "1rem",
        }}
      />
      {error ? (
        <p style={{ color: "var(--fail)", fontSize: 14, marginBottom: "0.75rem" }}>{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={busy || !passphrase.trim()}
        style={{
          width: "100%",
          padding: "0.75rem 1rem",
          borderRadius: 8,
          border: "none",
          background: "var(--gold)",
          color: "var(--ink)",
          fontWeight: 700,
          opacity: busy || !passphrase.trim() ? 0.55 : 1,
        }}
      >
        {busy ? "Checking…" : "Enter demo"}
      </button>
      <p style={{ marginTop: "1rem", fontSize: 13, color: "var(--muted)", marginBottom: 0 }}>
        Development default key: <code>bir-demo</code> if <code>DEMO_ACCESS_KEY</code> is unset.
      </p>
    </form>
  );
}
