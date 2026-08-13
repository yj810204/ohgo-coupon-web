import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { MemberProfile } from './member-profile-service.shared';

const AVATAR_BUCKET = 'photos';

function avatarFolder(userId: string) {
  return `avatars/${userId}`;
}

function avatarObjectPath(userId: string, ext: string) {
  return `${avatarFolder(userId)}/avatar.${ext}`;
}

/** Storage에 올라간 아바타 public URL (없으면 null) */
export async function getAvatarPublicUrl(userId: string): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();

  const { data: withCol, error: colError } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (!colError) {
    const url = (withCol as { avatar_url?: string } | null)?.avatar_url?.trim();
    if (url) return url;
  }

  const { data: files, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .list(avatarFolder(userId), { limit: 5 });

  if (error || !files?.length) return null;
  const file = files.find((f) => f.name.startsWith('avatar.')) ?? files[0];
  if (!file?.name) return null;

  const { data } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(`${avatarFolder(userId)}/${file.name}`);
  return `${data.publicUrl}?t=${file.updated_at ? new Date(file.updated_at).getTime() : Date.now()}`;
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('이미지는 5MB 이하여야 합니다.');
  }

  const supabase = getSupabaseBrowserClient();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = avatarObjectPath(userId, ext);

  // 이전 확장자 파일 정리
  const { data: existing } = await supabase.storage.from(AVATAR_BUCKET).list(avatarFolder(userId), { limit: 20 });
  const toRemove = (existing ?? [])
    .filter((f) => f.name.startsWith('avatar.') && f.name !== `avatar.${ext}`)
    .map((f) => `${avatarFolder(userId)}/${f.name}`);
  if (toRemove.length) {
    await supabase.storage.from(AVATAR_BUCKET).remove(toRemove);
  }

  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: data.publicUrl })
    .eq('id', userId);
  if (updateError) {
    // 017 마이그레이션 전이면 Storage만으로도 표시 가능
    console.warn('profiles.avatar_url update skipped:', updateError.message);
  }

  return publicUrl;
}

export async function getMemberProfile(userId: string): Promise<MemberProfile | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('role, total_point, bait_coupons, created_at, legacy_uuid')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const profileImageUrl = (await getAvatarPublicUrl(userId)) ?? undefined;

  return {
    isAdmin: data.role === 'admin',
    totalPoint: Number(data.total_point) || 0,
    baitCoupons: Number(data.bait_coupons) || 0,
    createdAt: data.created_at ? new Date(data.created_at) : null,
    profileImageUrl,
    legacyUuid: data.legacy_uuid ?? null,
  };
}

export async function resetTotalPoint(userId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('profiles').update({ total_point: 0 }).eq('id', userId);
  if (error) throw error;
}

export async function updateBaitCoupons(userId: string, count: number): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('profiles')
    .update({ bait_coupons: count })
    .eq('id', userId);
  if (error) throw error;
}

export async function saveExpoPushToken(userId: string, token: string | null): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', userId);
  if (error) throw error;
}
