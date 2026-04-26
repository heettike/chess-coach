// Converts Stockfish eval strings (from player's perspective) to plain English.
// Positive = player is ahead. "M+N" = player has mate in N. "M-N" = opponent has mate in N.

export interface EvalExplained {
  before: string;   // "you were winning by a lot"
  after: string;    // "your opponent now has forced checkmate in 2 moves"
  severity: "catastrophic" | "blunder" | "mistake" | "inaccuracy";
  severityLabel: string; // "catastrophic blunder"
  severityColor: string;
}

function parseMate(s: string): number | null {
  // M+4 → +4 (you have mate in 4)  M-2 → -2 (opponent has mate in 2)
  const m = s.match(/^M([+-]?\d+)$/i);
  if (m) return parseInt(m[1]);
  return null;
}

function parseCp(s: string | number): number | null {
  const val = parseFloat(String(s));
  return isNaN(val) ? null : val;
}

function describePosition(e: string | number): string {
  const s = String(e).trim();
  const mate = parseMate(s);
  if (mate !== null) {
    if (mate > 0) return `you had forced checkmate in ${mate} move${mate === 1 ? "" : "s"}`;
    return `you were being mated in ${Math.abs(mate)} move${Math.abs(mate) === 1 ? "" : "s"}`;
  }
  const val = parseCp(s);
  if (val === null) return "the position was unclear";
  if (Math.abs(val) < 0.3) return "the position was equal";
  if (val >= 5) return "you were completely winning";
  if (val >= 2.5) return "you were winning by a lot";
  if (val >= 1.2) return "you had a clear advantage";
  if (val >= 0.4) return "you were slightly ahead";
  if (val <= -5) return "you were losing badly";
  if (val <= -2.5) return "you were losing by a lot";
  if (val <= -1.2) return "you were at a clear disadvantage";
  return "you were slightly behind";
}

function describeConsequence(evalAfter: string | number, san: string): string {
  const s = String(evalAfter).trim();
  const mate = parseMate(s);
  if (mate !== null) {
    if (mate < 0) {
      const n = Math.abs(mate);
      return `${san} gave your opponent forced checkmate in ${n} move${n === 1 ? "" : "s"}`;
    }
    return `even after ${san} you still have forced checkmate — nice`;
  }
  const val = parseCp(s);
  if (val === null) return `${san} made the position unclear`;
  if (Math.abs(val) < 0.3) return `${san} let the advantage slip — the position is now equal`;
  if (val >= 2.5) return `${san} was fine — you're still winning`;
  if (val >= 0.4) return `${san} gave up some of your edge`;
  if (val <= -5) return `${san} turned a winning position into a loss`;
  if (val <= -2.5) return `${san} threw away your advantage — you're now losing`;
  if (val <= -1.2) return `${san} gave away a significant chunk of your advantage`;
  return `${san} cost you your edge`;
}

function getSeverity(evalBefore: string | number, evalAfter: string | number): Pick<EvalExplained, "severity" | "severityLabel" | "severityColor"> {
  const beforeS = String(evalBefore).trim();
  const afterS = String(evalAfter).trim();

  const afterMate = parseMate(afterS);
  const beforeVal = parseCp(beforeS) ?? (parseMate(beforeS) !== null ? (parseMate(beforeS)! > 0 ? 10 : -10) : 0);
  const afterVal = afterMate !== null ? (afterMate < 0 ? -10 : 10) : (parseCp(afterS) ?? 0);

  const drop = beforeVal - afterVal;

  if (afterMate !== null && afterMate < 0) {
    return { severity: "catastrophic", severityLabel: "catastrophic blunder", severityColor: "#ef4444" };
  }
  if (drop >= 4) return { severity: "blunder", severityLabel: "big blunder", severityColor: "#ef4444" };
  if (drop >= 2) return { severity: "mistake", severityLabel: "mistake", severityColor: "#f97316" };
  return { severity: "inaccuracy", severityLabel: "inaccuracy", severityColor: "#facc15" };
}

export function explainResult(blunder: {
  san: string;
  eval_before: string | number;
  eval_after: string | number;
}): EvalExplained {
  return {
    before: describePosition(blunder.eval_before),
    after: describeConsequence(blunder.eval_after, blunder.san),
    ...getSeverity(blunder.eval_before, blunder.eval_after),
  };
}
