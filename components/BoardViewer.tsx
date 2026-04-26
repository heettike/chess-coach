"use client";
import { useState, useCallback, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import EvalBar from "./EvalBar";

interface Props {
  moves: string[];
  startIndex?: number;
  showEval?: boolean;
  highlightSquares?: Record<string, React.CSSProperties>;
  onMoveChange?: (index: number, fen: string) => void;
  size?: number;
  orientation?: "white" | "black";
}

export default function BoardViewer({
  moves,
  startIndex = 0,
  showEval = false,
  highlightSquares,
  onMoveChange,
  size = 480,
  orientation = "white",
}: Props) {
  const [index, setIndex] = useState(startIndex);
  const [fens, setFens] = useState<string[]>([]);
  const [cp, setCp] = useState<number | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  useEffect(() => {
    const game = new Chess();
    const list = [game.fen()];
    for (const san of moves) {
      try {
        game.move(san);
        list.push(game.fen());
      } catch {
        break;
      }
    }
    setFens(list);
    setIndex(Math.min(startIndex, list.length - 1));
  }, [moves, startIndex]);

  const currentFen = fens[index] ?? new Chess().fen();

  useEffect(() => {
    if (!showEval || !currentFen) return;
    setEvalLoading(true);
    setCp(null);
    fetch(`/api/eval?fen=${encodeURIComponent(currentFen)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.cp !== undefined) setCp(d.cp);
        else if (d.mate !== undefined) setCp(d.mate > 0 ? 10000 : -10000);
      })
      .catch(() => {})
      .finally(() => setEvalLoading(false));
  }, [currentFen, showEval]);

  useEffect(() => {
    onMoveChange?.(index, currentFen);
  }, [index, currentFen]);

  const go = useCallback(
    (n: number) => setIndex(Math.max(0, Math.min(fens.length - 1, n))),
    [fens.length]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go, index]);

  const moveNum = index;
  const fullMove = Math.ceil(moveNum / 2);
  const isWhiteTurn = moveNum % 2 === 1;

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    background: "var(--bg-3)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    borderRadius: 5,
    padding: "4px 10px",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    fontSize: "0.8rem",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        {showEval && <EvalBar cp={evalLoading ? null : cp} height={size} />}
        <div style={{ width: size, height: size, flexShrink: 0 }}>
          <Chessboard
            options={{
              position: currentFen,
              boardOrientation: orientation,
              boardStyle: { width: size, height: size },
              darkSquareStyle: { backgroundColor: "#b58863" },
              lightSquareStyle: { backgroundColor: "#f0d9b5" },
              squareStyles: highlightSquares ?? {},
              allowDragging: false,
            }}
          />
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={() => go(0)} disabled={index === 0} style={btnStyle(index === 0)}>|&lt;</button>
        <button onClick={() => go(index - 1)} disabled={index === 0} style={btnStyle(index === 0)}>&lt;</button>
        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "monospace", minWidth: 64, textAlign: "center" }}>
          {index === 0 ? "start" : `${fullMove}${isWhiteTurn ? "." : "..."}`}
        </span>
        <button onClick={() => go(index + 1)} disabled={index >= fens.length - 1} style={btnStyle(index >= fens.length - 1)}>&gt;</button>
        <button onClick={() => go(fens.length - 1)} disabled={index >= fens.length - 1} style={btnStyle(index >= fens.length - 1)}>&gt;|</button>
        <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginLeft: "auto" }}>← →</span>
      </div>

      {/* Move list */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 3,
        maxHeight: 80, overflowY: "auto",
        padding: 8, background: "var(--bg-3)",
        borderRadius: 6, border: "1px solid var(--border)",
      }}>
        {moves.map((san, i) => {
          const isW = i % 2 === 0;
          const fn = Math.floor(i / 2) + 1;
          const active = index === i + 1;
          return (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              {isW && <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontFamily: "monospace" }}>{fn}.</span>}
              <button
                onClick={() => go(i + 1)}
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#000" : "var(--text-muted)",
                  border: "none", borderRadius: 3,
                  padding: "1px 4px", fontSize: "0.8rem",
                  fontFamily: "monospace", cursor: "pointer",
                }}
              >
                {san}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
