import { invalidateCache } from '@/lib/query-cache';
import { healProfileLegacyUuid, resolveCanonicalUserId } from '@/lib/firebase/canonical-user';
import {
  readCachedMemberId,
  resolveMemberId,
  type MemberIdentityHint,
  type ProfileLookup,
} from '@/lib/member-id-resolution';
import { persistFirestoreUserId } from '@/lib/storage';
import { isSupabaseConfigured, getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * 세션/Auth UUID → Firestore `users/{id}` 문서 ID.
 * 레거시 로그인 후 profiles.id(Supabase)와 users/{uuidv5}(Firebase)가 다를 때
 * profiles.legacy_uuid, 그다음 프로필 또는 기기에 저장된 이름+생년월일로 매핑한다.
 * 병합된(mergedTo) 문서는 실제 계정까지 따라간다.
 * 빈 프로필은 회원 없음으로 확정하지 않고, 세션을 한 번 갱신한 뒤 다시 찾는다.
 */
export async function resolveFirestoreUserId(
  userId: string,
  options?: { waitMs?: number },
): Promise<string | null> {
  if (!userId) return null;
  return readCachedMemberId(userId, () => resolveFirestoreUserIdUncached(userId), options?.waitMs);
}

async function resolveFirestoreUserIdUncached(userId: string): Promise<string | null> {
  const hint = deviceIdentityHint(userId);
  const { id, profile } = await resolveMemberId({
    userId,
    hint,
    lookupProfile: () => lookupProfile(userId),
    refreshSession:
      typeof window === 'undefined'
        ? undefined
        : async () => {
            const supabase = getSupabaseBrowserClient();
            await supabase.auth.refreshSession();
          },
    lookupServerMemberId: typeof window === 'undefined' ? undefined : fetchServerMemberId,
    findDoc: async (candidate) => {
      const resolved = await resolveCanonicalUserId(candidate);
      if (!resolved.missing && resolved.id) return { id: resolved.id, missing: false };
      return { id: candidate, missing: true };
    },
  });
  if (
    id &&
    profile.status === 'found' &&
    profile.legacyUuid &&
    profile.legacyUuid !== id &&
    typeof window === 'undefined'
  ) {
    void healProfileLegacyUuid(userId, id);
  }
  if (id) persistFirestoreUserId(userId, id);
  return id;
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

async function fetchServerMemberId(): Promise<string | null> {
  const response = await fetch('/api/me/member-id', { credentials: 'include', cache: 'no-store' });
  if (!response.ok) return null;
  const body = (await response.json()) as { fbUid?: unknown };
  return typeof body.fbUid === 'string' && body.fbUid ? body.fbUid : null;
}

function deviceIdentityHint(userId: string): MemberIdentityHint | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem('userInfo');
    if (!raw) return undefined;
    const local = JSON.parse(raw) as { uuid?: string; name?: string; dob?: string; fbUid?: string };
    if (local.uuid && local.uuid !== userId) return undefined;
    if (!local.name && !local.dob && !local.fbUid) return undefined;
    return { name: local.name, dob: local.dob, fbUid: local.fbUid };
  } catch {
    return undefined;
  }
}

type ProfileRow = { legacy_uuid: string | null; name: string | null; dob: string | null };

function foundProfile(row: ProfileRow): ProfileLookup {
  return {
    status: 'found',
    legacyUuid: row.legacy_uuid,
    name: row.name,
    dob: row.dob,
  };
}

async function lookupProfile(userId: string): Promise<ProfileLookup> {
  if (!isSupabaseConfigured()) return { status: 'absent' };

  if (typeof window === 'undefined' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .select('legacy_uuid, name, dob')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return error ? { status: 'unknown' } : { status: 'absent' };
    return foundProfile(data);
  }

  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('legacy_uuid, name, dob')
      .eq('id', userId)
      .maybeSingle();
    // 만료된 세션은 에러 없이 빈 행을 준다. 회원 없음으로 보지 않는다.
    if (error || !data) return { status: 'unknown' };
    return foundProfile(data);
  } catch {
    return { status: 'unknown' };
  }
}
