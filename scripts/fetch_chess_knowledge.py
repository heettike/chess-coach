#!/usr/bin/env python3
"""
scripts/fetch_chess_knowledge.py

Generates a comprehensive 52-week chess curriculum using Claude, drawing from
the classic chess literature:
  - Capablanca: Chess Fundamentals (1921)
  - Nimzowitsch: My System (1925)
  - Silman: How to Reassess Your Chess
  - de la Villa: 100 Endgames You Must Know
  - Polgar: Chess 5334 Problems
  - Kotov: Think Like a Grandmaster
  - Dvoretsky: Endgame Manual
  - Euwe: Chess Master vs Chess Amateur
  - Bronstein: Zurich International Chess Tournament 1953
  - Yusupov: Build Up Your Chess

Each week contains: label, concept, why, howToSpot, drill, commonMistake,
source (book), and 1-2 annotated board positions.

Output: public/chess_knowledge.json
Usage: python3 scripts/fetch_chess_knowledge.py
"""

import json
import os
import sys
import time
from pathlib import Path

import anthropic

TOPICS = [
    # ── Fundamentals (Capablanca) ──────────────────────────────────────
    {"id": "piece_activity",    "topic": "Piece activity: every piece must have a purpose",          "book": "Capablanca — Chess Fundamentals", "category": "fundamentals"},
    {"id": "open_files",        "topic": "Open files: seizing control before your opponent",         "book": "Capablanca — Chess Fundamentals", "category": "fundamentals"},
    {"id": "outpost_squares",   "topic": "Outpost squares: planting pieces your opponent can't chase","book": "Capablanca — Chess Fundamentals", "category": "fundamentals"},
    {"id": "endgame_king",      "topic": "King activation: the king as an endgame weapon",           "book": "Capablanca — Chess Fundamentals", "category": "endgame"},
    {"id": "rook_endgame",      "topic": "Rook endgames: the Lucena and Philidor positions",         "book": "Capablanca — Chess Fundamentals", "category": "endgame"},

    # ── Nimzowitsch: My System ─────────────────────────────────────────
    {"id": "blockade",          "topic": "Blockade: immobilising passed pawns with knights",         "book": "Nimzowitsch — My System", "category": "strategy"},
    {"id": "overprotection",    "topic": "Overprotection: guarding key squares before they're attacked", "book": "Nimzowitsch — My System", "category": "strategy"},
    {"id": "pawn_chain",        "topic": "Pawn chains: attacking at the base, not the head",         "book": "Nimzowitsch — My System", "category": "strategy"},
    {"id": "mysterious_rook",   "topic": "Rook on the 1st rank: the mysterious mysterious rook move","book": "Nimzowitsch — My System", "category": "strategy"},
    {"id": "centralisation",    "topic": "Centralisation: controlling the board from the centre",    "book": "Nimzowitsch — My System", "category": "strategy"},

    # ── Silman: How to Reassess Your Chess ────────────────────────────
    {"id": "imbalances",        "topic": "Imbalances: identifying what makes one side better",       "book": "Silman — How to Reassess Your Chess", "category": "strategy"},
    {"id": "weak_squares",      "topic": "Weak squares: exploiting colour complexes",               "book": "Silman — How to Reassess Your Chess", "category": "strategy"},
    {"id": "bishop_vs_knight",  "topic": "Bishop vs knight: open vs closed positions",              "book": "Silman — How to Reassess Your Chess", "category": "strategy"},
    {"id": "two_bishops",       "topic": "The two bishops advantage: when and how to exploit it",   "book": "Silman — How to Reassess Your Chess", "category": "strategy"},
    {"id": "minority_attack",   "topic": "Minority attack: using fewer pawns to create weaknesses", "book": "Silman — How to Reassess Your Chess", "category": "strategy"},

    # ── Kotov: Think Like a Grandmaster ───────────────────────────────
    {"id": "candidate_moves",   "topic": "Candidate moves: how to generate and organise your analysis", "book": "Kotov — Think Like a Grandmaster", "category": "calculation"},
    {"id": "tree_of_analysis",  "topic": "The tree of analysis: never recalculate the same line twice", "book": "Kotov — Think Like a Grandmaster", "category": "calculation"},
    {"id": "forcing_sequences", "topic": "Forcing sequences: checks then captures then threats",    "book": "Kotov — Think Like a Grandmaster", "category": "calculation"},
    {"id": "blunder_check",     "topic": "The blunder check: why you're missing the opponent's reply", "book": "Kotov — Think Like a Grandmaster", "category": "calculation"},

    # ── de la Villa: 100 Endgames You Must Know ───────────────────────
    {"id": "opposition",        "topic": "Opposition and key squares in king-pawn endgames",        "book": "de la Villa — 100 Endgames You Must Know", "category": "endgame"},
    {"id": "zugzwang",          "topic": "Zugzwang: positions where any move loses",                "book": "de la Villa — 100 Endgames You Must Know", "category": "endgame"},
    {"id": "triangulation",     "topic": "Triangulation: losing a tempo with the king",             "book": "de la Villa — 100 Endgames You Must Know", "category": "endgame"},
    {"id": "rook_vs_pawn",      "topic": "Rook vs pawn: cutting off the king",                     "book": "de la Villa — 100 Endgames You Must Know", "category": "endgame"},
    {"id": "bishop_endgame",    "topic": "Bishop endgames: same-color vs opposite-color drawbacks", "book": "de la Villa — 100 Endgames You Must Know", "category": "endgame"},
    {"id": "knight_endgame",    "topic": "Knight endgames: knights need targets, not open lines",   "book": "de la Vila — 100 Endgames You Must Know", "category": "endgame"},

    # ── Polgar: Chess 5334 Problems ───────────────────────────────────
    {"id": "discovered_attack",  "topic": "Discovered attacks: unmasking a hidden piece",          "book": "Polgar — Chess 5334 Problems", "category": "tactics"},
    {"id": "double_check",       "topic": "Double check: the most forcing move in chess",          "book": "Polgar — Chess 5334 Problems", "category": "tactics"},
    {"id": "deflection",         "topic": "Deflection: removing a key defender",                   "book": "Polgar — Chess 5334 Problems", "category": "tactics"},
    {"id": "decoy",              "topic": "Decoy: luring a piece onto a bad square",               "book": "Polgar — Chess 5334 Problems", "category": "tactics"},
    {"id": "interference",       "topic": "Interference: cutting the connection between defenders", "book": "Polgar — Chess 5334 Problems", "category": "tactics"},
    {"id": "zwischenzug",        "topic": "Zwischenzug: the in-between move that changes everything","book": "Polgar — Chess 5334 Problems", "category": "tactics"},
    {"id": "x_ray",              "topic": "X-ray attacks: pieces attacking through other pieces",   "book": "Polgar — Chess 5334 Problems", "category": "tactics"},

    # ── Dvoretsky: Endgame Manual ─────────────────────────────────────
    {"id": "rook_seventh",      "topic": "Rook on the seventh: the pig that eats pawns",           "book": "Dvoretsky — Endgame Manual", "category": "endgame"},
    {"id": "outside_passed",    "topic": "Outside passed pawn: the decisive diversion in endgames","book": "Dvoretsky — Endgame Manual", "category": "endgame"},
    {"id": "fortress",          "topic": "Building a fortress: drawing lost endgames",             "book": "Dvoretsky — Endgame Manual", "category": "endgame"},

    # ── Euwe: Chess Master vs Chess Amateur ───────────────────────────
    {"id": "development_lead",  "topic": "Using a development lead before it disappears",          "book": "Euwe — Chess Master vs Chess Amateur", "category": "fundamentals"},
    {"id": "open_file_attack",  "topic": "Converting open-file control into a decisive attack",    "book": "Euwe — Chess Master vs Chess Amateur", "category": "strategy"},
    {"id": "queenside_majority","topic": "Queenside pawn majority: converting space into a win",   "book": "Euwe — Chess Master vs Chess Amateur", "category": "strategy"},

    # ── Bronstein: Zurich 1953 ────────────────────────────────────────
    {"id": "dynamic_sacrifice", "topic": "Dynamic piece sacrifices: trading material for initiative","book": "Bronstein — Zurich 1953", "category": "strategy"},
    {"id": "attack_planning",   "topic": "Attack planning: piece coordination for kingside attacks","book": "Bronstein — Zurich 1953", "category": "strategy"},

    # ── Yusupov: Build Up Your Chess ─────────────────────────────────
    {"id": "two_weaknesses",    "topic": "The principle of two weaknesses: overloading the defence","book": "Yusupov — Build Up Your Chess", "category": "strategy"},
    {"id": "passed_pawn_power", "topic": "Passed pawn power: when to push, when to hold",         "book": "Yusupov — Build Up Your Chess", "category": "strategy"},
    {"id": "space_advantage",   "topic": "Space advantage: restricting the opponent's pieces",     "book": "Yusupov — Build Up Your Chess", "category": "strategy"},
    {"id": "transition",        "topic": "Knowing when to transition to the endgame",              "book": "Yusupov — Build Up Your Chess", "category": "strategy"},

    # ── Practical skills ──────────────────────────────────────────────
    {"id": "exchange_sacrifice","topic": "Exchange sacrifice: rook for minor piece — when it works","book": "Bronstein — Zurich 1953", "category": "strategy"},
    {"id": "connected_rooks",   "topic": "Connected rooks and the battery",                        "book": "Capablanca — Chess Fundamentals", "category": "fundamentals"},
    {"id": "piece_coordination","topic": "Piece coordination: pieces that support each other dominate","book": "Silman — How to Reassess Your Chess", "category": "strategy"},
    {"id": "good_vs_bad_bishop","topic": "Good vs bad bishop: fixing pawns on the same colour",   "book": "Silman — How to Reassess Your Chess", "category": "strategy"},
    {"id": "endgame_technique", "topic": "Endgame technique: converting a material advantage",     "book": "de la Villa — 100 Endgames You Must Know", "category": "endgame"},
    {"id": "opening_principles","topic": "Opening principles: what the books agree on",            "book": "Euwe — Chess Master vs Chess Amateur", "category": "fundamentals"},
]

WEEK_SCHEMA = """Return ONLY valid JSON (no markdown, no backticks) matching this exact structure:
{
  "id": "<same id as input>",
  "label": "<short title, 4-8 words>",
  "concept": "<2-3 sentences explaining the concept clearly for a 1300-1600 player>",
  "why": "<1-2 sentences: why this specifically costs rating points at club level>",
  "howToSpot": "<1-2 sentences: concrete checklist for recognising this in a game>",
  "drill": "<1 sentence: what to actively practice this week>",
  "commonMistake": "<1 sentence: the most common error when applying this concept>",
  "source": "<book name as given>",
  "boards": [
    {
      "moves": "<SAN move sequence from starting position, space-separated, e.g. e4 e5 Nf3 Nc6>",
      "orientation": "white",
      "arrows": [
        {"from": "<square>", "to": "<square>", "color": "rgba(74,222,128,0.9)"}
      ],
      "caption": "<1-2 sentences explaining what the board shows>"
    }
  ]
}

Rules for boards:
- Use "moves" for opening/middlegame sequences from the start position. Use "fen" (FEN string) instead of "moves" for endgame positions.
- Provide 1-2 boards per week. Each board MUST have a caption.
- arrows: green rgba(74,222,128,0.9) for good moves, red rgba(239,68,68,0.9) for bad moves, yellow rgba(250,204,21,0.6) for threats.
- Arrows use algebraic square names: a1-h8.
- moves: SAN format only (e4, Nf3, O-O, etc.) — no move numbers, no dots.
- For endgame positions, use "fen" key instead of "moves", with a valid FEN string.
- All move sequences MUST be legal chess. Double-check your moves.
"""


def generate_week(client: anthropic.Anthropic, topic: dict, attempt: int = 0) -> dict | None:
    prompt = f"""You are generating content for a personalized chess training app for a 1300-1600 rated player.

Generate curriculum content for this week's topic:
Topic: {topic['topic']}
Book: {topic['book']}
Category: {topic['category']}
ID: {topic['id']}

{WEEK_SCHEMA}"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1200,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        data = json.loads(raw)
        data["id"] = topic["id"]  # ensure id is correct
        return data

    except json.JSONDecodeError as e:
        if attempt < 2:
            print(f"  JSON parse error, retrying ({attempt+1}/2)...")
            time.sleep(2)
            return generate_week(client, topic, attempt + 1)
        print(f"  FAILED to parse JSON for {topic['id']}: {e}")
        return None
    except anthropic.RateLimitError:
        wait = 30 * (attempt + 1)
        print(f"  Rate limit hit, waiting {wait}s...")
        time.sleep(wait)
        return generate_week(client, topic, attempt + 1)
    except Exception as e:
        print(f"  Error for {topic['id']}: {e}")
        return None


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY not set")
        sys.exit(1)

    out_path = Path(__file__).parent.parent / "public" / "chess_knowledge.json"

    # Load existing output to allow resuming
    existing: dict[str, dict] = {}
    if out_path.exists():
        try:
            existing_list = json.loads(out_path.read_text())
            existing = {w["id"]: w for w in existing_list if isinstance(w, dict) and "id" in w}
            print(f"Resuming — {len(existing)} weeks already done")
        except Exception:
            pass

    client = anthropic.Anthropic(api_key=api_key)

    results: list[dict] = list(existing.values())
    todo = [t for t in TOPICS if t["id"] not in existing]

    print(f"Generating {len(todo)} weeks (skipping {len(existing)} already done)...")
    print(f"Total topics: {len(TOPICS)}\n")

    for i, topic in enumerate(todo):
        print(f"[{i+1}/{len(todo)}] {topic['id']}: {topic['topic'][:60]}...")
        week = generate_week(client, topic)
        if week:
            results.append(week)
            # Save after every topic so we can resume if interrupted
            out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))
            print(f"  ✓ saved ({len(results)} total)")
        else:
            print(f"  ✗ skipped")

        # Brief pause to avoid rate limits
        time.sleep(1.5)

    # Final save
    out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"\nDone. {len(results)} weeks written to {out_path}")


if __name__ == "__main__":
    main()
