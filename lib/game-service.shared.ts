export interface Game {
  game_id: string;
  game_name: string;
  game_type?: string;
  game_description?: string;
  game_path: string;
  thumbnail_path?: string;
  thumbnail_url?: string;
  is_active: boolean;
  display_order: number;
  config_data?: string;
  point_rate?: number;
  asset_urls?: Record<string, string>;
  regdate?: unknown;
  last_update?: unknown;
}

export interface GameScore {
  score_id?: string;
  game_id: string;
  score: number;
  points: number;
  level?: number;
  moves?: number;
  time?: number;
  extra_data?: string;
  regdate?: unknown;
}

export interface GlobalGameSettings {
  tournament_enabled?: boolean;
  tournament_start_date?: string;
  tournament_end_date?: string;
  daily_play_limit?: number;
  show_medals?: boolean;
  ranking_medal_count?: number;
  game_notice?: string;
}

export interface TournamentSettings {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}

export interface GameBaitConfig {
  dailyLimit?: number;
  baitPerCoupon?: number;
}

export function calculatePoints(score: number, pointRate = 100): number {
  return Math.floor(score * (pointRate / 100));
}
