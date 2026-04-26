import { OpeningLesson } from "./types";

// Curated lessons targeting tiktiktike's actual weak spots
// Based on analysis: Italian Game 44% WR, Center Game 43% WR, King's Fianchetto 42-48%

export const openingLessons: OpeningLesson[] = [
  {
    id: "italian-two-knights",
    name: "Italian Game — Stop the Trap",
    color: "white",
    keyIdea: "After Bc4, your opponent plays Nd4 — the Blackburne-Shilling Gambit. Most players fall into the trap. You need to sidestep it correctly.",
    summary: "You've played Italian Game lines 314 times with a 44% win rate. The main leak is after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nd4 — the Blackburne-Shilling Gambit. Here's how to handle it and when to play the real Italian.",
    moves: [
      { san: "e4", uci: "e2e4", explanation: "Control the center. e4 is the most direct — fight for the center immediately." },
      { san: "e5", uci: "e7e5", explanation: "Black mirrors you. Classical double king pawn game." },
      { san: "Nf3", uci: "g1f3", explanation: "Attack the e5 pawn. This also develops a piece toward the center — two goals at once." },
      { san: "Nc6", uci: "b8c6", explanation: "Black defends e5 and develops. Most natural." },
      { san: "Bc4", uci: "f1c4", explanation: "The Italian bishop. Pointing at f7 — the weakest square in Black's position at the start." },
      { san: "Nd4", uci: "c6d4", explanation: "THE TRAP MOVE. Black plays Blackburne-Shilling Gambit, threatening Nxf3+ forking your queen. Most beginners take on f3 and walk into Qh4# checkmate. Do NOT take." },
      { san: "Nxe5", uci: "f3e5", explanation: "The antidote. Counter-attack immediately. Don't be scared of Nd4 — just take the free pawn. Black's threat of Nxf3+ is gone because after Nxf3+ Kd1 Black has nothing." },
      { san: "Qg5", uci: "d8g5", explanation: "Black attacks your knight and g2 at once. Looks scary. It's not. Stay calm." },
      { san: "Nxf7", uci: "e5f7", explanation: "Take the rook with check. This is the key move — Fried Liver style counter-attack. You're completely winning here with correct play." },
    ]
  },
  {
    id: "italian-giuoco",
    name: "Italian Game — Giuoco Piano Setup",
    color: "white",
    keyIdea: "When Black plays the normal Bc5 response, build a strong center with c3 and d4. This is the correct Italian Game plan.",
    summary: "When Black plays normally (not the trap), here's the correct Italian Game plan. The goal is c3-d4 — a pawn center that gives you a lasting advantage.",
    moves: [
      { san: "e4", uci: "e2e4", explanation: "Center. Always." },
      { san: "e5", uci: "e7e5", explanation: "Black mirrors." },
      { san: "Nf3", uci: "g1f3", explanation: "Attack e5, develop." },
      { san: "Nc6", uci: "b8c6", explanation: "Defend e5, develop." },
      { san: "Bc4", uci: "f1c4", explanation: "Italian bishop — aim at f7." },
      { san: "Bc5", uci: "f8c5", explanation: "Black copies. Now the position is symmetrical — you need a plan to break it." },
      { san: "c3", uci: "c2c3", explanation: "Prepare d4. This is the KEY move of the Italian Game. You're building a pawn center. Don't rush d4 yet — prepare it first." },
      { san: "Nf6", uci: "g8f6", explanation: "Black develops, attacks your e4 pawn." },
      { san: "d4", uci: "d2d4", explanation: "Now strike the center. You have c3 supporting this pawn so Black can't easily capture. This gives you a space advantage." },
      { san: "exd4", uci: "e5d4", explanation: "Black takes. Now you have a choice: cxd4 (open center) or take with the knight." },
      { san: "cxd4", uci: "c3d4", explanation: "Recapture with the pawn. You now have a strong center. Black's bishop on c5 is under pressure. Your plan: develop Nc3, 0-0, then attack." },
    ]
  },
  {
    id: "ruy-lopez-basics",
    name: "Ruy Lopez — The Best Opening in Chess",
    color: "white",
    keyIdea: "The Ruy Lopez (Spanish Opening) is the most theoretically sound 1.e4 opening. Bb5 pins the knight that defends e5 — creating long-term pressure without any tricks.",
    summary: "You play Bb5 (Ruy Lopez) 100+ times with ~50% win rate — better than your Italian! This is the right direction. Learn the main ideas and you'll push this much higher.",
    moves: [
      { san: "e4", uci: "e2e4", explanation: "Center." },
      { san: "e5", uci: "e7e5", explanation: "Black mirrors." },
      { san: "Nf3", uci: "g1f3", explanation: "Attack e5." },
      { san: "Nc6", uci: "b8c6", explanation: "Defend e5." },
      { san: "Bb5", uci: "f1b5", explanation: "The Ruy Lopez. You're not directly attacking e5 — you're putting indirect pressure on it. The bishop pins Nc6, which defends e5. This is long-term strategic thinking." },
      { san: "a6", uci: "a7a6", explanation: "The Morphy Defense — most common. Black says 'I challenge your bishop.' You have a choice now." },
      { san: "Ba4", uci: "b5a4", explanation: "Retreat but maintain the pin. Don't take on c6 — that doubles Black's pawns but gives them the bishop pair and opens the b-file for the rook. Patience." },
      { san: "Nf6", uci: "g8f6", explanation: "Black develops and counter-attacks e4." },
      { san: "O-O", uci: "e1g1", explanation: "Castle. King safety first. Also, this threatens Bxc6 followed by Nxe5 since the pin is gone." },
      { san: "Be7", uci: "f8e7", explanation: "Black prepares to castle. This is the Closed Ruy Lopez — the main line." },
      { san: "Re1", uci: "f1e1", explanation: "Support the e4 pawn. The rook belongs on e1 in the Ruy Lopez — it will support e4 and often come into play on e5 later." },
    ]
  },
  {
    id: "as-black-vs-e4",
    name: "Playing Black — Caro-Kann Defense",
    color: "black",
    keyIdea: "As Black you score 5% worse than as White. You need a solid, reliable defense to 1.e4. The Caro-Kann gives you a good pawn structure without memorizing sharp lines.",
    summary: "Your Black results are dragging your rating. Instead of playing into your opponent's preparation after 1.e4 e5, try the Caro-Kann (1...c6). Solid pawn structure, easy to learn, used by top GMs.",
    moves: [
      { san: "e4", uci: "e2e4", explanation: "White plays the most common opening move." },
      { san: "c6", uci: "c7c6", explanation: "The Caro-Kann. Not e5 — instead prepare d5. This pawn structure is much harder to attack than e5 positions." },
      { san: "d4", uci: "d2d4", explanation: "White builds a full pawn center. Most common response." },
      { san: "d5", uci: "d7d5", explanation: "Challenge the center immediately. c6 was preparation for this. You now have equal center control." },
      { san: "e5", uci: "e4e5", explanation: "White pushes forward. This is the Advance Variation." },
      { san: "Bf5", uci: "c8f5", explanation: "Develop the bishop BEFORE closing the chain. This is the key Caro-Kann idea — get the bishop out before it gets locked in. This is why Caro-Kann is better than French for many players." },
      { san: "Nf3", uci: "g1f3", explanation: "White develops." },
      { san: "e6", uci: "e7e6", explanation: "Solidify. Your pawn structure is rock solid. White has space but you have no weaknesses. Your plan: Nd7, c5, then attack White's d4 pawn." },
      { san: "Be2", uci: "f1e2", explanation: "White develops." },
      { san: "Ne7", uci: "g8e7", explanation: "Develop the knight to e7 not f6 — f6 is blocked by the pawn chain. Ne7 supports d5 and c6." },
      { san: "O-O", uci: "e1g1", explanation: "White castles." },
      { san: "Nd7", uci: "b8d7", explanation: "Develop. Now you're ready to play c5, challenging White's center. The position is roughly equal and you understand the plan." },
    ]
  },
  {
    id: "king-fianchetto-correct",
    name: "King's Fianchetto — What You're Doing Wrong",
    color: "white",
    keyIdea: "You play g3 systems 90+ times but with mediocre results. The issue: you're not understanding when to open the game and when to keep it closed.",
    summary: "g3 (King's Fianchetto / Catalan setup) is a solid opening — but you need a clear plan. After g3 Bg2, you must decide: build a Catalan structure with d4-c4, or play a King's Indian Attack.",
    moves: [
      { san: "g3", uci: "g2g3", explanation: "Fianchetto system. You're planning Bg2, then deciding based on Black's setup." },
      { san: "d5", uci: "d7d5", explanation: "Black plays in the center." },
      { san: "Bg2", uci: "f1g2", explanation: "The fianchetto bishop. This will become your strongest piece — it controls a long diagonal." },
      { san: "Nf6", uci: "g8f6", explanation: "Black develops." },
      { san: "Nf3", uci: "g1f3", explanation: "Develop the knight. Now you face a decision: d4-c4 (Catalan) or d3 (King's Indian Attack)." },
      { san: "e6", uci: "e7e6", explanation: "Black plays solid." },
      { san: "d4", uci: "d2d4", explanation: "Commit to the Catalan! This is the right move. d4 with your bishop on g2 = massive pressure on the long diagonal." },
      { san: "Be7", uci: "f8e7", explanation: "Black develops." },
      { san: "c4", uci: "c2c4", explanation: "The Catalan move. Attack d5. Now your bishop on g2 is aiming at Black's queenside. This is one of the most positionally sound openings in chess." },
      { san: "O-O", uci: "e8g8", explanation: "Black castles." },
      { san: "O-O", uci: "e1g1", explanation: "Castle. Your position is excellent. The g2 bishop controls the long diagonal, c4 puts pressure on d5, and you have a slight space advantage." },
    ]
  },
  {
    id: "tactics-fork",
    name: "Knight Forks — The Pattern You Miss Most",
    color: "white",
    keyIdea: "A knight fork attacks two pieces at once. Knights are the most dangerous tactical pieces because they move in an L-shape that's hard to visualize. You miss these constantly.",
    summary: "Knight forks appear in your games repeatedly. The pattern: your opponent has two valuable pieces that can both be attacked by a knight in one move. Always check knight outpost squares that attack two pieces.",
    moves: [
      { san: "e4", uci: "e2e4", explanation: "We're setting up a position to teach the fork pattern." },
      { san: "e5", uci: "e7e5", explanation: "" },
      { san: "Nf3", uci: "g1f3", explanation: "" },
      { san: "Nc6", uci: "b8c6", explanation: "" },
      { san: "Bc4", uci: "f1c4", explanation: "" },
      { san: "Nf6", uci: "g8f6", explanation: "" },
      { san: "Ng5", uci: "f3g5", explanation: "TACTIC: The knight jumps to g5 attacking f7 — a square defended only by the king. This threatens Nxf7 forking the queen on d8 and the rook on h8. Black MUST respond. Can you see why Nxf7 would be devastating?" },
      { san: "d5", uci: "d7d5", explanation: "Black counterattacks. This is the Fried Liver Defense — the best response." },
      { san: "exd5", uci: "e4d5", explanation: "Take the pawn." },
      { san: "Nxd5", uci: "c6d5", explanation: "Black recaptures with the knight." },
      { san: "Nxf7", uci: "g5f7", explanation: "THE FORK. Knight takes f7 — attacking the queen on d8 AND the rook on h8 simultaneously. Black cannot save both. This is a double attack — one of the most common winning tactics in chess." },
    ]
  }
];
