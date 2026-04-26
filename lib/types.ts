export interface ColorStat {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
}

export interface TimeControlStat {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
}

export interface OpeningStat {
  name: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  as_white: { games: number; win_rate: number };
  as_black: { games: number; win_rate: number };
}

export interface BlunderPosition {
  move_num: number;
  san: string;
  fen_before: string;
  fen_after?: string;
  eval_before: string | number;
  eval_after: string | number;
  best_uci?: string;
  played_uci?: string;
  drop_cp?: number;
  drop_str?: string;
  pattern?: string;
  game_date: string;
  opponent: string;
  color: string;
  time_control?: string;
}

export interface PatternGroup {
  pattern: string;
  label: string;
  count: number;
  advice?: string;
  examples: BlunderPosition[];
}

export interface GameRecord {
  white: string;
  black: string;
  date: string;
  result: string;
  time_control: string;
  termination: string;
  color: string;
  moves: string[];
  pgn: string;
}

export interface WeakOpening {
  opening: string;
  games: number;
  win_rate: number;
  issue: string;
}

export interface GameData {
  username: string;
  generated_at: string;
  total_games: number;
  overall: { wins: number; losses: number; draws: number; win_rate: number };
  color_stats: { white: ColorStat; black: ColorStat };
  time_controls: Record<string, TimeControlStat>;
  terminations: Record<string, number>;
  openings: OpeningStat[];
  yearly: Record<string, Record<string, number>>;
  recent_trend: {
    last_100: { wins: number; losses: number; draws: number };
    last_50: { wins: number; losses: number; draws: number };
  };
  recent_losses: GameRecord[];
  blunder_positions: BlunderPosition[];
  pattern_summary?: PatternGroup[];
  coaching_insights?: Record<string, string>;
  daily_learn_last_run?: string;
  weak_openings: WeakOpening[];
}

export interface OpeningLesson {
  id: string;
  name: string;
  color: "white" | "black";
  moves: { san: string; uci: string; explanation: string }[];
  summary: string;
  keyIdea: string;
}

export interface CloudEval {
  fen: string;
  depth: number;
  pvs: { moves: string; cp?: number; mate?: number }[];
}
