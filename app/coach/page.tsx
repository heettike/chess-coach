"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import gameDataRaw from "@/public/game_data.json";
import type { GameData } from "@/lib/types";

const gameData = gameDataRaw as GameData;

const totalGames = gameData.total_games;
const winRate = gameData.overall.win_rate;
const whiteWR = gameData.color_stats.white.win_rate;
const blackWR = gameData.color_stats.black.win_rate;

// Dynamically import Chessboard to avoid SSR issues
const Chessboard = dynamic(
  () => import("react-chessboard").then((mod) => mod.Chessboard),
  { ssr: false }
);

const INITIAL_MESSAGE =
  `I've analyzed all ${totalGames} of your chess.com games. Your win rate is ${winRate}% — consistent, which means this is a skill ceiling, not variance. The White vs Black gap (${whiteWR}% vs ${blackWR}%) is your clearest leak. [MOVES: e4 e5 Nf3 Nc6 Bc4 Nd4] — this is the Blackburne-Shilling Gambit. You've walked into this 314 times. Let's fix the Italian Game first.`;

const SUGGESTED_QUESTIONS = [
  "Why is my win rate as Black so much lower?",
  "What's wrong with my Italian Game?",
  "Show me the correct Ruy Lopez setup",
  "What are the 3 things I should work on most to reach 2000?",
];

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

// Parse [FEN: ...] or [MOVES: ...] from Viktor's response (for side board updates)
function parseBoardDirective(text: string): { type: "fen"; value: string } | { type: "moves"; value: string[] } | null {
  const fenMatch = text.match(/\[FEN:\s*([^\]]+)\]/);
  if (fenMatch) return { type: "fen", value: fenMatch[1].trim() };

  const movesMatch = text.match(/\[MOVES:\s*([^\]]+)\]/);
  if (movesMatch) {
    const moves = movesMatch[1].trim().split(/\s+/).filter(Boolean);
    return { type: "moves", value: moves };
  }

  return null;
}

// Convert a move sequence string → FEN via chess.js
function movesToFen(movesStr: string): string | null {
  const moves = movesStr.trim().split(/\s+/).filter(Boolean);
  const chess = new Chess();
  for (const m of moves) {
    try { chess.move(m); } catch { break; }
  }
  return chess.fen();
}

// Split a message into alternating text/board segments for inline rendering
// Supports: [MOVES: e4 e5 | PLAYED: e2e4 | BEST: d2d4] for guess-the-move boards
type MsgSegment =
  | { kind: "text"; content: string }
  | { kind: "board"; fen: string; label: string; playedUci?: string; bestUci?: string };

function parseUciArrow(uci: string | undefined): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function parseSegments(text: string): MsgSegment[] {
  const segs: MsgSegment[] = [];
  // Match [MOVES: ...] or [FEN: ...], optionally with | PLAYED: uci | BEST: uci
  const re = /\[MOVES:\s*([^\]|]+)(?:\|\s*PLAYED:\s*([a-h][1-8][a-h][1-8][qrbn]?))?(?:\|\s*BEST:\s*([a-h][1-8][a-h][1-8][qrbn]?))?\]|\[FEN:\s*([^\]|]+)(?:\|\s*PLAYED:\s*([a-h][1-8][a-h][1-8][qrbn]?))?(?:\|\s*BEST:\s*([a-h][1-8][a-h][1-8][qrbn]?))?\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      segs.push({ kind: "text", content: text.slice(last, match.index) });
    }
    const movesStr = match[1];
    const playedUci1 = match[2];
    const bestUci1 = match[3];
    const fenStr = match[4];
    const playedUci2 = match[5];
    const bestUci2 = match[6];
    if (movesStr) {
      const fen = movesToFen(movesStr.trim());
      if (fen) segs.push({ kind: "board", fen, label: movesStr.trim(), playedUci: playedUci1, bestUci: bestUci1 });
    } else if (fenStr) {
      segs.push({ kind: "board", fen: fenStr.trim(), label: "", playedUci: playedUci2, bestUci: bestUci2 });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) segs.push({ kind: "text", content: text.slice(last) });
  return segs;
}

function renderTextBlock(text: string): React.ReactNode[] {
  const lines = text.replace(/\n{3,}/g, "\n\n").split("\n");
  return lines.map((line, i) => {
    const isList = line.match(/^[-*]\s+(.*)$/);
    if (isList) {
      return (
        <div key={i} style={{ display: "flex", gap: 8, marginTop: 2, marginBottom: 2 }}>
          <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }}>·</span>
          <span>{renderInline(isList[1])}</span>
        </div>
      );
    }
    if (line === "") return <div key={i} style={{ height: "0.5em" }} />;
    return <div key={i}>{renderInline(line)}</div>;
  });
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} style={{ fontFamily: "'SF Mono', 'Menlo', monospace", fontSize: "0.88em", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px", color: "var(--accent-light)" }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

// Apply initial message board directive on load
function getInitialBoardState(): { moves: string[]; fen: string | null } {
  const directive = parseBoardDirective(INITIAL_MESSAGE);
  if (!directive) return { moves: [], fen: null };
  if (directive.type === "moves") return { moves: directive.value, fen: null };
  if (directive.type === "fen") return { moves: [], fen: directive.value };
  return { moves: [], fen: null };
}

const initialBoardState = getInitialBoardState();

export default function CoachPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: INITIAL_MESSAGE },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Board state
  const [boardMoves, setBoardMoves] = useState<string[]>(initialBoardState.moves);
  const [boardIndex, setBoardIndex] = useState(initialBoardState.moves.length);
  const [manualFen, setManualFen] = useState<string | null>(initialBoardState.fen);
  const [fenInput, setFenInput] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const lineHeight = 24;
    const maxHeight = lineHeight * 4 + 16;
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px";
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  // Current FEN derived from moves or manual override
  const currentFen = useMemo(() => {
    if (manualFen && boardMoves.length === 0) return manualFen;
    const chess = new Chess();
    const movesToApply = boardMoves.slice(0, boardIndex);
    for (const m of movesToApply) {
      try { chess.move(m); } catch { break; }
    }
    return chess.fen();
  }, [boardMoves, boardIndex, manualFen]);

  // Move labels for the move list
  const moveLabels = useMemo(() => {
    const chess = new Chess();
    const labels: string[] = [];
    for (const m of boardMoves) {
      try {
        const result = chess.move(m);
        labels.push(result.san);
      } catch {
        break;
      }
    }
    return labels;
  }, [boardMoves]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "ArrowLeft") {
        setBoardIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        setBoardIndex((i) => Math.min(boardMoves.length, i + 1));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [boardMoves.length]);

  const applyBoardDirective = useCallback(
    (directive: { type: "fen"; value: string } | { type: "moves"; value: string[] }) => {
      if (directive.type === "moves") {
        setBoardMoves(directive.value);
        setBoardIndex(directive.value.length);
        setManualFen(null);
      } else {
        setManualFen(directive.value);
        setBoardMoves([]);
        setBoardIndex(0);
      }
    },
    []
  );

  const handleFenInput = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;

      // Try as FEN first: FEN strings contain "/" characters
      if (trimmed.includes("/")) {
        try {
          const chess = new Chess(trimmed);
          setManualFen(chess.fen());
          setBoardMoves([]);
          setBoardIndex(0);
          setFenInput("");
          return;
        } catch {}
      }

      // Otherwise treat as move sequence
      const moves = trimmed.split(/\s+/).filter(Boolean);
      const chess = new Chess();
      const validMoves: string[] = [];
      for (const m of moves) {
        try {
          chess.move(m);
          validMoves.push(m);
        } catch {
          break;
        }
      }
      if (validMoves.length > 0) {
        setBoardMoves(validMoves);
        setBoardIndex(validMoves.length);
        setManualFen(null);
        setFenInput("");
      }
    },
    []
  );

  const resetBoard = useCallback(() => {
    setBoardMoves([]);
    setBoardIndex(0);
    setManualFen(null);
    setFenInput("");
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      const userMessage: Message = { role: "user", content: content.trim() };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setInput("");
      setIsStreaming(true);

      const assistantMessage: Message = {
        role: "assistant",
        content: "",
        streaming: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      try {
        const apiMessages = updatedMessages.map(({ role, content }) => ({
          role,
          content,
        }));

        const res = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
        });

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let text = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value);
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              role: "assistant",
              content: text,
              streaming: true,
            };
            return next;
          });
        }

        // Stream complete — parse for board directives
        const directive = parseBoardDirective(text);
        if (directive) {
          applyBoardDirective(directive);
        }

        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: text };
          return next;
        });
      } catch {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: "Something went wrong. Try again.",
          };
          return next;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [messages, isStreaming, applyBoardDirective]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleChipClick = (question: string) => {
    sendMessage(question);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        overflow: "hidden",
      }}
    >
      {/* Left panel — player context */}
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          overflowY: "auto",
          padding: "28px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Profile */}
        <div>
          <SectionLabel>Your profile</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <StatRow label="Total games" value={totalGames.toLocaleString()} />
            <StatRow label="Overall win rate" value={`${winRate}%`} />
            <StatRow label="Win rate as White" value={`${whiteWR}%`} valueColor="var(--win)" />
            <StatRow
              label="Win rate as Black"
              value={`${blackWR}%`}
              valueColor={blackWR < whiteWR ? "var(--loss)" : "var(--win)"}
            />
          </div>
        </div>

        {/* Weak spots */}
        <div>
          <SectionLabel>Weak spots</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {gameData.weak_openings.map((opening, i) => (
              <div
                key={i}
                style={{
                  padding: "9px 11px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                }}
              >
                <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 2, color: "var(--text)" }}>
                  {opening.opening}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--loss)", marginBottom: 2 }}>
                  {opening.win_rate}% WR over {opening.games} games
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  {opening.issue}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Suggested questions */}
        <div>
          <SectionLabel>Suggested questions</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {SUGGESTED_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => handleChipClick(q)}
                disabled={isStreaming}
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "8px 11px",
                  color: "var(--text-muted)",
                  fontSize: "0.75rem",
                  textAlign: "left",
                  cursor: isStreaming ? "default" : "pointer",
                  lineHeight: 1.5,
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isStreaming) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Center — board */}
      <div
        style={{
          width: 420,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Board header */}
        <div
          style={{
            padding: "16px 20px 14px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-dim)" }}>
            Live Board
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {/* Chessboard */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <Chessboard
              options={{
                position: currentFen,
                boardStyle: { width: 380, height: 380 },
                darkSquareStyle: { backgroundColor: "#b58863" },
                lightSquareStyle: { backgroundColor: "#f0d9b5" },
                allowDragging: false,
                showAnimations: true,
                animationDurationInMs: 150,
              }}
            />
          </div>

          {/* Navigation controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
              justifyContent: "center",
            }}
          >
            <NavButton
              onClick={() => setBoardIndex(0)}
              disabled={boardIndex === 0}
              title="Start"
            >
              {"<<"}
            </NavButton>
            <NavButton
              onClick={() => setBoardIndex((i) => Math.max(0, i - 1))}
              disabled={boardIndex === 0}
              title="Previous (←)"
            >
              {"<"}
            </NavButton>
            <span style={{ fontSize: "0.75rem", color: "var(--text-dim)", minWidth: 60, textAlign: "center" }}>
              {boardIndex} / {boardMoves.length}
            </span>
            <NavButton
              onClick={() => setBoardIndex((i) => Math.min(boardMoves.length, i + 1))}
              disabled={boardIndex === boardMoves.length}
              title="Next (→)"
            >
              {">"}
            </NavButton>
            <NavButton
              onClick={() => setBoardIndex(boardMoves.length)}
              disabled={boardIndex === boardMoves.length}
              title="End"
            >
              {">>"}
            </NavButton>
            <button
              onClick={resetBoard}
              style={{
                marginLeft: 4,
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 5,
                padding: "4px 10px",
                color: "var(--text-dim)",
                fontSize: "0.72rem",
                cursor: "pointer",
                transition: "border-color 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)";
              }}
            >
              Reset
            </button>
          </div>

          {/* Move list */}
          {moveLabels.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 8 }}>
                Moves
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {moveLabels.map((label, i) => {
                  const moveNum = Math.floor(i / 2) + 1;
                  const isWhiteMove = i % 2 === 0;
                  const isCurrentPos = boardIndex === i + 1;
                  return (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                      {isWhiteMove && (
                        <span style={{ fontSize: "0.68rem", color: "var(--text-dim)", marginRight: 1 }}>
                          {moveNum}.
                        </span>
                      )}
                      <button
                        onClick={() => setBoardIndex(i + 1)}
                        style={{
                          background: isCurrentPos ? "var(--accent)" : "var(--bg-2)",
                          border: `1px solid ${isCurrentPos ? "var(--accent)" : "var(--border)"}`,
                          borderRadius: 4,
                          padding: "2px 7px",
                          color: isCurrentPos ? "#000" : "var(--text-muted)",
                          fontSize: "0.75rem",
                          fontFamily: "'SF Mono', 'Menlo', monospace",
                          cursor: "pointer",
                          transition: "background 0.1s, color 0.1s",
                          fontWeight: isCurrentPos ? 700 : 400,
                        }}
                        onMouseEnter={(e) => {
                          if (!isCurrentPos) {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
                            (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isCurrentPos) {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
                          }
                        }}
                      >
                        {label}
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* FEN / moves input */}
          <div>
            <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 8 }}>
              Enter FEN or moves
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              <input
                value={fenInput}
                onChange={(e) => setFenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleFenInput(fenInput);
                  }
                }}
                placeholder="e4 e5 Nf3 Nc6  or  paste FEN..."
                style={{
                  flex: 1,
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "7px 11px",
                  color: "var(--text)",
                  fontSize: "0.75rem",
                  fontFamily: "'SF Mono', 'Menlo', monospace",
                  outline: "none",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
              />
              <button
                onClick={() => handleFenInput(fenInput)}
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "7px 13px",
                  color: "var(--text-muted)",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
                }}
              >
                Set
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right — chat */}
      <main
        style={{
          flex: 1,
          minWidth: 320,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.82rem",
              fontWeight: 700,
              color: "var(--accent)",
              flexShrink: 0,
            }}
          >
            V
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>Viktor</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              Chess coach — {totalGames.toLocaleString()} games analyzed
            </div>
          </div>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              message={msg}
              onBoardExpand={(fen, movesLabel) => {
                // If the label looks like a move sequence (no "/" = not a FEN), replay it
                if (movesLabel && !movesLabel.includes("/")) {
                  const moves = movesLabel.split(/\s+/).filter(Boolean);
                  setBoardMoves(moves);
                  setBoardIndex(moves.length);
                  setManualFen(null);
                } else {
                  setManualFen(fen);
                  setBoardMoves([]);
                  setBoardIndex(0);
                }
              }}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: "14px 24px 20px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Viktor anything..."
              rows={1}
              style={{
                flex: 1,
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "10px 13px",
                color: "var(--text)",
                fontSize: "0.86rem",
                lineHeight: "1.5",
                resize: "none",
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color 0.15s",
                overflowY: "auto",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              style={{
                background: !input.trim() || isStreaming ? "var(--bg-3)" : "var(--accent)",
                color: !input.trim() || isStreaming ? "var(--text-dim)" : "#000",
                border: !input.trim() || isStreaming ? "1px solid var(--border)" : "none",
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: !input.trim() || isStreaming ? "default" : "pointer",
                transition: "background 0.15s, color 0.15s",
                flexShrink: 0,
                height: 40,
              }}
            >
              Send
            </button>
          </div>
          <div style={{ marginTop: 7, fontSize: "0.68rem", color: "var(--text-dim)" }}>
            Enter to send — Shift+Enter for newline — arrow keys navigate board
          </div>
        </div>
      </main>
    </div>
  );
}

// ---- Sub-components ----

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.68rem",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--text-dim)",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: valueColor ?? "var(--text)" }}>{value}</span>
    </div>
  );
}

function NavButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        borderRadius: 5,
        width: 30,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: disabled ? "var(--text-dim)" : "var(--text-muted)",
        fontSize: "0.78rem",
        fontFamily: "'SF Mono', 'Menlo', monospace",
        cursor: disabled ? "default" : "pointer",
        transition: "border-color 0.12s, color 0.12s",
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
        }
      }}
    >
      {children}
    </button>
  );
}

function InlineBoard({
  fen,
  label,
  playedUci,
  bestUci,
  onExpand,
}: {
  fen: string;
  label: string;
  playedUci?: string;
  bestUci?: string;
  onExpand: (fen: string, moves: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const hasGuess = !!(playedUci || bestUci);

  const playedArrow = parseUciArrow(playedUci);
  const bestArrow = parseUciArrow(bestUci);

  const arrows = useMemo(() => {
    const a: { startSquare: string; endSquare: string; color: string }[] = [];
    if (playedArrow)
      a.push({ startSquare: playedArrow.from, endSquare: playedArrow.to, color: "rgba(239,68,68,0.9)" });
    if (revealed && bestArrow)
      a.push({ startSquare: bestArrow.from, endSquare: bestArrow.to, color: "rgba(74,222,128,0.9)" });
    return a;
  }, [revealed, playedArrow, bestArrow]);

  return (
    <div
      style={{
        margin: "10px 0",
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
        display: "inline-flex",
        flexDirection: "column",
        background: "var(--bg-2)",
      }}
    >
      <Chessboard
        options={{
          position: fen,
          boardStyle: { width: 300, height: 300 },
          darkSquareStyle: { backgroundColor: "#b58863" },
          lightSquareStyle: { backgroundColor: "#f0d9b5" },
          allowDragging: false,
          showAnimations: false,
          arrows: arrows.length > 0 ? arrows : undefined,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderTop: "1px solid var(--border)",
          gap: 8,
        }}
      >
        {hasGuess ? (
          revealed ? (
            <span style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>
              red = played · green = best
            </span>
          ) : (
            <button
              onClick={() => setRevealed(true)}
              style={{
                background: "var(--accent)",
                color: "#000",
                border: "none",
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: "0.72rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              What&apos;s the best move? →
            </button>
          )
        ) : (
          label && (
            <span style={{ fontFamily: "monospace", fontSize: "0.68rem", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {label}
            </span>
          )
        )}
        <button
          onClick={() => onExpand(fen, label)}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "3px 8px",
            fontSize: "0.68rem",
            color: "var(--text-muted)",
            cursor: "pointer",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          expand →
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ message, onBoardExpand }: { message: Message; onBoardExpand: (fen: string, moves: string) => void }) {
  const isUser = message.role === "user";
  const isStreaming = message.streaming;
  const isEmpty = message.content === "" && isStreaming;

  const segments = useMemo(() => {
    if (isUser || isEmpty) return null;
    return parseSegments(message.content);
  }, [message.content, isUser, isEmpty]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        maxWidth: isUser ? "82%" : "100%",
        alignSelf: isUser ? "flex-end" : "flex-start",
      }}
    >
      {!isUser && (
        <div style={{ fontSize: "0.72rem", color: "var(--accent)", fontWeight: 600, marginBottom: 4 }}>
          Viktor
        </div>
      )}
      <div
        style={{
          padding: isUser ? "10px 13px" : "2px 0",
          background: isUser ? "var(--bg-3)" : "transparent",
          border: isUser ? "1px solid var(--border)" : "none",
          borderRadius: isUser ? 8 : 0,
          fontSize: "0.86rem",
          lineHeight: 1.7,
          color: "var(--text)",
        }}
      >
        {isEmpty ? (
          <span style={{ color: "var(--text-muted)" }}>...</span>
        ) : isUser ? (
          message.content
        ) : segments ? (
          segments.map((seg, i) =>
            seg.kind === "text" ? (
              <div key={i}>{renderTextBlock(seg.content)}</div>
            ) : (
              <InlineBoard key={i} fen={seg.fen} label={seg.label} playedUci={seg.playedUci} bestUci={seg.bestUci} onExpand={onBoardExpand} />
            )
          )
        ) : null}
      </div>
    </div>
  );
}
