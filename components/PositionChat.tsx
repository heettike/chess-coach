"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Chess } from "chess.js";

interface Msg {
  role: "user" | "assistant";
  content: string;       // raw (may contain [FEN:] markers)
  streaming?: boolean;
}

interface Props {
  fen: string;
  playedUci?: string;
  bestUci?: string;
  pattern?: string;
  color?: string;
  moveNum?: number;
  opponent?: string;
  onBoardUpdate?: (fen: string) => void;   // called when Viktor references a position
}

function uciLabel(uci: string): string {
  if (!uci || uci.length < 4) return uci;
  return `${uci.slice(0, 2)}-${uci.slice(2, 4)}`;
}

function movesToFen(movesStr: string): string | null {
  const moves = movesStr.trim().split(/\s+/).filter(Boolean);
  const chess = new Chess();
  for (const m of moves) {
    try { chess.move(m); } catch { break; }
  }
  return chess.fen();
}

// Extract the first [FEN: ...] or [MOVES: ...] from Viktor's response
function extractBoardFen(text: string): string | null {
  const fenMatch = text.match(/\[FEN:\s*([^\]|]+)/);
  if (fenMatch) return fenMatch[1].trim();
  const movesMatch = text.match(/\[MOVES:\s*([^\]|]+)/);
  if (movesMatch) return movesToFen(movesMatch[1].trim());
  return null;
}

// Strip [FEN: ...] and [MOVES: ...] markers from display, replace with a small indicator
function cleanForDisplay(text: string): string {
  return text
    .replace(/\[FEN:[^\]]+\]/g, "↑ board updated")
    .replace(/\[MOVES:[^\]|]+(?:\|[^\]]+)?\]/g, "↑ board updated")
    .trim();
}

// Parse FEN into a plain-English piece list so Viktor knows exactly where things are
function fenToPieceList(fen: string, playerColor: string): string {
  const boardStr = fen.split(" ")[0];
  const ranks = boardStr.split("/");
  const files = "abcdefgh";
  const map: Record<string, string[]> = {};

  ranks.forEach((rank, ri) => {
    const rankNum = 8 - ri;
    let fi = 0;
    for (const ch of rank) {
      if (ch >= "1" && ch <= "8") { fi += parseInt(ch); continue; }
      const sq = files[fi] + rankNum;
      if (!map[ch]) map[ch] = [];
      map[ch].push(sq);
      fi++;
    }
  });

  const names: Record<string, string> = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn" };
  const isWhite = playerColor !== "black";
  const yours = isWhite ? "KQRBNP" : "kqrbnp";
  const theirs = isWhite ? "kqrbnp" : "KQRBNP";

  function describe(keys: string, label: string) {
    const parts: string[] = [];
    for (const k of keys) {
      const sqs = map[k];
      if (sqs?.length) parts.push(`${names[k.toUpperCase()]}${sqs.length > 1 ? "s" : ""} on ${sqs.join(", ")}`);
    }
    return `${label}: ${parts.join("; ") || "none"}`;
  }

  return [describe(yours, "Your pieces"), describe(theirs, "Opponent pieces")].join("\n");
}

// Very simple inline renderer: bold **text** support
function renderText(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : p
  );
}

interface SfLine { rank: number; firstMoveSan: string; eval: string; sanMoves: string[] }
interface SfResult { lines: SfLine[]; depth: number; error?: string }

export function PositionChat({ fen, playedUci, bestUci, pattern, color, moveNum, opponent, onBoardUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sfData, setSfData] = useState<SfResult | null>(null);
  const [sfLoading, setSfLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setMessages([]);
    setInput("");
    setSfData(null);
  }, [fen]);

  // Fetch Stockfish analysis when chat opens
  useEffect(() => {
    if (!open || sfData || sfLoading) return;
    setSfLoading(true);
    fetch(`/api/stockfish?fen=${encodeURIComponent(fen)}`)
      .then((r) => r.json())
      .then((d) => setSfData(d))
      .catch(() => setSfData({ lines: [], depth: 0, error: "unavailable" }))
      .finally(() => setSfLoading(false));
  }, [open, fen, sfData, sfLoading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const buildContext = useCallback(() => {
    const lines: string[] = [
      `FEN: ${fen}`,
      fenToPieceList(fen, color ?? "white"),
    ];
    if (moveNum) lines.push(`Move number: ${moveNum}`);
    if (color) lines.push(`Player was: ${color}`);
    if (opponent) lines.push(`Opponent: ${opponent}`);
    if (pattern) lines.push(`Blunder pattern: ${pattern.replace(/_/g, " ")}`);
    if (playedUci) lines.push(`Played move (the blunder): ${uciLabel(playedUci)}`);
    if (bestUci) lines.push(`Engine best move: ${uciLabel(bestUci)}`);

    // Inject real Stockfish lines — Viktor explains these, never invents his own
    if (sfData?.lines?.length) {
      lines.push(`\n== STOCKFISH ENGINE ANALYSIS (depth ${sfData.depth}) — THIS IS GROUND TRUTH ==`);
      lines.push(`Do NOT calculate independently. Only describe moves from these lines.`);
      sfData.lines.forEach((l) => {
        const moveLine = l.sanMoves.slice(0, 5).join(" ");
        lines.push(`Option ${l.rank}: ${l.firstMoveSan} [${l.eval}]  line: ${moveLine}`);
      });
      lines.push(`Any move NOT in these lines is unverified — do not mention it.`);
    } else {
      lines.push(`\nNo engine data available. Only describe moves you can verify from the piece list. Say "I'm not certain" rather than guessing.`);
    }

    lines.push(`\nKeep answers short and plain. Explain chess terms. Use [FEN: ...] to show positions on the board.`);
    return lines.join("\n");
  }, [fen, moveNum, color, opponent, pattern, playedUci, bestUci, sfData]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setStreaming(true);

    setMessages([...history, { role: "assistant", content: "", streaming: true }]);

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          positionContext: buildContext(),
        }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: full, streaming: true };
          return next;
        });
      }

      // When streaming finishes, check for a board directive and fire callback
      const boardFen = extractBoardFen(full);
      if (boardFen && onBoardUpdate) onBoardUpdate(boardFen);

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: full };
        return next;
      });
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: "Something went wrong." };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming, buildContext, onBoardUpdate, sfData]);

  const patternLabel = pattern ? pattern.replace(/_/g, " ") : null;

  return (
    <div style={{ marginTop: 16 }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            width: "100%",
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "9px 14px",
            color: "var(--text-muted)",
            fontSize: "0.8rem",
            cursor: "pointer",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: "0.75rem" }}>V</span>
          Ask Viktor about this position
        </button>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-2)" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--bg-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>V</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Viktor</span>
              {sfLoading && (
                <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>· fetching engine...</span>
              )}
              {!sfLoading && sfData && !sfData.error && sfData.lines.length > 0 && (
                <span style={{ fontSize: "0.65rem", color: "var(--win)" }}>· engine ready (depth {sfData.depth})</span>
              )}
              {!sfLoading && (!sfData || sfData.error || sfData.lines.length === 0) && (
                <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>— ask about this position</span>
              )}
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.75rem", padding: "2px 6px" }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ maxHeight: 300, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.length === 0 && (
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
                {patternLabel
                  ? <>This is a <strong style={{ color: "var(--text)" }}>{patternLabel}</strong> position. Ask me why the move was wrong, what the best response is, or how to avoid this in future games.</>
                  : "Ask me anything about this position."}
                {onBoardUpdate && <div style={{ marginTop: 6, fontSize: "0.7rem", color: "var(--text-dim)" }}>When I reference a different position, the board on the left will update.</div>}
              </div>
            )}
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              const displayText = isUser ? msg.content : cleanForDisplay(msg.content);
              return (
                <div
                  key={i}
                  style={{
                    alignSelf: isUser ? "flex-end" : "flex-start",
                    maxWidth: "95%",
                    fontSize: "0.8rem",
                    lineHeight: 1.65,
                    background: isUser ? "var(--bg-3)" : "transparent",
                    border: isUser ? "1px solid var(--border)" : "none",
                    borderRadius: 6,
                    padding: isUser ? "6px 10px" : "0",
                  }}
                >
                  {msg.content === "" && msg.streaming ? (
                    <span style={{ color: "var(--text-muted)" }}>...</span>
                  ) : (
                    displayText.split("\n").map((line, li) => {
                      if (line === "↑ board updated") {
                        return (
                          <div key={li} style={{ fontSize: "0.68rem", color: "var(--accent)", margin: "4px 0", fontStyle: "italic" }}>
                            ↑ board updated above
                          </div>
                        );
                      }
                      if (line === "") return <div key={li} style={{ height: "0.4em" }} />;
                      return <div key={li}>{renderText(line)}</div>;
                    })
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border)", display: "flex", gap: 7, alignItems: "flex-end" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
              }}
              placeholder="Why was this move wrong?"
              rows={1}
              style={{ flex: 1, background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", color: "var(--text)", fontSize: "0.78rem", lineHeight: 1.5, resize: "none", outline: "none", fontFamily: "inherit", overflowY: "hidden", transition: "border-color 0.15s" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || streaming}
              style={{ background: !input.trim() || streaming ? "var(--bg-3)" : "var(--accent)", color: !input.trim() || streaming ? "var(--text-muted)" : "#000", border: !input.trim() || streaming ? "1px solid var(--border)" : "none", borderRadius: 6, padding: "6px 12px", fontSize: "0.75rem", fontWeight: 600, cursor: !input.trim() || streaming ? "default" : "pointer", flexShrink: 0, height: 32 }}
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
