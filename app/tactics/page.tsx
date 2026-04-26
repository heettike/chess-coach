"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import type { BlunderPosition } from "@/lib/types";
import gameData from "@/public/game_data.json";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false }
);

const allBlunders: BlunderPosition[] = (gameData as { blunder_positions: BlunderPosition[] }).blunder_positions;
const puzzles = allBlunders.filter((b) => b.drop >= 300);

function parseUCI(uci: string): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function toSquareDisplay(uci: string): string {
  if (!uci || uci.length < 4) return uci;
  return uci.slice(2, 4);
}

function getWhyItWorks(drop: number): string {
  if (drop > 800) {
    return "Winning material — this move captures or wins a piece. Material advantage at 1300-1600 level almost always wins.";
  }
  if (drop > 400) {
    return "Tactical shot — forcing sequence that gains significant advantage.";
  }
  return "Strong move that creates threats your opponent cannot handle simultaneously.";
}

export default function TacticsPage() {
  const [index, setIndex] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [answerShown, setAnswerShown] = useState(false);

  const total = puzzles.length;
  const puzzle = puzzles[index];

  const bestMoveSquares = useMemo(() => parseUCI(puzzle?.best_move ?? ""), [puzzle]);

  const customSquareStyles: Record<string, React.CSSProperties> = useMemo(() => {
    if (!answerShown || !bestMoveSquares) return {};
    return {
      [bestMoveSquares.from]: { background: "rgba(74,222,128,0.45)" },
      [bestMoveSquares.to]: { background: "rgba(74,222,128,0.7)" },
    };
  }, [answerShown, bestMoveSquares]);

  const boardOrientation: "white" | "black" = puzzle.color === "white" ? "white" : "black";
  const hintChar = puzzle.best_move?.[0]?.toUpperCase() ?? "?";

  function goTo(n: number) {
    setIndex(Math.max(0, Math.min(total - 1, n)));
    setHintShown(false);
    setAnswerShown(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "32px 24px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: "1.35rem", fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
              Tactics trainer
            </h1>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>
              Positions from your own games — find the winning move
            </p>
          </div>
          <span style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
            Puzzle {index + 1} of {total}
          </span>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "flex", gap: 40, alignItems: "flex-start", flexWrap: "wrap" }}>

          {/* Board */}
          <div style={{ flexShrink: 0 }}>
            <Chessboard
              options={{
                position: puzzle.fen_before,
                boardOrientation,
                boardStyle: { width: 400, height: 400 },
                darkSquareStyle: { backgroundColor: "#b58863" },
                lightSquareStyle: { backgroundColor: "#f0d9b5" },
                squareStyles: customSquareStyles,
                allowDragging: false,
              }}
            />
          </div>

          {/* Right panel */}
          <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Puzzle prompt */}
            <div style={{
              padding: "14px 16px",
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                your puzzle
              </div>
              <div style={{ fontSize: "0.95rem", fontWeight: 500, lineHeight: 1.5 }}>
                Find the best move.{" "}
                <span style={{ color: "var(--accent)" }}>
                  You are playing as {puzzle.color}.
                </span>
              </div>
              <div style={{ marginTop: 10, fontSize: "0.78rem", color: "var(--text-dim)" }}>
                From your game on{" "}
                <span style={{ color: "var(--text-muted)" }}>{puzzle.game_date}</span>
                {" "}vs{" "}
                <strong style={{ color: "var(--text)" }}>{puzzle.opponent}</strong>
              </div>
            </div>

            {/* Hint */}
            {!hintShown && !answerShown && (
              <button
                onClick={() => setHintShown(true)}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  borderRadius: 5,
                  padding: "9px 16px",
                  fontSize: "0.84rem",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                give hint
              </button>
            )}

            {hintShown && !answerShown && (
              <div style={{
                padding: "10px 14px",
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                fontSize: "0.84rem",
                color: "var(--text-muted)",
              }}>
                Starts with{" "}
                <strong style={{ color: "var(--accent)", fontFamily: "monospace" }}>{hintChar}...</strong>
              </div>
            )}

            {/* Show answer */}
            {!answerShown && (
              <button
                onClick={() => setAnswerShown(true)}
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
                show answer
              </button>
            )}

            {/* Answer revealed */}
            {answerShown && (
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
                  <div style={{ fontSize: "0.95rem" }}>
                    Move to{" "}
                    <strong style={{ color: "var(--win)", fontFamily: "monospace" }}>
                      {toSquareDisplay(puzzle.best_move)}
                    </strong>
                    <span style={{ marginLeft: 8, fontSize: "0.78rem", color: "var(--text-dim)", fontFamily: "monospace" }}>
                      ({puzzle.best_move})
                    </span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    eval drop avoided:{" "}
                    <span style={{ color: "var(--win)", fontFamily: "monospace" }}>
                      {puzzle.drop} cp = {(puzzle.drop / 100).toFixed(1)} pawns
                    </span>
                  </div>
                </div>

                <div style={{
                  padding: "12px 14px",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    why this works
                  </div>
                  <div style={{ fontSize: "0.84rem", lineHeight: 1.6, color: "var(--text-muted)" }}>
                    {getWhyItWorks(puzzle.drop)}
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
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
                next puzzle
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
