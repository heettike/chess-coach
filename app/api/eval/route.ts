import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const fen = req.nextUrl.searchParams.get("fen");
  if (!fen) return NextResponse.json({ error: "missing fen" }, { status: 400 });

  try {
    const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=1`;
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });

    if (!r.ok) return NextResponse.json({ cp: 0 });

    const data = await r.json();
    const pv = data?.pvs?.[0];
    if (!pv) return NextResponse.json({ cp: 0 });

    if (pv.cp !== undefined) return NextResponse.json({ cp: pv.cp });
    if (pv.mate !== undefined) return NextResponse.json({ mate: pv.mate });

    return NextResponse.json({ cp: 0 });
  } catch {
    return NextResponse.json({ cp: 0 });
  }
}
