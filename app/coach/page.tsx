"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import gameDataRaw from "@/public/game_data.json";
import type { GameData } from "@/lib/types";

const gameData = gameDataRaw as GameData;

const totalGames = gameData.total_games;
const winRate = gameData.overall.win_rate;
const whiteWR = gameData.color_stats.white.win_rate;
const blackWR = gameData.color_stats.black.win_rate;

const INITIAL_MESSAGE =
  `I've analyzed all ${totalGames} of your chess.com games. Your win rate sits at ${winRate}% — consistent across blitz and rapid, which tells me this isn't variance, it's a skill ceiling. The gap between White and Black (${whiteWR}% vs ${blackWR}%) is your clearest leak. What do you want to work on first?`;

const SUGGESTED_QUESTIONS = [
  "Why is my win rate as Black so much lower?",
  "What's wrong with my Italian Game?",
  "Teach me how to handle the King's fianchetto better",
  "What are the 3 things I should work on most to reach 2000?",
];

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isList = line.match(/^[-*]\s+(.*)$/);

    if (isList) {
      nodes.push(
        <div key={i} style={{ display: "flex", gap: 8, marginTop: 2, marginBottom: 2 }}>
          <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }}>·</span>
          <span>{renderInline(isList[1])}</span>
        </div>
      );
    } else if (line === "") {
      nodes.push(<div key={i} style={{ height: "0.6em" }} />);
    } else {
      nodes.push(<div key={i}>{renderInline(line)}</div>);
    }
  }

  return nodes;
}

function renderInline(text: string): React.ReactNode {
  // bold: **text**
  // code: `text`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          style={{
            fontFamily: "'SF Mono', 'Fira Code', 'Menlo', monospace",
            fontSize: "0.88em",
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "1px 5px",
            color: "var(--accent-light)",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export default function CoachPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: INITIAL_MESSAGE },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

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

        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: text };
          return next;
        });
      } catch (err) {
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
    [messages, isStreaming]
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
      {/* Left panel */}
      <aside
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          overflowY: "auto",
          padding: "28px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        {/* Profile section */}
        <div>
          <div
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              marginBottom: 14,
            }}
          >
            Your profile
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <StatRow label="Total games" value={totalGames.toLocaleString()} />
            <StatRow label="Overall win rate" value={`${winRate}%`} />
            <StatRow
              label="Win rate as White"
              value={`${whiteWR}%`}
              valueColor="var(--win)"
            />
            <StatRow
              label="Win rate as Black"
              value={`${blackWR}%`}
              valueColor={blackWR < whiteWR ? "var(--loss)" : "var(--win)"}
            />
          </div>
        </div>

        {/* Weak spots */}
        <div>
          <div
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              marginBottom: 14,
            }}
          >
            Weak spots
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {gameData.weak_openings.map((opening, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 12px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: 3,
                    color: "var(--text)",
                  }}
                >
                  {opening.opening}
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--loss)",
                    marginBottom: 3,
                  }}
                >
                  {opening.win_rate}% WR over {opening.games} games
                </div>
                <div style={{ fontSize: "0.73rem", color: "var(--text-muted)" }}>
                  {opening.issue}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Suggested questions */}
        <div>
          <div
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              marginBottom: 14,
            }}
          >
            Suggested questions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SUGGESTED_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => handleChipClick(q)}
                disabled={isStreaming}
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "9px 12px",
                  color: "var(--text-muted)",
                  fontSize: "0.78rem",
                  textAlign: "left",
                  cursor: isStreaming ? "default" : "pointer",
                  lineHeight: 1.5,
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isStreaming) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "var(--accent)";
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "var(--text)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "var(--border)";
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "var(--text-muted)";
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Right: chat area */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 28px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.85rem",
              fontWeight: 700,
              color: "var(--accent)",
            }}
          >
            V
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>Viktor</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              Chess coach — {totalGames.toLocaleString()} games analyzed
            </div>
          </div>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxHeight: "calc(100vh - 200px)",
          }}
        >
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: "16px 28px 24px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
            }}
          >
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
                padding: "10px 14px",
                color: "var(--text)",
                fontSize: "0.88rem",
                lineHeight: "1.5",
                resize: "none",
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color 0.15s",
                overflowY: "auto",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              style={{
                background:
                  !input.trim() || isStreaming
                    ? "var(--bg-3)"
                    : "var(--accent)",
                color: !input.trim() || isStreaming ? "var(--text-dim)" : "#000",
                border:
                  !input.trim() || isStreaming
                    ? "1px solid var(--border)"
                    : "none",
                borderRadius: 8,
                padding: "10px 18px",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor:
                  !input.trim() || isStreaming ? "default" : "pointer",
                transition: "background 0.15s, color 0.15s",
                flexShrink: 0,
                height: 42,
              }}
            >
              Send
            </button>
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: "0.7rem",
              color: "var(--text-dim)",
            }}
          >
            Enter to send — Shift+Enter for newline
          </div>
        </div>
      </main>
    </div>
  );
}

function StatRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "7px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: "0.82rem",
          fontWeight: 600,
          color: valueColor ?? "var(--text)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isStreaming = message.streaming;
  const isEmpty = message.content === "" && isStreaming;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        maxWidth: "80%",
        alignSelf: isUser ? "flex-end" : "flex-start",
      }}
    >
      {!isUser && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--accent)",
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Viktor
        </div>
      )}
      <div
        style={{
          padding: isUser ? "10px 14px" : "2px 0",
          background: isUser ? "var(--bg-3)" : "transparent",
          border: isUser ? "1px solid var(--border)" : "none",
          borderRadius: isUser ? 8 : 0,
          fontSize: "0.88rem",
          lineHeight: 1.7,
          color: "var(--text)",
        }}
      >
        {isEmpty ? (
          <span style={{ color: "var(--text-muted)" }}>...</span>
        ) : isUser ? (
          message.content
        ) : (
          renderMarkdown(message.content)
        )}
      </div>
    </div>
  );
}
