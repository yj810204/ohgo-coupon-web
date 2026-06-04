import { createAdminClient } from './supabase/admin';
import { syncGameThumbnailFromLocal } from './game-thumbnail';
import type { Game } from './game-service.shared';

export interface ScanResult {
  registered: number;
  updated: number;
  errors: string[];
}

const SKIP_DIRS = new Set(['shared', 'node_modules', '.', '..']);

function buildGamePayload(
  config: Record<string, unknown>,
  gameId: string,
  gamePath: string,
  existing?: Partial<Game>,
): Record<string, unknown> {
  return {
    game_name: (config.game_name as string) || gameId,
    game_type: (config.game_type as string) || 'puzzle',
    game_description:
      (config.game_description as string) ||
      (config.description as string) ||
      '',
    game_path: gamePath,
    config_data: existing?.config_data || JSON.stringify(config),
    point_rate: existing?.point_rate ?? (config.point_rate as number) ?? 100,
    is_active: existing?.is_active ?? true,
  };
}

async function syncThumbnailAfterSave(
  publicRoot: string,
  gameId: string,
  config: Record<string, unknown>,
  existing?: { thumbnail_url?: string | null; thumbnail_path?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  const result = await syncGameThumbnailFromLocal({
    admin,
    publicRoot,
    gameId,
    config,
    existing,
    preserveExistingUrl: true,
  });

  if (!result.synced && !result.thumbnail_url) {
    if (existing?.thumbnail_path && !existing?.thumbnail_url) {
      const { error } = await admin
        .from('games')
        .update({ thumbnail_path: null, updated_at: new Date().toISOString() })
        .eq('id', gameId);
      if (error) throw error;
    }
    return;
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (result.thumbnail_path) patch.thumbnail_path = result.thumbnail_path;
  if (result.thumbnail_url) patch.thumbnail_url = result.thumbnail_url;

  const { error } = await admin.from('games').update(patch).eq('id', gameId);
  if (error) throw error;
}

async function getGameSupabase(gameId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from('games').select('*').eq('id', gameId).maybeSingle();
  if (error) throw error;
  return data;
}

async function registerGame(
  config: Record<string, unknown>,
  gameId: string,
  gamePath: string,
  displayOrder: number,
  publicRoot: string,
): Promise<void> {
  const admin = createAdminClient();
  const payload = buildGamePayload(config, gameId, gamePath);
  const { error } = await admin.from('games').insert({
    id: gameId,
    ...payload,
    display_order: displayOrder,
    is_active: true,
  });
  if (error) throw error;

  await syncThumbnailAfterSave(publicRoot, gameId, config);
}

async function updateGame(
  config: Record<string, unknown>,
  gameId: string,
  gamePath: string,
  displayOrder: number | undefined,
  publicRoot: string,
): Promise<void> {
  const admin = createAdminClient();
  const existing = await getGameSupabase(gameId);

  const payload = buildGamePayload(config, gameId, gamePath, existing ? {
    config_data: existing.config_data ?? undefined,
    point_rate: existing.point_rate ?? undefined,
    is_active: existing.is_active ?? undefined,
  } : undefined);

  const { error } = await admin
    .from('games')
    .update({
      ...payload,
      asset_urls: existing?.asset_urls ?? null,
      display_order: existing?.display_order ?? displayOrder ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameId);
  if (error) throw error;

  await syncThumbnailAfterSave(publicRoot, gameId, config, existing ? {
    thumbnail_url: existing.thumbnail_url,
    thumbnail_path: existing.thumbnail_path,
  } : undefined);
}

/** public/games/ 폴더 스캔 (서버 전용) */
export async function scanGamesFolder(gamesPath: string): Promise<ScanResult> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const result: ScanResult = {
    registered: 0,
    updated: 0,
    errors: [],
  };

  const publicRoot = path.join(gamesPath, '..');

  try {
    try {
      await fs.access(gamesPath);
    } catch {
      result.errors.push(`games 폴더를 찾을 수 없습니다: ${gamesPath}`);
      return result;
    }

    const entries = await fs.readdir(gamesPath, { withFileTypes: true });
    let displayOrder = 1;

    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
        continue;
      }

      const gameFolder = path.join(gamesPath, entry.name);
      const configFile = path.join(gameFolder, 'config.json');

      try {
        await fs.access(configFile);
      } catch {
        result.errors.push(`${entry.name}: config.json 파일이 없습니다.`);
        continue;
      }

      try {
        const configContent = await fs.readFile(configFile, 'utf-8');
        const config = JSON.parse(configContent) as Record<string, unknown>;

        const gameId = (config.game_id as string) || entry.name;
        const gamePath = `games/${gameId}`;
        const existing = await getGameSupabase(gameId);

        if (existing) {
          await updateGame(config, gameId, gamePath, displayOrder, publicRoot);
          result.updated++;
        } else {
          await registerGame(config, gameId, gamePath, displayOrder, publicRoot);
          result.registered++;
        }

        displayOrder++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류';
        result.errors.push(`${entry.name}: ${message}`);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    result.errors.push(`스캔 중 오류 발생: ${message}`);
  }

  return result;
}
