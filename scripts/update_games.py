"""
Blunder extraction pipeline — correct version.

Critical fix: best_uci comes from sf.evaluate(fen_BEFORE) — this is the best
move for the PLAYER in that position. Previously we were evaluating fen_AFTER
which gives the opponent's best response. That was completely wrong.

Filters:
- Only 5m and 10m games
- Skip positions where player is already losing (eval < -200 for player)
- Mate scores handled separately — never converted to centipawns
- Pattern classification for each blunder
"""

import re
import json
import subprocess
import time
import urllib.request
from collections import defaultdict, Counter
from pathlib import Path

USERNAME = "tiktiktike"
OUTPUT_FILE = "public/game_data.json"
STOCKFISH_PATH = "/usr/games/stockfish"
if not Path(STOCKFISH_PATH).exists():
    STOCKFISH_PATH = "/opt/homebrew/bin/stockfish"

ANALYZE_DEPTH = 14
BLUNDER_THRESHOLD = 150        # cp drop to flag as blunder
ALREADY_LOSING_CUTOFF = -200   # skip if player is already down this many cp

try:
    import chess
    import chess.pgn
    import io
    HAS_CHESS = True
except ImportError:
    HAS_CHESS = False

HEADERS = {"User-Agent": "chess-coach/1.0 tk@noice.so"}


# ── HTTP ──────────────────────────────────────────────────────

def http_get(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.status, r.read().decode("utf-8")
        except Exception as e:
            if i < retries - 1:
                time.sleep(5)
    return None, None


# ── PGN parsing ───────────────────────────────────────────────

def parse_games(pgn_text):
    blocks = re.split(r'\n\n(?=\[Event )', pgn_text.strip())
    games = []
    for block in blocks:
        headers = {}
        for m in re.finditer(r'\[(\w+)\s+"([^"]+)"\]', block):
            headers[m.group(1)] = m.group(2)
        if not headers:
            continue
        mv = re.search(r'\n\n(1\..*)', block, re.DOTALL)
        headers["_moves_raw"] = mv.group(1).strip() if mv else ""
        games.append(headers)
    return games


def clean_moves(raw):
    clean = re.sub(r'\{[^}]*\}', '', raw)
    clean = re.sub(r'\([^)]*\)', '', clean)
    clean = re.sub(r'\$\d+', '', clean)
    out = []
    for t in clean.split():
        if re.match(r'^\d+\.+$', t):
            continue
        if t in ('1-0', '0-1', '1/2-1/2', '*'):
            break
        out.append(t)
    return out


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


def is_5m_or_10m(tc):
    try:
        base = int(tc.split("+")[0]) if "+" in tc else int(tc)
        return base in (300, 600)
    except:
        return False


def tc_label(tc):
    try:
        base = int(tc.split("+")[0]) if "+" in tc else int(tc)
        return "blitz" if base < 600 else "rapid"
    except:
        return "other"


# ── Eval helpers ──────────────────────────────────────────────

def player_cp(cp_white, mate_white, color):
    """Convert white-perspective eval to player-perspective cp. Returns (cp, mate) from player's view."""
    if mate_white is not None:
        return None, mate_white if color == "white" else -mate_white
    if cp_white is None:
        return 0, None
    return (cp_white if color == "white" else -cp_white), None


def fmt_eval(cp_white, mate_white, color):
    """Human-readable eval from player's perspective."""
    if mate_white is not None:
        m = mate_white if color == "white" else -mate_white
        return f"M{'+' if m > 0 else ''}{m}"
    if cp_white is None:
        return "?"
    p = (cp_white if color == "white" else -cp_white) / 100.0
    return f"{'+' if p >= 0 else ''}{p:.1f}"


def eval_drop_pawns(cp_before_player, mate_before_player, cp_after_player, mate_after_player):
    """
    Compute drop in player's eval from before to after the move.
    Returns drop in centipawns (capped at 1500), and a display string.
    Handles mate correctly — never produces 20000 cp nonsense.
    """
    # Was winning, now has forced mate against them
    if mate_before_player is None and mate_after_player is not None:
        if mate_after_player < 0:  # opponent now has forced mate
            drop_cp = 1200  # treat as massive blunder (~12 pawns)
            drop_str = "losing (forced mate)"
            return drop_cp, drop_str

    # Was about to deliver mate, blundered it away
    if mate_before_player is not None and mate_before_player > 0:
        if mate_after_player is None:
            drop_cp = 1000
            drop_str = "missed forced mate"
            return drop_cp, drop_str
        elif mate_after_player < 0:
            drop_cp = 1200
            drop_str = "missed forced mate → now losing"
            return drop_cp, drop_str

    # Both are regular cp values
    before = cp_before_player or 0
    after = cp_after_player or 0
    drop = before - after
    if drop <= 0:
        return 0, "+0.0"
    drop = min(drop, 1000)
    pawns = drop / 100.0
    return drop, f"−{pawns:.1f} pawns"


# ── Stockfish ─────────────────────────────────────────────────

class Stockfish:
    def __init__(self, path):
        self.proc = subprocess.Popen(
            [path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1
        )
        self._cmd("uci"); self._wait("uciok")
        self._cmd("setoption name Hash value 128")
        self._cmd("setoption name Threads value 2")
        self._cmd("isready"); self._wait("readyok")

    def _cmd(self, s):
        self.proc.stdin.write(s + "\n")
        self.proc.stdin.flush()

    def _wait(self, tok):
        while True:
            if tok in self.proc.stdout.readline():
                return

    def evaluate(self, fen, depth=14):
        """
        Returns (cp, mate, best_uci) where:
        - cp is centipawns from WHITE's perspective (None if mate)
        - mate is moves to mate from WHITE's perspective (None if no forced mate)
        - best_uci is the best move for whoever is to move at this FEN
        """
        self._cmd(f"position fen {fen}")
        self._cmd(f"go depth {depth}")
        cp, mate, best_uci = None, None, None
        while True:
            line = self.proc.stdout.readline().strip()
            if "score cp" in line:
                m = re.search(r'score cp (-?\d+)', line)
                if m:
                    cp, mate = int(m.group(1)), None
                pv = re.search(r' pv (\S+)', line)
                if pv:
                    best_uci = pv.group(1)
            elif "score mate" in line:
                m = re.search(r'score mate (-?\d+)', line)
                if m:
                    mate, cp = int(m.group(1)), None
                pv = re.search(r' pv (\S+)', line)
                if pv:
                    best_uci = pv.group(1)
            elif line.startswith("bestmove"):
                bm = re.search(r'bestmove (\S+)', line)
                if bm:
                    best_uci = bm.group(1)
                break
        return cp, mate, best_uci

    def close(self):
        self._cmd("quit")


# ── Pattern classification ────────────────────────────────────

def classify_pattern(fen_before, played_uci, best_uci):
    if not HAS_CHESS:
        return "positional"
    try:
        board = chess.Board(fen_before)
        played = chess.Move.from_uci(played_uci)
        best = chess.Move.from_uci(best_uci)
        player = board.turn
        opp = not player

        b_best = board.copy()
        b_best.push(best)

        if b_best.is_checkmate():
            return "missed_checkmate"

        # Missed fork — best move attacks 2+ valuable pieces
        valuable = {chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT}
        attacked = [sq for sq in chess.SQUARES
                    if (p := b_best.piece_at(sq)) and p.color == opp
                    and p.piece_type in valuable and b_best.is_attacked_by(player, sq)]
        if len(attacked) >= 2:
            return "missed_fork"

        # Missed capture of hanging piece
        target = board.piece_at(best.to_square)
        if target and target.piece_type in valuable:
            return "missed_capture"

        # Left a piece hanging after played move
        b_played = board.copy()
        b_played.push(played)
        for sq in chess.SQUARES:
            p = b_played.piece_at(sq)
            if p and p.color == player:
                if b_played.is_attacked_by(opp, sq) and not b_played.is_attacked_by(player, sq):
                    return "hanging_piece"

        # Walked into fork
        double_attacked = [sq for sq in chess.SQUARES
                           if (p := b_played.piece_at(sq)) and p.color == player
                           and p.piece_type in {chess.QUEEN, chess.ROOK, chess.KING}
                           and b_played.is_attacked_by(opp, sq)]
        if len(double_attacked) >= 2:
            return "walked_into_fork"

        # Back rank
        king_sq = b_best.king(opp)
        if king_sq is not None:
            rank = chess.square_rank(king_sq)
            if rank in (0, 7) and b_best.is_check():
                return "back_rank"

        # Best move is a forcing check
        if b_best.is_check():
            return "missed_check"

        # Walked into pin
        for sq in chess.SQUARES:
            p = b_played.piece_at(sq)
            if p and p.color == player and b_played.is_pinned(player, sq):
                return "walked_into_pin"

        return "positional"
    except:
        return "positional"


PATTERN_LABELS = {
    "missed_checkmate": "Missed checkmate",
    "missed_fork": "Missed fork",
    "missed_capture": "Left a piece free to take",
    "hanging_piece": "Left your piece hanging",
    "walked_into_fork": "Walked into a fork",
    "walked_into_pin": "Walked into a pin",
    "back_rank": "Back rank weakness",
    "missed_check": "Missed forcing check",
    "positional": "Positional error",
}

PATTERN_ADVICE = {
    "missed_checkmate": "You had checkmate and didn't play it. Before every move, scan for checks — does any check force mate? Always calculate checks first.",
    "missed_fork": "One move attacked two of your opponent's pieces simultaneously — you missed it. After developing, scan every knight and queen square for double attacks.",
    "missed_capture": "A piece was hanging — free to take — and you played somewhere else. Before every move: does my opponent have a piece I can take for free?",
    "hanging_piece": "After your move, one of your pieces had no defender and could be taken for free. Before playing any move, ask: can my opponent take the piece I just moved?",
    "walked_into_fork": "You moved a piece to a square that allowed your opponent to attack two of your pieces at once. Before moving, check if the destination allows a fork.",
    "walked_into_pin": "Your move placed a piece in a pin — stuck defending a more valuable piece behind it. Check the diagonals and files for enemy bishops, rooks, and queens.",
    "back_rank": "Your king was on the back rank with no escape square and your opponent had a back rank tactic. After castling, push h3 (or h6 as Black) to create a luft.",
    "missed_check": "A forcing check was available that leads to a big advantage. Checks limit your opponent's choices — always calculate them first.",
    "positional": "A quiet positional error. Study what the best move accomplishes — better piece activity, stronger pawn structure, or improved king safety.",
}


# ── Opening classification ────────────────────────────────────

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
        pm = prefix.split()
        if moves[:len(pm)] == pm:
            return name
    return f"1.{moves[0]}" if moves else "Unknown"


# ── Main analysis ─────────────────────────────────────────────

def analyze_games(losses, sf, max_games=1000):
    blunders = []
    analyzed = 0

    for g, color in losses:
        if analyzed >= max_games:
            break
        moves = clean_moves(g.get("_moves_raw", ""))
        if len(moves) < 15:
            continue

        pgn_str = "".join(f'[{k} "{g.get(k,"?")}"]\n'
                          for k in ["Event","White","Black","Result","Date","TimeControl"])
        pgn_str += "\n" + g.get("_moves_raw", "")

        try:
            pgn = chess.pgn.read_game(io.StringIO(pgn_str))
            if not pgn:
                continue
        except:
            continue

        board = pgn.board()
        move_num = 0

        for node in pgn.mainline():
            move = node.move
            move_num += 1
            is_player = (board.turn == chess.WHITE) == (color == "white")

            if not is_player or move_num < 6 or move_num > 55:
                board.push(move)
                continue

            fen_before = board.fen()

            # ── THE CORRECT CALL: evaluate player's position BEFORE the move ──
            # best_uci here is what the PLAYER should have played
            cp_before_w, mate_before_w, best_uci = sf.evaluate(fen_before, ANALYZE_DEPTH)

            # Filter: skip if player is already losing badly
            cp_player_before, mate_player_before = player_cp(cp_before_w, mate_before_w, color)
            if mate_player_before is not None and mate_player_before < 0:
                board.push(move)
                continue
            if cp_player_before is not None and cp_player_before < ALREADY_LOSING_CUTOFF:
                board.push(move)
                continue

            san = board.san(move)
            played_uci = move.uci()

            # Skip if player played the best move
            if played_uci == best_uci:
                board.push(move)
                continue

            board.push(move)
            fen_after = board.fen()

            # Evaluate AFTER the blunder (to measure how bad it was)
            cp_after_w, mate_after_w, _ = sf.evaluate(fen_after, ANALYZE_DEPTH)
            cp_player_after, mate_player_after = player_cp(cp_after_w, mate_after_w, color)

            drop_cp, drop_str = eval_drop_pawns(
                cp_player_before, mate_player_before,
                cp_player_after, mate_player_after
            )

            if drop_cp < BLUNDER_THRESHOLD:
                continue

            pattern = classify_pattern(fen_before, played_uci, best_uci)

            blunders.append({
                "move_num": move_num,
                "san": san,
                "played_uci": played_uci,
                "best_uci": best_uci,          # player's best move in that position
                "fen_before": fen_before,       # position where player should find the move
                "fen_after": fen_after,
                "eval_before": fmt_eval(cp_before_w, mate_before_w, color),
                "eval_after": fmt_eval(cp_after_w, mate_after_w, color),
                "drop_cp": drop_cp,
                "drop_str": drop_str,
                "pattern": pattern,
                "game_date": g.get("Date", ""),
                "opponent": g.get("Black" if color == "white" else "White", ""),
                "color": color,
                "time_control": tc_label(g.get("TimeControl", "")),
            })

        analyzed += 1
        if analyzed % 100 == 0:
            print(f"  {analyzed}/{max_games} games — {len(blunders)} blunders")

    return blunders


def build_patterns(blunders):
    counts = Counter(b["pattern"] for b in blunders)
    result = []
    for pattern, count in counts.most_common(25):
        if count < 3:
            break
        examples = [b for b in blunders if b["pattern"] == pattern][:8]
        result.append({
            "pattern": pattern,
            "label": PATTERN_LABELS.get(pattern, pattern),
            "count": count,
            "advice": PATTERN_ADVICE.get(pattern, ""),
            "examples": examples,
        })
    return result


# ── Fetch games ───────────────────────────────────────────────

def fetch_games():
    print(f"Fetching archives for {USERNAME}...")
    _, body = http_get(f"https://api.chess.com/pub/player/{USERNAME}/games/archives")
    archives = json.loads(body).get("archives", [])
    print(f"  {len(archives)} months found")

    all_pgn = ""
    for url in archives:
        label = "/".join(url.split("/")[-2:])
        s, text = http_get(url + "/pgn")
        if s == 200 and text:
            all_pgn += text.strip() + "\n\n"
            print(f"  {label}: {text.count('[Event ')} games")
        time.sleep(0.8)
    return all_pgn


# ── Main ──────────────────────────────────────────────────────

def main():
    all_pgn = fetch_games()

    print("\nParsing...")
    games = parse_games(all_pgn)
    target = [g for g in games if is_5m_or_10m(g.get("TimeControl", ""))]
    print(f"Total: {len(games)} | 5m/10m: {len(target)}")

    # Stats
    op_stats = defaultdict(Counter)
    op_color = defaultdict(lambda: {"white": Counter(), "black": Counter()})
    tc_stats = defaultdict(Counter)
    color_stats = {"white": Counter(), "black": Counter()}
    term_stats = Counter()
    yearly = defaultdict(Counter)

    for g in target:
        color, outcome = player_result(g)
        if not outcome or outcome == "unknown":
            continue
        moves = clean_moves(g.get("_moves_raw", ""))
        name = classify_opening(moves)
        op_stats[name][outcome] += 1
        op_color[name][color][outcome] += 1
        tc_stats[tc_label(g.get("TimeControl",""))][outcome] += 1
        color_stats[color][outcome] += 1
        yearly[g.get("Date","")[:4]][outcome] += 1
        term = g.get("Termination","").lower()
        if "time" in term: term_stats["flagged"] += 1
        elif "checkmate" in term: term_stats["checkmate"] += 1
        elif "resignation" in term: term_stats["resignation"] += 1
        elif "agreement" in term: term_stats["draw"] += 1
        else: term_stats["other"] += 1

    opening_summary = []
    for name, res in op_stats.items():
        w, l, d = res["win"], res["loss"], res["draw"]
        tot = w + l + d
        if tot < 5:
            continue
        opening_summary.append({
            "name": name, "games": tot, "wins": w, "losses": l, "draws": d,
            "win_rate": round(100*w/tot),
            "as_white": {"games": sum(op_color[name]["white"].values()), "win_rate": round(100*op_color[name]["white"]["win"]/max(1,sum(op_color[name]["white"].values())))},
            "as_black": {"games": sum(op_color[name]["black"].values()), "win_rate": round(100*op_color[name]["black"]["win"]/max(1,sum(op_color[name]["black"].values())))},
        })
    opening_summary.sort(key=lambda x: -x["games"])

    # Include both losses AND draws — blunders happen in drawn games too
    losses_list = [(g, c) for g in reversed(target) for c, o in [player_result(g)] if o in ("loss", "draw") and c]

    # Recent losses for review
    recent_losses = []
    for g, color in [(g, c) for g, c in losses_list if player_result(g)[1] == "loss"][:50]:
        moves = clean_moves(g.get("_moves_raw",""))
        if len(moves) < 10: continue
        pgn_str = "".join(f'[{k} "{g.get(k,"?")}"]\n' for k in ["Event","White","Black","Result","Date","TimeControl","Termination"])
        pgn_str += "\n" + g.get("_moves_raw","")
        recent_losses.append({"white": g.get("White",""), "black": g.get("Black",""), "date": g.get("Date",""),
                               "result": g.get("Result",""), "time_control": tc_label(g.get("TimeControl","")),
                               "termination": g.get("Termination",""), "color": color, "moves": moves, "pgn": pgn_str})

    # Blunder analysis — 2000 games (losses + draws), keep top 500
    blunder_positions = []
    pattern_summary = []
    if HAS_CHESS and Path(STOCKFISH_PATH).exists():
        print(f"\nStockfish analysis on last 2000 losses+draws (5m/10m)...")
        sf = Stockfish(STOCKFISH_PATH)
        blunder_positions = analyze_games(losses_list, sf, max_games=2000)
        sf.close()
        blunder_positions.sort(key=lambda x: -x["drop_cp"])
        pattern_summary = build_patterns(blunder_positions)
        print(f"Done — {len(blunder_positions)} blunders | {len(pattern_summary)} patterns")
        for p in pattern_summary:
            print(f"  {p['label']}: {p['count']}")
        blunder_positions = blunder_positions[:500]
    else:
        print("Stockfish not found")

    total_w = sum(1 for g in target if player_result(g)[1] == "win")
    total_l = sum(1 for g in target if player_result(g)[1] == "loss")
    total_d = sum(1 for g in target if player_result(g)[1] == "draw")
    total = total_w + total_l + total_d

    recent_all = sorted([{"date": g.get("Date",""), "outcome": o}
                         for g in target for _, o in [player_result(g)] if o and o != "unknown"],
                        key=lambda x: x["date"])

    output = {
        "username": USERNAME,
        "generated_at": time.strftime("%Y-%m-%d"),
        "time_control_filter": "5m and 10m only",
        "total_games": total,
        "overall": {"wins": total_w, "losses": total_l, "draws": total_d,
                    "win_rate": round(100*total_w/total) if total else 0},
        "color_stats": {
            c: {"games": (n := sum(color_stats[c].values())), "wins": color_stats[c]["win"],
                "losses": color_stats[c]["loss"], "draws": color_stats[c]["draw"],
                "win_rate": round(100*color_stats[c]["win"]/max(1,n))}
            for c in ("white", "black")
        },
        "time_controls": {k: {"games": (n := v["win"]+v["loss"]+v["draw"]), "wins": v["win"],
                               "losses": v["loss"], "draws": v["draw"],
                               "win_rate": round(100*v["win"]/max(1,n))}
                          for k, v in tc_stats.items()},
        "terminations": dict(term_stats),
        "openings": opening_summary,
        "yearly": {y: dict(v) for y, v in sorted(yearly.items())},
        "recent_trend": {
            "last_100": {"wins": sum(1 for x in recent_all[-100:] if x["outcome"]=="win"),
                         "losses": sum(1 for x in recent_all[-100:] if x["outcome"]=="loss"),
                         "draws": sum(1 for x in recent_all[-100:] if x["outcome"]=="draw")},
            "last_50": {"wins": sum(1 for x in recent_all[-50:] if x["outcome"]=="win"),
                        "losses": sum(1 for x in recent_all[-50:] if x["outcome"]=="loss"),
                        "draws": sum(1 for x in recent_all[-50:] if x["outcome"]=="draw")},
        },
        "recent_losses": recent_losses,
        "blunder_positions": blunder_positions,
        "pattern_summary": pattern_summary,
        "weak_openings": [{"opening": o["name"], "games": o["games"], "win_rate": o["win_rate"], "issue": "below 45%"}
                          for o in opening_summary if o["win_rate"] < 45 and o["games"] >= 10],
    }

    Path(OUTPUT_FILE).parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nWrote {OUTPUT_FILE} ({Path(OUTPUT_FILE).stat().st_size//1024} KB)")


if __name__ == "__main__":
    main()
