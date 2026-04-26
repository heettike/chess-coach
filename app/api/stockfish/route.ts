import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";

export interface StockfishLine {
  rank: number;
  sanMoves: string[];   // first 5 moves in SAN
  uciMoves: string[];
  firstMoveSan: string;
  firstMoveUci: string;
  eval: string;         // "+2.3" / "-1.1" / "Mate in 3" / "Opponent mates in 2"
  evalRaw: { cp?: number; mate?: number };
}

export interface StockfishResult {
  fen: string;
  depth: number;
  lines: StockfishLine[];
  error?: string;
}

function formatEval(cp?: number, mate?: number): string {
  if (mate !== undefined) {
    return mate > 0 ? `Mate in ${mate}` : `Opponent mates in ${Math.abs(mate)}`;
  }
  if (cp !== undefined) {
    const pawns = (cp / 100).toFixed(1);
    return cp >= 0 ? `+${pawns}` : `${pawns}`;
  }
  return "0.0";
}

function uciLineToSan(fen: string, uciStr: string, maxMoves = 5): { san: string[]; uci: string[] } {
  const ucis = uciStr.trim().split(/\s+/).filter(Boolean).slice(0, maxMoves);
  const chess = new Chess(fen);
  const san: string[] = [];
  const uci: string[] = [];
  for (const u of ucis) {
    try {
      const mv = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
      san.push(mv.san);
      uci.push(u);
    } catch {
      break;
    }
  }
  return { san, uci };
}

export async function GET(req: NextRequest) {
  const fen = req.nextUrl.searchParams.get("fen");
  if (!fen) return NextResponse.json({ error: "missing fen" }, { status: 400 });

  try {
    const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=3`;
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });

    if (!r.ok) {
      return NextResponse.json({ fen, depth: 0, lines: [], error: "no cloud eval for this position" });
    }

    const data = await r.json();
    const pvs: { moves: string; cp?: number; mate?: number }[] = data?.pvs ?? [];

    const lines: StockfishLine[] = pvs.map((pv, i) => {
      const { san, uci } = uciLineToSan(fen, pv.moves ?? "");
      return {
        rank: i + 1,
        sanMoves: san,
        uciMoves: uci,
        firstMoveSan: san[0] ?? "",
        firstMoveUci: uci[0] ?? "",
        eval: formatEval(pv.cp, pv.mate),
        evalRaw: { cp: pv.cp, mate: pv.mate },
      };
    });

    return NextResponse.json({ fen, depth: data.depth ?? 0, lines } as StockfishResult);
  } catch (e) {
    return NextResponse.json({ fen, depth: 0, lines: [], error: String(e) });
  }
}
