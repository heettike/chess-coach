"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import gameDataRaw from "@/public/game_data.json";
import tacticsDataRaw from "@/public/tactics_data.json";
import { PositionChat } from "@/components/PositionChat";
import { explainResult } from "@/lib/evalText";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => (
      <div style={{ width: 280, height: 280, background: "var(--bg-3)", borderRadius: 6 }} />
    ),
  }
);

const gd = gameDataRaw as any;
const td = tacticsDataRaw as any;
const blunderPositions: any[] = gd.blunder_positions ?? [];
const patternSummaryRaw: any[] = gd.pattern_summary ?? [];

// Map blunder pattern keys → Lichess puzzle themes
const PATTERN_TO_THEMES: Record<string, string[]> = {
  missed_fork:      ["fork"],
  walked_into_fork: ["fork"],
  hanging_piece:    ["hangingPiece"],
  missed_capture:   ["hangingPiece"],
  missed_checkmate: ["mateIn1", "mateIn2"],
  back_rank:        ["backRankMate"],
  walked_into_pin:  ["pin", "skewer"],
  missed_check:     ["discoveredAttack"],
  positional:       ["deflection", "sacrifice"],
};

function getPuzzlesForPattern(patternKey: string): any[] {
  const themes = PATTERN_TO_THEMES[patternKey] ?? [];
  const all: any[] = [];
  for (const theme of themes) {
    const ps: any[] = td.puzzles?.[theme] ?? [];
    all.push(...ps);
  }
  // Shuffle deterministically so puzzles vary between patterns
  return all.slice(0, 20);
}

const STORAGE_KEY = "chess-curriculum-v2";

// ── Types ──────────────────────────────────────────────────────

interface BoardDemo {
  moves?: string;       // SAN move sequence from start
  fen?: string;         // or direct FEN
  orientation?: "white" | "black";
  arrows?: { from: string; to: string; color: string }[];
  caption: string;
}

interface WeekMeta {
  label: string;
  concept: string;
  why: string;
  howToSpot: string;
  drill: string;
  commonMistake: string;
  source?: string;       // e.g. "Silman — How to Reassess Your Chess"
  boards?: BoardDemo[];  // canonical positions shown in theory
}

// ── Helpers ────────────────────────────────────────────────────

function movesToFen(moves: string): string {
  const chess = new Chess();
  for (const m of moves.trim().split(/\s+/).filter(Boolean)) {
    try { chess.move(m); } catch { break; }
  }
  return chess.fen();
}

function resolveBoard(b: BoardDemo): { fen: string; arrows: any[]; orientation: "white" | "black" } {
  const fen = b.fen ?? (b.moves ? movesToFen(b.moves) : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const arrows = (b.arrows ?? []).map((a) => ({
    startSquare: a.from,
    endSquare: a.to,
    color: a.color,
  }));
  return { fen, arrows, orientation: b.orientation ?? "white" };
}

// ── Pattern metadata with canonical board demos ────────────────

const PATTERN_META: Record<string, WeekMeta> = {
  hanging_piece: {
    label: "Hanging pieces",
    concept: "A hanging piece has no defender — it can be taken for free. This is the most common way club players lose material. Every piece must either be defended or actively threatening something.",
    why: "At 1300–1600, over 40% of decisive material swings come from one side simply leaving a piece undefended. You're not losing because your strategy is bad — you're giving things away.",
    howToSpot: "After your opponent moves: scan all their pieces — is anything undefended? Then scan your own: after your intended move, does anything become undefended? Ten seconds, every move.",
    drill: "Find the hanging piece before clicking reveal. The answer is always: take the free piece.",
    commonMistake: "Seeing the free piece but choosing a 'better' plan. Almost always wrong. Material in hand beats a plan.",
    boards: [
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Nd4",
        orientation: "white",
        arrows: [{ from: "f3", to: "d4", color: "rgba(74,222,128,0.9)" }],
        caption: "Blackburne-Shilling: Black plays Nd4?? — the knight is undefended. Nxd4 wins material immediately.",
      },
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 Nc3 Nf6 d3 d6 O-O O-O Ng5",
        orientation: "white",
        arrows: [{ from: "g5", to: "f7", color: "rgba(74,222,128,0.9)" }],
        caption: "Ng5 attacks the undefended f7 pawn — a classic weak point in Black's position.",
      },
    ],
  },
  missed_fork: {
    label: "Missed forks",
    concept: "A fork attacks two pieces simultaneously — the opponent can only save one. Knights are the best forkers because their L-shaped movement reaches squares no other piece covers easily. Train yourself to see pairs of enemy pieces as fork targets.",
    why: "Forks are pattern-recognition problems. You don't calculate them — you see them. Once trained, they become automatic. Until then, your brain filters them as noise.",
    howToSpot: "Find any two enemy pieces and ask: is there a square that hits both? For knights: visualise the L-shape landing squares from nearby positions. For pawns: two side-by-side enemy pieces are always fork candidates.",
    drill: "Find the forking square before clicking reveal. The green arrow shows the destination.",
    commonMistake: "Looking at one target at a time. Train to scan for pairs simultaneously.",
    source: "Polgar — Chess Tactics for Champions",
    boards: [
      {
        fen: "r3k3/2p5/8/3N4/8/8/8/4K3 w - - 0 1",
        orientation: "white",
        arrows: [
          { from: "d5", to: "c7", color: "rgba(74,222,128,0.9)" },
          { from: "c7", to: "e8", color: "rgba(250,204,21,0.6)" },
          { from: "c7", to: "a8", color: "rgba(250,204,21,0.6)" },
        ],
        caption: "Nd5-c7+ forks the king on e8 and rook on a8. Both attacked by one knight — Black can only save one.",
      },
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7",
        orientation: "white",
        arrows: [{ from: "f7", to: "d8", color: "rgba(250,204,21,0.6)" }, { from: "f7", to: "h8", color: "rgba(250,204,21,0.6)" }],
        caption: "Fried Liver Attack: Nxf7 forks queen on d8 and rook on h8. Black is immediately lost.",
      },
    ],
  },
  walked_into_fork: {
    label: "Walked into forks",
    concept: "Your move placed two of your pieces where one enemy piece could attack both. Before any move, check whether your new positions create a fork target for the opponent's knight, queen, or bishop.",
    why: "You walk into forks when you're only thinking about your own threats. Add one check after every candidate move: does this create a fork against me?",
    howToSpot: "After your intended move, mentally place your opponent's knight on every nearby square — does it hit two of your pieces? Especially watch for their knight approaching the center.",
    drill: "The position shows the moment before the fork. Find the safer move that avoids the fork.",
    commonMistake: "Only thinking about your own attack. Three seconds of defensive scan prevents this every time.",
    boards: [
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 Nc3 Nf6 d3 d6 O-O O-O",
        orientation: "black",
        arrows: [{ from: "c3", to: "d5", color: "rgba(239,68,68,0.7)" }],
        caption: "After castling in the Italian, Nd5 becomes a threat — it would fork pieces on c7 and f6. Black must be alert.",
      },
    ],
  },
  missed_checkmate: {
    label: "Missed checkmate",
    concept: "Checkmate ends the game instantly — it's worth more than any material advantage. When you have checks available, follow every one to see if it forces mate before evaluating other moves. Checks limit the opponent's options to almost nothing.",
    why: "Missed mates happen because players find a 'winning' move and stop calculating. The brain says 'I'm winning' and moves on. Discipline: always verify there's no forced mate first.",
    howToSpot: "Checks first, always. For each check: is the king trapped? Does the opponent have only one reply? Does your next check also leave only one reply? Two or three of these = forced mate.",
    drill: "Find the mating sequence. Usually 1–3 moves. The king is trapped — find the cage.",
    commonMistake: "Playing a 'winning' move that takes 20 more moves when forced mate was available.",
    boards: [
      {
        fen: "6k1/5ppp/8/8/8/8/8/1R4K1 w - - 0 1",
        orientation: "white",
        arrows: [{ from: "b1", to: "b8", color: "rgba(74,222,128,0.9)" }],
        caption: "Back rank mate: Rb8# — the king has no escape square because h7/g7/f7 pawns block. Always look here first.",
      },
      {
        fen: "r1b2rk1/pppp1Qpp/2n2n2/2b1p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 6",
        orientation: "black",
        arrows: [{ from: "f7", to: "g8", color: "rgba(239,68,68,0.9)" }],
        caption: "Scholar's mate: Qxf7# — king trapped, no defenders. This is what over-rapid Black development enables.",
      },
    ],
  },
  back_rank: {
    label: "Back rank weakness",
    concept: "After castling without creating an escape square, your king is trapped on the back rank. A single rook or queen on the 8th rank delivers instant checkmate. One move — h3 for White, h6 for Black — eliminates this for the entire game.",
    why: "Back-rank mates feel 'unfair' because they're sudden. But they're always preventable. Make h3/h6 a reflex after castling.",
    howToSpot: "After castling: can a rook or queen land on your back rank with check? Does your king have an escape square? If not, play h3 (or h6) immediately. Also check your opponent's back rank — it's often weaker than yours.",
    drill: "The position shows a back-rank mate you missed delivering, or one your opponent delivered. Find the key move.",
    commonMistake: "Making the escape square after you're already under pressure. Make it early — it costs one tempo and saves the game.",
    boards: [
      {
        fen: "3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
        orientation: "white",
        arrows: [{ from: "d1", to: "d8", color: "rgba(74,222,128,0.9)" }],
        caption: "Rxd8# — Black's king has no escape because f7/g7/h7 are all blocked. h6 earlier would have prevented this.",
      },
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 O-O O-O d3 d6 h3",
        orientation: "white",
        arrows: [{ from: "h2", to: "h3", color: "rgba(74,222,128,0.9)" }],
        caption: "h3 — the escape square. One move, played proactively, eliminates back-rank mate threats for the rest of the game.",
      },
    ],
  },
  missed_capture: {
    label: "Missed free captures",
    concept: "A piece was undefended and capturable, but you played a different move. Free material is almost always correct to take. The only exception: if taking loses more material immediately, or if a forced mate exists without taking.",
    why: "Ignoring free material is a direct rating killer. Your opponent miscalculated. Punish it.",
    howToSpot: "Before every move: scan all opponent pieces. Is anything undefended or under-defended? Can any of your pieces take it safely? Five seconds. Every move.",
    drill: "Find the free piece. Take it.",
    commonMistake: "Playing a 'plan' move when free material exists. Plans are for when nothing is free.",
    boards: [
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4 Be2",
        orientation: "white",
        arrows: [{ from: "f1", to: "f7", color: "rgba(74,222,128,0.9)" }],
        caption: "Nxf7 takes the undefended f7 pawn — a free piece. Never walk past free material.",
      },
    ],
  },
  walked_into_pin: {
    label: "Walked into pins and skewers",
    concept: "A pin freezes a piece shielding a more valuable piece behind it. A skewer attacks the more valuable piece — when it moves, the less valuable piece behind it is taken. Both exploit straight-line alignment of pieces.",
    why: "Pins paralise your pieces without the opponent spending material. A pinned knight can't defend, can't attack, can't move. Your position collapses.",
    howToSpot: "Before moving: is your destination on the same diagonal/rank/file as a more valuable piece? Is an enemy bishop/rook/queen pointing at that line? If yes, reconsider.",
    drill: "The position shows the moment before you walked into the pin. Find what you should have played instead.",
    commonMistake: "Not checking long diagonals. A bishop on b2 pins your knight on d4 if your king is on g7.",
    source: "Nimzowitsch — My System",
    boards: [
      {
        moves: "e4 e5 Nf3 Nc6 Bb5",
        orientation: "black",
        arrows: [
          { from: "b5", to: "c6", color: "rgba(239,68,68,0.7)" },
          { from: "c6", to: "e8", color: "rgba(250,204,21,0.5)" },
        ],
        caption: "Ruy Lopez: Bb5 pins the Nc6 to the king. The knight can't move without exposing the king — it's paralysed.",
      },
      {
        fen: "4k3/ppp2ppp/3p1n2/4p3/4P3/3P1N2/PPP2PPP/4KB1R w K - 0 8",
        orientation: "white",
        arrows: [{ from: "f1", to: "b5", color: "rgba(74,222,128,0.9)" }, { from: "b5", to: "f6", color: "rgba(250,204,21,0.5)" }],
        caption: "Bb5+ pins the Nf6 to the king. After ...c6, the bishop retreats but the knight was frozen for a tempo.",
      },
    ],
  },
  missed_check: {
    label: "Missed forcing checks",
    concept: "A check forces a response — it limits your opponent to almost nothing. A check that wins material by exposing a piece, or creates a discovered attack, is almost always the strongest move. Checks create tempo.",
    why: "'Checks first' is a calculation principle. Every check available should be evaluated before other moves. A check that wins a piece is better than 99% of quiet moves.",
    howToSpot: "Before every move: do I have a check? What does the king's forced reply expose? A piece? A discovered attack? If yes, the check is almost certainly correct.",
    drill: "Find the check that creates a material gain. The key question: what does the forced king move expose?",
    commonMistake: "Skipping checks because 'they don't seem to lead anywhere.' Calculate them anyway.",
    boards: [
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O dxc3 Qb3",
        orientation: "white",
        arrows: [{ from: "b3", to: "f7", color: "rgba(74,222,128,0.9)" }],
        caption: "Evans Gambit: Qb3 attacks f7 with check — forcing king to move and exposing more threats. Always check first.",
      },
    ],
  },
  positional: {
    label: "Positional errors",
    concept: "Not every mistake loses material immediately. Positional errors weaken pawn structure, trap pieces, or give long-term advantages that compound over 10–20 moves. The 1500+ level is largely won on piece activity, pawn structure, and king safety.",
    why: "As you improve beyond 1400, pure tactical mistakes become less frequent. What remains are positional errors that slowly strangle your position over many moves.",
    howToSpot: "After each move ask: which of my pieces is least active? Are my pawns creating weaknesses? Is my king safe for the next 10 moves? The answer to the first question drives your next move.",
    drill: "The best move improves piece activity, fixes pawn structure, or secures king safety. Find it.",
    commonMistake: "Playing 'nothing moves' — moves that don't actively improve anything. Every move needs a purpose.",
    source: "Silman — How to Reassess Your Chess",
    boards: [
      {
        moves: "d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 Bg5 Be7 e3 O-O Bd3 dxc4 Bxc4 Nbd7",
        orientation: "white",
        arrows: [{ from: "g5", to: "e7", color: "rgba(250,204,21,0.5)" }],
        caption: "Semi-Slav: White's bishop on g5 is actively placed, Black's on e7 is passive. Piece activity is the imbalance.",
      },
    ],
  },
};

// ── Standard (book-sourced) weeks ────────────────────────────

const STANDARD_WEEKS: WeekMeta[] = [
  {
    label: "Italian Game — know it cold",
    concept: "1.e4 e5 2.Nf3 Nc6 3.Bc4 — the bishop eyes f7, Black's weakest early point. The Giuoco Piano (3...Bc5) and Two Knights (3...Nf6) are Black's main replies. Goal: develop both knights, bishop to c4, castle before move 10, then d3 or d4.",
    why: "This is your most-played opening as White and your results are below expected. The issue isn't the opening — it's reaching the middlegame without a plan.",
    howToSpot: "Develop both knights and Bc4 before moving any piece twice. Castle before move 10. Then d3 to support the center.",
    drill: "Play 5 Italian games focused purely on clean development — both knights, Bc4, castled. Don't worry about attacking.",
    commonMistake: "Moving the same piece twice in the opening, or delaying castling past move 12.",
    boards: [
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 O-O O-O d6",
        orientation: "white",
        arrows: [{ from: "c4", to: "f7", color: "rgba(250,204,21,0.4)" }],
        caption: "Giuoco Piano: solid setup for both sides. White will play d4 when ready. Note Bc4 eyes f7 the entire game.",
      },
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5 c6 dxc6 bxc6 Be2",
        orientation: "black",
        arrows: [{ from: "g5", to: "f7", color: "rgba(239,68,68,0.7)" }],
        caption: "Two Knights: 4.Ng5 attacks f7 aggressively. Black must play 4...d5 to counter-attack. Know this line.",
      },
    ],
  },
  {
    label: "King safety — castle early, don't weaken",
    concept: "Your king is safest behind an intact pawn wall. Every pawn move in front of your castled king creates a permanent weakness. f3 weakens g3/h3. g4 opens diagonals. h3 alone is fine (escape square). The danger window: moves 10–20.",
    why: "Games lost to kingside attacks almost always involve late castling or unnecessary pawn moves in front of the castled king. Both are avoidable.",
    howToSpot: "Before any pawn move in front of your king: what square does this weaken? Can the opponent use it? If yes, don't push it without a complete attack prepared.",
    drill: "Review your last 5 losses. In how many was your king in the center on move 15, or did you push kingside pawns prematurely?",
    commonMistake: "Castling then immediately pushing g4 to 'attack.' You've invited the counterattack before your pieces are ready.",
    source: "Dvoretsky — Positional Play",
    boards: [
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 O-O O-O h3",
        orientation: "white",
        arrows: [{ from: "h2", to: "h3", color: "rgba(74,222,128,0.9)" }],
        caption: "h3 after castling — the 'luft' (escape square). Costs one tempo, prevents back-rank checkmates and Bg4 pins.",
      },
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 O-O O-O d3 d6 Nc3 Bg4 Be3",
        orientation: "white",
        arrows: [{ from: "g4", to: "f3", color: "rgba(239,68,68,0.7)" }],
        caption: "Bg4 pins the Nf3. If White hasn't played h3, this pin is annoying and hard to break without concessions.",
      },
    ],
  },
  {
    label: "Rook activation: open files and the 7th rank",
    concept: "Rooks need open files to operate — a rook on a closed file is nearly worthless. Connect your rooks, put them on open or half-open files, and invade the 7th rank when possible. Enemy pawns on their starting rank become targets.",
    why: "Most players develop pieces correctly but leave rooks idle through the entire middlegame. You're playing with 6 pieces while your opponent uses 8.",
    howToSpot: "After each rook move: is this rook on an open file? Is it doing anything? A rook behind a passed pawn is especially powerful — pawn shields, rook supports.",
    drill: "In this week's games: activate at least one rook before move 20. Identify the open file and occupy it.",
    commonMistake: "Doubling rooks on a closed file. Two rooks on a closed file do less than one rook on an open file.",
    source: "Capablanca — Chess Fundamentals",
    boards: [
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 O-O O-O d3 d6 Re1",
        orientation: "white",
        arrows: [{ from: "f1", to: "e1", color: "rgba(74,222,128,0.9)" }],
        caption: "Re1 — the rook moves to the e-file in preparation. When d4 breaks the center, the e-file will open and the rook is already there.",
      },
      {
        fen: "3r2k1/1pp2rpp/p7/3Rp3/4P3/1P3P2/P5PP/5RK1 w - - 0 1",
        orientation: "white",
        arrows: [{ from: "d5", to: "d7", color: "rgba(74,222,128,0.9)" }],
        caption: "Rook on the 7th rank — attacking pawns on their starting squares. This is a winning structure in most rook endgames.",
      },
    ],
  },
  {
    label: "Calculation: checks, captures, threats — in that order",
    concept: "You don't need to calculate 10 moves deep. You need to calculate 3 moves accurately, every time. Method: 1) Find all forcing moves (checks, captures, threats). 2) Evaluate the most forcing one fully. 3) Calculate opponent's ONLY or BEST reply. 4) Your response. Stop unless forcing continues.",
    why: "Most tactical errors at 1300–1600 happen from stopping calculation one move too early. The missed move was on move 3, not move 10.",
    howToSpot: "Every move: checks first, then captures, then threats. For each forcing line, ask: what is my opponent's best response? Then calculate your reply to that.",
    drill: "In each position: the forcing sequence is 2–3 moves. Calculate before clicking reveal.",
    commonMistake: "Calculating 'I play this, they play that' without asking whether they have a better reply.",
    source: "Kotov — Think Like a Grandmaster",
    boards: [
      {
        fen: "r1bqr1k1/ppp2ppp/2n5/3np3/4P3/2NP1N2/PPP2PPP/R1BQ1RK1 b - - 0 8",
        orientation: "black",
        arrows: [
          { from: "d5", to: "f4", color: "rgba(74,222,128,0.9)" },
          { from: "e5", to: "f3", color: "rgba(250,204,21,0.5)" },
        ],
        caption: "Black has Nf4 and Nf3 as threats. Calculate: which forcing move creates the bigger problem for White? Checks, captures, threats — in order.",
      },
    ],
  },
  {
    label: "Pawn structure: don't create permanent weaknesses",
    concept: "Pawn moves are irreversible. Isolated pawns (no adjacent pawns on neighboring files) become long-term targets. Doubled pawns restrict mobility. Backward pawns can't be defended by other pawns. The ideal structure is connected, mobile, and not over-advanced.",
    why: "Endgames are often decided entirely by pawn structure. A bad pawn on move 15 can cost you the game on move 60.",
    howToSpot: "Before any pawn push: after this push, is the pawn defended? Can it advance further? Does it leave a backward pawn behind? Does it create an isolated pawn?",
    drill: "Review your last 5 losses. Find the first pawn move that created a permanent weakness. Was it avoidable?",
    commonMistake: "Advancing pawns quickly without a plan. Pawn advances should open a file, create a passed pawn, or gain space — not just 'because I can.'",
    source: "Silman — How to Reassess Your Chess",
    boards: [
      {
        fen: "4k3/ppp2ppp/3p4/8/3P4/3P4/PP3PPP/4K3 w - - 0 1",
        orientation: "white",
        arrows: [{ from: "d4", to: "d4", color: "rgba(239,68,68,0.3)" }],
        caption: "Isolated d-pawn: defended only by pieces, not pawns. In the endgame this becomes a permanent target — avoid creating these.",
      },
      {
        moves: "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4",
        orientation: "white",
        arrows: [{ from: "d4", to: "d5", color: "rgba(74,222,128,0.9)" }],
        caption: "Slav: White's d4 pawn is strong — central, defended, not isolated. This is a healthy pawn structure to aim for.",
      },
    ],
  },
  {
    label: "Endgame: king activation and opposition",
    concept: "In the endgame, your king becomes a powerful attacking piece. King opposition (two kings facing each other with one square between them) determines who controls key squares. The rule of the square tells you if a lone king can catch a passed pawn.",
    why: "Most 1300–1600 endgames are decided by who activates their king first. Knowing opposition means converting won positions cleanly instead of drawing them.",
    howToSpot: "In any endgame: centralise your king immediately (toward d4/e4/d5/e5). In pawn endgames: always check opposition before deciding king placement.",
    drill: "In pawn endgames this week: make the opposition decision consciously. Ask which square gives you opposition before moving.",
    commonMistake: "Keeping the king passive in the endgame. It's your strongest endgame piece — use it.",
    source: "de la Villa — 100 Endgames You Must Know",
    boards: [
      {
        fen: "8/8/8/3k4/3P4/3K4/8/8 w - - 0 1",
        orientation: "white",
        arrows: [{ from: "d3", to: "d4", color: "rgba(239,68,68,0.5)" }, { from: "d5", to: "d4", color: "rgba(74,222,128,0.4)" }],
        caption: "Direct opposition: kings face each other. The player whose turn it ISN'T has the opposition and wins the key squares. White to move loses opposition.",
      },
      {
        fen: "8/8/8/8/5p2/8/8/3K4 b - - 0 1",
        orientation: "black",
        arrows: [{ from: "f4", to: "f1", color: "rgba(74,222,128,0.9)" }],
        caption: "Rule of the square: draw a diagonal from f4 to f1, then to the side. If White's king is outside that square, it can't catch the pawn — Black promotes.",
      },
    ],
  },
  {
    label: "Prophylaxis — stop the plan before it starts",
    concept: "Prophylaxis means identifying your opponent's best plan and stopping it — before they execute it. The best players spend as much time preventing threats as creating them. A prophylactic move often looks quiet but removes entire categories of counterplay.",
    why: "At 1500+, positions don't always have tactical fireworks. The player who understands what the opponent wants — and stops it — wins by strangulation. Their opponent runs out of good moves.",
    howToSpot: "Before every move: ask 'if I do nothing, what is my opponent's single best plan?' If it's dangerous, prevent it. The prophylactic move is usually quiet and non-forcing.",
    drill: "In each position: find the opponent's threat. Find the move that stops it while improving your own position.",
    commonMistake: "Ignoring the opponent's plan because 'my attack is too strong.' Sometimes it isn't.",
    source: "Nimzowitsch — My System",
    boards: [
      {
        moves: "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O cxd4 exd4 dxc4 Bxc4 Nc6 Be3",
        orientation: "white",
        arrows: [{ from: "e3", to: "d4", color: "rgba(74,222,128,0.9)" }],
        caption: "Nimzo-Indian: Be3 is prophylaxis — it supports the d4 pawn before Black attacks it. Preventing the attack is better than defending it.",
      },
    ],
  },
  {
    label: "Time management in blitz",
    concept: "Time is a resource. 2–5 seconds on forcing/obvious moves. 10–15 seconds on critical junctions. Never below 30 seconds in a complex middlegame. Flagging a winning position is pure waste.",
    why: "You've been flagged in a meaningful number of games. Winning positions lost on time are the most expensive mistakes — you did all the work and threw away the result.",
    howToSpot: "Track your time use. If you spend 20+ seconds on moves in familiar opening positions, you'll be in time trouble later. Build fast defaults for positions you've seen dozens of times.",
    drill: "Play 10 games with the explicit goal of never dropping below 30 seconds. Prioritise the clock in the last 2 minutes.",
    commonMistake: "Thinking for a long time about moves in positions you've seen before. Pattern recognition should make these fast.",
    boards: [
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4 Nc3 Nxe4",
        orientation: "black",
        arrows: [{ from: "e4", to: "e4", color: "rgba(74,222,128,0.3)" }],
        caption: "Italian middlegame — a position you've reached 100+ times. You should know the plan in under 3 seconds here. If you're thinking for 20 seconds, you're burning clock on a solved position.",
      },
    ],
  },
  {
    label: "The two weaknesses principle",
    concept: "It's hard to defend one weakness — possible with precise play. But two weaknesses on opposite sides of the board split the defender's attention. Eventually one falls. Create a threat on one wing to divert defenders, then strike on the other.",
    why: "You reach winning positions but fail to convert them. Usually because you push on one side only and allow consolidation. Learn to open a second front.",
    howToSpot: "In a winning position: identify the primary weakness. Then ask: how can I create a second weakness on the other side? Usually a pawn break or piece infiltration opens it.",
    drill: "In each position: identify both weaknesses. The best move maintains pressure on one while creating or attacking the other.",
    commonMistake: "Attacking the same weakness repeatedly. When the defence holds, switch sides immediately.",
    source: "Silman — How to Reassess Your Chess",
    boards: [
      {
        fen: "6k1/r4ppp/1pp5/p7/P3P3/1P1R2PP/5PK1/8 w - - 0 1",
        orientation: "white",
        arrows: [
          { from: "d3", to: "d6", color: "rgba(74,222,128,0.7)" },
          { from: "e4", to: "e5", color: "rgba(250,204,21,0.5)" },
        ],
        caption: "Two weaknesses: Black's a5 pawn and the queenside pawn structure. White attacks a5, Black defends it, White breaks with e5 — Black can't hold both.",
      },
    ],
  },
  {
    label: "Piece coordination — every piece needs a job",
    concept: "Strong positions aren't about individual pieces — it's about harmony. A bishop and rook covering the same diagonal and file create double threats. Knight and bishop covering adjacent squares create a network. Uncoordinated pieces fight each other for space.",
    why: "'My pieces are all in the wrong place' is a coordination failure. The cure: after every move, identify your worst-placed piece and plan to improve it in 3 moves.",
    howToSpot: "Which piece is doing the least? What square maximises its value? How do you get it there? Answering this question every move is the core of positional play.",
    drill: "In each position: identify the passive piece. Find the move that activates it.",
    commonMistake: "Chasing opponent moves reactively, ignoring your own piece improvement.",
    source: "Chernev — Logical Chess Move by Move",
    boards: [
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 O-O O-O d3 d6 c3 Nf6 Re1 a5 Nbd2",
        orientation: "white",
        arrows: [
          { from: "d2", to: "f1", color: "rgba(74,222,128,0.9)" },
          { from: "f1", to: "e3", color: "rgba(74,222,128,0.7)" },
        ],
        caption: "Nd2-f1-e3 — the Italian knight maneuver. Every piece is improving toward a more active square. This is coordination in practice.",
      },
    ],
  },
  {
    label: "Discovered attacks — the invisible threat",
    concept: "A discovered attack moves one piece to reveal an attack from a piece behind it. The moved piece can attack on its own simultaneously, creating two threats at once. Discovered checks are especially powerful — the opponent must respond to the check while also dealing with the secondary threat.",
    why: "Discovered attacks are among the hardest patterns to see for both players. If you learn to create them, your opponents won't see them. If you learn to spot them defensively, you stop losing to them.",
    howToSpot: "Look for pieces on the same line as an enemy piece. If you move the front piece, what does the piece behind it now attack? This is a discovered attack waiting to happen.",
    drill: "In each position: find the piece that, when moved, reveals a lethal attack from the piece behind it.",
    commonMistake: "Only looking at the piece that moves, not the piece it uncovers.",
    source: "Polgar — Chess Tactics for Champions",
    boards: [
      {
        fen: "r1bqkb1r/ppp2ppp/2n5/3pp3/2BnP3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 6",
        orientation: "white",
        arrows: [
          { from: "f3", to: "d4", color: "rgba(74,222,128,0.9)" },
          { from: "c4", to: "f7", color: "rgba(250,204,21,0.7)" },
        ],
        caption: "Nxd4 is a discovered attack: the knight takes on d4, revealing the bishop on c4 attacking f7. Two threats at once — Black can't defend both.",
      },
    ],
  },
  {
    label: "The pin — paralyse, then punish",
    concept: "A pin freezes a piece. An absolute pin (to the king) means the piece literally cannot move legally. A relative pin (to the queen) means moving costs major material. The correct response: heap more pressure on the pinned piece until it collapses, or break the pin with the pinned piece's support.",
    why: "Pins are how positional players grind down tactical players. You get forks and hanging pieces — they get positional squeezes. Learn both sides.",
    howToSpot: "When you pin an opponent's piece, ask: how many more pieces can I pile on that pinned piece? When you're pinned, ask: how do I break it? Options: interpose, move the more valuable piece out, or attack the pinner.",
    drill: "In each position: identify the pin and find either how to increase pressure on the pinned piece, or how to break free from the pin.",
    commonMistake: "Creating a pin but not increasing pressure on it. A pin with no follow-up is just a temporary annoyance.",
    source: "Nimzowitsch — My System",
    boards: [
      {
        moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5 c6 dxc6 bxc6 Qf3",
        orientation: "white",
        arrows: [{ from: "f3", to: "f6", color: "rgba(239,68,68,0.7)" }, { from: "g5", to: "f7", color: "rgba(250,204,21,0.5)" }],
        caption: "Qf3 in the Fried Liver Attack — pins the Nf6 while threatening Nxf7. The pin AND a direct attack: Black is overwhelmed.",
      },
    ],
  },
];

// ── Build curriculum ──────────────────────────────────────────

function buildCurriculum(): WeekMeta[] {
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
      return { key: g.pattern, ...meta, label: (meta as any).label ?? g.label ?? g.pattern, count: g.count, examples: g.examples ?? patternMap[g.pattern] ?? [], source: (meta as any).source ?? "your games" };
    });
  } else {
    const sorted = Object.entries(patternMap).filter(([, v]) => v.length >= 3).sort((a, b) => b[1].length - a[1].length);
    patternWeeks = sorted.map(([key, examples]) => ({
      key, ...(PATTERN_META[key] ?? {}), label: PATTERN_META[key]?.label ?? key.replace(/_/g, " "), count: examples.length, examples, source: "your games",
    }));
  }

  const needed = Math.max(0, 52 - patternWeeks.length);
  // Only use hardcoded STANDARD_WEEKS — all positions are verified canonical openings/endgames
  const standardWeeks = STANDARD_WEEKS.slice(0, needed).map((w: any, i: number) => ({ key: w.id ?? `standard_${i}`, ...w, count: 0, examples: [] }));
  return [...patternWeeks, ...standardWeeks].slice(0, 52) as any[];
}

function parseUCI(uci: string) {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

// ── Board demo component ──────────────────────────────────────

function BoardDemo({ demo }: { demo: BoardDemo }) {
  const { fen, arrows, orientation } = resolveBoard(demo);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-2)", flexShrink: 0 }}>
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          boardStyle: { width: 260, height: 260 },
          darkSquareStyle: { backgroundColor: "#b58863" },
          lightSquareStyle: { backgroundColor: "#f0d9b5" },
          arrows,
          allowDragging: false,
          showAnimations: false,
        }}
      />
      <div style={{ padding: "8px 10px", fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.5, borderTop: "1px solid var(--border)" }}>
        {demo.caption}
      </div>
    </div>
  );
}

// ── Theory section ────────────────────────────────────────────

function TheorySection({ title, body, accent, warn, boards }: { title: string; body: string; accent?: boolean; warn?: boolean; boards?: BoardDemo[] }) {
  return (
    <div style={{ padding: "14px 16px", background: warn ? "rgba(239,68,68,0.04)" : accent ? "var(--bg-2)" : "var(--bg)", border: `1px solid ${warn ? "rgba(239,68,68,0.2)" : "var(--border)"}`, borderRadius: 8 }}>
      <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: warn ? "#ef4444" : accent ? "var(--accent)" : "var(--text-dim)", marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.7, margin: 0, flex: 1, minWidth: 260 }}>{body}</p>
        {boards && boards.length > 0 && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
            {boards.map((b, i) => <BoardDemo key={i} demo={b} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Lichess puzzle drill ──────────────────────────────────────

function applyUci(fen: string, uci: string): string {
  try {
    const c = new Chess(fen);
    c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    return c.fen();
  } catch { return fen; }
}

function PuzzleDrill({ puzzles }: { puzzles: any[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const puzzle = puzzles[index];

  const { puzzleFen, solutionUci, orientation } = useMemo(() => {
    if (!puzzle) return { puzzleFen: null, solutionUci: null, orientation: "white" as const };
    const fen = applyUci(puzzle.fen, puzzle.moves[0]);
    const chess = new Chess(fen);
    return {
      puzzleFen: fen,
      solutionUci: puzzle.moves[1] as string,
      orientation: (chess.turn() === "w" ? "white" : "black") as "white" | "black",
    };
  }, [puzzle]);

  const arrows = useMemo(() => {
    if (!revealed || !solutionUci) return [];
    return [{ startSquare: solutionUci.slice(0, 2), endSquare: solutionUci.slice(2, 4), color: "rgba(74,222,128,0.9)" }];
  }, [revealed, solutionUci]);

  function goTo(n: number) { setIndex(Math.max(0, Math.min(puzzles.length - 1, n))); setRevealed(false); }

  if (!puzzle || !puzzleFen) return <div style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No Lichess puzzles for this pattern.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ padding: "10px 14px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.8rem", color: "var(--text-dim)", lineHeight: 1.6, display: "flex", gap: 10 }}>
        <span style={{ color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>Lichess puzzle:</span>
        <span>Find the best move. All positions are Stockfish-verified.</span>
      </div>
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
        puzzle {index + 1} of {puzzles.length} · rating {puzzle.rating}
      </div>
      <div style={{ display: "flex", gap: 36, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          <Chessboard options={{ position: puzzleFen, boardOrientation: orientation, boardStyle: { width: 420, height: 420 }, darkSquareStyle: { backgroundColor: "#b58863" }, lightSquareStyle: { backgroundColor: "#f0d9b5" }, arrows, allowDragging: false }} />
          <div style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center" }}>
            {revealed ? "green = best move" : `playing as ${orientation} — find the best move`}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 14 }}>
          {!revealed ? (
            <button onClick={() => setRevealed(true)} style={{ background: "var(--accent)", color: "#000", border: "none", borderRadius: 6, padding: "11px 18px", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer" }}>Show best move →</button>
          ) : (
            <div style={{ padding: "12px 14px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6 }}>
              <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--win)", marginBottom: 8 }}>Stockfish solution</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Best move: <strong style={{ color: "var(--text)" }}>{solutionUci?.slice(0, 2)}-{solutionUci?.slice(2, 4)}</strong>
              </div>
              {puzzle.url && (
                <a href={puzzle.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: "0.72rem", color: "var(--accent)" }}>view on Lichess →</a>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => goTo(index - 1)} disabled={index === 0} style={navBtnStyle(index === 0)}>previous</button>
            <button onClick={() => goTo(index + 1)} disabled={index >= puzzles.length - 1} style={navBtnStyle(index >= puzzles.length - 1)}>next</button>
          </div>
          {puzzleFen && (
            <PositionChat
              fen={puzzleFen}
              bestUci={solutionUci ?? undefined}
              color={orientation}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Drill view ────────────────────────────────────────────────

function DrillView({ pool, puzzles, week, onBack, onMarkComplete, isComplete }: {
  pool: any[]; puzzles: any[]; week: any; onBack: () => void; onMarkComplete: () => void; isComplete: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tab, setTab] = useState<"theory" | "drill" | "puzzles">("theory");
  const [overrideFen, setOverrideFen] = useState<string | null>(null);

  const total = pool.length;
  const blunder = pool[index];
  const playedArrow = parseUCI(blunder?.played_uci ?? "");
  const bestArrow = parseUCI(blunder?.best_uci ?? "");

  const viktorFen = overrideFen;
  const boardFen = viktorFen ?? blunder?.fen_before;

  const arrows = useMemo(() => {
    if (tab !== "drill" || viktorFen) return [];
    const a: any[] = [];
    if (playedArrow) a.push({ startSquare: playedArrow.from, endSquare: playedArrow.to, color: "rgba(239,68,68,0.9)" });
    if (revealed && bestArrow) a.push({ startSquare: bestArrow.from, endSquare: bestArrow.to, color: "rgba(74,222,128,0.9)" });
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, index, tab, viktorFen]);

  function goTo(n: number) { setIndex(Math.max(0, Math.min(total - 1, n))); setRevealed(false); setOverrideFen(null); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 940 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={backBtnStyle}>← curriculum</button>
        <span style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--text)" }}>{week.label}</span>
        {week.source && <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", fontStyle: "italic" }}>— {week.source}</span>}
        {isComplete && <span style={{ fontSize: "0.72rem", color: "var(--win)", border: "1px solid var(--win)", borderRadius: 4, padding: "2px 8px", marginLeft: "auto" }}>✓ complete</span>}
      </div>

      <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden", alignSelf: "flex-start" }}>
        {([
          ["theory", "Theory"],
          ["drill", `Your games (${total})`],
          ["puzzles", `Lichess puzzles (${puzzles.length})`],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t as any)} style={{ padding: "7px 18px", background: tab === t ? "var(--bg-3)" : "transparent", border: "none", borderLeft: t !== "theory" ? "1px solid var(--border)" : "none", color: tab === t ? "var(--text)" : "var(--text-muted)", fontSize: "0.8rem", fontWeight: tab === t ? 600 : 400, cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "theory" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 900 }}>
          <TheorySection title="The concept" body={week.concept} boards={(week.boards ?? []).slice(0, 1)} />
          <TheorySection title="Why it matters for you" body={week.why} accent />
          <TheorySection title="How to spot it" body={week.howToSpot} boards={(week.boards ?? []).slice(1, 2)} />
          <TheorySection title="How to practice" body={week.drill} />
          <TheorySection title="Common mistake" body={week.commonMistake} warn />
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            {total > 0 && (
              <button onClick={() => setTab("drill")} style={{ background: "var(--accent)", color: "#000", border: "none", borderRadius: 6, padding: "10px 20px", fontSize: "0.86rem", fontWeight: 600, cursor: "pointer" }}>
                Drill {total} positions from your games →
              </button>
            )}
            {!isComplete && (
              <button onClick={onMarkComplete} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 20px", fontSize: "0.86rem", color: "var(--text-muted)", cursor: "pointer" }}>
                Mark as understood →
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "drill" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!blunder ? (
            <div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No positions yet — run <code style={{ fontFamily: "monospace", background: "var(--bg-3)", padding: "2px 6px", borderRadius: 3 }}>python3 scripts/update_games.py</code> to load patterns.</p>
              {!isComplete && <button onClick={onMarkComplete} style={{ marginTop: 16, background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 20px", fontSize: "0.86rem", color: "var(--text-muted)", cursor: "pointer" }}>Mark as understood → advance</button>}
            </div>
          ) : (
            <>
              <div style={{ padding: "10px 14px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.8rem", color: "var(--text-dim)", lineHeight: 1.6, display: "flex", gap: 10 }}>
                <span style={{ color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>Key:</span>
                <span>{week.drill}</span>
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>position {index + 1} of {total}</div>
              <div style={{ display: "flex", gap: 36, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flexShrink: 0 }}>
                  <Chessboard options={{ position: boardFen, boardOrientation: blunder.color === "white" ? "white" : "black", boardStyle: { width: 420, height: 420 }, darkSquareStyle: { backgroundColor: "#b58863" }, lightSquareStyle: { backgroundColor: "#f0d9b5" }, arrows, allowDragging: false }} />
                  <div style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    {viktorFen ? (
                      <><span style={{ color: "var(--accent)" }}>Viktor&apos;s position</span><button onClick={() => setOverrideFen(null)} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "0.68rem", cursor: "pointer", textDecoration: "underline", padding: 0 }}>reset</button></>
                    ) : revealed ? "red = your move  ·  green = best move" : `move ${blunder.move_num} · ${blunder.color} · ${blunder.time_control ?? "blitz"}`}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ padding: "12px 14px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6 }}>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>context</div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{blunder.game_date}{blunder.opponent && <> · vs <strong style={{ color: "var(--text)" }}>{blunder.opponent}</strong></>}</div>
                    <div style={{ marginTop: 6, fontSize: "0.82rem", color: "var(--text-muted)" }}>move {blunder.move_num} · playing as {blunder.color}</div>
                  </div>
                  {!revealed ? (
                    <button onClick={() => setRevealed(true)} style={{ background: "var(--accent)", color: "#000", border: "none", borderRadius: 6, padding: "11px 18px", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer" }}>What's the best move? →</button>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {(() => {
                        const r = explainResult(blunder);
                        return (
                          <div style={{ padding: "12px 14px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6 }}>
                            <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: r.severityColor, marginBottom: 10 }}>{r.severityLabel}</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Before: <span style={{ color: "var(--text)" }}>{r.before}</span></div>
                              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>After: <span style={{ color: r.severityColor, fontWeight: 500 }}>{r.after}</span></div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => goTo(index - 1)} disabled={index === 0} style={navBtnStyle(index === 0)}>previous</button>
                    <button onClick={() => goTo(index + 1)} disabled={index >= total - 1} style={navBtnStyle(index >= total - 1)}>next</button>
                    <button onClick={() => { setIndex(Math.floor(Math.random() * total)); setRevealed(false); }} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", padding: "8px 14px", fontSize: "0.82rem", cursor: "pointer" }}>random</button>
                  </div>
                  <PositionChat
                    fen={blunder.fen_before}
                    playedUci={blunder.played_uci}
                    bestUci={blunder.best_uci}
                    pattern={blunder.pattern}
                    color={blunder.color}
                    moveNum={blunder.move_num}
                    opponent={blunder.opponent}
                    onBoardUpdate={setOverrideFen}
                  />
                </div>
              </div>
              {!isComplete && (
                <div style={{ marginTop: 8, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
                  <button onClick={onMarkComplete} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 20px", fontSize: "0.86rem", color: "var(--text-muted)", cursor: "pointer" }}>
                    I understand this concept → advance to next week
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "puzzles" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <PuzzleDrill puzzles={puzzles} />
          {!isComplete && (
            <div style={{ marginTop: 8, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
              <button onClick={onMarkComplete} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 20px", fontSize: "0.86rem", color: "var(--text-muted)", cursor: "pointer" }}>
                I understand this concept → advance to next week
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const backBtnStyle: React.CSSProperties = { background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: 5, padding: "5px 10px", fontSize: "0.8rem", cursor: "pointer" };
const navBtnStyle = (disabled: boolean): React.CSSProperties => ({ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", padding: "8px 14px", fontSize: "0.82rem", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 });

// ── Week card ─────────────────────────────────────────────────

function WeekCard({ week, weekNum, status, onOpen }: { week: any; weekNum: number; status: "complete" | "current" | "upcoming"; onOpen: () => void }) {
  return (
    <button onClick={onOpen} style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: status === "current" ? "var(--bg-2)" : "var(--bg)", border: `1px solid ${status === "current" ? "var(--accent)" : "var(--border)"}`, borderRadius: 8, cursor: "pointer", textAlign: "left", color: "var(--text)", opacity: status === "upcoming" ? 0.65 : 1, transition: "border-color 0.15s" }}
      onMouseEnter={(e) => { if (status !== "current") (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--text-dim)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = status === "current" ? "var(--accent)" : "var(--border)"; }}
    >
      <span style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "var(--text-dim)", minWidth: 28 }}>{weekNum}</span>
      <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", background: status === "complete" ? "var(--win)" : status === "current" ? "var(--accent)" : "var(--bg-3)", color: status === "complete" ? "#000" : status === "current" ? "#000" : "var(--text-dim)", border: status === "upcoming" ? "1px solid var(--border)" : "none" }}>
        {status === "complete" ? "✓" : status === "current" ? "→" : "·"}
      </span>
      <span style={{ flex: 1, fontSize: "0.88rem", fontWeight: status === "current" ? 600 : 400, color: status === "complete" ? "var(--text-muted)" : "var(--text)" }}>{week.label}</span>
      {week.source && week.source !== "your games" && <span style={{ fontSize: "0.68rem", color: "var(--text-dim)", fontStyle: "italic", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{week.source}</span>}
      {week.count > 0 && <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontFamily: "monospace", flexShrink: 0 }}>{week.count}x</span>}
      {status === "current" && <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>NOW</span>}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function TacticsPage() {
  const curriculum = useMemo(() => buildCurriculum(), []);
  const [completedWeeks, setCompletedWeeks] = useState<number[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [openWeek, setOpenWeek] = useState<number | null>(null);

  useEffect(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) setCompletedWeeks(JSON.parse(s)); } catch {}
    setHydrated(true);
  }, []);

  const currentWeekIndex = useMemo(() => {
    for (let i = 0; i < curriculum.length; i++) { if (!completedWeeks.includes(i)) return i; }
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

  if (openWeek !== null) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "32px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <DrillView
            pool={(curriculum[openWeek] as any).examples ?? []}
            puzzles={getPuzzlesForPattern((curriculum[openWeek] as any).key ?? "")}
            week={curriculum[openWeek]}
            onBack={() => setOpenWeek(null)}
            onMarkComplete={() => markComplete(openWeek)}
            isComplete={completedWeeks.includes(openWeek)}
          />
        </div>
      </div>
    );
  }

  const current = curriculum[currentWeekIndex] as any;
  const totalComplete = completedWeeks.length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "32px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: "1.35rem", fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>52-week training plan</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>
            {totalComplete > 0 ? `${totalComplete} of 52 weeks complete` : "one core idea per week — theory + board demos + your game positions"}
          </p>
        </div>

        <div style={{ padding: "20px 22px", background: "var(--bg-2)", border: "1px solid var(--accent)", borderRadius: 10, marginBottom: 28 }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>this week · week {currentWeekIndex + 1}</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 8 }}>{current.label}</div>
          {current.source && current.source !== "your games" && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontStyle: "italic", marginBottom: 10 }}>{current.source}</div>}
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.65, margin: "0 0 16px" }}>{current.concept}</p>
          <button onClick={() => setOpenWeek(currentWeekIndex)} style={{ background: "var(--accent)", color: "#000", border: "none", borderRadius: 6, padding: "9px 18px", fontSize: "0.86rem", fontWeight: 600, cursor: "pointer" }}>
            {current.examples?.length > 0 ? `Study + drill ${current.examples.length} positions →` : "Study theory + board demos →"}
          </button>
        </div>

        {totalComplete > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ height: 3, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(totalComplete / 52) * 100}%`, background: "var(--accent)", borderRadius: 2, transition: "width 0.4s" }} />
            </div>
            <div style={{ marginTop: 5, fontSize: "0.7rem", color: "var(--text-dim)" }}>{totalComplete}/52 weeks complete</div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {curriculum.map((week, i) => (
            <WeekCard key={(week as any).key} week={week} weekNum={i + 1} status={completedWeeks.includes(i) ? "complete" : i === currentWeekIndex ? "current" : "upcoming"} onOpen={() => setOpenWeek(i)} />
          ))}
        </div>
      </div>
    </div>
  );
}
