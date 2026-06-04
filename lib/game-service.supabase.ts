import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getSettingsValue, setSettingsValue } from '@/lib/settings-store';
import type { Game, GameScore, GlobalGameSettings, TournamentSettings, GameBaitConfig } from './game-service.shared';

const GLOBAL_KEY = 'game_settings_global';
const TOURNAMENT_KEY = 'game_settings_tournament';
const BAIT_CONFIG_KEY = 'game_bait_config';

function mapGame(row: Record<string, unknown>): Game {
  return {
    game_id: row.id as string,
    game_name: (row.game_name as string) ?? '',
    game_type: (row.game_type as string) ?? undefined,
    game_description: (row.game_description as string) ?? undefined,
    game_path: (row.game_path as string) ?? '',
    thumbnail_path: (row.thumbnail_path as string) ?? undefined,
    thumbnail_url: (row.thumbnail_url as string) ?? undefined,
    is_active: row.is_active !== false,
    display_order: Number(row.display_order) || 0,
    config_data: (row.config_data as string) ?? undefined,
    point_rate: Number(row.point_rate) || 100,
    asset_urls: (row.asset_urls as Record<string, string>) ?? undefined,
    regdate: row.created_at,
    last_update: row.updated_at,
  };
}

export async function getAllGames(): Promise<Game[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapGame(row));
}

export async function getActiveGames(): Promise<Game[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from('games').select('*').eq('is_active', true);
  if (error) throw error;
  const games = (data ?? []).map((row: Record<string, unknown>) => mapGame(row));
  games.sort((a: Game, b: Game) => (a.display_order ?? 0) - (b.display_order ?? 0));
  return games;
}

export async function getGame(gameId: string): Promise<Game | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle();
  if (error) throw error;
  return data ? mapGame(data) : null;
}

export async function toggleGameActive(gameId: string, isActive: boolean): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('games')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', gameId);
  if (error) throw error;
}

export async function updateGame(
  gameId: string,
  data: Partial<Omit<Game, 'game_id'>>,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.game_name !== undefined) row.game_name = data.game_name;
  if (data.game_description !== undefined) row.game_description = data.game_description;
  if (data.point_rate !== undefined) row.point_rate = data.point_rate;
  if (data.asset_urls !== undefined) row.asset_urls = data.asset_urls;
  if (data.config_data !== undefined) row.config_data = data.config_data;
  if (data.thumbnail_path !== undefined) row.thumbnail_path = data.thumbnail_path;
  if (data.thumbnail_url !== undefined) row.thumbnail_url = data.thumbnail_url;

  const { error } = await supabase.from('games').update(row).eq('id', gameId);
  if (error) throw error;
}

export async function saveGameScore(
  userId: string,
  gameId: string,
  score: number,
  level?: number,
  moves?: number,
  time?: number,
  extraData?: unknown,
): Promise<{ points: number; totalPoints: number }> {
  const game = await getGame(gameId);
  if (!game || !game.is_active) {
    throw new Error('게임을 찾을 수 없거나 비활성화된 게임입니다.');
  }

  const pointRate = game.point_rate ?? 100;
  const points = Math.floor(score * (pointRate / 100));
  const supabase = getSupabaseBrowserClient();

  const scoreRow: Omit<GameScore, 'score_id'> = {
    game_id: gameId,
    score,
    points,
    level: level ?? 1,
    moves: moves ?? 0,
    time: time ?? 0,
    extra_data: extraData ? JSON.stringify(extraData) : undefined,
    regdate: new Date(),
  };

  await supabase.from('game_scores').insert({
    user_id: userId,
    game_id: gameId,
    score,
    points,
    level: scoreRow.level,
    moves: scoreRow.moves,
    time_seconds: scoreRow.time,
    extra_data: extraData ?? null,
  });

  await supabase.from('points').insert({
    user_id: userId,
    amount: points,
    reason: game.game_name,
    source_id: gameId,
  });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('total_point')
    .eq('id', userId)
    .single();
  if (profileError || !profile) throw new Error('사용자를 찾을 수 없습니다.');

  const totalPoints = Math.max(0, (Number(profile.total_point) || 0) + points);
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ total_point: totalPoints })
    .eq('id', userId);
  if (updateError) throw updateError;

  return { points, totalPoints };
}

export async function getGlobalGameSettings(): Promise<GlobalGameSettings | null> {
  const value = await getSettingsValue<GlobalGameSettings | null>(GLOBAL_KEY, null);
  return value;
}

export async function updateGlobalGameSettings(settings: Partial<GlobalGameSettings>): Promise<void> {
  const current = (await getGlobalGameSettings()) ?? {};
  await setSettingsValue(GLOBAL_KEY, {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString(),
  });
}

export async function getTournamentSettings(): Promise<TournamentSettings | null> {
  return getSettingsValue<TournamentSettings | null>(TOURNAMENT_KEY, null);
}

export async function updateTournamentSettings(settings: Partial<TournamentSettings>): Promise<void> {
  const current = (await getTournamentSettings()) ?? {};
  await setSettingsValue(TOURNAMENT_KEY, {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString(),
  });
}

export async function getGameBaitConfig(): Promise<GameBaitConfig | null> {
  return getSettingsValue<GameBaitConfig | null>(BAIT_CONFIG_KEY, null);
}

export async function updateGameBaitConfig(settings: Partial<GameBaitConfig>): Promise<void> {
  const current = (await getGameBaitConfig()) ?? {};
  await setSettingsValue(BAIT_CONFIG_KEY, {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString(),
  });
}

export type { Game, GameScore, GlobalGameSettings, TournamentSettings, GameBaitConfig };
