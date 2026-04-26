/**
 * /api/position-explain
 *
 * Ground truth position explainer. All chess facts come from Stockfish (via
 * Lichess cloud eval). Claude is never asked to calculate or reason about chess.
 *
 * Returns a structured explanation + pre-written Viktor message based on:
 *   - Pattern type (from Stockfish pattern classifier in update_games.py)
 *   - Eval before/after (from Stockfish)
 *   - Best move + line (from Lichess cloud eval, Stockfish depth ~26)
 *   - Plain-English piece list (decoded from FEN)
 */

import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";

interface ExplainRequest {
  fen: string;
  playedUci?: string;
  bestUci?: string;
  pattern?: string;
  evalBefore?: string;
  evalAfter?: string;
  color?: string;
}

interface ExplainResult {
  viktorMessage: string;        // shown immediately as Viktor's first message
  bestMoveSan: string;
  engineLine: string[];         // SAN moves
  engineEval: string;
  depth: number;
  structuredContext: string;    // injected into follow-up Claude calls
}

// ── Lichess cloud eval ─────────────────────────────────────────

async function fetchCloudEval(fen: string) {
  try {
    const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=1`;
    const r = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 3600 } });
    if (!r.ok) return null;
    const data = await r.json();
    const pv = data?.pvs?.[0];
    if (!pv) return null;

    const moves = (pv.moves ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
    const chess = new Chess(fen);
    const sanMoves: string[] = [];
    for (const uci of moves) {
      try {
        const mv = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
        sanMoves.push(mv.san);
      } catch { break; }
    }

    let evalStr = "0.0";
    if (pv.mate !== undefined) evalStr = pv.mate > 0 ? `Mate in ${pv.mate}` : `Opponent mates in ${Math.abs(pv.mate)}`;
    else if (pv.cp !== undefined) { const p = (pv.cp / 100).toFixed(1); evalStr = pv.cp >= 0 ? `+${p}` : `${p}`; }

    return { sanMoves, evalStr, depth: data.depth ?? 0 };
  } catch { return null; }
}

// ── UCI → SAN ──────────────────────────────────────────────────

function uciToSan(fen: string, uci: string): string {
  if (!uci || uci.length < 4) return uci;
  try {
    const chess = new Chess(fen);
    const mv = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    return mv.san;
  } catch { return uci.slice(0, 2) + "-" + uci.slice(2, 4); }
}

// ── FEN → piece list ───────────────────────────────────────────

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

// ── Deterministic pattern explanations ────────────────────────
// No LLM — pure template. Viktor message is built from verified data only.

interface ExplainData {
  playedSan: string;
  bestSan: string;
  bestEval: string;
  pattern: string;
  engineLine: string[];
  evalBefore: string;
  evalAfter: string;
}

function buildViktorMessage(d: ExplainData): string {
  const lineStr = d.engineLine.slice(0, 4).join(" ");
  const lineNote = lineStr ? ` The engine line goes: ${lineStr}.` : "";

  const templates: Record<string, string> = {
    hanging_piece:     `You played ${d.playedSan} which left one of your pieces undefended — your opponent could take it for free. The engine says ${d.bestSan} (${d.bestEval}) was right because it keeps everything protected.${lineNote}`,
    missed_fork:       `You missed a fork with ${d.bestSan} (${d.bestEval}) — one move that attacks two of your opponent's pieces at once. Instead you played ${d.playedSan} and the chance disappeared.${lineNote}`,
    walked_into_fork:  `${d.playedSan} placed two of your pieces where one enemy piece could attack both at the same time. The engine says ${d.bestSan} (${d.bestEval}) avoids that trap.${lineNote}`,
    missed_checkmate:  `${d.bestSan} was checkmate — the game-winner — and you played ${d.playedSan} instead and missed it.${lineNote}`,
    back_rank:         `Your back rank (the row with your king) was exposed. ${d.playedSan} left it vulnerable. ${d.bestSan} (${d.bestEval}) creates an escape square or blocks the threat.${lineNote}`,
    missed_capture:    `A piece was free — your opponent left it undefended — and you didn't take it. ${d.bestSan} (${d.bestEval}) was the free capture that ${d.playedSan} missed.${lineNote}`,
    walked_into_pin:   `${d.playedSan} put you in a pin — your piece got stuck in front of a more valuable piece and couldn't move. ${d.bestSan} (${d.bestEval}) avoids the pin entirely.${lineNote}`,
    missed_check:      `${d.bestSan} (${d.bestEval}) gives a forcing check that wins material, but you played ${d.playedSan} and let your opponent off the hook.${lineNote}`,
    positional:        `${d.playedSan} was a quiet positional mistake — it reduced your piece activity or left a weakness. ${d.bestSan} (${d.bestEval}) keeps your pieces more active.${lineNote}`,
  };

  const msg = templates[d.pattern] ?? `You played ${d.playedSan} but the engine prefers ${d.bestSan} (${d.bestEval}).${lineNote}`;
  return msg;
}

// ── Handler ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body: ExplainRequest = await req.json();
  const { fen, playedUci, bestUci, pattern = "positional", evalBefore = "?", evalAfter = "?", color = "white" } = body;

  if (!fen) return NextResponse.json({ error: "missing fen" }, { status: 400 });

  // Parallel: cloud eval + SAN conversions
  const [cloudEval, playedSan, bestSan] = await Promise.all([
    fetchCloudEval(fen),
    Promise.resolve(playedUci ? uciToSan(fen, playedUci) : "your move"),
    Promise.resolve(bestUci ? uciToSan(fen, bestUci) : ""),
  ]);

  const engineLine = cloudEval?.sanMoves ?? [];
  const engineEval = cloudEval?.evalStr ?? bestSan ? "" : "unknown";
  const depth = cloudEval?.depth ?? 0;

  // Best move from cloud eval (most accurate), fall back to stored best_uci
  const finalBestSan = engineLine[0] ?? bestSan ?? "?";
  const finalBestEval = cloudEval?.evalStr ?? "";

  const explainData: ExplainData = {
    playedSan,
    bestSan: finalBestSan,
    bestEval: finalBestEval,
    pattern,
    engineLine,
    evalBefore,
    evalAfter,
  };

  const viktorMessage = buildViktorMessage(explainData);

  // Context for Claude follow-up calls — structured, no chess reasoning needed
  const structuredContext = [
    fenToPieceList(fen, color),
    `Move played (wrong): ${playedSan}`,
    `Engine best move: ${finalBestSan} (${finalBestEval})`,
    `Mistake pattern: ${pattern.replace(/_/g, " ")}`,
    `Engine line: ${engineLine.join(" ")}`,
    `\nViktor already told the player: "${viktorMessage}"`,
    `\nFor follow-up questions: only reference the data above. Do not calculate or invent moves. If asked something you can't answer from this data, say so.`,
  ].join("\n");

  return NextResponse.json({
    viktorMessage,
    bestMoveSan: finalBestSan,
    engineLine,
    engineEval: finalBestEval,
    depth,
    structuredContext,
  } as ExplainResult);
}
