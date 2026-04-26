"""
Full automation pipeline:
1. Fetch new games from chess.com
2. Run Stockfish analysis (blunders + tactics)
3. Write updated game_data.json

Run: python3 scripts/update_games.py
Requires: stockfish binary, chess module (pip install chess)
"""

import re
import json
import subprocess
import time
import sys
import urllib.request
from collections import defaultdict, Counter
from pathlib import Path

USERNAME = "tiktiktike"
OUTPUT_FILE = "public/game_data.json"
STOCKFISH_PATH = "/usr/games/stockfish"  # CI path (GitHub Actions ubuntu)

# local dev fallback
if not Path(STOCKFISH_PATH).exists():
    STOCKFISH_PATH = "/opt/homebrew/bin/stockfish"

ANALYZE_DEPTH = 12
BLUNDER_THRESHOLD = 150
MAX_GAMES_TO_ANALYZE = 300

# Only analyze 5m and 10m games (blitz + rapid)
ALLOWED_TIME_CONTROLS = {"300", "300+0", "600", "600+0", "300+3", "600+5"}


# ─── HTTP ────────────────────────────────────────────────────

HEADERS = {"User-Agent": "chess-coach/1.0 tk@noice.so"}

def http_get(url, retries=3, delay=5):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status, r.read().decode("utf-8")
        except Exception as e:
            if attempt < retries - 1:
                print(f"    retry {attempt+1}: {e}")
                time.sleep(delay)
            else:
                return None, None
    return None, None


def fetch_archives():
    _, body = http_get(f"https://api.chess.com/pub/player/{USERNAME}/games/archives")
    if not body:
        return []
    return json.loads(body).get("archives", [])


def fetch_all_games_pgn(archives):
    all_pgn = ""
    total = 0
    for archive_url in archives:
        label = "/".join(archive_url.split("/")[-2:])
        status, text = http_get(archive_url + "/pgn")
        if status == 200 and text:
            count = text.count("[Event ")
            all_pgn += text.strip() + "\n\n"
            total += count
            print(f"  {label}: {count} games")
        else:
            print(f"  {label}: skipped (status {status})")
        time.sleep(1)
    return all_pgn, total


# ─── PGN PARSING ─────────────────────────────────────────────

def parse_games(pgn_text):
    blocks = re.split(r'\n\n(?=\[Event )', pgn_text.strip())
    games = []
    for block in blocks:
        if not block.strip():
            continue
        headers = {}
        for m in re.finditer(r'\[(\w+)\s+"([^"]+)"\]', block):
            headers[m.group(1)] = m.group(2)
        if not headers:
            continue
        moves_match = re.search(r'\n\n(1\..*)', block, re.DOTALL)
        headers["_moves_raw"] = moves_match.group(1).strip() if moves_match else ""
        games.append(headers)
    return games


def clean_moves(raw):
    clean = re.sub(r'\{[^}]*\}', '', raw)
    clean = re.sub(r'\([^)]*\)', '', clean)
    clean = re.sub(r'\$\d+', '', clean)
    moves = []
    for t in clean.split():
        if re.match(r'^\d+\.+$', t):
            continue
        if t in ('1-0', '0-1', '1/2-1/2', '*'):
            break
        moves.append(t)
    return moves


def player_result(game):
    white = game.get("White", "").lower()
    black = game.get("Black", "").lower()
    result = game.get("Result", "*")
    is_white = white == USERNAME.lower()
    is_black = black == USERNAME.lower()
    if not is_white and not is_black:
        return None, None
    color = "white" if is_white else "black"
    if result == "1-0":
        outcome = "win" if is_white else "loss"
    elif result == "0-1":
        outcome = "win" if is_black else "loss"
    elif result == "1/2-1/2":
        outcome = "draw"
    else:
        outcome = "unknown"
    return color, outcome


def tc_label(tc_str):
    try:
        base = int(tc_str.split("+")[0]) if "+" in tc_str else int(tc_str)
        if base < 180:
            return "bullet"
        elif base < 600:
            return "blitz"
        elif base < 1800:
            return "rapid"
        else:
            return "classical"
    except:
        return "other"


def is_target_tc(tc_str):
    """Only analyze 5m and 10m games per player preference."""
    try:
        base = int(tc_str.split("+")[0]) if "+" in tc_str else int(tc_str)
        return base in (300, 600)
    except:
        return False


# ─── OPENING CLASSIFICATION ───────────────────────────────────

OPENING_NAMES = {
    "e4 e5 Nf3 Nc6 Bc4": "Italian Game",
    "e4 e5 Nf3 Nc6 Bb5": "Ruy Lopez",
    "e4 e5 Nf3 Nc6 d4": "Center Game",
    "e4 e5 Nf3 Nc6 Nc3": "Three/Four Knights",
    "e4 e5 d4": "Center Game (2.d4)",
    "e4 e5 Bc4": "Bishop's Opening",
    "e4 e5 f4": "King's Gambit",
    "e4 c5": "Sicilian Defense",
    "e4 e6": "French Defense",
    "e4 c6": "Caro-Kann",
    "e4 d5": "Scandinavian",
    "d4 d5": "Queen's Pawn",
    "d4 Nf6": "Indian Defense",
    "g3": "King's Fianchetto",
    "Nf3": "Reti Opening",
    "c4": "English Opening",
}

def classify_opening(moves):
    for prefix, name in OPENING_NAMES.items():
        prefix_moves = prefix.split()
        if moves[:len(prefix_moves)] == prefix_moves:
            return name
    return f"1.{moves[0]}" if moves else "Unknown"


# ─── STOCKFISH ────────────────────────────────────────────────

try:
    import chess
    import chess.pgn
    import io
    HAS_CHESS = True
except ImportError:
    HAS_CHESS = False
    print("WARNING: chess module not found. Skipping Stockfish analysis.")
    print("Install with: pip install chess")


class Stockfish:
    def __init__(self, path):
        self.proc = subprocess.Popen(
            [path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1
        )
        self._send("uci")
        self._wait("uciok")
        self._send("setoption name Hash value 64")
        self._send("isready")
        self._wait("readyok")

    def _send(self, cmd):
        self.proc.stdin.write(cmd + "\n")
        self.proc.stdin.flush()

    def _wait(self, token):
        while True:
            line = self.proc.stdout.readline().strip()
            if token in line:
                return line

    def evaluate(self, fen, depth=12):
        self._send(f"position fen {fen}")
        self._send(f"go depth {depth}")
        score, best_move = None, None
        while True:
            line = self.proc.stdout.readline().strip()
            if "score cp" in line:
                m = re.search(r'score cp (-?\d+)', line)
                if m:
                    score = int(m.group(1))
                m2 = re.search(r'pv (\S+)', line)
                if m2:
                    best_move = m2.group(1)
            elif "score mate" in line:
                m = re.search(r'score mate (-?\d+)', line)
                if m:
                    mate = int(m.group(1))
                    score = 10000 if mate > 0 else -10000
            elif line.startswith("bestmove"):
                m = re.search(r'bestmove (\S+)', line)
                if m:
                    best_move = m.group(1)
                break
        return score, best_move

    def close(self):
        self._send("quit")


def game_to_pgn_string(game):
    headers = ""
    for k in ["Event", "Site", "Date", "White", "Black", "Result", "WhiteElo", "BlackElo", "TimeControl", "Termination"]:
        headers += f'[{k} "{game.get(k, "?")}"]\n'
    return headers + "\n" + game.get("_moves_raw", "")


def analyze_game_for_blunders(pgn_str, sf, color, depth=12):
    if not HAS_CHESS:
        return []
    try:
        pgn = chess.pgn.read_game(io.StringIO(pgn_str))
        if not pgn:
            return []
    except:
        return []

    board = pgn.board()
    blunders = []
    move_num = 0

    for node in pgn.mainline():
        move = node.move
        move_num += 1
        is_player = (board.turn == chess.WHITE and color == "white") or \
                    (board.turn == chess.BLACK and color == "black")

        fen_before = board.fen()
        san = board.san(move)

        if is_player and move_num >= 4:
            score_before, _ = sf.evaluate(fen_before, depth)
            board.push(move)
            fen_after = board.fen()
            score_after, best_move = sf.evaluate(fen_after, depth)

            drop = ((score_before or 0) - (score_after or 0)) if color == "white" else \
                   ((score_after or 0) - (score_before or 0))

            if drop >= BLUNDER_THRESHOLD:
                blunders.append({
                    "move_num": move_num,
                    "san": san,
                    "fen_before": fen_before,
                    "fen_after": fen_after,
                    "eval_before": score_before,
                    "eval_after": score_after,
                    "best_move": best_move,
                    "drop": drop,
                    "type": "blunder" if drop >= BLUNDER_THRESHOLD else "mistake",
                })
        else:
            board.push(move)

    return blunders


# ─── MAIN ─────────────────────────────────────────────────────

def main():
    print(f"Fetching games for {USERNAME}...")
    archives = fetch_archives()
    print(f"Found {len(archives)} monthly archives")

    pgn_text, total_fetched = fetch_all_games_pgn(archives)
    print(f"\nFetched {total_fetched} total games\n")

    print("Parsing...")
    games = parse_games(pgn_text)
    print(f"Parsed {len(games)} games")

    # Filter to 5m/10m only for analysis
    target_games = [g for g in games if is_target_tc(g.get("TimeControl", ""))]
    print(f"Target time controls (5m/10m): {len(target_games)} games\n")

    # ── Opening stats (all time controls) ──
    opening_stats = defaultdict(lambda: Counter())
    opening_by_color = defaultdict(lambda: {"white": Counter(), "black": Counter()})
    for g in target_games:
        color, outcome = player_result(g)
        if not outcome or outcome == "unknown":
            continue
        moves = clean_moves(g.get("_moves_raw", ""))
        name = classify_opening(moves)
        opening_stats[name][outcome] += 1
        opening_by_color[name][color][outcome] += 1

    opening_summary = []
    for name, res in opening_stats.items():
        w, l, d = res["win"], res["loss"], res["draw"]
        total = w + l + d
        if total < 5:
            continue
        opening_summary.append({
            "name": name,
            "games": total,
            "wins": w,
            "losses": l,
            "draws": d,
            "win_rate": round(100 * w / total) if total else 0,
            "as_white": {
                "games": sum(opening_by_color[name]["white"].values()),
                "win_rate": round(100 * opening_by_color[name]["white"]["win"] / max(1, sum(opening_by_color[name]["white"].values())))
            },
            "as_black": {
                "games": sum(opening_by_color[name]["black"].values()),
                "win_rate": round(100 * opening_by_color[name]["black"]["win"] / max(1, sum(opening_by_color[name]["black"].values())))
            }
        })
    opening_summary.sort(key=lambda x: -x["games"])

    # ── Time control stats ──
    tc_stats = defaultdict(Counter)
    for g in target_games:
        color, outcome = player_result(g)
        if not outcome or outcome == "unknown":
            continue
        label = tc_label(g.get("TimeControl", ""))
        tc_stats[label][outcome] += 1

    tc_summary = {}
    for label, res in tc_stats.items():
        w, l, d = res["win"], res["loss"], res["draw"]
        total = w + l + d
        tc_summary[label] = {"games": total, "wins": w, "losses": l, "draws": d,
                              "win_rate": round(100 * w / total) if total else 0}

    # ── Color stats ──
    color_stats = {"white": Counter(), "black": Counter()}
    for g in target_games:
        color, outcome = player_result(g)
        if color and outcome and outcome != "unknown":
            color_stats[color][outcome] += 1

    # ── Terminations ──
    term_stats = Counter()
    for g in target_games:
        _, outcome = player_result(g)
        if not outcome or outcome == "unknown":
            continue
        term = g.get("Termination", "").lower()
        if "time" in term:
            term_stats["flagged"] += 1
        elif "checkmate" in term:
            term_stats["checkmate"] += 1
        elif "resignation" in term:
            term_stats["resignation"] += 1
        elif "agreement" in term or "stalemate" in term:
            term_stats["draw"] += 1
        else:
            term_stats["other"] += 1

    # ── Yearly ──
    yearly = defaultdict(Counter)
    for g in target_games:
        year = g.get("Date", "")[:4]
        _, outcome = player_result(g)
        if outcome and outcome != "unknown":
            yearly[year][outcome] += 1
    yearly_summary = {y: dict(v) for y, v in sorted(yearly.items())}

    # ── Recent losses for review ──
    all_losses = [(g, *player_result(g)) for g in target_games]
    all_losses = [(g, c, o) for g, c, o in all_losses if o == "loss"]
    recent_losses = []
    for g, color, outcome in reversed(all_losses):
        moves = clean_moves(g.get("_moves_raw", ""))
        if len(moves) < 10:
            continue
        recent_losses.append({
            "white": g.get("White", ""),
            "black": g.get("Black", ""),
            "date": g.get("Date", ""),
            "result": g.get("Result", ""),
            "time_control": tc_label(g.get("TimeControl", "")),
            "termination": g.get("Termination", ""),
            "color": color,
            "moves": moves,
            "pgn": game_to_pgn_string(g),
        })
        if len(recent_losses) >= 50:
            break

    # ── Stockfish blunder analysis ──
    blunder_positions = []
    if HAS_CHESS and Path(STOCKFISH_PATH).exists():
        print(f"\nRunning Stockfish on {MAX_GAMES_TO_ANALYZE} recent losses (5m/10m only)...")
        sf = Stockfish(STOCKFISH_PATH)
        analyzed = 0

        for g, color, outcome in reversed(all_losses):
            if analyzed >= MAX_GAMES_TO_ANALYZE:
                break
            moves = clean_moves(g.get("_moves_raw", ""))
            if len(moves) < 15:
                continue

            blunders = analyze_game_for_blunders(game_to_pgn_string(g), sf, color, depth=ANALYZE_DEPTH)
            for b in blunders:
                b["game_date"] = g.get("Date", "")
                b["opponent"] = g.get("Black" if color == "white" else "White", "")
                b["color"] = color
                blunder_positions.append(b)

            analyzed += 1
            if analyzed % 50 == 0:
                print(f"  {analyzed}/{MAX_GAMES_TO_ANALYZE} — {len(blunder_positions)} blunders found")

        sf.close()
        blunder_positions.sort(key=lambda x: -x["drop"])
        blunder_positions = blunder_positions[:100]
        print(f"Stockfish done — {len(blunder_positions)} worst blunders extracted")
    else:
        print("Stockfish not found at", STOCKFISH_PATH, "— skipping deep analysis")

    # ── Overall ──
    total_w = sum(1 for g in target_games if player_result(g)[1] == "win")
    total_l = sum(1 for g in target_games if player_result(g)[1] == "loss")
    total_d = sum(1 for g in target_games if player_result(g)[1] == "draw")
    total = total_w + total_l + total_d

    recent_all = sorted(
        [{"date": g.get("Date", ""), "outcome": o}
         for g in target_games
         for _, o in [player_result(g)]
         if o and o != "unknown"],
        key=lambda x: x["date"]
    )

    weak = [
        {"opening": o["name"], "games": o["games"], "win_rate": o["win_rate"], "issue": "below average win rate"}
        for o in opening_summary
        if o["win_rate"] < 45 and o["games"] >= 10
    ]

    output = {
        "username": USERNAME,
        "generated_at": time.strftime("%Y-%m-%d"),
        "time_control_filter": "5m and 10m only",
        "total_games": total,
        "overall": {
            "wins": total_w, "losses": total_l, "draws": total_d,
            "win_rate": round(100 * total_w / total) if total else 0,
        },
        "color_stats": {
            "white": {
                "games": sum(color_stats["white"].values()),
                "wins": color_stats["white"]["win"],
                "losses": color_stats["white"]["loss"],
                "draws": color_stats["white"]["draw"],
                "win_rate": round(100 * color_stats["white"]["win"] / max(1, sum(color_stats["white"].values())))
            },
            "black": {
                "games": sum(color_stats["black"].values()),
                "wins": color_stats["black"]["win"],
                "losses": color_stats["black"]["loss"],
                "draws": color_stats["black"]["draw"],
                "win_rate": round(100 * color_stats["black"]["win"] / max(1, sum(color_stats["black"].values())))
            }
        },
        "time_controls": tc_summary,
        "terminations": dict(term_stats),
        "openings": opening_summary,
        "yearly": yearly_summary,
        "recent_trend": {
            "last_100": {
                "wins": sum(1 for x in recent_all[-100:] if x["outcome"] == "win"),
                "losses": sum(1 for x in recent_all[-100:] if x["outcome"] == "loss"),
                "draws": sum(1 for x in recent_all[-100:] if x["outcome"] == "draw"),
            },
            "last_50": {
                "wins": sum(1 for x in recent_all[-50:] if x["outcome"] == "win"),
                "losses": sum(1 for x in recent_all[-50:] if x["outcome"] == "loss"),
                "draws": sum(1 for x in recent_all[-50:] if x["outcome"] == "draw"),
            }
        },
        "recent_losses": recent_losses,
        "blunder_positions": blunder_positions,
        "weak_openings": weak,
    }

    Path(OUTPUT_FILE).parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    size_kb = Path(OUTPUT_FILE).stat().st_size // 1024
    print(f"\nWrote {OUTPUT_FILE} ({size_kb} KB)")
    print(f"  {total} target games | {len(opening_summary)} openings | {len(blunder_positions)} blunders")


if __name__ == "__main__":
    main()
