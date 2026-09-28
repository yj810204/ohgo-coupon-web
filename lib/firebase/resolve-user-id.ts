import { cachedFetch, invalidateCache } from '@/lib/query-cache';
import { healProfileLegacyUuid, resolveCanonicalUserId } from '@/lib/firebase/canonical-user';
import { listLegacyUuidCandidates } from '@/lib/legacy-uuid';
import { isSupabaseConfigured, getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * 세션/Auth UUID → Firestore `users/{id}` 문서 ID.
 * 레거시 로그인 후 profiles.id(Supabase)와 users/{uuidv5}(Firebase)가 다를 때
 * profiles.legacy_uuid(또는 name+dob 재계산)로 매핑한다.
 * 병합된(mergedTo) 문서는 실제 계정까지 따라간다.
 */
export async function resolveFirestoreUserId(userId: string): Promise<string | null> {
  if (!userId) return null;
  return cachedFetch(`fb-uid:${userId}`, 300_000, () => resolveFirestoreUserIdUncached(userId));
}

async function resolveFirestoreUserIdUncached(userId: string): Promise<string | null> {
  const profile = await lookupProfileRow(userId);
  const candidates: string[] = [];

  if (profile?.legacy_uuid) candidates.push(profile.legacy_uuid);
  candidates.push(userId);
  if (profile?.name && profile?.dob) {
    try {
      candidates.push(...listLegacyUuidCandidates(profile.name, profile.dob));
    } catch {
      /* ignore */
    }
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const resolved = await resolveCanonicalUserId(candidate);
    if (!resolved.missing && resolved.id) {
      if (
        profile &&
        profile.legacy_uuid &&
        profile.legacy_uuid !== resolved.id &&
        typeof window === 'undefined'
      ) {
        void healProfileLegacyUuid(userId, resolved.id);
      }
      return resolved.id;
    }
  }

  return null;
}

export async function requireFirestoreUserId(userId: string): Promise<string> {
  const resolved = await resolveFirestoreUserId(userId);
  if (!resolved) throw new Error('회원 정보를 찾을 수 없습니다.');
  return resolved;
}

export function invalidateFirestoreUserIdCache(userId?: string) {
  if (userId) invalidateCache(`fb-uid:${userId}`);
  else invalidateCache('fb-uid:');
}

type ProfileRow = { legacy_uuid: string | null; name: string | null; dob: string | null };

async function lookupProfileRow(userId: string): Promise<ProfileRow | null> {
  if (!isSupabaseConfigured()) return null;

  if (typeof window === 'undefined' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { data } = await admin
      .from('profiles')
      .select('legacy_uuid, name, dob')
      .eq('id', userId)
      .maybeSingle();
    return data;
  }

  try {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from('profiles')
      .select('legacy_uuid, name, dob')
      .eq('id', userId)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}
