import { listLegacyUuidCandidates } from '@/lib/legacy-uuid';
import { cachedFetch, peekCache, seedCache } from '@/lib/query-cache';
import { TimeoutError } from '@/lib/with-timeout';

/** 확인된 회원 id만 오래 캐시한다. 없음은 캐시하지 않는다. */
export const MEMBER_ID_TTL_MS = 300_000;

/** 스탬프 조회가 회원 번호를 기다리는 한계. 바깥 캐시 대기보다 길되, 30초까지 붙잡지 않는다. */
export const MEMBER_ID_LOOKUP_WAIT_MS = 9_000;

export type ProfileLookup =
  | { status: 'found'; legacyUuid: string | null; name: string | null; dob: string | null }
  | { status: 'unknown' }
  | { status: 'absent' };

export type MemberIdentityHint = {
  name?: string | null;
  dob?: string | null;
  /** 이 로그인 id로 이전에 확인한 Firestore 문서 id */
  fbUid?: string | null;
  /** userInfo에 저장된 로그인 id. 지금 사용자와 같을 때만 빠른 조회에 쓴다. */
  storedUuid?: string | null;
};

const unverifiedSeeds = new Set<string>();

/** 저장된 Firestore id, 또는 로그인 id와 같은 저장 uuid를 프로필보다 먼저 본다. */
export function fastMemberIdCandidates(userId: string, hint?: MemberIdentityHint): string[] {
  const ids: string[] = [];
  if (hint?.fbUid) ids.push(hint.fbUid);
  if (userId && hint?.storedUuid && hint.storedUuid === userId) ids.push(userId);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

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

/**
 * 저장된 Firestore id, 서버가 알려 준 id, legacy_uuid, 로그인 id,
 * 프로필 이름+생일, 기기에 저장된 이름+생일 순.
 */
export function memberIdCandidates(
  userId: string,
  profile: ProfileLookup,
  hint?: MemberIdentityHint,
  serverFbUid?: string | null,
): string[] {
  const candidates: string[] = [];
  if (hint?.fbUid) candidates.push(hint.fbUid);
  if (serverFbUid) candidates.push(serverFbUid);
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
  lookupServerMemberId?: () => Promise<string | null>;
  findDoc: (id: string) => Promise<{ id: string; missing: boolean }>;
}): Promise<{ id: string | null; profile: ProfileLookup }> {
  const tried = new Set<string>();
  for (const candidate of fastMemberIdCandidates(input.userId, input.hint)) {
    tried.add(candidate);
    const found = await input.findDoc(candidate);
    if (!found.missing && found.id) return { id: found.id, profile: { status: 'unknown' } };
  }

  let profile = await input.lookupProfile();
  if (profile.status === 'unknown' && input.refreshSession) {
    try {
      await input.refreshSession();
    } catch {
      /* 갱신 실패도 회원 없음으로 확정하지 않는다 */
    }
    profile = await input.lookupProfile();
  }

  let serverFbUid: string | null = null;
  if (profile.status === 'unknown' && input.lookupServerMemberId) {
    try {
      serverFbUid = await input.lookupServerMemberId();
    } catch {
      serverFbUid = null;
    }
  }

  for (const candidate of memberIdCandidates(input.userId, profile, input.hint, serverFbUid)) {
    if (tried.has(candidate)) continue;
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

/** localStorage의 fbUid로 메모리 조회를 먼저 채운다. 문서는 호출자가 뒤에서 확인한다. */
export function seedCachedMemberId(userId: string, fbUid: string): void {
  if (!userId || !fbUid || peekCachedMemberId(userId)) return;
  seedCache(`fb-uid:${userId}`, fbUid, MEMBER_ID_TTL_MS);
  unverifiedSeeds.add(userId);
}

/** 방금 심은 값이면 true를 한 번만 돌려준다. */
export function consumeUnverifiedMemberSeed(userId: string): boolean {
  if (!unverifiedSeeds.has(userId)) return false;
  unverifiedSeeds.delete(userId);
  return true;
}
