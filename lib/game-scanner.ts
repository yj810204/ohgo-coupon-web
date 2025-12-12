import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Game } from './game-service';

export interface ScanResult {
  registered: number;
  updated: number;
  errors: string[];
}

/**
 * 게임 정보를 Firebase에 저장
 */
async function registerGame(config: any, gameId: string, gamePath: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  
  const gameData: Omit<Game, 'game_id'> = {
    game_name: config.game_name || gameId,
    game_type: config.game_type || 'puzzle',
    game_description: config.game_description || config.description || '',
    game_path: gamePath,
    thumbnail_path: config.thumbnail_path || `${gamePath}/thumbnail.png`,
    is_active: true,
    display_order: 0,
    config_data: JSON.stringify(config),
    point_rate: config.point_rate ?? 100, // 기본값: 100% (점수 그대로)
    regdate: new Date(),
    last_update: new Date(),
  };

  await setDoc(gameRef, gameData);
}

/**
 * 기존 게임 정보 업데이트
 */
async function updateGame(config: any, gameId: string, gamePath: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  
  const updateData: Partial<Game> = {
    game_name: config.game_name || gameId,
    game_type: config.game_type || 'puzzle',
    game_description: config.game_description || config.description || '',
    game_path: gamePath,
    thumbnail_path: config.thumbnail_path || `${gamePath}/thumbnail.png`,
    config_data: JSON.stringify(config),
    point_rate: config.point_rate ?? 100,
    last_update: new Date(),
  };

  await setDoc(gameRef, updateData, { merge: true });
}

/**
 * public/games/ 폴더 스캔 (클라이언트 사이드에서는 사용 불가, API에서만 사용)
 * 이 함수는 서버 사이드에서만 동작합니다.
 */
export async function scanGamesFolder(gamesPath: string): Promise<ScanResult> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  const result: ScanResult = {
    registered: 0,
    updated: 0,
    errors: [],
  };

  try {
    // games 폴더 존재 확인
    try {
      await fs.access(gamesPath);
    } catch {
      result.errors.push(`games 폴더를 찾을 수 없습니다: ${gamesPath}`);
      return result;
    }

    // 폴더 목록 읽기
    const entries = await fs.readdir(gamesPath, { withFileTypes: true });
    let displayOrder = 1;

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.' || entry.name === '..') {
        continue;
      }

      const gameFolder = path.join(gamesPath, entry.name);
      const configFile = path.join(gameFolder, 'config.json');

      try {
        // config.json 파일 확인
        await fs.access(configFile);
      } catch {
        result.errors.push(`${entry.name}: config.json 파일이 없습니다.`);
        continue;
      }

      try {
        // config.json 읽기 및 파싱
        const configContent = await fs.readFile(configFile, 'utf-8');
        const config = JSON.parse(configContent);

        // game_id는 폴더명 또는 config.json의 game_id 사용
        const gameId = config.game_id || entry.name;
        const gamePath = `games/${gameId}`;

        // 기존 게임 확인
        const gameRef = doc(db, 'games', gameId);
        const gameSnap = await getDoc(gameRef);

        if (gameSnap.exists()) {
          // 기존 게임 업데이트
          await updateGame(config, gameId, gamePath);
          
          // display_order 유지
          const existingData = gameSnap.data();
          if (existingData.display_order === undefined) {
            await setDoc(gameRef, { display_order: displayOrder++ }, { merge: true });
          }
          
          result.updated++;
        } else {
          // 신규 게임 등록
          await registerGame(config, gameId, gamePath);
          
          // display_order 설정
          await setDoc(gameRef, { display_order: displayOrder++ }, { merge: true });
          
          result.registered++;
        }
      } catch (error: any) {
        result.errors.push(`${entry.name}: ${error.message || '알 수 없는 오류'}`);
      }
    }
  } catch (error: any) {
    result.errors.push(`스캔 중 오류 발생: ${error.message || '알 수 없는 오류'}`);
  }

  return result;
}

