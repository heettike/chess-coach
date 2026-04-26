"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import type { BlunderPosition } from "@/lib/types";
import gameData from "@/public/game_data.json";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false }
);

const blunders: BlunderPosition[] = (gameData as { blunder_positions: BlunderPosition[] }).blunder_positions;

function getExplanation(drop: number): string {
  if (drop > 500) {
    return "This is a losing blunder — you gave up a major piece or worse. Always check if your piece is hanging before moving.";
  }
  if (drop > 200) {
    return "Significant mistake. You missed a tactical threat. Before every move, ask: what does my opponent threaten?";
  }
  return "Positional error. You gave up an advantage. These are harder to see — focus on piece activity and king safety.";
}

function parseUCI(uci: string): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export default function BlundersPage() {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const total = blunders.length;
  const blunder = blunders[index];

  const bestMoveSquares = useMemo(() => parseUCI(blunder?.best_move ?? ""), [blunder]);
  const blunderSquares = useMemo(() => parseUCI(blunder?.best_move ?? ""), [blunder]);

  const customSquareStyles: Record<string, React.CSSProperties> = useMemo(() => {
    if (!revealed) return {};
    const styles: Record<string, React.CSSProperties> = {};
    if (blunderSquares) {
      // The player's blunder destination — red tint
      styles[blunderSquares.to] = { background: "rgba(248,113,113,0.55)" };
    }
    if (bestMoveSquares) {
      styles[bestMoveSquares.from] = { background: "rgba(74,222,128,0.45)" };
      styles[bestMoveSquares.to] = { background: "rgba(74,222,128,0.7)" };
    }
    return styles;
  }, [revealed, blunderSquares, bestMoveSquares]);

  const currentFen = revealed ? blunder.fen_after : blunder.fen_before;
  const boardOrientation: "white" | "black" = blunder.color === "white" ? "white" : "black";

  function goTo(n: number) {
    setIndex(Math.max(0, Math.min(total - 1, n)));
    setRevealed(false);
  }

  function skipRandom() {
    const rand = Math.floor(Math.random() * total);
    setIndex(rand);
    setRevealed(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "32px 24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: "1.35rem", fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
              Blunder review
            </h1>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>
              Your actual blunders, one at a time
            </p>
          </div>
          <span style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
            Blunder {index + 1} of {total}
          </span>
        </div>

        {/* Main content */}
        <div style={{ display: "flex", gap: 40, alignItems: "flex-start", flexWrap: "wrap" }}>

          {/* Board */}
          <div style={{ flexShrink: 0 }}>
            <Chessboard
              options={{
                position: currentFen,
                boardOrientation,
                boardStyle: { width: 420, height: 420 },
                darkSquareStyle: { backgroundColor: "#b58863" },
                lightSquareStyle: { backgroundColor: "#f0d9b5" },
                squareStyles: customSquareStyles,
                allowDragging: false,
              }}
            />
          </div>

          {/* Info panel */}
          <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Context */}
            <div style={{
              padding: "12px 14px",
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                context
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Move {blunder.move_num} &middot; {blunder.game_date} vs <strong style={{ color: "var(--text)" }}>{blunder.opponent}</strong>
              </div>
              <div style={{ marginTop: 8, fontSize: "0.9rem" }}>
                You played:{" "}
                <strong style={{ color: "var(--loss)", fontFamily: "monospace" }}>{blunder.san}</strong>
              </div>
            </div>

            {/* Show best move button */}
            {!revealed && (
              <button
                onClick={() => setRevealed(true)}
                style={{
                  background: "var(--accent)",
                  color: "#0a0a0a",
                  border: "none",
                  borderRadius: 6,
                  padding: "11px 18px",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: "-0.01em",
                }}
              >
                Show best move
              </button>
            )}

            {/* Revealed section */}
            {revealed && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{
                  padding: "12px 14px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    best move
                  </div>
                  <div style={{ fontSize: "0.9rem" }}>
                    <strong style={{ color: "var(--win)", fontFamily: "monospace" }}>{blunder.best_move}</strong>
                  </div>
                  <div style={{ marginTop: 6, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    eval drop:{" "}
                    <span style={{ color: "var(--loss)", fontFamily: "monospace" }}>
                      {blunder.drop} cp = {(blunder.drop / 100).toFixed(1)} pawns
                    </span>
                  </div>
                </div>

                <div style={{
                  padding: "12px 14px",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: "0.84rem",
                  lineHeight: 1.6,
                  color: "var(--text-muted)",
                }}>
                  {getExplanation(blunder.drop)}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <button
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                style={{
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  color: index === 0 ? "var(--text-dim)" : "var(--text-muted)",
                  borderRadius: 5,
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
                  color: index >= total - 1 ? "var(--text-dim)" : "var(--text-muted)",
                  borderRadius: 5,
                  padding: "8px 14px",
                  fontSize: "0.82rem",
                  cursor: index >= total - 1 ? "default" : "pointer",
                  opacity: index >= total - 1 ? 0.4 : 1,
                }}
              >
                next blunder
              </button>
              <button
                onClick={skipRandom}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--text-dim)",
                  borderRadius: 5,
                  padding: "8px 14px",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                }}
              >
                skip to random
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
