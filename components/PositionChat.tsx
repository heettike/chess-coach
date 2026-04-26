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
  color?: string;
  moveNum?: number;
  opponent?: string;
}

function uciToSan(uci: string): string {
  if (!uci || uci.length < 4) return uci;
  return `${uci.slice(0, 2)}-${uci.slice(2, 4)}`;
}

export function PositionChat({ fen, playedUci, bestUci, pattern, color, moveNum, opponent }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset chat when position changes
  useEffect(() => {
    setMessages([]);
    setInput("");
  }, [fen]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const buildPositionContext = useCallback(() => {
    const lines: string[] = [`FEN: ${fen}`];
    if (moveNum) lines.push(`Move number: ${moveNum}`);
    if (color) lines.push(`Player was: ${color}`);
    if (opponent) lines.push(`Opponent: ${opponent}`);
    if (pattern) lines.push(`Blunder pattern: ${pattern.replace(/_/g, " ")}`);
    if (playedUci) lines.push(`Played move (the blunder): ${uciToSan(playedUci)}`);
    if (bestUci) lines.push(`Engine best move: ${uciToSan(bestUci)}`);
    return lines.join("\n");
  }, [fen, moveNum, color, opponent, pattern, playedUci, bestUci]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setStreaming(true);

    const placeholder: Msg = { role: "assistant", content: "", streaming: true };
    setMessages([...history, placeholder]);

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          positionContext: buildPositionContext(),
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
  }, [messages, streaming, buildPositionContext]);

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
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.color = "var(--text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: "0.75rem" }}>V</span>
          Ask Viktor about this position
        </button>
      ) : (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            background: "var(--bg-2)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span
                style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: "var(--bg-2)", border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.65rem", fontWeight: 700, color: "var(--accent)", flexShrink: 0,
                }}
              >
                V
              </span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Viktor</span>
              <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>— ask about this position</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: "var(--text-muted)",
                cursor: "pointer", fontSize: "0.75rem", padding: "2px 6px",
              }}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              maxHeight: 260,
              overflowY: "auto",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {messages.length === 0 && (
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                {pattern
                  ? `This is a <strong>${pattern.replace(/_/g, " ")}</strong> position. Ask me why the played move was wrong, what makes the best move correct, or anything else about this position.`
                  : "Ask me anything about this position — why a move was played, what the best plan is, or how to avoid this mistake."}
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "90%",
                  fontSize: "0.8rem",
                  lineHeight: 1.6,
                  color: msg.role === "user" ? "var(--text)" : "var(--text)",
                  background: msg.role === "user" ? "var(--bg-3)" : "transparent",
                  border: msg.role === "user" ? "1px solid var(--border)" : "none",
                  borderRadius: 6,
                  padding: msg.role === "user" ? "6px 10px" : "0",
                }}
              >
                {msg.content === "" && msg.streaming ? (
                  <span style={{ color: "var(--text-muted)" }}>...</span>
                ) : (
                  msg.content
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: "8px 10px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: 7,
              alignItems: "flex-end",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Why was this move wrong?"
              rows={1}
              style={{
                flex: 1,
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 10px",
                color: "var(--text)",
                fontSize: "0.78rem",
                lineHeight: 1.5,
                resize: "none",
                outline: "none",
                fontFamily: "inherit",
                overflowY: "hidden",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || streaming}
              style={{
                background: !input.trim() || streaming ? "var(--bg-3)" : "var(--accent)",
                color: !input.trim() || streaming ? "var(--text-muted)" : "#000",
                border: !input.trim() || streaming ? "1px solid var(--border)" : "none",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: !input.trim() || streaming ? "default" : "pointer",
                flexShrink: 0,
                height: 32,
              }}
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
