"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface Props {
  fen: string;
  playedUci?: string;
  bestUci?: string;
  pattern?: string;
  evalBefore?: string;
  evalAfter?: string;
  color?: string;
  moveNum?: number;
  opponent?: string;
  onBoardUpdate?: (fen: string) => void;
}

interface ExplainResult {
  viktorMessage: string;
  bestMoveSan: string;
  engineLine: string[];
  engineEval: string;
  depth: number;
  structuredContext: string;
}

// Strip any [FEN:] / [MOVES:] markers — Viktor in position mode must not output them
function cleanForDisplay(text: string): string {
  return text
    .replace(/\[FEN:[^\]]+\]/g, "")
    .replace(/\[MOVES:[^\]]+\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

export function PositionChat({ fen, playedUci, bestUci, pattern, evalBefore, evalAfter, color, moveNum, opponent, onBoardUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [explainData, setExplainData] = useState<ExplainResult | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setMessages([]);
    setInput("");
    setExplainData(null);
  }, [fen]);

  // Pre-fetch position explanation on mount — Viktor's first message is ready before user opens chat
  useEffect(() => {
    if (explainData || explainLoading) return;
    setExplainLoading(true);
    fetch("/api/position-explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, playedUci, bestUci, pattern, evalBefore, evalAfter, color }),
    })
      .then((r) => r.json())
      .then((d: ExplainResult) => {
        setExplainData(d);
        // Immediately show Viktor's pre-built first message (no Claude call)
        if (d.viktorMessage) {
          setMessages([{ role: "assistant", content: d.viktorMessage }]);
        }
      })
      .catch(() => setExplainData(null))
      .finally(() => setExplainLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

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
          positionContext: explainData?.structuredContext ?? null,
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
  }, [messages, streaming, explainData]);

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
              {explainLoading && (
                <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>· analyzing...</span>
              )}
              {!explainLoading && explainData && (
                <span style={{ fontSize: "0.65rem", color: "var(--win)" }}>· Stockfish depth {explainData.depth}</span>
              )}
              {!explainLoading && !explainData && (
                <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>· ask about this position</span>
              )}
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.75rem", padding: "2px 6px" }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ maxHeight: 300, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.length === 0 && (
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
                {explainLoading ? "Analyzing position..." : "Ask me anything about this position."}
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
