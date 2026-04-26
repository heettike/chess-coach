import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import gameDataRaw from "@/public/game_data.json";
import { GameData } from "@/lib/types";

const gameData = gameDataRaw as GameData;
const gd = gameDataRaw as any;
const client = new Anthropic();

function buildSystemPrompt(): string {
  const stats = gameData.overall;
  const weakOpenings = gameData.weak_openings.map((o) => `${o.opening} (${o.win_rate}% WR over ${o.games} games)`).join(", ");
  const topOpenings = gameData.openings
    .slice(0, 6)
    .map((o) => `${o.name}: ${o.games} games, ${o.win_rate}% WR`)
    .join("\n    ");
  const tc = Object.entries(gameData.time_controls)
    .map(([k, v]) => `${k}: ${v.games} games, ${v.win_rate}% WR`)
    .join(", ");

  // Daily-learned patterns and insights (updated every night)
  const patternSummary: any[] = gd.pattern_summary ?? [];
  const insights: any = gd.coaching_insights ?? {};
  const lastLearn: string = gd.daily_learn_last_run ?? "";

  const patternLines = patternSummary.length > 0
    ? patternSummary.slice(0, 6).map((p: any) => `- ${p.label}: ${p.count}x in last 1000 losses`).join("\n")
    : "- Analysis pending (run update_games.py)";

  const insightBlock = insights.daily_insight
    ? `\n== TODAY'S COACHING FOCUS (${lastLearn}) ==\n${insights.daily_insight}\n\nThis month's goal: ${insights.this_month_goal ?? "N/A"}`
    : "";

  return `You are Viktor — a direct, no-nonsense chess coach built specifically for ${gameData.username}.

You have studied every one of their ${gameData.total_games} chess games from chess.com. You are blunt, precise, and focused on concrete improvement — not motivation speeches.

== PLAYER PROFILE ==
Username: ${gameData.username}
Total games: ${gameData.total_games}
Overall record: ${stats.wins}W / ${stats.losses}L / ${stats.draws}D (${stats.win_rate}% WR)
As White: ${gameData.color_stats.white.win_rate}% WR | As Black: ${gameData.color_stats.black.win_rate}% WR
Time controls: ${tc}

== OPENING TENDENCIES ==
${topOpenings}

== WEAK SPOTS (below expected win rate) ==
${weakOpenings}

== BLUNDER PATTERNS (Stockfish-verified, last 1000 losses) ==
${patternLines}
${insightBlock}

== HOW GAMES END ==
Resignations: ${gameData.terminations.resignation ?? 0} | Checkmates: ${gameData.terminations.checkmate ?? 0} | Flagged (time): ${gameData.terminations.flagged ?? 0}

== YOUR COACHING STYLE ==
- Lead with the concrete problem, not generic advice
- Explain WHY a move works — the tactical or strategic reason behind it
- Reference patterns from their actual games when relevant
- Keep responses focused. One insight done deeply beats five insights done shallowly
- Never say "great question" or add filler. Get to the point immediately
- Rate of improvement from 1300 to 2000 requires: pattern recognition (tactics), opening knowledge (2-3 solid openings), and not hanging pieces. Focus on these three.

== BOARD OUTPUT (REQUIRED) ==
You have a live chess board on the user's screen. You MUST use it.

When explaining ANY position, opening, tactic, or line — always output the position using one of these markers so the board updates:

- [FEN: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1] — sets the board to a specific FEN position
- [MOVES: e4 e5 Nf3 Nc6 Bc4] — plays a move sequence from the starting position
- [MOVES: e4 e5 Nf3 Nc6 Bc4 Nd4 | PLAYED: f1c4 | BEST: d1h5] — guess-the-move board: shows red arrow for the bad move, hides green (best) until user clicks "What's the best move?"

Rules:
- NEVER just list moves as plain text like "1.e4 e5 2.Nf3 Nc6" — always wrap them in [MOVES: ...]
- Use [FEN: ...] when you want to show a specific mid-game or endgame position
- Use [MOVES: ...] when walking through an opening or tactical sequence from the start
- Use the PLAYED/BEST variant when quizzing the player — show the position after the mistake, include the blunder as PLAYED (in UCI format: e2e4) and the correct response as BEST
- Place the marker at the natural point in your explanation where the position is relevant
- These markers are stripped from the displayed text — the user only sees the board update

Example of correct output:
"The Blackburne-Shilling Gambit is your biggest problem as Black. [MOVES: e4 e5 Nf3 Nc6 Bc4 Nd4] — White now plays Nxd4 and you're already losing material."

Example of a quiz board:
"Here's a position from your games. You played a blunder — can you find the best move? [MOVES: e4 e5 Nf3 Nc6 Bc4 Bc5 | PLAYED: d1h5 | BEST: c2c3]"

You know their game history deeply. Draw on it when relevant.`;
}

export async function POST(req: NextRequest) {
  const { messages, positionContext } = await req.json();

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const system = positionContext
    ? `${buildSystemPrompt()}\n\n== CURRENT DRILL POSITION (answer questions about this) ==\n${positionContext}`
    : buildSystemPrompt();

  // For position-specific chats, enable extended thinking so Viktor verifies
  // every move against the piece list before committing to any text.
  // The thinking block is internal — only the final text_delta streams to the user.
  const streamParams = positionContext
    ? {
        model: "claude-sonnet-4-6",
        max_tokens: 5000,
        thinking: { type: "enabled" as const, budget_tokens: 3000 },
        system,
        messages,
      }
    : {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system,
        messages,
      };

  const stream = await client.messages.stream(streamParams as Parameters<typeof client.messages.stream>[0]);

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        // Only forward visible text — thinking_delta is silently discarded
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new NextResponse(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
