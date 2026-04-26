"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { openingLessons } from "@/lib/openings-curriculum";
import { OpeningLesson } from "@/lib/types";

const BoardViewer = dynamic(() => import("@/components/BoardViewer"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: 480,
        height: 480,
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        fontSize: 13,
      }}
    >
      loading board...
    </div>
  ),
});

export default function OpeningsPage() {
  const [selectedLesson, setSelectedLesson] = useState<OpeningLesson>(
    openingLessons[0]
  );
  const [moveIndex, setMoveIndex] = useState(0);

  const totalMoves = selectedLesson.moves.length;

  const selectLesson = useCallback((lesson: OpeningLesson) => {
    setSelectedLesson(lesson);
    setMoveIndex(0);
  }, []);

  const goNext = useCallback(() => {
    setMoveIndex((i) => Math.min(i + 1, totalMoves));
  }, [totalMoves]);

  const goPrev = useCallback(() => {
    setMoveIndex((i) => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev]);

  const currentMove =
    moveIndex > 0 ? selectedLesson.moves[moveIndex - 1] : null;
  const explanation =
    moveIndex === 0 ? selectedLesson.keyIdea : currentMove!.explanation;

  const sanMoves = selectedLesson.moves.slice(0, moveIndex).map((m) => m.san);

  const progressPct = totalMoves > 0 ? (moveIndex / totalMoves) * 100 : 0;
  const isDone = moveIndex === totalMoves;

  const nextLessonIndex = openingLessons.findIndex(
    (l) => l.id === selectedLesson.id
  );
  const nextLesson =
    nextLessonIndex >= 0 && nextLessonIndex < openingLessons.length - 1
      ? openingLessons[nextLessonIndex + 1]
      : null;

  return (
    <div style={styles.root}>
      {/* Left sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>openings</div>
        <ul style={styles.lessonList}>
          {openingLessons.map((lesson) => {
            const isActive = lesson.id === selectedLesson.id;
            return (
              <li
                key={lesson.id}
                style={{
                  ...styles.lessonItem,
                  ...(isActive ? styles.lessonItemActive : {}),
                }}
                onClick={() => selectLesson(lesson)}
              >
                {lesson.name}
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Center: board + move label + explanation */}
      <main style={styles.center}>
        {/* Move label above board */}
        <div style={styles.moveLabel}>
          {moveIndex === 0 ? (
            <span style={styles.moveLabelMuted}>start position</span>
          ) : (
            <>
              <span style={styles.moveLabelNumber}>
                {Math.ceil(moveIndex / 2)}.{moveIndex % 2 === 0 ? ".." : ""}
              </span>
              <span style={styles.moveLabelSan}>{currentMove?.san}</span>
            </>
          )}
        </div>

        {/* Board */}
        <div style={styles.boardWrapper}>
          <BoardViewer
            key={selectedLesson.id}
            moves={sanMoves}
            startIndex={sanMoves.length}
            size={480}
          />
        </div>

        {/* Nav buttons */}
        <div style={styles.navRow}>
          <button
            style={{
              ...styles.navBtn,
              opacity: moveIndex === 0 ? 0.3 : 1,
              cursor: moveIndex === 0 ? "default" : "pointer",
            }}
            onClick={goPrev}
            disabled={moveIndex === 0}
            aria-label="Previous move"
          >
            &#8592;
          </button>
          <span style={styles.navHint}>use arrow keys or buttons</span>
          <button
            style={{
              ...styles.navBtn,
              opacity: isDone ? 0.3 : 1,
              cursor: isDone ? "default" : "pointer",
            }}
            onClick={goNext}
            disabled={isDone}
            aria-label="Next move"
          >
            &#8594;
          </button>
        </div>

        {/* Explanation */}
        <div style={styles.explanationBox}>
          <p style={styles.explanationText}>{explanation}</p>
        </div>
      </main>

      {/* Right panel */}
      <aside style={styles.rightPanel}>
        <div style={styles.lessonTitle}>{selectedLesson.name}</div>
        <div style={styles.keyIdeaLabel}>key idea</div>
        <p style={styles.keyIdeaText}>{selectedLesson.keyIdea}</p>

        <div style={styles.progressSection}>
          <div style={styles.progressLabel}>
            {isDone ? (
              <span style={{ color: "var(--accent)" }}>complete</span>
            ) : (
              <>
                move{" "}
                <span style={{ color: "var(--accent)" }}>{moveIndex}</span> of{" "}
                {totalMoves}
              </>
            )}
          </div>
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progressPct}%`,
              }}
            />
          </div>
        </div>

        {isDone && nextLesson && (
          <button
            style={styles.nextLessonBtn}
            onClick={() => selectLesson(nextLesson)}
          >
            next: {nextLesson.name}
          </button>
        )}

        <div style={styles.divider} />

        <div style={styles.shortcutsLabel}>keyboard shortcuts</div>
        <div style={styles.shortcut}>
          <kbd style={styles.kbd}>&#8592;</kbd>
          <span style={styles.shortcutText}>previous move</span>
        </div>
        <div style={styles.shortcut}>
          <kbd style={styles.kbd}>&#8594;</kbd>
          <span style={styles.shortcutText}>next move</span>
        </div>
      </aside>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    height: "100vh",
    background: "var(--bg)",
    color: "var(--text)",
    overflow: "hidden",
    fontFamily: "inherit",
  },

  /* Sidebar */
  sidebar: {
    width: 240,
    minWidth: 240,
    borderRight: "1px solid var(--border)",
    background: "var(--bg-2)",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
  },
  sidebarHeader: {
    padding: "20px 16px 12px",
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  },
  lessonList: {
    listStyle: "none",
    margin: 0,
    padding: "8px 0",
  },
  lessonItem: {
    padding: "10px 16px",
    fontSize: 13,
    color: "var(--text-muted)",
    cursor: "pointer",
    borderLeft: "2px solid transparent",
    transition: "color 0.15s, background 0.15s",
    lineHeight: 1.4,
  },
  lessonItemActive: {
    color: "var(--text)",
    borderLeftColor: "var(--accent)",
    background: "var(--bg-3)",
  },

  /* Center */
  center: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "32px 24px",
    overflowY: "auto",
    gap: 0,
  },
  moveLabel: {
    height: 40,
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  moveLabelMuted: {
    fontSize: 13,
    color: "var(--text-muted)",
    fontFamily: "monospace",
    letterSpacing: "0.05em",
  },
  moveLabelNumber: {
    fontSize: 22,
    fontFamily: "monospace",
    color: "var(--text-muted)",
  },
  moveLabelSan: {
    fontSize: 28,
    fontFamily: "monospace",
    fontWeight: 600,
    color: "var(--accent)",
    letterSpacing: "-0.01em",
  },
  boardWrapper: {
    lineHeight: 0,
  },
  navRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginTop: 20,
  },
  navBtn: {
    background: "var(--bg-3)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    borderRadius: 4,
    cursor: "pointer",
    transition: "background 0.15s",
  },
  navHint: {
    fontSize: 11,
    color: "var(--text-muted)",
    letterSpacing: "0.04em",
  },
  explanationBox: {
    marginTop: 24,
    maxWidth: 520,
    width: "100%",
    background: "var(--bg-2)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "18px 20px",
  },
  explanationText: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.7,
    color: "var(--text)",
  },

  /* Right panel */
  rightPanel: {
    width: 280,
    minWidth: 280,
    borderLeft: "1px solid var(--border)",
    background: "var(--bg-2)",
    padding: "28px 20px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  lessonTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text)",
    lineHeight: 1.4,
    marginBottom: 14,
  },
  keyIdeaLabel: {
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  },
  keyIdeaText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.65,
    color: "var(--text-muted)",
    marginBottom: 28,
  },
  progressSection: {
    marginBottom: 20,
  },
  progressLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 8,
  },
  progressTrack: {
    height: 3,
    background: "var(--bg-3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "var(--accent)",
    borderRadius: 2,
    transition: "width 0.2s ease",
  },
  nextLessonBtn: {
    width: "100%",
    padding: "10px 14px",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    fontSize: 12,
    cursor: "pointer",
    textAlign: "left",
    fontWeight: 500,
    marginBottom: 8,
    lineHeight: 1.4,
    letterSpacing: "0.01em",
  },
  divider: {
    height: 1,
    background: "var(--border)",
    margin: "20px 0",
  },
  shortcutsLabel: {
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 10,
  },
  shortcut: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  kbd: {
    background: "var(--bg-3)",
    border: "1px solid var(--border)",
    borderRadius: 3,
    padding: "2px 7px",
    fontSize: 12,
    color: "var(--text)",
    fontFamily: "monospace",
  },
  shortcutText: {
    fontSize: 12,
    color: "var(--text-muted)",
  },
};
