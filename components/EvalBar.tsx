"use client";

interface Props {
  cp: number | null; // centipawns, from white's perspective
  height?: number;
}

export default function EvalBar({ cp, height = 400 }: Props) {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  let whitePercent = 50;
  if (cp !== null) {
    // Convert cp to percentage (sigmoid-like)
    const pawns = cp / 100;
    whitePercent = 50 + (50 * pawns) / (Math.abs(pawns) + 3);
    whitePercent = clamp(whitePercent, 5, 95);
  }

  const blackPercent = 100 - whitePercent;

  const label = cp === null ? "?" : cp > 0 ? `+${(cp / 100).toFixed(1)}` : (cp / 100).toFixed(1);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        style={{
          width: 16,
          height,
          borderRadius: 4,
          overflow: "hidden",
          border: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: blackPercent, background: "#1a1a1a" }} />
        <div style={{ flex: whitePercent, background: "#e8e8e8" }} />
      </div>
      <span style={{ fontSize: "0.625rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
        {label}
      </span>
    </div>
  );
}
