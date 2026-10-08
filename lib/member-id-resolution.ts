import { listLegacyUuidCandidates } from '@/lib/legacy-uuid';
import { cachedFetch, peekCache } from '@/lib/query-cache';
import { TimeoutError } from '@/lib/with-timeout';

/** 확인된 회원 id만 오래 캐시한다. 없음은 캐시하지 않는다. */
export const MEMBER_ID_TTL_MS = 300_000;

export type ProfileLookup =
  | { status: 'found'; legacyUuid: string | null; name: string | null; dob: string | null }
  | { status: 'unknown' }
  | { status: 'absent' };

export type MemberIdentityHint = { name?: string | null; dob?: string | null };

function pushLegacyCandidates(target: string[], name?: string | null, dob?: string | null) {
  const trimmedName = name?.trim() ?? '';
  const digits = (dob ?? '').replace(/\D/g, '');
  if (!trimmedName || !digits) return;
  try {
    target.push(...listLegacyUuidCandidates(trimmedName, digits));
  } catch {
    /* 생년월일 형식이 아니면 이 후보는 건너뛴다 */
  }
}

/** legacy_uuid, 로그인 id, 프로필 이름+생일, 기기에 저장된 이름+생일 순. */
export function memberIdCandidates(
  userId: string,
  profile: ProfileLookup,
  hint?: MemberIdentityHint,
): string[] {
  const candidates: string[] = [];
  if (profile.status === 'found' && profile.legacyUuid) candidates.push(profile.legacyUuid);
  if (userId) candidates.push(userId);
  if (profile.status === 'found') pushLegacyCandidates(candidates, profile.name, profile.dob);
  pushLegacyCandidates(candidates, hint?.name, hint?.dob);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    unique.push(candidate);
  }
  return unique;
}

/**
 * 빈 프로필(세션 만료로 행이 안 보이는 경우)은 한 번 갱신한 뒤 다시 본다.
 * 그래도 없으면 로그인 id와 기기의 이름+생년월일로 Firestore 회원을 찾는다.
 * 찾지 못하면 null. 호출자가 그 null을 길게 캐시하면 안 된다.
 */
export async function resolveMemberId(input: {
  userId: string;
  hint?: MemberIdentityHint;
  lookupProfile: () => Promise<ProfileLookup>;
  refreshSession?: () => Promise<void>;
  findDoc: (id: string) => Promise<{ id: string; missing: boolean }>;
}): Promise<{ id: string | null; profile: ProfileLookup }> {
  let profile = await input.lookupProfile();
  if (profile.status === 'unknown' && input.refreshSession) {
    try {
      await input.refreshSession();
    } catch {
      /* 갱신 실패도 회원 없음으로 확정하지 않는다 */
    }
    profile = await input.lookupProfile();
  }

  for (const candidate of memberIdCandidates(input.userId, profile, input.hint)) {
    const found = await input.findDoc(candidate);
    if (!found.missing && found.id) return { id: found.id, profile };
  }
  return { id: null, profile };
}

export async function readCachedMemberId(
  userId: string,
  load: () => Promise<string | null>,
  waitMs?: number,
): Promise<string | null> {
  const key = `fb-uid:${userId}`;
  try {
    return await cachedFetch(
      key,
      MEMBER_ID_TTL_MS,
      async () => {
        const id = await load();
        if (!id) {
          const error = new Error('member-unresolved');
          error.name = 'MemberUnresolved';
          throw error;
        }
        return id;
      },
      waitMs,
    );
  } catch (error) {
    if (error instanceof TimeoutError) throw error;
    if (error instanceof Error && error.name === 'MemberUnresolved') return null;
    throw error;
  }
}

export function peekCachedMemberId(userId: string): string | undefined {
  return peekCache<string>(`fb-uid:${userId}`);
}
