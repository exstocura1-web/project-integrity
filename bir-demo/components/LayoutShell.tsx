import type { ReactNode } from "react";

const shell: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
};

const main: React.CSSProperties = {
  flex: 1,
  width: "100%",
  maxWidth: 1100,
  margin: "0 auto",
  padding: "2rem 1.25rem 3rem",
};

const header: React.CSSProperties = {
  borderBottom: "1px solid var(--border)",
  background: "linear-gradient(180deg, #12100c 0%, var(--ink) 100%)",
};

const headerInner: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "1rem 1.25rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
};

const brand: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const footer: React.CSSProperties = {
  marginTop: "auto",
  borderTop: "1px solid var(--border)",
  padding: "1rem 1.25rem",
  fontSize: 13,
  color: "var(--muted)",
  textAlign: "center" as const,
};

export function LayoutShell({
  children,
  rightSlot,
}: {
  children: ReactNode;
  rightSlot?: ReactNode;
}) {
  return (
    <div style={shell}>
      <header style={header}>
        <div style={headerInner}>
          <div style={brand}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.35rem",
                color: "var(--chalk)",
                letterSpacing: "0.04em",
              }}
            >
              Exsto Cura Consilium
            </span>
            <span style={{ fontSize: 13, color: "var(--gold)", fontWeight: 600 }}>
              BIR™ — Bid Schedule Intelligence Review (demo)
            </span>
          </div>
          {rightSlot ?? null}
        </div>
      </header>
      <main style={main}>{children}</main>
      <footer style={footer}>
        Illustration only — not formal advisory output. Do not upload sensitive or client-confidential data.
        Methodology: BIR™. © Exsto Cura Consilium.
      </footer>
    </div>
  );
}
