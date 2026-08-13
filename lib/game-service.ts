import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore';
import { DATA_SOURCE, isFirebaseDataSource } from '@/lib/data-source';
import { getFirebaseDb } from '@/lib/firebase/client';
import { requireFirestoreUserId } from '@/lib/firebase/resolve-user-id';
import { invalidatePointCache } from '@/lib/firebase/user-points';
import { cachedFetch, invalidateCache } from '@/lib/query-cache';
import type {
  Game,
  GameScore,
  GlobalGameSettings,
  TournamentSettings,
  GameBaitConfig,
} from './game-service.shared';
import { calculatePoints } from './game-service.shared';
import * as supa from './game-service.supabase';
import * as fb from './game-service.firebase';

export type { Game, GameScore, GlobalGameSettings, TournamentSettings, GameBaitConfig };
export { calculatePoints };

const impl = DATA_SOURCE === 'firebase' ? fb : supa;

const GAMES_TTL_MS = 5 * 60_000;
const GAMES_PREFIX = 'games:';

function invalidateGames() {
  invalidateCache(GAMES_PREFIX);
}

export const getAllGames: typeof supa.getAllGames = () =>
  cachedFetch(`${GAMES_PREFIX}all`, GAMES_TTL_MS, () => impl.getAllGames());

export const getActiveGames: typeof supa.getActiveGames = () =>
  cachedFetch(`${GAMES_PREFIX}active`, GAMES_TTL_MS, () => impl.getActiveGames());

export const getGame: typeof supa.getGame = (gameId) =>
  cachedFetch(`${GAMES_PREFIX}one:${gameId}`, GAMES_TTL_MS, () => impl.getGame(gameId));

export const toggleGameActive: typeof supa.toggleGameActive = async (...a) => {
  const result = await impl.toggleGameActive(...a);
  invalidateGames();
  return result;
};

export const updateGame: typeof supa.updateGame = async (...a) => {
  const result = await impl.updateGame(...a);
  invalidateGames();
  return result;
};

export const getGlobalGameSettings: typeof supa.getGlobalGameSettings = (...a) =>
  impl.getGlobalGameSettings(...a);
export const updateGlobalGameSettings: typeof supa.updateGlobalGameSettings = (...a) =>
  impl.updateGlobalGameSettings(...a);
export const getTournamentSettings: typeof supa.getTournamentSettings = (...a) =>
  impl.getTournamentSettings(...a);
export const updateTournamentSettings: typeof supa.updateTournamentSettings = (...a) =>
  impl.updateTournamentSettings(...a);
export const getGameBaitConfig: typeof supa.getGameBaitConfig = (...a) =>
  impl.getGameBaitConfig(...a);
export const updateGameBaitConfig: typeof supa.updateGameBaitConfig = (...a) =>
  impl.updateGameBaitConfig(...a);

/** firebase 모드: 잔액은 Firestore users.totalPoint, 이력은 users/{id}/points (구앱 fishName 호환) */
async function saveGameScoreFirebase(
  userId: string,
  gameId: string,
  score: number,
  level?: number,
  moves?: number,
  time?: number,
  extraData?: unknown
): Promise<{ points: number; totalPoints: number }> {
  const game = await getGame(gameId);
  if (!game || !game.is_active) {
    throw new Error('게임을 찾을 수 없거나 비활성화된 게임입니다.');
  }

  const pointRate = game.point_rate ?? 100;
  const points = Math.floor(score * (pointRate / 100));
  const fbUserId = await requireFirestoreUserId(userId);
  const db = getFirebaseDb();
  const userRef = doc(db, 'users', fbUserId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('사용자를 찾을 수 없습니다.');

  const totalPoints = Math.max(0, (Number(snap.data().totalPoint) || 0) + points);
  await updateDoc(userRef, {
    totalPoint: totalPoints,
    lastGameAt: new Date(),
  });

  await addDoc(collection(db, `users/${fbUserId}/points`), {
    fishName: game.game_name || gameId,
    gameType: gameId,
    point: points,
    score,
    level: level ?? 1,
    moves: moves ?? 0,
    time: time ?? 0,
    fishLevel: level ?? 1,
    extraPoint: 0,
    extraData: extraData ?? null,
    at: new Date(),
  });

  invalidatePointCache();
  return { points, totalPoints };
}

export const saveGameScore: typeof supa.saveGameScore = async (...args) => {
  if (isFirebaseDataSource()) {
    return saveGameScoreFirebase(...args);
  }
  return supa.saveGameScore(...args);
};
