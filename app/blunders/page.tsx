"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import gameDataRaw from "@/public/game_data.json";
import { PositionChat } from "@/components/PositionChat";
import { explainResult } from "@/lib/evalText";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => (
      <div style={{ width: 420, height: 420, background: "var(--bg-3)", borderRadius: 6 }} />
    ),
  }
);

const gd = gameDataRaw as any;
const blunders: any[] = gd.blunder_positions ?? [];
const patternSummary: any[] = gd.pattern_summary ?? [];

type View = "patterns" | "drill";

function parseUCI(uci: string) {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

// ── Pattern view ──────────────────────────────────────────────

function PatternCard({
  group,
  onDrill,
}: {
  group: any;
  onDrill: (examples: any[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((x) => !x)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          color: "var(--text)",
        }}
      >
        <span
          style={{
            fontFamily: "monospace",
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "var(--accent)",
            minWidth: 44,
          }}
        >
          {group.count}x
        </span>
        <span style={{ fontSize: "0.95rem", fontWeight: 500, flex: 1 }}>{group.label}</span>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            {group.advice}
          </p>
          <button
            onClick={() => onDrill(group.examples ?? [])}
            style={{
              alignSelf: "flex-start",
              background: "var(--accent)",
              color: "#000",
              border: "none",
              borderRadius: 5,
              padding: "7px 14px",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Drill these positions
          </button>
        </div>
      )}
    </div>
  );
}

// ── Drill view ────────────────────────────────────────────────

function DrillView({ pool, onBack }: { pool: any[]; onBack: () => void }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [overrideFen, setOverrideFen] = useState<string | null>(null);

  const total = pool.length;
  const blunder = pool[index];

  const playedArrow = parseUCI(blunder.played_uci ?? "");
  const bestArrow = parseUCI(blunder.best_uci ?? "");

  // When Viktor references a position, show it on the board and clear arrows
  const viktorFen = overrideFen;
  const boardFen = viktorFen ?? blunder.fen_before;

  const arrows = useMemo(() => {
    if (viktorFen) return []; // Viktor's position — no arrows
    const a: { startSquare: string; endSquare: string; color: string }[] = [];
    if (playedArrow) a.push({ startSquare: playedArrow.from, endSquare: playedArrow.to, color: "rgba(239,68,68,0.9)" });
    if (revealed && bestArrow) a.push({ startSquare: bestArrow.from, endSquare: bestArrow.to, color: "rgba(74,222,128,0.9)" });
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, index, viktorFen]);

  function goTo(n: number) {
    setIndex(Math.max(0, Math.min(total - 1, n)));
    setRevealed(false);
    setOverrideFen(null);
  }

  const advice =
    PATTERN_ADVICE_MAP[blunder.pattern as string] ??
    "Study the position — find what you missed and why the green move is better.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onBack}
          style={{
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
            borderRadius: 5,
            padding: "5px 10px",
            fontSize: "0.8rem",
            cursor: "pointer",
          }}
        >
          ← patterns
        </button>
        <span
          style={{
            fontSize: "0.8rem",
            color: "var(--text-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {index + 1} / {total}
        </span>
      </div>

      {/* Main layout */}
      <div style={{ display: "flex", gap: 36, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Board */}
        <div style={{ flexShrink: 0 }}>
          <Chessboard
            options={{
              position: boardFen,
              boardOrientation: blunder.color === "white" ? "white" : "black",
              boardStyle: { width: 420, height: 420 },
              darkSquareStyle: { backgroundColor: "#b58863" },
              lightSquareStyle: { backgroundColor: "#f0d9b5" },
              arrows,
              allowDragging: false,
            }}
          />
          <div style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {viktorFen ? (
              <>
                <span style={{ color: "var(--accent)" }}>Viktor&apos;s position</span>
                <button onClick={() => setOverrideFen(null)} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "0.68rem", cursor: "pointer", textDecoration: "underline", padding: 0 }}>reset</button>
              </>
            ) : revealed
              ? "red = your move  ·  green = best move"
              : `red = your move  ·  move ${blunder.move_num} · ${blunder.color}`}
          </div>
        </div>

        {/* Info panel */}
        <div
          style={{
            flex: 1,
            minWidth: 240,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* Context */}
          <div
            style={{
              padding: "12px 14px",
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              context
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
              {blunder.game_date}
              {blunder.opponent && (
                <>
                  {" "}· vs{" "}
                  <strong style={{ color: "var(--text)" }}>{blunder.opponent}</strong>
                </>
              )}
            </div>
            <div style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--text-muted)" }}>
              move {blunder.move_num} · playing as {blunder.color}
            </div>
          </div>

          {/* CTA or reveal */}
          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              style={{
                background: "var(--accent)",
                color: "#000",
                border: "none",
                borderRadius: 6,
                padding: "11px 18px",
                fontSize: "0.88rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              What's the best move? →
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Plain-English result */}
              {(() => {
                const r = explainResult(blunder);
                return (
                  <div style={{ padding: "12px 14px", background: "var(--bg-2)", border: `1px solid var(--border)`, borderRadius: 6 }}>
                    <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: r.severityColor, marginBottom: 10 }}>
                      {r.severityLabel}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        Before: <span style={{ color: "var(--text)" }}>{r.before}</span>
                      </div>
                      <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        After: <span style={{ color: r.severityColor, fontWeight: 500 }}>{r.after}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Advice */}
              <div
                style={{
                  padding: "12px 14px",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: "0.84rem",
                  lineHeight: 1.65,
                  color: "var(--text-muted)",
                }}
              >
                {advice}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              style={{
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                color: "var(--text-muted)",
                padding: "8px 14px",
                fontSize: "0.82rem",
                cursor: index === 0 ? "default" : "pointer",
                opacity: index === 0 ? 0.4 : 1,
              }}
            >
              previous
            </button>
            <button
              onClick={() => goTo(index + 1)}
              disabled={index >= total - 1}
              style={{
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                color: "var(--text-muted)",
                padding: "8px 14px",
                fontSize: "0.82rem",
                cursor: index >= total - 1 ? "default" : "pointer",
                opacity: index >= total - 1 ? 0.4 : 1,
              }}
            >
              next
            </button>
            <button
              onClick={() => {
                setIndex(Math.floor(Math.random() * total));
                setRevealed(false);
              }}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 5,
                color: "var(--text-muted)",
                padding: "8px 14px",
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              random
            </button>
          </div>

          {/* Viktor chat */}
          <PositionChat
            fen={blunder.fen_before}
            playedUci={blunder.played_uci}
            bestUci={blunder.best_uci}
            pattern={blunder.pattern}
            color={blunder.color}
            moveNum={blunder.move_num}
            opponent={blunder.opponent}
            onBoardUpdate={setOverrideFen}
          />
        </div>
      </div>
    </div>
  );
}

const PATTERN_ADVICE_MAP: Record<string, string> = {
  missed_checkmate:
    "You had checkmate and didn't see it. Always ask: can I give check? Follow every check to see if it forces mate.",
  missed_fork:
    "One move attacked two pieces at once. Green arrow shows the forking square. Train yourself to scan knight and queen squares that hit multiple targets.",
  missed_capture:
    "A piece was free to take and you moved elsewhere. Before every move: does my opponent have a hanging piece?",
  hanging_piece:
    "After your move, one of your pieces had no defender. Always verify: can my opponent take what I just moved?",
  walked_into_fork:
    "Your move placed two of your pieces on squares that could be forked. Check if your destination lets the opponent attack two pieces at once.",
  walked_into_pin:
    "You moved into a pin or skewer — your piece got stuck defending a more valuable piece behind it. Scan the diagonals and files for long-range attackers.",
  back_rank:
    "Back rank weakness. Your king had no escape square. After castling, always create a pawn escape hatch (h3 or g3).",
  missed_check:
    "A forcing check was available that leads to a big advantage. Checks limit your opponent — always calculate them first.",
  positional:
    "A quiet positional error. Study what the best move accomplishes — improved piece activity, pawn structure, or king safety.",
};

// ── Page ──────────────────────────────────────────────────────

export default function BlundersPage() {
  const [view, setView] = useState<View>("patterns");
  const [drillPool, setDrillPool] = useState<any[]>([]);

  function startDrill(pool: any[]) {
    setDrillPool(pool);
    setView("drill");
  }

  function drillAll() {
    startDrill([...blunders].sort(() => Math.random() - 0.5));
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        padding: "32px 24px",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "1.35rem",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                margin: 0,
              }}
            >
              Blunder review
            </h1>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>
              {blunders.length} quality blunders from positions you weren&apos;t already losing
            </p>
          </div>
          {view === "patterns" && (
            <button
              onClick={drillAll}
              style={{
                background: "var(--accent)",
                color: "#000",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Drill all →
            </button>
          )}
        </div>

        {view === "patterns" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {patternSummary.length > 0 ? (
              patternSummary.map((group: any) => (
                <PatternCard key={group.pattern} group={group} onDrill={startDrill} />
              ))
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                Pattern data not yet generated. Run{" "}
                <code
                  style={{
                    fontFamily: "monospace",
                    background: "var(--bg-3)",
                    padding: "2px 6px",
                    borderRadius: 3,
                  }}
                >
                  python3 scripts/update_games.py
                </code>{" "}
                to analyze your games.
              </p>
            )}
          </div>
        )}

        {view === "drill" && drillPool.length > 0 && (
          <DrillView pool={drillPool} onBack={() => setView("patterns")} />
        )}
      </div>
    </div>
  );
}
