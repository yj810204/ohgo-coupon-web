import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getSettingsValue } from '@/lib/settings-store';
import type { GlobalGameSettings } from '@/lib/game-service.shared';
import type { GroupedFishCatch, RankingUser, TournamentInfo } from './ranking.shared';

const GLOBAL_KEY = 'game_settings_global';
const TOURNAMENT_KEY = 'game_settings_tournament';

type TournamentStore = {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
};

export async function fetchTournament(): Promise<TournamentInfo> {
  const d = await getSettingsValue<TournamentStore | null>(TOURNAMENT_KEY, null);
  if (!d?.title) return null;
  const startDate = d.startDate ? new Date(d.startDate) : null;
  const endDate = d.endDate ? new Date(d.endDate) : null;
  if (!startDate || !endDate) return null;
  return {
    title: String(d.title),
    description: d.description ? String(d.description) : '',
    startDate,
    endDate,
  };
}

export async function fetchMedalCount(): Promise<number> {
  const global = await getSettingsValue<GlobalGameSettings | null>(GLOBAL_KEY, null);
  return global?.ranking_medal_count ?? 3;
}

export async function fetchRankingUsers(currentUserId?: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, total_point')
    .order('total_point', { ascending: false });
  if (error) throw error;

  const all: RankingUser[] = (data ?? []).map((row: { id: string; name: string; total_point: number }) => ({
    id: row.id,
    name: row.name || '이름 없음',
    totalPoint: Number(row.total_point) || 0,
  }));
  const filtered = all.filter((u) => u.totalPoint > 0);
  const myIdx = currentUserId ? filtered.findIndex((u) => u.id === currentUserId) : -1;
  return { users: filtered, myRank: myIdx >= 0 ? myIdx + 1 : null };
}

export async function fetchUserFishRecords(userId: string): Promise<GroupedFishCatch[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('points')
    .select('amount, reason')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const fishMap: Record<string, GroupedFishCatch> = {};
  (data ?? []).forEach((row: { amount: number; reason: string | null }) => {
    const fn = row.reason || '이름 없음';
    if (!fishMap[fn]) fishMap[fn] = { fishName: fn, totalPoints: 0, count: 0 };
    fishMap[fn].totalPoints += Number(row.amount) || 0;
    fishMap[fn].count += 1;
  });
  return Object.values(fishMap).sort((a, b) => b.totalPoints - a.totalPoints);
}

export async function fetchUserDisplayName(userId: string): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from('profiles').select('name').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data?.name || '이름 없음';
}
