import type { SupabaseClient } from '@supabase/supabase-js';

export const GAMES_STORAGE_BUCKET = 'games';

export interface LocalThumbnailFile {
  absolutePath: string;
  relativePath: string;
  contentType: string;
}

export interface ThumbnailSyncResult {
  synced: boolean;
  thumbnail_path?: string;
  thumbnail_url?: string;
}

/** public/ 기준 썸네일 후보 경로를 순서대로 탐색 */
export async function findLocalThumbnailFile(
  publicRoot: string,
  gameId: string,
  config: Record<string, unknown>,
): Promise<LocalThumbnailFile | null> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const candidates: string[] = [];
  const configPath = config.thumbnail_path as string | undefined;
  if (configPath) {
    candidates.push(configPath.replace(/^\//, ''));
  }
  candidates.push(`games/${gameId}/thumbnail.png`);
  candidates.push(`games/${gameId}/assets/thumbnail.png`);
  candidates.push(`games/${gameId}/assets/thumbnail.jpg`);
  candidates.push(`games/${gameId}/assets/thumbnail.jpeg`);

  for (const relativePath of candidates) {
    const absolutePath = path.join(publicRoot, relativePath);
    try {
      await fs.access(absolutePath);
      const ext = path.extname(absolutePath).toLowerCase();
      const contentType =
        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      return { absolutePath, relativePath, contentType };
    } catch {
      // 다음 후보
    }
  }

  return null;
}

export function getGameThumbnailStoragePath(gameId: string): string {
  return `${gameId}/thumbnail.png`;
}

/** Supabase Storage에 썸네일 업로드 후 public URL 반환 */
export async function uploadThumbnailBuffer(
  admin: SupabaseClient,
  gameId: string,
  buffer: Buffer,
  contentType = 'image/png',
): Promise<{ storagePath: string; publicUrl: string }> {
  const storagePath = getGameThumbnailStoragePath(gameId);
  const { error } = await admin.storage.from(GAMES_STORAGE_BUCKET).upload(storagePath, buffer, {
    upsert: true,
    contentType,
  });
  if (error) throw error;

  const { data } = admin.storage.from(GAMES_STORAGE_BUCKET).getPublicUrl(storagePath);
  return { storagePath, publicUrl: data.publicUrl };
}

/** 로컬 썸네일 파일 → Storage 업로드 → DB 저장용 필드 반환 */
export async function syncGameThumbnailFromLocal(options: {
  admin: SupabaseClient;
  publicRoot: string;
  gameId: string;
  config: Record<string, unknown>;
  existing?: { thumbnail_url?: string | null; thumbnail_path?: string | null };
  preserveExistingUrl?: boolean;
}): Promise<ThumbnailSyncResult> {
  const { admin, publicRoot, gameId, config, existing, preserveExistingUrl = true } = options;

  if (preserveExistingUrl && existing?.thumbnail_url) {
    return {
      synced: false,
      thumbnail_path: existing.thumbnail_path ?? undefined,
      thumbnail_url: existing.thumbnail_url,
    };
  }

  const local = await findLocalThumbnailFile(publicRoot, gameId, config);
  if (!local) {
    return { synced: false };
  }

  const fs = await import('fs/promises');
  const buffer = await fs.readFile(local.absolutePath);
  const { publicUrl } = await uploadThumbnailBuffer(admin, gameId, buffer, local.contentType);

  return {
    synced: true,
    thumbnail_path: local.relativePath,
    thumbnail_url: publicUrl,
  };
}
