import { getSettingsValue, setSettingsValue } from '@/lib/settings-store';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { EmojiPack } from './emoji-pack-shared';

const SETTINGS_KEY = 'emoji_packs';
const STORAGE_BUCKET = 'photos';

type EmojiStore = { packs: EmojiPack[] };

async function readStore(): Promise<EmojiStore> {
  return getSettingsValue<EmojiStore>(SETTINGS_KEY, { packs: [] });
}

async function writeStore(store: EmojiStore): Promise<void> {
  await setSettingsValue(SETTINGS_KEY, store);
}

export async function getEmojiPacks(includeInactive = false): Promise<EmojiPack[]> {
  const store = await readStore();
  let packs = store.packs.map((p) => ({
    ...p,
    emojis: [...(p.emojis || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
  }));
  if (!includeInactive) packs = packs.filter((p) => p.isActive);
  packs.sort(
    (a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime(),
  );
  return packs;
}

export async function getEmojiPack(packId: string): Promise<EmojiPack | null> {
  const store = await readStore();
  const pack = store.packs.find((p) => p.packId === packId);
  if (!pack) return null;
  return {
    ...pack,
    emojis: [...(pack.emojis || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
  };
}

export async function saveEmojiPack(
  pack: Omit<EmojiPack, 'packId' | 'createdAt' | 'updatedAt'> & { packId?: string },
): Promise<string> {
  const store = await readStore();
  const packId = pack.packId || `pack_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();
  const idx = store.packs.findIndex((p) => p.packId === packId);

  const next: EmojiPack = {
    packId,
    name: pack.name,
    description: pack.description,
    emojis: pack.emojis || [],
    isActive: pack.isActive !== undefined ? pack.isActive : true,
    createdAt: idx >= 0 ? store.packs[idx].createdAt : now,
    updatedAt: now,
  };

  if (idx >= 0) store.packs[idx] = next;
  else store.packs.push(next);

  await writeStore(store);
  return packId;
}

export async function deleteEmojiPack(packId: string): Promise<void> {
  const pack = await getEmojiPack(packId);
  if (pack) {
    for (const emoji of pack.emojis) {
      try {
        await deleteEmojiImage(packId, emoji.emojiId);
      } catch {
        /* ignore */
      }
    }
  }
  const store = await readStore();
  store.packs = store.packs.filter((p) => p.packId !== packId);
  await writeStore(store);
}

export async function uploadEmojiImage(
  packId: string,
  emojiId: string,
  imageFile: File,
): Promise<string> {
  if (!imageFile.type.startsWith('image/')) throw new Error('이미지 파일만 업로드할 수 있습니다.');
  if (imageFile.size > 100 * 1024) throw new Error('이미지 크기는 100KB 이하여야 합니다.');

  const ext = imageFile.name.split('.').pop() || 'png';
  const path = `emojis/${packId}/${emojiId}.${ext}`;
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, imageFile, {
    upsert: true,
    contentType: imageFile.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteEmojiImage(packId: string, emojiId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const extensions = ['png', 'jpg', 'jpeg', 'svg', 'webp'];
  const paths = extensions.map((ext) => `emojis/${packId}/${emojiId}.${ext}`);
  await supabase.storage.from(STORAGE_BUCKET).remove(paths);
}
