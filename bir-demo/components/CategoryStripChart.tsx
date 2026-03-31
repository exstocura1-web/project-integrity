"use client";

/** Simple horizontal strip chart — SVG, no deps. */
export function CategoryStripChart({
  items,
  title,
}: {
  items: { label: string; value: number }[];
  title: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const w = 360;
  const rowH = 28;
  const h = items.length * rowH + 36;

  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ fontWeight: 600, marginBottom: "0.75rem", color: "var(--chalk)" }}>{title}</figcaption>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title}>
        {items.map((it, i) => {
          const y = 32 + i * rowH;
          const bw = Math.round((it.value / max) * (w - 120));
          return (
            <g key={it.label}>
              <text x={0} y={y + 14} fill="var(--muted)" fontSize={11}>
                {it.label.length > 18 ? `${it.label.slice(0, 17)}…` : it.label}
              </text>
              <rect
                x={110}
                y={y}
                width={bw}
                height={18}
                rx={4}
                fill="rgba(201,169,110,0.35)"
                stroke="var(--gold)"
                strokeWidth={1}
              />
              <text x={110 + bw + 6} y={y + 14} fill="var(--chalk)" fontSize={11}>
                {it.value}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
