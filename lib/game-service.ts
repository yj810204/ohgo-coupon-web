import { collection, getDocs, doc, getDoc, setDoc, updateDoc, query, where, orderBy, runTransaction } from 'firebase/firestore';
import { db } from './firebase';

export interface Game {
  game_id: string;
  game_name: string;
  game_type?: string;
  game_description?: string;
  game_path: string;
  thumbnail_path?: string;
  thumbnail_url?: string; // Firebase Storage URL (우선순위 높음)
  is_active: boolean;
  display_order: number;
  config_data?: string;
  point_rate?: number; // 포인트 적립 비율 (% 단위, 기본값: 100)
  asset_urls?: Record<string, string>; // 에셋 이미지 URL (예: { block_0: 'https://...', bird_0: 'https://...' })
  regdate?: any;
  last_update?: any;
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
  regdate?: any;
}

/**
 * 모든 게임 조회 (관리자용)
 */
export async function getAllGames(): Promise<Game[]> {
  try {
    const gamesRef = collection(db, 'games');
    const snapshot = await getDocs(query(gamesRef, orderBy('display_order', 'asc')));
    
    const games: Game[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      games.push({
        game_id: doc.id,
        ...data,
        is_active: data.is_active ?? true,
        display_order: data.display_order ?? 0,
        point_rate: data.point_rate ?? 100,
      } as Game);
    });
    
    return games;
  } catch (error) {
    console.error('Error fetching all games:', error);
    throw error;
  }
}

/**
 * 활성화된 게임만 조회
 */
export async function getActiveGames(): Promise<Game[]> {
  try {
    const gamesRef = collection(db, 'games');
    // 인덱스 없이 작동하도록 where만 사용하고, 클라이언트 사이드에서 정렬
    const snapshot = await getDocs(
      query(
        gamesRef,
        where('is_active', '==', true)
      )
    );
    
    const games: Game[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      games.push({
        game_id: doc.id,
        ...data,
        is_active: true,
        display_order: data.display_order ?? 0,
        point_rate: data.point_rate ?? 100,
      } as Game);
    });
    
    // 클라이언트 사이드에서 정렬
    games.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    
    return games;
  } catch (error) {
    console.error('Error fetching active games:', error);
    throw error;
  }
}

/**
 * 특정 게임 정보 조회
 */
export async function getGame(gameId: string): Promise<Game | null> {
  try {
    const gameRef = doc(db, 'games', gameId);
    const gameSnap = await getDoc(gameRef);
    
    if (!gameSnap.exists()) {
      return null;
    }
    
    const data = gameSnap.data();
    return {
      game_id: gameSnap.id,
      ...data,
      is_active: data.is_active ?? true,
      display_order: data.display_order ?? 0,
      point_rate: data.point_rate ?? 100,
    } as Game;
  } catch (error) {
    console.error('Error fetching game:', error);
    throw error;
  }
}

/**
 * 게임 활성화/비활성화
 */
export async function toggleGameActive(gameId: string, isActive: boolean): Promise<void> {
  try {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, {
      is_active: isActive,
      last_update: new Date(),
    });
  } catch (error) {
    console.error('Error toggling game active status:', error);
    throw error;
  }
}

/**
 * 점수를 포인트로 변환
 * @param score 게임 점수
 * @param pointRate 포인트 적립 비율 (% 단위, 예: 10 = 10%, 100 = 점수 그대로)
 * @returns 획득한 포인트
 */
export function calculatePoints(score: number, pointRate: number = 100): number {
  const rate = pointRate / 100; // %를 소수로 변환
  return Math.floor(score * rate);
}

/**
 * 게임 점수 저장 및 포인트 적립
 */
export async function saveGameScore(
  userId: string,
  gameId: string,
  score: number,
  level?: number,
  moves?: number,
  time?: number,
  extraData?: any
): Promise<{ points: number; totalPoints: number }> {
  try {
    // 게임 정보 조회
    const game = await getGame(gameId);
    if (!game || !game.is_active) {
      throw new Error('게임을 찾을 수 없거나 비활성화된 게임입니다.');
    }

    // 포인트 계산
    const pointRate = game.point_rate ?? 100;
    const points = calculatePoints(score, pointRate);

    // 게임 점수 기록
    const gameScoresRef = collection(db, `users/${userId}/gameScores`);
    const scoreData: Omit<GameScore, 'score_id'> = {
      game_id: gameId,
      score,
      points,
      level: level ?? 1,
      moves: moves ?? 0,
      time: time ?? 0,
      extra_data: extraData ? JSON.stringify(extraData) : undefined,
      regdate: new Date(),
    };
    
    await setDoc(doc(gameScoresRef), scoreData);

    // 포인트 이력 기록 (기존 포인트 시스템과 동일한 구조)
    const pointsRef = collection(db, `users/${userId}/points`);
    await setDoc(doc(pointsRef), {
      point: points,
      fishName: game.game_name, // 게임 이름을 fishName으로 저장 (기존 시스템 호환)
      fishLevel: level ?? 1,
      extraPoint: 0,
      at: new Date(),
      gameType: 'cj_game',
      gameId: gameId,
    });

    // totalPoint 업데이트 (트랜잭션 사용)
    const userRef = doc(db, 'users', userId);
    
    let totalPoints = 0;
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }
      
      const currentPoints = (userSnap.data()?.totalPoint ?? 0) as number;
      const nextPoints = Math.max(0, currentPoints + points); // 음수 방지
      
      transaction.update(userRef, {
        totalPoint: nextPoints,
      });
      
      totalPoints = nextPoints;
    });

    return {
      points,
      totalPoints,
    };
  } catch (error) {
    console.error('Error saving game score:', error);
    throw error;
  }
}

export interface GlobalGameSettings {
  tournament_enabled?: boolean;
  tournament_start_date?: string;
  tournament_end_date?: string;
  daily_play_limit?: number;
  show_medals?: boolean;
  ranking_medal_count?: number; // 1, 2, 3 중 선택 (기본값 3)
  game_notice?: string;
}

/**
 * 통합 게임 설정 조회
 */
export async function getGlobalGameSettings(): Promise<GlobalGameSettings | null> {
  try {
    const settingsRef = doc(db, 'gameSettings', 'global');
    const settingsSnap = await getDoc(settingsRef);
    if (settingsSnap.exists()) {
      return settingsSnap.data() as GlobalGameSettings;
    }
    return null;
  } catch (error) {
    console.error('Error fetching global game settings:', error);
    return null;
  }
}

/**
 * 통합 게임 설정 업데이트
 */
export async function updateGlobalGameSettings(settings: Partial<GlobalGameSettings>): Promise<void> {
  try {
    const settingsRef = doc(db, 'gameSettings', 'global');
    await setDoc(settingsRef, {
      ...settings,
      updatedAt: new Date(),
    }, { merge: true });
  } catch (error) {
    console.error('Error updating global game settings:', error);
    throw error;
  }
}

