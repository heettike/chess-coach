#!/usr/bin/env python3
"""
Daily learning agent for chess-coach.

Runs every night:
1. Fetches new chess.com games since last run
2. Incrementally updates blunder patterns (Stockfish, fast depth)
3. Calls Claude to synthesize personalized insights from new patterns
4. Updates game_data.json with fresh coaching intelligence
5. Commits and the site auto-updates via Vercel

Designed to compound — the more games played, the sharper the coaching.
"""

import json
import os
import sys
import subprocess
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter

# ── Config ────────────────────────────────────────────────────

USERNAME = "tiktiktike"
OUTPUT_FILE = Path("public/game_data.json")
LEARN_DEPTH = 10          # Faster than the weekly full-depth run
MAX_NEW_GAMES = 100       # Analyze at most 100 new losses per daily run
MIN_NEW_GAMES = 5         # Skip Stockfish if fewer than this new losses

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"   # Fast + cheap for daily

# ── Helpers ───────────────────────────────────────────────────

def http_get(url: str) -> tuple[int, str]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "chess-coach/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:
        return 0, ""

def load_game_data() -> dict:
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE) as f:
            return json.load(f)
    return {}

def save_game_data(data: dict):
    with open(OUTPUT_FILE, "w") as f:
        json.dump(data, f, indent=2)

def get_last_run_date(data: dict) -> str | None:
    return data.get("daily_learn_last_run")

def is_5m_or_10m(tc: str) -> bool:
    try:
        base = int(tc.split("+")[0])
        return base in (300, 600)
    except Exception:
        return False

def player_result(game: dict) -> tuple[str | None, str]:
    white = game.get("White", "").lower()
    black = game.get("Black", "").lower()
    result = game.get("Result", "*")
    if white == USERNAME.lower():
        color = "white"
        outcome = "win" if result == "1-0" else "loss" if result == "0-1" else "draw"
    elif black == USERNAME.lower():
        color = "black"
        outcome = "win" if result == "0-1" else "loss" if result == "1-0" else "draw"
    else:
        return None, "unknown"
    return color, outcome

# ── Fetch new games since last run ────────────────────────────

def fetch_recent_games(since_date: str | None) -> list[dict]:
    """Fetch games from recent months only (not full history)."""
    _, body = http_get(f"https://api.chess.com/pub/player/{USERNAME}/games/archives")
    if not body:
        print("  Failed to fetch archives")
        return []
    archives = json.loads(body).get("archives", [])
    # Only check last 2 months
    recent_archives = archives[-2:]
    games = []
    for url in recent_archives:
        _, pgn_body = http_get(url + "/pgn")
        if not pgn_body:
            continue
        from io import StringIO
        import chess.pgn
        pgn_io = StringIO(pgn_body)
        while True:
            game = chess.pgn.read_game(pgn_io)
            if game is None:
                break
            headers = dict(game.headers)
            if not is_5m_or_10m(headers.get("TimeControl", "")):
                continue
            # Filter by date if we have a last-run date
            game_date = headers.get("Date", "")
            if since_date and game_date and game_date <= since_date:
                continue
            # Serialize to dict with moves
            node = game
            moves = []
            while node.variations:
                node = node.variations[0]
                moves.append(node.move.uci())
            headers["moves_uci"] = moves
            games.append(headers)
    print(f"  {len(games)} new 5m/10m games since {since_date or 'beginning'}")
    return games

# ── Incremental Stockfish analysis ────────────────────────────

def find_stockfish() -> str | None:
    for path in ["/usr/games/stockfish", "/usr/bin/stockfish", "/opt/homebrew/bin/stockfish"]:
        if Path(path).exists():
            return path
    result = subprocess.run(["which", "stockfish"], capture_output=True, text=True)
    if result.returncode == 0:
        return result.stdout.strip()
    return None

class Stockfish:
    def __init__(self, path: str):
        self.proc = subprocess.Popen(
            [path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1
        )
        self._send("uci")
        self._wait("uciok")
        self._send("isready")
        self._wait("readyok")

    def _send(self, cmd: str):
        self.proc.stdin.write(cmd + "\n")
        self.proc.stdin.flush()

    def _wait(self, token: str) -> list[str]:
        lines = []
        while True:
            line = self.proc.stdout.readline().strip()
            lines.append(line)
            if token in line:
                return lines

    def evaluate(self, fen: str, depth: int = 10) -> tuple[int, int | None, str | None]:
        self._send(f"position fen {fen}")
        self._send(f"go depth {depth}")
        cp, mate, best = 0, None, None
        for line in self._wait("bestmove"):
            if line.startswith("info") and "score" in line:
                parts = line.split()
                try:
                    si = parts.index("score")
                    if parts[si + 1] == "cp":
                        cp = int(parts[si + 2])
                    elif parts[si + 1] == "mate":
                        mate = int(parts[si + 2])
                        cp = 10000 if mate > 0 else -10000
                except (ValueError, IndexError):
                    pass
            if line.startswith("bestmove"):
                parts = line.split()
                best = parts[1] if len(parts) > 1 and parts[1] != "(none)" else None
        return cp, mate, best

    def close(self):
        self._send("quit")
        self.proc.wait()

def fmt_eval(cp: int, mate: int | None, color: str) -> str:
    if mate is not None:
        sign = "+" if (mate > 0 and color == "white") or (mate < 0 and color == "black") else "-"
        return f"M{sign}{abs(mate)}"
    pawns = cp / 100.0
    if color == "black":
        pawns = -pawns
    return f"{pawns:+.1f}"

def analyze_new_losses(games: list[dict], sf: Stockfish) -> list[dict]:
    import chess
    blunders = []
    losses = [(g, c) for g in games for c, o in [player_result(g)] if o == "loss" and c]
    print(f"  Analyzing {min(len(losses), MAX_NEW_GAMES)} new losses...")

    for analyzed, (game, color) in enumerate(losses[:MAX_NEW_GAMES]):
        if analyzed % 10 == 0 and analyzed > 0:
            print(f"    {analyzed}/{min(len(losses), MAX_NEW_GAMES)} — {len(blunders)} blunders")
        board = chess.Board()
        moves_uci = game.get("moves_uci", [])
        prev_fen = board.fen()
        for uci in moves_uci:
            try:
                move = chess.Move.from_uci(uci)
            except Exception:
                break
            is_player = (board.turn == chess.WHITE) == (color == "white")
            fen_before = board.fen()
            try:
                san = board.san(move)
                board.push(move)
            except Exception:
                break
            fen_after = board.fen()
            if not is_player:
                prev_fen = fen_after
                continue
            cp_b, mate_b, best_uci = sf.evaluate(fen_before, LEARN_DEPTH)
            cp_a, mate_a, _ = sf.evaluate(fen_after, LEARN_DEPTH)
            # From player's perspective
            if color == "black":
                cp_b_p = -cp_b
                cp_a_p = cp_a  # after player's move, it's white's turn
            else:
                cp_b_p = cp_b
                cp_a_p = -cp_a
            # Skip if already losing badly
            if cp_b_p < -250:
                prev_fen = fen_after
                continue
            drop = cp_b_p - cp_a_p
            if drop < 150:
                prev_fen = fen_after
                continue
            # Classify
            pattern = classify_pattern(fen_before, uci, best_uci, board.copy())
            drop_pawns = drop / 100.0
            if mate_b is not None or mate_a is not None:
                drop_str = "losing (forced mate)"
            else:
                drop_str = f"−{drop_pawns:.1f} pawns"
            blunders.append({
                "fen_before": fen_before,
                "san": san,
                "played_uci": uci,
                "best_uci": best_uci,
                "eval_before": fmt_eval(cp_b, mate_b, color),
                "eval_after": fmt_eval(cp_a, mate_a, "white" if color == "black" else "black"),
                "drop_str": drop_str,
                "drop_cp": drop,
                "pattern": pattern,
                "color": color,
                "move_num": board.fullmove_number,
                "time_control": game.get("TimeControl", ""),
                "game_date": game.get("Date", ""),
                "opponent": game.get("Black" if color == "white" else "White", ""),
            })
            prev_fen = fen_after
    return blunders

def classify_pattern(fen_before: str, played_uci: str, best_uci: str | None, board_after) -> str:
    import chess
    board = chess.Board(fen_before)
    try:
        played_move = chess.Move.from_uci(played_uci)
    except Exception:
        return "positional"
    # Missed checkmate
    if best_uci:
        test = chess.Board(fen_before)
        try:
            test.push(chess.Move.from_uci(best_uci))
            if test.is_checkmate():
                return "missed_checkmate"
        except Exception:
            pass
    # Missed capture of hanging piece
    if best_uci and chess.Move.from_uci(best_uci) in board.legal_moves:
        bm = chess.Move.from_uci(best_uci)
        if board.is_capture(bm) and not board.is_capture(played_move):
            victim_sq = bm.to_square
            piece = board.piece_at(victim_sq)
            if piece and not board.is_attacked_by(piece.color, victim_sq):
                return "missed_capture"
    # Hanging piece after move
    board_copy = chess.Board(fen_before)
    try:
        board_copy.push(played_move)
        moved_sq = played_move.to_square
        moved_piece = board_copy.piece_at(moved_sq)
        if moved_piece:
            opp_color = not moved_piece.color
            if board_copy.is_attacked_by(opp_color, moved_sq):
                defenders = board_copy.attackers(moved_piece.color, moved_sq)
                if not defenders:
                    return "hanging_piece"
    except Exception:
        pass
    # Missed fork
    if best_uci:
        test = chess.Board(fen_before)
        try:
            bm = chess.Move.from_uci(best_uci)
            test.push(bm)
            attacked = sum(1 for sq in chess.SQUARES if test.is_attacked_by(not test.turn, sq) and test.piece_at(sq) and test.piece_at(sq).color == test.turn)
            if attacked >= 2:
                return "missed_fork"
        except Exception:
            pass
    # Back rank
    board_copy2 = chess.Board(fen_before)
    try:
        board_copy2.push(played_move)
        if board_copy2.is_check():
            king_sq = board_copy2.king(board_copy2.turn)
            if king_sq is not None:
                rank = chess.square_rank(king_sq)
                if rank in (0, 7):
                    return "back_rank"
    except Exception:
        pass
    # Missed check
    if best_uci:
        test2 = chess.Board(fen_before)
        try:
            test2.push(chess.Move.from_uci(best_uci))
            if test2.is_check() and not chess.Board(fen_before).is_check():
                return "missed_check"
        except Exception:
            pass
    return "positional"

def build_patterns(blunders: list[dict]) -> list[dict]:
    LABELS = {
        "hanging_piece": "Hanging pieces",
        "missed_fork": "Missed forks",
        "walked_into_fork": "Walked into forks",
        "missed_checkmate": "Missed checkmate",
        "back_rank": "Back rank weakness",
        "missed_capture": "Missed free captures",
        "walked_into_pin": "Walked into pins",
        "missed_check": "Missed forcing checks",
        "positional": "Positional errors",
    }
    counts = Counter(b["pattern"] for b in blunders)
    result = []
    for pattern, count in counts.most_common(25):
        if count < 5:
            break
        examples = [b for b in blunders if b["pattern"] == pattern][:8]
        result.append({
            "pattern": pattern,
            "label": LABELS.get(pattern, pattern),
            "count": count,
            "examples": examples,
        })
    return result

# ── Claude synthesis ──────────────────────────────────────────

def call_claude(prompt: str) -> str:
    if not ANTHROPIC_API_KEY:
        return ""
    payload = json.dumps({
        "model": ANTHROPIC_MODEL,
        "max_tokens": 2048,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.loads(r.read())
            return resp["content"][0]["text"]
    except Exception as e:
        print(f"  Claude API error: {e}")
        return ""

def synthesize_insights(data: dict) -> dict:
    """Use Claude to generate personalized daily coaching insights."""
    pattern_summary = data.get("pattern_summary", [])
    weak_openings = data.get("weak_openings", [])
    overall = data.get("overall", {})
    recent_trend = data.get("recent_trend", {})

    if not pattern_summary:
        print("  No patterns yet — skipping Claude synthesis")
        return {}

    top_patterns = pattern_summary[:5]
    pattern_text = "\n".join(
        f"- {p['label']}: {p['count']} times" for p in top_patterns
    )
    weak_text = "\n".join(
        f"- {o['opening']}: {o['win_rate']}% WR ({o['games']} games)" for o in weak_openings[:3]
    )

    prompt = f"""You are an expert chess coach analyzing the game data of {USERNAME}, a {overall.get('win_rate', '?')}% win-rate chess player aiming to improve from ~1300 to 2000.

THEIR TOP BLUNDER PATTERNS (from last 1000 losses, analyzed by Stockfish):
{pattern_text}

THEIR WEAKEST OPENINGS:
{weak_text}

RECENT TREND: {recent_trend.get('note', 'N/A')}

Generate a JSON object with these exact fields:
{{
  "daily_insight": "One sharp, specific insight about their biggest pattern this week — not generic advice, something that addresses exactly how THEY lose. 2-3 sentences max.",
  "weekly_focus_reason": "Why their top pattern ({top_patterns[0]['label'] if top_patterns else 'unknown'}) is costing them the most rating points specifically. 1-2 sentences.",
  "opening_fix": "One concrete fix for their weakest opening ({weak_openings[0]['opening'] if weak_openings else 'unknown'}) — a specific move or concept, not vague advice.",
  "pattern_advice": {{
    {chr(10).join(f'    "{p["pattern"]}": "One sentence of the most actionable drill advice for this specific pattern."' for p in top_patterns)}
  }},
  "this_month_goal": "One measurable goal for this month based on these patterns. Something they can track in their next 50 games."
}}

Return ONLY the JSON, no other text."""

    print("  Calling Claude for synthesis...")
    raw = call_claude(prompt)
    try:
        # Extract JSON from response
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(raw[start:end])
    except Exception as e:
        print(f"  JSON parse error: {e}")
    return {}

# ── Main ──────────────────────────────────────────────────────

def main():
    print(f"\n=== Chess Daily Learn — {datetime.now().strftime('%Y-%m-%d %H:%M')} ===\n")

    data = load_game_data()
    last_run = get_last_run_date(data)
    print(f"Last run: {last_run or 'never'}")

    # Step 1: Fetch new games
    print("\n1. Fetching new games...")
    try:
        import chess.pgn
    except ImportError:
        print("  python-chess not installed")
        sys.exit(1)

    new_games = fetch_recent_games(last_run)

    # Step 2: Incremental Stockfish analysis
    new_blunders = []
    if new_games:
        sf_path = find_stockfish()
        if sf_path:
            new_losses = [(g, c) for g in new_games for c, o in [player_result(g)] if o == "loss" and c]
            if len(new_losses) >= MIN_NEW_GAMES:
                print(f"\n2. Stockfish analysis ({len(new_losses)} new losses)...")
                sf = Stockfish(sf_path)
                new_blunders = analyze_new_losses(new_games, sf)
                sf.close()
                print(f"   Found {len(new_blunders)} new blunders")
            else:
                print(f"\n2. Only {len(new_losses)} new losses — skipping Stockfish (need {MIN_NEW_GAMES}+)")
        else:
            print("\n2. Stockfish not found — skipping analysis")
    else:
        print("\n2. No new games — skipping Stockfish")

    # Step 3: Merge new blunders with existing
    if new_blunders:
        print("\n3. Merging blunders...")
        existing = data.get("blunder_positions", [])
        # Deduplicate by fen_before + played_uci
        existing_keys = {(b["fen_before"], b["played_uci"]) for b in existing}
        fresh = [b for b in new_blunders if (b["fen_before"], b["played_uci"]) not in existing_keys]
        merged = fresh + existing
        # Keep top 500 most recent
        data["blunder_positions"] = merged[:500]
        data["pattern_summary"] = build_patterns(data["blunder_positions"])
        print(f"   Total: {len(data['blunder_positions'])} blunders, {len(data['pattern_summary'])} patterns")
    else:
        print("\n3. No new blunders to merge")

    # Step 4: Claude synthesis
    print("\n4. Claude synthesis...")
    insights = synthesize_insights(data)
    if insights:
        data["coaching_insights"] = insights
        print(f"   Daily insight: {insights.get('daily_insight', '')[:80]}...")
    else:
        print("   Skipped (no patterns or no API key)")

    # Step 5: Update metadata
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    data["daily_learn_last_run"] = today

    # Step 6: Save
    print(f"\n5. Saving {OUTPUT_FILE}...")
    save_game_data(data)
    print(f"   Done — {OUTPUT_FILE.stat().st_size // 1024} KB")

    print("\n=== Complete ===")

if __name__ == "__main__":
    main()
