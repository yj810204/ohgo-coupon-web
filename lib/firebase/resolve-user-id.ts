import { doc, getDoc } from 'firebase/firestore';
import { cachedFetch } from '@/lib/query-cache';
import { getFirebaseDb } from '@/lib/firebase/client';
import { computeLegacyUuid } from '@/lib/legacy-uuid';
import { isSupabaseConfigured, getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * 세션/Auth UUID → Firestore `users/{id}` 문서 ID.
 * 레거시 로그인 후 profiles.id(Supabase)와 users/{uuidv5}(Firebase)가 다를 때
 * profiles.legacy_uuid(또는 name+dob 재계산)로 매핑한다.
 */
export async function resolveFirestoreUserId(userId: string): Promise<string | null> {
  if (!userId) return null;
  return cachedFetch(`fb-uid:${userId}`, 300_000, () => resolveFirestoreUserIdUncached(userId));
}

async function resolveFirestoreUserIdUncached(userId: string): Promise<string | null> {
  const db = getFirebaseDb();
  const legacyId = await lookupLegacyUuidFromProfile(userId);

  if (legacyId && legacyId !== userId) {
    const mapped = await getDoc(doc(db, 'users', legacyId));
    if (mapped.exists()) return legacyId;
  }

  const direct = await getDoc(doc(db, 'users', userId));
  if (direct.exists()) return userId;

  return null;
}

export async function requireFirestoreUserId(userId: string): Promise<string> {
  const resolved = await resolveFirestoreUserId(userId);
  if (!resolved) throw new Error('회원 정보를 찾을 수 없습니다.');
  return resolved;
}

async function lookupLegacyUuidFromProfile(userId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  type ProfileRow = { legacy_uuid: string | null; name: string | null; dob: string | null };

  let profile: ProfileRow | null = null;

  if (typeof window === 'undefined' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { data } = await admin
      .from('profiles')
      .select('legacy_uuid, name, dob')
      .eq('id', userId)
      .maybeSingle();
    profile = data;
  } else {
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase
        .from('profiles')
        .select('legacy_uuid, name, dob')
        .eq('id', userId)
        .maybeSingle();
      profile = data;
    } catch {
      return null;
    }
  }

  if (!profile) return null;
  if (profile.legacy_uuid) return profile.legacy_uuid;

  if (profile.name && profile.dob) {
    try {
      return computeLegacyUuid(profile.name, profile.dob);
    } catch {
      return null;
    }
  }

  return null;
}
