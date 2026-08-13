import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import type {
  Game,
  GlobalGameSettings,
  TournamentSettings,
  GameBaitConfig,
} from './game-service.shared';

function toIso(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const fn = (value as { toDate?: () => Date }).toDate;
    if (typeof fn === 'function') {
      const d = fn.call(value);
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return undefined;
}

function mapGame(id: string, row: Record<string, unknown>): Game {
  return {
    game_id: id,
    game_name: (row.game_name as string) ?? '',
    game_type: (row.game_type as string) ?? undefined,
    game_description: (row.game_description as string) ?? undefined,
    game_path: (row.game_path as string) ?? `games/${id}`,
    thumbnail_path: (row.thumbnail_path as string) ?? undefined,
    thumbnail_url: (row.thumbnail_url as string) ?? undefined,
    is_active: row.is_active !== false,
    display_order: Number(row.display_order) || 0,
    config_data:
      typeof row.config_data === 'string'
        ? row.config_data
        : row.config_data
          ? JSON.stringify(row.config_data)
          : undefined,
    point_rate: Number(row.point_rate) || 100,
    asset_urls: (row.asset_urls as Record<string, string>) ?? undefined,
    regdate: row.regdate ?? row.created_at,
    last_update: row.last_update ?? row.updated_at,
  };
}

export async function getAllGames(): Promise<Game[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, 'games'));
  const games = snap.docs.map((d) => mapGame(d.id, d.data() as Record<string, unknown>));
  games.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  return games;
}

export async function getActiveGames(): Promise<Game[]> {
  const all = await getAllGames();
  return all.filter((g) => g.is_active);
}

export async function getGame(gameId: string): Promise<Game | null> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'games', gameId));
  if (!snap.exists()) return null;
  return mapGame(snap.id, snap.data() as Record<string, unknown>);
}

export async function toggleGameActive(gameId: string, isActive: boolean): Promise<void> {
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'games', gameId), {
    is_active: isActive,
    last_update: Timestamp.now(),
  });
}

export async function updateGame(
  gameId: string,
  data: Partial<Omit<Game, 'game_id'>>,
): Promise<void> {
  const db = getFirebaseDb();
  const row: Record<string, unknown> = { last_update: Timestamp.now() };
  if (data.game_name !== undefined) row.game_name = data.game_name;
  if (data.game_description !== undefined) row.game_description = data.game_description;
  if (data.point_rate !== undefined) row.point_rate = data.point_rate;
  if (data.asset_urls !== undefined) row.asset_urls = data.asset_urls;
  if (data.config_data !== undefined) row.config_data = data.config_data;
  if (data.thumbnail_path !== undefined) row.thumbnail_path = data.thumbnail_path;
  if (data.thumbnail_url !== undefined) row.thumbnail_url = data.thumbnail_url;
  if (data.is_active !== undefined) row.is_active = data.is_active;
  if (data.display_order !== undefined) row.display_order = data.display_order;
  await updateDoc(doc(db, 'games', gameId), row);
}

/** fishing + tournament 요약 (구앱 gameSettings) */
export async function getGlobalGameSettings(): Promise<GlobalGameSettings | null> {
  const db = getFirebaseDb();
  const [fishingSnap, tournamentSnap] = await Promise.all([
    getDoc(doc(db, 'gameSettings', 'fishing')),
    getDoc(doc(db, 'gameSettings', 'tournament')),
  ]);

  const fishing = fishingSnap.exists() ? fishingSnap.data() : {};
  const tournament = tournamentSnap.exists() ? tournamentSnap.data() : {};
  const hasTournament = Boolean(
    tournament.title && tournament.startDate && tournament.endDate,
  );

  return {
    tournament_enabled: hasTournament,
    tournament_start_date: toIso(tournament.startDate),
    tournament_end_date: toIso(tournament.endDate),
    ranking_medal_count: Number(fishing.rankingMedalCount) || 3,
    show_medals: fishing.showMedals !== false,
    game_notice: fishing.gameNotice ? String(fishing.gameNotice) : undefined,
    daily_play_limit: fishing.dailyPlayLimit != null ? Number(fishing.dailyPlayLimit) : undefined,
  };
}

export async function updateGlobalGameSettings(
  settings: Partial<GlobalGameSettings>,
): Promise<void> {
  const db = getFirebaseDb();
  const patch: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if (settings.ranking_medal_count !== undefined) {
    patch.rankingMedalCount = settings.ranking_medal_count;
  }
  if (settings.show_medals !== undefined) {
    patch.showMedals = settings.show_medals;
  }
  if (settings.game_notice !== undefined) {
    patch.gameNotice = settings.game_notice;
  }
  if (settings.daily_play_limit !== undefined) {
    patch.dailyPlayLimit = settings.daily_play_limit;
  }
  await setDoc(doc(db, 'gameSettings', 'fishing'), patch, { merge: true });

  // 대회 비활성화 시 구앱이 배너를 안 보이도록 문서 비우기
  if (settings.tournament_enabled === false) {
    await setDoc(
      doc(db, 'gameSettings', 'tournament'),
      {
        title: '',
        description: '',
        startDate: null,
        endDate: null,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
  }
}

export async function getTournamentSettings(): Promise<TournamentSettings | null> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'gameSettings', 'tournament'));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (!data.title) return null;
  return {
    title: String(data.title),
    description: data.description ? String(data.description) : '',
    startDate: toIso(data.startDate),
    endDate: toIso(data.endDate),
  };
}

export async function updateTournamentSettings(
  settings: Partial<TournamentSettings>,
): Promise<void> {
  const db = getFirebaseDb();
  const patch: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if (settings.title !== undefined) patch.title = settings.title;
  if (settings.description !== undefined) patch.description = settings.description;
  if (settings.startDate !== undefined) {
    patch.startDate = settings.startDate
      ? Timestamp.fromDate(new Date(settings.startDate))
      : null;
  }
  if (settings.endDate !== undefined) {
    patch.endDate = settings.endDate ? Timestamp.fromDate(new Date(settings.endDate)) : null;
  }
  await setDoc(doc(db, 'gameSettings', 'tournament'), patch, { merge: true });
}

export async function getGameBaitConfig(): Promise<GameBaitConfig | null> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'config', 'bait'));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    dailyLimit: data.dailyLimit != null ? Number(data.dailyLimit) : undefined,
    baitPerCoupon: data.baitPerCoupon != null ? Number(data.baitPerCoupon) : undefined,
  };
}

export async function updateGameBaitConfig(settings: Partial<GameBaitConfig>): Promise<void> {
  const db = getFirebaseDb();
  const patch: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if (settings.dailyLimit !== undefined) patch.dailyLimit = settings.dailyLimit;
  if (settings.baitPerCoupon !== undefined) patch.baitPerCoupon = settings.baitPerCoupon;
  await setDoc(doc(db, 'config', 'bait'), patch, { merge: true });
}
