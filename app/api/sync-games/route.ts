import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

const USERNAME = "tiktiktike";

async function fetchAllGames(): Promise<string> {
  const archivesUrl = `https://api.chess.com/pub/player/${USERNAME}/games/archives`;
  const headers = { "User-Agent": "chess-coach-app/1.0 tk@noice.so" };

  const archivesRes = await fetch(archivesUrl, { headers });
  if (!archivesRes.ok) throw new Error("Failed to fetch archives");
  const { archives } = await archivesRes.json();

  // Only fetch last 3 months to keep it fast
  const recent = archives.slice(-3);
  let pgn = "";

  for (const url of recent) {
    const r = await fetch(`${url}/pgn`, { headers });
    if (r.ok) pgn += (await r.text()) + "\n\n";
    await new Promise((r) => setTimeout(r, 1000));
  }

  return pgn;
}

export async function GET() {
  try {
    const pgn = await fetchAllGames();
    const outPath = path.join(process.cwd(), "public", "recent_games.pgn");
    await writeFile(outPath, pgn, "utf-8");
    return NextResponse.json({ ok: true, size: pgn.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
