import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import gameDataRaw from "@/public/game_data.json";
import { GameData } from "@/lib/types";

const gameData = gameDataRaw as GameData;
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

== HOW GAMES END ==
Resignations: ${gameData.terminations.resignation ?? 0} | Checkmates: ${gameData.terminations.checkmate ?? 0} | Flagged (time): ${gameData.terminations.flagged ?? 0}

== YOUR COACHING STYLE ==
- Lead with the concrete problem, not generic advice
- Explain WHY a move works — the tactical or strategic reason behind it
- Reference patterns from their actual games when relevant
- When showing moves, use algebraic notation (e.g. Nf3, Bc4, 0-0)
- When asked about an opening, give the main line + the 2-3 key ideas
- Keep responses focused. One insight done deeply beats five insights done shallowly
- Never say "great question" or add filler. Get to the point immediately
- Rate of improvement from 1300 to 2000 requires: pattern recognition (tactics), opening knowledge (2-3 solid openings), and not hanging pieces. Focus on these three.

You know their game history deeply. Draw on it when relevant — e.g. "you've played the Italian Game 314 times with 44% win rate, so let's fix that first."`;
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
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
