/**
 * Copy strings / JSX into your signed-out shell (e.g. App.tsx or LoginView).
 * Remove every occurrence of the default Google AI Studio app title project-wide (grep first).
 */

export const PROJECT_INTEGRITY_COPY = {
  documentTitle: "Project Integrity™ | Exsto Cura Consilium",
  wordmark: "Project Integrity™",
  houseLine: "Exsto Cura Consilium",
  headline: "Project governance",
  subhead: "Automated compliance and risk management — internal workspace.",
  pillars: [
    {
      label: "Schedule & XER intelligence",
      text: "Bring schedule and XER forensics into governance workflows as engagement artifacts are connected in-product.",
    },
    {
      label: "TIA & change-order traceability",
      text: "Keep time-impact and change threads structured so summaries stay traceable to supporting context as methodologies are applied.",
    },
    {
      label: "Audit trail",
      text: "Access is limited to authorized personnel; sensitive actions are logged for internal governance review.",
    },
  ],
  signInNote:
    "Sign in with Google. Access is restricted to authorized personnel.",
  footerLinks: {
    privacy: { label: "Privacy", href: "mailto:mcraig@exstocura.com?subject=Project%20Integrity%20—%20privacy" },
    support: { label: "Support", href: "mailto:mcraig@exstocura.com?subject=Project%20Integrity%20—%20support" },
    site: { label: "exstocura.com", href: "https://exstocura.com/" },
  },
  disclaimer:
    "Internal beta — Exsto Cura Consilium personnel and authorized invitees only. Not a client-facing production commitment.",
} as const;
