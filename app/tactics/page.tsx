"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import gameDataRaw from "@/public/game_data.json";

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
const blunderPositions: any[] = gd.blunder_positions ?? [];
const patternSummaryRaw: any[] = gd.pattern_summary ?? [];

const STORAGE_KEY = "chess-curriculum-v1";

// ── Pattern metadata ──────────────────────────────────────────

interface PatternMeta {
  label: string;
  concept: string;
  why: string;
  howToSpot: string;
  drill: string;
  commonMistake: string;
}

const PATTERN_META: Record<string, PatternMeta> = {
  hanging_piece: {
    label: "Hanging pieces",
    concept: "A hanging piece has no defender — it can be taken for free. This is the single most common way club players lose material. Every piece on the board should either be defended or actively threatening something.",
    why: "At 1300–1600, over 40% of decisive material swings come from one side simply leaving a piece undefended. You're not losing because your strategy is bad — you're losing because you're giving things away.",
    howToSpot: "After your opponent moves, before you reply: scan every one of their pieces. Is anything undefended? Now scan your own pieces: after your intended move, does anything become undefended? This 10-second habit eliminates the pattern.",
    drill: "In each drill position, find the hanging piece before clicking reveal. The answer is always 'take the free piece.'",
    commonMistake: "Players see the free piece but calculate a 'better' move. Almost always wrong. Take what's free.",
  },
  missed_fork: {
    label: "Missed forks",
    concept: "A fork is one piece attacking two enemy pieces simultaneously. The opponent can only save one — you win the other. Knights are the best forking pieces because their L-shaped movement hits squares no other piece covers. Queens, bishops, and even pawns fork too.",
    why: "Forks are pattern-recognition problems. You don't 'calculate' them — you see them. Once you've trained the patterns, they become automatic. Until then, your brain filters them out as noise.",
    howToSpot: "Look for squares where one piece attacks two targets at once. For knights: find any two enemy pieces and ask 'is there a square that would hit both?' For pawns: two side-by-side enemy pieces are always fork targets.",
    drill: "Before revealing: find the forking square. The green arrow shows the destination. The key is recognising the target pattern, not calculating.",
    commonMistake: "Looking at one target at a time. Train yourself to scan for PAIRS of pieces that can be hit simultaneously.",
  },
  walked_into_fork: {
    label: "Walked into forks",
    concept: "You moved a piece to a square that created a fork opportunity for your opponent. Both your pieces were suddenly attackable by a single enemy piece, and you lost one. This is a failure of pattern recognition BEFORE moving — you need to check if your intended position enables a fork.",
    why: "This is the defensive side of fork awareness. It's not enough to find forks for yourself — you must also see when you're about to hand one to your opponent.",
    howToSpot: "Before moving, ask: after I move here, what knight squares, diagonal attacks, or pawn advances could hit TWO of my pieces at once? Especially watch for enemy knights near the center — they have the most forking range.",
    drill: "The position shows the moment BEFORE you walked into the fork. Identify what you should have played instead.",
    commonMistake: "Only thinking about attack, not defence. The check 'does my move create a fork against me' takes 3 seconds and costs nothing.",
  },
  missed_checkmate: {
    label: "Missed checkmate",
    concept: "Checkmate ends the game instantly. A forced mate, even in 2–3 moves, is worth more than any material advantage. When you have checks available, follow each one to see if it forces mate before evaluating other moves.",
    why: "Missed mates are almost always missed because players stop calculating after seeing a good (but not best) move. The brain says 'I'm winning' and stops. Train yourself to check: can I FORCE mate?",
    howToSpot: "Count forcing moves first: checks, captures, then threats. For each check: is the king trapped? Does the opponent have only one reply? Does your next check also leave only one reply? Two or three of these in a row = forced mate.",
    drill: "Find the mating sequence before revealing. Usually 1–3 moves. The king is trapped — find the cage.",
    commonMistake: "Playing a 'winning' move that takes 20 more moves to convert, when a forced mate was available. Always check for mate before any other consideration.",
  },
  back_rank: {
    label: "Back rank weakness",
    concept: "After castling, if your pawns are still on the second rank (or have moved without creating an escape square), your king is trapped on the back rank. A single heavy piece — rook or queen — on the 8th rank delivers instant checkmate. This is called a back-rank mate.",
    why: "Back-rank mates are catastrophic because they come from nowhere, feel 'unfair', and end games you were winning. One move — h3 for White, h6 for Black — eliminates the entire threat at the cost of one tempo.",
    howToSpot: "After you castle: can a rook or queen land on your back rank with check, and does your king have nowhere to go? If yes, play h3/g3 (h6/g6) immediately. In games where you're ahead: check if your OPPONENT'S back rank is weak. Often you can force a back-rank mate they don't see.",
    drill: "The position shows either a back-rank mate you could have delivered, or one your opponent delivered because you forgot to create an escape square.",
    commonMistake: "Moving the h-pawn too late — after you're already under back-rank pressure. Make the escape square early, in the opening phase.",
  },
  missed_capture: {
    label: "Missed free captures",
    concept: "A piece was undefended and capturable, but you played a different move. Free material is almost always correct to take. The only exception: if taking the piece loses you more material immediately (a trap), or if there's a forced mate without taking.",
    why: "In the 1300–1700 range, ignoring free material is a direct rating killer. Your opponent miscalculated and left you a free piece. Take it.",
    howToSpot: "Before every move: scan all your opponent's pieces. Is anything undefended or under-defended? Can any of your pieces take it safely? This takes 5 seconds. Do it every move.",
    drill: "Find the free piece. Take it. Simple.",
    commonMistake: "Playing a 'plan' move when there's free material available. Plans are for when nothing is free.",
  },
  walked_into_pin: {
    label: "Walked into pins and skewers",
    concept: "A pin restricts a piece that's shielding a more valuable piece behind it — the pinned piece can't move without exposing the more valuable one. A skewer is the reverse: the more valuable piece is attacked, and when it moves, the less valuable one behind it is taken. Both exploit alignment on diagonals, files, or ranks.",
    why: "Pins are devastating in the middlegame because they freeze your pieces. A pinned knight can't defend, can't attack, can't move. Your position falls apart not because of tactics but because your pieces are paralysed.",
    howToSpot: "Before moving a piece: is your intended destination on the same diagonal/rank/file as a more valuable piece? Is there an enemy bishop, rook, or queen pointing at that line? If yes, you're about to get pinned.",
    drill: "The position shows the moment before you walked into the pin. Find where the pin comes from and what you should have played instead.",
    commonMistake: "Not checking the long diagonals. A bishop on b2 pins your knight on d4 if your king is on g7. These 'quiet' pins sneak up because the attacker isn't nearby.",
  },
  missed_check: {
    label: "Missed forcing checks",
    concept: "A check forces your opponent to respond to the threat to their king, limiting their options drastically. A check that wins material — by exposing a piece after the king moves, or creating a discovered attack — is often the strongest move available. Checks create tempo: you move with purpose, they react.",
    why: "'Checks first' is a fundamental principle of calculation. Every position with a check available should start there. A check that leads to winning a piece is better than 99% of other moves in the position.",
    howToSpot: "Before every move: do I have a check? Then ask: after the only legal reply, what did I gain? An exposed piece? A discovered attack? A better king position? If yes, the check is almost certainly best.",
    drill: "Find the check that wins material or gives a decisive advantage. The key question: what does the king's forced move expose?",
    commonMistake: "Skipping checks because they 'don't seem to lead anywhere.' Calculate them anyway. The board looks different after a forcing check.",
  },
  positional: {
    label: "Positional errors",
    concept: "Not every mistake is a blunder that loses material immediately. Positional errors weaken your structure, trap your pieces, or give your opponent long-term advantages that compound over 10–20 moves. Better piece activity, pawn structure, and king safety determine who wins most games at the 1500+ level.",
    why: "As you improve beyond 1400, pure tactical mistakes become less frequent. What remains are positional errors — bad piece placement, weakened pawn structures, poor king safety — that slowly strangle your position.",
    howToSpot: "After each move, ask: which of my pieces is least active? What one move would most improve it? Are my pawns creating weaknesses (isolated, doubled, backward)? Is my king safe for the next 10 moves?",
    drill: "The best move accomplishes one of: improved piece activity, better pawn structure, or king safety. Find it before revealing.",
    commonMistake: "Playing 'nothing moves' — moves that don't actively improve anything. Every move should have a purpose.",
  },
};

const STANDARD_WEEKS = [
  {
    label: "Italian Game — know it cold",
    concept: "1.e4 e5 2.Nf3 Nc6 3.Bc4 is your most common opening as White. The bishop on c4 eyes the f7 pawn — Black's weakest point early on. The Giuoco Piano (3...Bc5) and Two Knights (3...Nf6) are Black's main replies. Your goal: rapid development, castle early, control the center with d3 or d4.",
    why: "You play the Italian repeatedly but your win rate is below average with it. The issue isn't the opening — it's that you reach the middlegame without a plan. Fix this first.",
    howToSpot: "In the Italian: develop both knights and the bishop before moving any piece twice. Castle before move 10. Only then push d3 or d4 to challenge the center.",
    drill: "Play 5 Italian games this week focused purely on getting to a clean development — both knights out, bishop on c4, castled, then d3. Don't worry about winning. Win by surviving the opening better.",
    commonMistake: "Moving the same piece twice in the opening, or delaying castling past move 12.",
  },
  {
    label: "King safety: castle early, don't weaken",
    concept: "Your king is safest behind an intact pawn wall after castling. Every pawn move in front of your castled king creates a weakness. f3 weakens g3 and h3. g4 opens diagonals. h3 is okay (escape square). The danger window is moves 10–20 — if you haven't castled by move 12, your king is a target.",
    why: "Games lost to kingside attacks almost always involve: late castling, or unnecessary pawn moves in front of the castled king. Both are avoidable with one rule: castle before move 10, don't push f/g/h pawns unless you have a specific plan.",
    howToSpot: "Count: how many moves until you can castle? If it's more than 3–4, you have a king safety problem. Also: before moving a pawn in front of your castled king, ask what square it weakens.",
    drill: "Review your last 5 losses. In how many was your king still in the center on move 15, or did you push a pawn in front of it?",
    commonMistake: "Castling then immediately pushing h4 or g4 to 'attack.' You've invited the counterattack before your pieces are ready.",
  },
  {
    label: "Rook activation: open files and the 7th rank",
    concept: "Rooks are worth 5 pawns but they need open files to operate. A rook on a closed file is worth less than a bishop. Connect your rooks (no pieces between them), put them on open or half-open files, and invade the 7th rank when possible — enemy pawns still on their starting rank become targets.",
    why: "Most players develop their pieces correctly but leave rooks on their starting squares through the entire middlegame. You're playing with 6 pieces while your opponent uses 8.",
    howToSpot: "After every rook move, ask: is this rook on an open file? Is it threatening anything? Rooks behind passed pawns are especially powerful — the pawn shields them while the rook supports the advance.",
    drill: "In this week's games, make a point of activating at least one rook before move 20. Identify the most open file and put your rook on it.",
    commonMistake: "Doubling rooks on a closed file. Two rooks on a closed file do nothing — one active rook on an open file is better.",
  },
  {
    label: "Calculation: 3-move forced sequences",
    concept: "You don't need to calculate 10 moves deep — you need to calculate 3 moves accurately, every time. The method: 1) Find candidate moves (checks, captures, threats). 2) Pick the most forcing one. 3) Calculate opponent's ONLY or BEST reply. 4) Calculate your response. Stop there unless something forcing continues.",
    why: "Most tactical mistakes at 1300–1600 happen not from failing to calculate deeply, but from stopping calculation one move too early. The move you missed was on move 3, not move 10.",
    howToSpot: "Before every move: checks first, then captures, then threats. For each forcing move, ask what your opponent's ONLY reply is (if they're in check) or their BEST reply. Then calculate your response to that.",
    drill: "In each drill position: find the forcing sequence. It's 2–3 moves. Calculate before you click reveal.",
    commonMistake: "Calculating 'I play this, they play that, I play this' without asking whether THEY have a better reply. Always ask: what's their best response?",
  },
  {
    label: "Pawn structure: don't create permanent weaknesses",
    concept: "Pawn moves are permanent — you can't take them back. Isolated pawns (no friendly pawns on adjacent files) become long-term targets. Doubled pawns are hard to advance. Backward pawns can't be defended by other pawns. The best pawn structure is connected, mobile, and not over-advanced.",
    why: "Endgames are often decided entirely by pawn structure. A bad pawn you created on move 15 can cost you the game on move 60. Build a habit of evaluating pawn weaknesses before every pawn push.",
    howToSpot: "Before any pawn move, ask: after I push this pawn, is it defended? Can it advance further, or is it stuck? Does it leave a backward pawn behind? Does it create an isolated pawn?",
    drill: "Review your last 5 losses. Find the first moment a pawn weakness became decisive. Was it avoidable?",
    commonMistake: "Advancing pawns quickly without a plan. Pawn advances should be purposeful — either opening a file, creating a passed pawn, or gaining space. Not just 'because I can.'",
  },
  {
    label: "Endgame essentials: king activation and opposition",
    concept: "In the endgame, the king becomes a powerful piece — use it. King opposition (two kings facing each other with one square between them, and it's your opponent's turn) determines who controls key squares. The rule of the square tells you if a lone king can catch a passed pawn without piece help.",
    why: "Most games at 1300–1600 that reach the endgame are decided by who activates their king first. If you understand opposition and king activity, you convert winning positions cleanly instead of drawing them.",
    howToSpot: "In any endgame: immediately start centralising your king (move toward d4/d5/e4/e5 for White, or d5/e5 for Black). Count the rule of the square if your opponent has a passed pawn.",
    drill: "In pawn endgames: always check opposition before deciding where to put your king. The right square is often not the obvious one.",
    commonMistake: "Keeping the king passive in the endgame. 'The king is a fighting piece — use it.' — Reuben Fine.",
  },
  {
    label: "Prophylaxis: stop your opponent's plan",
    concept: "The best players spend as much time preventing threats as creating them. Prophylaxis means asking 'what does my opponent want to do?' and making a move that prevents it — even if that move isn't the most aggressive option. It's the difference between reactive play (responding to threats) and proactive play (stopping them before they exist).",
    why: "At the 1500+ level, positions don't always have tactical fireworks. The player who understands what their opponent wants to do — and stops it — wins by strangulation. Your opponent runs out of good moves.",
    howToSpot: "Before every move: ask 'if I do nothing, what is my opponent's best threat?' If it's serious, address it. The prophylactic move is often a quiet, non-forcing move that limits opponent options.",
    drill: "In each position: find the opponent's threat. Then find the move that stops it while improving your own position.",
    commonMistake: "Ignoring the opponent's plan because 'my attack is too strong.' Sometimes it isn't. Ask first.",
  },
  {
    label: "Time management in blitz",
    concept: "In 5-minute chess, time is a resource. Spending 30 seconds on move 8 often means you'll flag in a winning endgame. The heuristic: use 2–5 seconds on forcing/obvious moves, 10–15 seconds on critical junctions, and never fall below 30 seconds in a complex middlegame.",
    why: "You've been flagged (lost on time while ahead on board) in a meaningful number of games. This is pure waste — winning positions that become losses because the clock ran out.",
    howToSpot: "Track your time per move. If you spend 20+ seconds on non-critical moves in the opening/early middlegame, you'll be in time trouble later. Develop a 'fast default' for common positions you've seen before.",
    drill: "Play 10 games with the explicit goal of never falling below 30 seconds. Prioritise the clock in the last 2 minutes.",
    commonMistake: "Thinking for a long time about moves in positions you've seen dozens of times. Build pattern recognition so familiar positions are fast.",
  },
  {
    label: "The two weaknesses principle",
    concept: "It's hard to attack one strong weakness — a good defender can hold. But two weaknesses require the defender to split their attention, and eventually one falls. Create a threat on one side of the board to divert defending pieces, then strike on the other. This is how grandmasters convert 'equal' positions.",
    why: "You reach winning positions but fail to convert them. Often this is because you push on one side only, letting your opponent consolidate. Learn to open a second front.",
    howToSpot: "In a winning position: identify the primary weakness. Then ask: how can I create a SECOND weakness on the other side? Usually a pawn break or piece infiltration opens the second front.",
    drill: "In each position: identify both weaknesses. The move that attacks or creates one while maintaining pressure on the other is usually best.",
    commonMistake: "Attacking the same weakness repeatedly. When the defence holds, switch sides. The defender can't be everywhere.",
  },
  {
    label: "Piece coordination: every piece has a job",
    concept: "A strong position isn't about individual pieces — it's about pieces working together. A bishop and rook covering the same diagonal and file create double threats. A knight and bishop covering adjacent squares create a network. Uncoordinated pieces fight each other for space and leave gaps.",
    why: "The feeling of 'my pieces are all in the wrong place' is piece coordination failure. The cure: after every move, identify your worst-placed piece and plan to improve it within the next 3 moves.",
    howToSpot: "Ask: which of my pieces is doing least? What square would maximise its value? How do I get it there? The process of improving the worst piece is the heart of positional play.",
    drill: "In each position: identify the poorly placed piece. Find the move that begins to activate it.",
    commonMistake: "Chasing the opponent's moves reactively, ignoring your own piece improvement. Improve your pieces every move, not just when forced.",
  },
];

// ── Build curriculum ──────────────────────────────────────────

function buildCurriculum() {
  const patternMap: Record<string, any[]> = {};
  for (const b of blunderPositions) {
    const p = b.pattern ?? "unknown";
    if (p === "unknown" || p === null) continue;
    if (!patternMap[p]) patternMap[p] = [];
    patternMap[p].push(b);
  }

  let patternWeeks: any[] = [];
  if (patternSummaryRaw.length > 0) {
    patternWeeks = patternSummaryRaw.map((g) => {
      const meta = PATTERN_META[g.pattern] ?? {};
      return {
        key: g.pattern,
        ...meta,
        label: meta.label ?? g.label ?? g.pattern,
        count: g.count,
        examples: g.examples ?? patternMap[g.pattern] ?? [],
        source: "your games",
      };
    });
  } else {
    const sorted = Object.entries(patternMap)
      .filter(([, v]) => v.length >= 3)
      .sort((a, b) => b[1].length - a[1].length);
    patternWeeks = sorted.map(([key, examples]) => ({
      key,
      ...PATTERN_META[key],
      label: PATTERN_META[key]?.label ?? key.replace(/_/g, " "),
      count: examples.length,
      examples,
      source: "your games",
    }));
  }

  const needed = Math.max(0, 52 - patternWeeks.length);
  const standardWeeks = STANDARD_WEEKS.slice(0, needed).map((w, i) => ({
    key: `standard_${i}`,
    ...w,
    count: 0,
    examples: [],
    source: "general",
  }));

  return [...patternWeeks, ...standardWeeks].slice(0, 52);
}

function parseUCI(uci: string) {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

// ── Drill view ────────────────────────────────────────────────

function DrillView({
  pool,
  week,
  onBack,
  onMarkComplete,
  isComplete,
}: {
  pool: any[];
  week: any;
  onBack: () => void;
  onMarkComplete: () => void;
  isComplete: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tab, setTab] = useState<"drill" | "theory">("theory");

  const total = pool.length;
  const blunder = pool[index];

  const playedArrow = parseUCI(blunder?.played_uci ?? "");
  const bestArrow = parseUCI(blunder?.best_uci ?? "");

  const arrows = useMemo(() => {
    if (!revealed || tab !== "drill") return [];
    const a: { startSquare: string; endSquare: string; color: string }[] = [];
    if (playedArrow)
      a.push({ startSquare: playedArrow.from, endSquare: playedArrow.to, color: "rgba(239,68,68,0.9)" });
    if (bestArrow)
      a.push({ startSquare: bestArrow.from, endSquare: bestArrow.to, color: "rgba(74,222,128,0.9)" });
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, index, tab]);

  function goTo(n: number) {
    setIndex(Math.max(0, Math.min(total - 1, n)));
    setRevealed(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={backBtnStyle}>← curriculum</button>
        <span style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--text)" }}>{week.label}</span>
        {isComplete && (
          <span style={{ fontSize: "0.72rem", color: "var(--win)", border: "1px solid var(--win)", borderRadius: 4, padding: "2px 8px", marginLeft: "auto" }}>
            ✓ complete
          </span>
        )}
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden", alignSelf: "flex-start" }}>
        {(["theory", "drill"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "7px 18px",
              background: tab === t ? "var(--bg-3)" : "transparent",
              border: "none",
              color: tab === t ? "var(--text)" : "var(--text-muted)",
              fontSize: "0.8rem",
              fontWeight: tab === t ? 600 : 400,
              cursor: "pointer",
              transition: "background 0.1s",
            }}
          >
            {t === "theory" ? "Theory" : `Drill (${total} positions)`}
          </button>
        ))}
      </div>

      {/* Theory tab */}
      {tab === "theory" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
          <TheorySection title="The concept" body={week.concept} />
          <TheorySection title="Why it matters for you" body={week.why} accent />
          <TheorySection title="How to spot it" body={week.howToSpot} />
          <TheorySection title="How to practice" body={week.drill} />
          <TheorySection title="Common mistake" body={week.commonMistake} warn />

          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            {total > 0 && (
              <button
                onClick={() => setTab("drill")}
                style={{ background: "var(--accent)", color: "#000", border: "none", borderRadius: 6, padding: "10px 20px", fontSize: "0.86rem", fontWeight: 600, cursor: "pointer" }}
              >
                Start drilling {total} positions →
              </button>
            )}
            {!isComplete && (
              <button
                onClick={onMarkComplete}
                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 20px", fontSize: "0.86rem", color: "var(--text-muted)", cursor: "pointer" }}
              >
                Mark as understood →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Drill tab */}
      {tab === "drill" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!blunder ? (
            <div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                No positions yet — run{" "}
                <code style={{ fontFamily: "monospace", background: "var(--bg-3)", padding: "2px 6px", borderRadius: 3 }}>
                  python3 scripts/update_games.py
                </code>{" "}
                to load your game patterns.
              </p>
              {!isComplete && (
                <button
                  onClick={onMarkComplete}
                  style={{ marginTop: 16, background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 20px", fontSize: "0.86rem", color: "var(--text-muted)", cursor: "pointer" }}
                >
                  Mark as understood → advance to next week
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Concept reminder */}
              <div style={{ padding: "10px 14px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.8rem", color: "var(--text-dim)", lineHeight: 1.6, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>Key:</span>
                <span>{week.drill}</span>
              </div>

              {/* Position counter */}
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                position {index + 1} of {total}
              </div>

              {/* Board + panel */}
              <div style={{ display: "flex", gap: 36, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flexShrink: 0 }}>
                  <Chessboard
                    options={{
                      position: blunder.fen_before,
                      boardOrientation: blunder.color === "white" ? "white" : "black",
                      boardStyle: { width: 420, height: 420 },
                      darkSquareStyle: { backgroundColor: "#b58863" },
                      lightSquareStyle: { backgroundColor: "#f0d9b5" },
                      arrows,
                      allowDragging: false,
                    }}
                  />
                  <div style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center" }}>
                    {revealed
                      ? "red = your move  ·  green = best move"
                      : `move ${blunder.move_num} · ${blunder.color} · ${blunder.time_control ?? "blitz"}`}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ padding: "12px 14px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6 }}>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>context</div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                      {blunder.game_date}
                      {blunder.opponent && (
                        <> · vs <strong style={{ color: "var(--text)" }}>{blunder.opponent}</strong></>
                      )}
                    </div>
                    <div style={{ marginTop: 6, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                      move {blunder.move_num} · playing as {blunder.color}
                    </div>
                  </div>

                  {!revealed ? (
                    <button
                      onClick={() => setRevealed(true)}
                      style={{ background: "var(--accent)", color: "#000", border: "none", borderRadius: 6, padding: "11px 18px", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer" }}
                    >
                      Show best move
                    </button>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ padding: "12px 14px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6 }}>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>result</div>
                        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 4 }}>you played</div>
                            <div style={{ fontFamily: "monospace", fontSize: "0.95rem", fontWeight: 700, color: "#ef4444" }}>{blunder.san}</div>
                          </div>
                          {blunder.eval_before && blunder.eval_after && (
                            <div>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 4 }}>eval</div>
                              <div style={{ fontFamily: "monospace", fontSize: "0.9rem", color: "var(--text)" }}>
                                {blunder.eval_before}
                                <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>→</span>
                                <span style={{ color: "#ef4444" }}>{blunder.eval_after}</span>
                              </div>
                            </div>
                          )}
                          {blunder.drop_str && (
                            <div>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 4 }}>drop</div>
                              <div style={{ fontFamily: "monospace", fontSize: "0.9rem", color: "#f97316", fontWeight: 600 }}>{blunder.drop_str}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => goTo(index - 1)} disabled={index === 0} style={navBtnStyle(index === 0)}>previous</button>
                    <button onClick={() => goTo(index + 1)} disabled={index >= total - 1} style={navBtnStyle(index >= total - 1)}>next</button>
                    <button
                      onClick={() => { setIndex(Math.floor(Math.random() * total)); setRevealed(false); }}
                      style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", padding: "8px 14px", fontSize: "0.82rem", cursor: "pointer" }}
                    >
                      random
                    </button>
                  </div>
                </div>
              </div>

              {/* Mark complete */}
              {!isComplete && (
                <div style={{ marginTop: 8, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
                  <button
                    onClick={onMarkComplete}
                    style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 20px", fontSize: "0.86rem", color: "var(--text-muted)", cursor: "pointer" }}
                  >
                    I understand this concept → advance to next week
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TheorySection({ title, body, accent, warn }: { title: string; body: string; accent?: boolean; warn?: boolean }) {
  return (
    <div style={{ padding: "14px 16px", background: warn ? "rgba(239,68,68,0.04)" : accent ? "var(--bg-2)" : "var(--bg)", border: `1px solid ${warn ? "rgba(239,68,68,0.2)" : "var(--border)"}`, borderRadius: 8 }}>
      <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: warn ? "#ef4444" : accent ? "var(--accent)" : "var(--text-dim)", marginBottom: 8 }}>
        {title}
      </div>
      <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.7, margin: 0 }}>{body}</p>
    </div>
  );
}

const backBtnStyle: React.CSSProperties = {
  background: "var(--bg-3)",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
  borderRadius: 5,
  padding: "5px 10px",
  fontSize: "0.8rem",
  cursor: "pointer",
};

const navBtnStyle = (disabled: boolean): React.CSSProperties => ({
  background: "var(--bg-3)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  color: "var(--text-muted)",
  padding: "8px 14px",
  fontSize: "0.82rem",
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.4 : 1,
});

// ── Week card ─────────────────────────────────────────────────

function WeekCard({
  week,
  weekNum,
  status,
  onOpen,
}: {
  week: any;
  weekNum: number;
  status: "complete" | "current" | "upcoming";
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "13px 16px",
        background: status === "current" ? "var(--bg-2)" : "var(--bg)",
        border: `1px solid ${status === "current" ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 8,
        cursor: "pointer",
        textAlign: "left",
        color: "var(--text)",
        opacity: status === "upcoming" ? 0.6 : 1,
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => {
        if (status !== "current") (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--text-dim)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = status === "current" ? "var(--accent)" : "var(--border)";
      }}
    >
      <span style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "var(--text-dim)", minWidth: 36 }}>
        {weekNum}
      </span>

      {/* Status icon */}
      <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", background: status === "complete" ? "var(--win)" : status === "current" ? "var(--accent)" : "var(--bg-3)", color: status === "complete" ? "#000" : status === "current" ? "#000" : "var(--text-dim)", border: status === "upcoming" ? "1px solid var(--border)" : "none" }}>
        {status === "complete" ? "✓" : status === "current" ? "→" : "·"}
      </span>

      <span style={{ flex: 1, fontSize: "0.88rem", fontWeight: status === "current" ? 600 : 400, color: status === "complete" ? "var(--text-muted)" : "var(--text)" }}>
        {week.label}
      </span>

      {week.source === "your games" && week.count > 0 && (
        <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontFamily: "monospace" }}>
          {week.count}x
        </span>
      )}

      {status === "current" && (
        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 4, padding: "2px 7px" }}>
          THIS WEEK
        </span>
      )}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function TacticsPage() {
  const curriculum = useMemo(() => buildCurriculum(), []);

  const [completedWeeks, setCompletedWeeks] = useState<number[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [openWeek, setOpenWeek] = useState<number | null>(null);

  // Load progress from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setCompletedWeeks(JSON.parse(saved));
    } catch {}
    setHydrated(true);
  }, []);

  const currentWeekIndex = useMemo(() => {
    for (let i = 0; i < curriculum.length; i++) {
      if (!completedWeeks.includes(i)) return i;
    }
    return curriculum.length - 1;
  }, [curriculum, completedWeeks]);

  const markComplete = useCallback((weekIndex: number) => {
    setCompletedWeeks((prev) => {
      if (prev.includes(weekIndex)) return prev;
      const next = [...prev, weekIndex];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setOpenWeek(null);
  }, []);

  if (!hydrated) return null;

  // If drilling a week, show full drill view
  if (openWeek !== null) {
    const week = curriculum[openWeek];
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "32px 24px" }}>
        <div style={{ maxWidth: 940, margin: "0 auto" }}>
          <DrillView
            pool={week.examples}
            week={week}
            onBack={() => setOpenWeek(null)}
            onMarkComplete={() => markComplete(openWeek)}
            isComplete={completedWeeks.includes(openWeek)}
          />
        </div>
      </div>
    );
  }

  const current = curriculum[currentWeekIndex];
  const totalComplete = completedWeeks.length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "32px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: "1.35rem", fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
            52-week training plan
          </h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>
            {totalComplete > 0
              ? `${totalComplete} of 52 weeks complete`
              : "one core idea per week — understand it fully before moving on"}
          </p>
        </div>

        {/* This week hero */}
        <div
          style={{ padding: "20px 22px", background: "var(--bg-2)", border: "1px solid var(--accent)", borderRadius: 10, marginBottom: 28 }}
        >
          <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>
            this week · week {currentWeekIndex + 1}
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 10 }}>{current.label}</div>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.65, margin: "0 0 16px" }}>
            {current.concept}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setOpenWeek(currentWeekIndex)}
              style={{ background: "var(--accent)", color: "#000", border: "none", borderRadius: 6, padding: "9px 18px", fontSize: "0.86rem", fontWeight: 600, cursor: "pointer" }}
            >
              {current.examples.length > 0
                ? `Study + drill ${current.examples.length} positions →`
                : "Study this week →"}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {totalComplete > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ height: 3, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(totalComplete / 52) * 100}%`, background: "var(--accent)", borderRadius: 2, transition: "width 0.4s" }} />
            </div>
            <div style={{ marginTop: 5, fontSize: "0.7rem", color: "var(--text-dim)" }}>
              {totalComplete}/52 weeks complete
            </div>
          </div>
        )}

        {/* Full curriculum */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {curriculum.map((week, i) => {
            const status = completedWeeks.includes(i)
              ? "complete"
              : i === currentWeekIndex
              ? "current"
              : "upcoming";
            return (
              <WeekCard
                key={week.key}
                week={week}
                weekNum={i + 1}
                status={status}
                onOpen={() => setOpenWeek(i)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
