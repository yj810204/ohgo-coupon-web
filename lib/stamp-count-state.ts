import { CACHE_WAIT_MS } from '@/lib/query-cache';
import { TimeoutError } from '@/lib/with-timeout';

export function stampListCacheKey(uuid: string): string {
  return `stamps:list:${uuid}`;
}

export function couponCountCacheKey(uuid: string): string {
  return `stamps:couponCount:${uuid}`;
}

export type StampCouponCounts = { stamps: number | null; coupons: number | null };

/** 처음 한 번과 다시 시도를 합쳐 이 횟수까지만 조회한다. */
export const STAMP_LOAD_ATTEMPT_LIMIT = 4;
export const STAMP_RETRY_BASE_MS = 1_200;
/** 재시도를 다 쓴 뒤, 화면이 보이는 동안 천천히 다시 시도한다. */
export const STAMP_SLOW_RETRY_MS = 12_000;
export const STAMP_SLOW_RETRY_WINDOW_MS = 120_000;

export const LAST_KNOWN_STAMP_PREFIX = 'ohgo-stamp-counts:';

export type StampRetryState = {
  attempts: number;
  failed: boolean;
  exhausted: boolean;
};

export type StampRetryPlan = {
  state: StampRetryState;
  retry: boolean;
  delayMs: number;
};

export function initialStampRetryState(): StampRetryState {
  return { attempts: 0, failed: false, exhausted: false };
}

/** 바깥 캐시 대기(1.5초)만 실패가 아니다. 회원 조회 시간 초과는 실패다. */
export function isOuterCacheWaitTimeout(reason: unknown): boolean {
  return reason instanceof TimeoutError && reason.message === `timeout ${CACHE_WAIT_MS}`;
}

export function memberUnconfirmedError(): Error {
  const error = new Error('확인되지 않은 회원 번호입니다.');
  error.name = 'MemberUnconfirmed';
  return error;
}

export function isMemberUnconfirmed(error: unknown): boolean {
  return error instanceof Error && error.name === 'MemberUnconfirmed';
}

function settleCount(prev: number | null, result: PromiseSettledResult<unknown>, next: number): number | null {
  if (result.status === 'fulfilled') return next;
  // 시간 초과·실패 모두 마지막 성공 값을 유지한다. 한 번도 못 받았으면 0으로 보이지 않는다.
  return prev;
}

/**
 * 성공한 개수만 반영한다.
 * 실패하거나 아직 진행 중이면 이전 값을 유지하고, 받은 적이 없으면 빈 자리로 둔다.
 */
export function applyStampCouponLoad(
  prev: StampCouponCounts,
  result: {
    stamps: PromiseSettledResult<string[]>;
    coupons: PromiseSettledResult<number>;
  },
): StampCouponCounts {
  return {
    stamps: settleCount(prev.stamps, result.stamps, result.stamps.status === 'fulfilled' ? result.stamps.value.length : 0),
    coupons: settleCount(prev.coupons, result.coupons, result.coupons.status === 'fulfilled' ? result.coupons.value : 0),
  };
}

export function countsFromCacheValue(
  uuid: string,
  key: string,
  value: unknown,
): Partial<StampCouponCounts> | null {
  if (key === stampListCacheKey(uuid) && Array.isArray(value)) return { stamps: value.length };
  if (key === couponCountCacheKey(uuid) && typeof value === 'number') return { coupons: value };
  return null;
}

/** 캐시 구독으로 들어온 성공·실패를 개수에 반영한다. 확인되지 않은 회원 번호는 그 칸만 비운다. */
export function applyStampCacheEvent(
  uuid: string,
  prev: StampCouponCounts,
  key: string,
  value: unknown,
  error?: unknown,
): StampCouponCounts {
  if (error) {
    if (!isMemberUnconfirmed(error)) return prev;
    if (key === stampListCacheKey(uuid)) return { ...prev, stamps: null };
    if (key === couponCountCacheKey(uuid)) return { ...prev, coupons: null };
    return prev;
  }
  const next = countsFromCacheValue(uuid, key, value);
  if (!next) return prev;
  return { ...prev, ...next };
}

export function stampLoadFailed(result: {
  stamps: PromiseSettledResult<unknown>;
  coupons: PromiseSettledResult<unknown>;
}): boolean {
  const failed = (item: PromiseSettledResult<unknown>) =>
    item.status === 'rejected' && !isOuterCacheWaitTimeout(item.reason);
  return failed(result.stamps) || failed(result.coupons);
}

/** 1.2초, 2.4초, 4.8초. 네 번째 실패부터는 다시 시도하지 않는다. */
export function planStampFailure(
  state: StampRetryState,
  limit: number = STAMP_LOAD_ATTEMPT_LIMIT,
): StampRetryPlan {
  const attempts = state.attempts + 1;
  if (attempts >= limit) {
    return {
      state: { attempts, failed: true, exhausted: true },
      retry: false,
      delayMs: 0,
    };
  }
  return {
    state: { attempts, failed: true, exhausted: false },
    retry: true,
    delayMs: STAMP_RETRY_BASE_MS * 2 ** Math.min(state.attempts, 2),
  };
}

export function planStampSuccess(): StampRetryPlan {
  return { state: initialStampRetryState(), retry: false, delayMs: 0 };
}

/** 캐시로 늦게 도착한 오류. 안쪽 시간 초과도 다시 시도한다. 바깥 1.5초 대기는 제외한다. */
export function planStampCacheError(state: StampRetryState, error: unknown): StampRetryPlan | null {
  if (!error || isOuterCacheWaitTimeout(error)) return null;
  return planStampFailure(state);
}

export function resetStampRetryForResume(state: StampRetryState): StampRetryState {
  return { attempts: 0, failed: state.failed, exhausted: false };
}

/** 재시도가 끝난 뒤 2분 안에서, 화면이 보일 때만 백그라운드 재시도를 이어 간다. */
export function shouldKeepSlowStampRetry(elapsedMs: number, visible: boolean): boolean {
  return visible && elapsedMs >= 0 && elapsedMs <= STAMP_SLOW_RETRY_WINDOW_MS;
}

/** 회원이 바뀌면 이전 숫자를 지운다. 그 회원의 저장값만 바로 보여 준다. */
export function countsAfterMemberChange(
  memberId: string | undefined,
  known: StampCouponCounts | null,
): StampCouponCounts {
  if (!memberId) return { stamps: null, coupons: null };
  return known ?? { stamps: null, coupons: null };
}

export type ServerStampCountBody = {
  userId: string;
  memberId: string;
  stamps: number;
  coupons: number;
};

export function parseServerStampCounts(body: unknown): ServerStampCountBody | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as { userId?: unknown; memberId?: unknown; stamps?: unknown; coupons?: unknown };
  if (typeof row.userId !== 'string' || !row.userId) return null;
  if (typeof row.memberId !== 'string' || !row.memberId) return null;
  if (!isCount(row.stamps) || !isCount(row.coupons)) return null;
  return { userId: row.userId, memberId: row.memberId, stamps: row.stamps, coupons: row.coupons };
}

/** 세션 사용자나 확인된 회원 문서가 화면의 uuid, fbUid, legacy id 중 하나와 같아야 한다. */
export function serverCountsMatchViewer(
  counts: { userId: string; memberId: string },
  viewer: { uuid?: string | null; fbUid?: string | null; legacyUuid?: string | null } | null,
): boolean {
  if (!viewer) return false;
  const known = [viewer.uuid, viewer.fbUid, viewer.legacyUuid].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  if (known.length === 0) return false;
  return known.includes(counts.userId) || known.includes(counts.memberId);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** 진행 중 시간 초과가 아닌 실패만, 횟수 안에서 다시 시도한다. */
export function shouldRetryStampLoad(input: { attempts: number; failed: boolean; limit?: number }): boolean {
  if (!input.failed) return false;
  const limit = input.limit ?? STAMP_LOAD_ATTEMPT_LIMIT;
  return input.attempts < limit - 1;
}

export type StampCountPresentation = 'pending' | 'value' | 'retry';

/** 숫자도 없고 재시도가 끝났으면 다시 불러오기. 0은 성공한 0만 숫자로 둔다. */
export function stampCountPresentation(count: number | null, exhausted: boolean): StampCountPresentation {
  if (count != null) return 'value';
  if (exhausted) return 'retry';
  return 'pending';
}

type CountStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function readLastKnownStampCounts(
  storage: Pick<CountStorage, 'getItem'>,
  memberId: string,
): StampCouponCounts | null {
  if (!memberId) return null;
  try {
    const raw = storage.getItem(LAST_KNOWN_STAMP_PREFIX + memberId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { stamps?: unknown; coupons?: unknown };
    if (typeof parsed.stamps !== 'number' || typeof parsed.coupons !== 'number') return null;
    if (!Number.isFinite(parsed.stamps) || !Number.isFinite(parsed.coupons)) return null;
    return { stamps: parsed.stamps, coupons: parsed.coupons };
  } catch {
    return null;
  }
}

export function writeLastKnownStampCounts(
  storage: Pick<CountStorage, 'setItem'>,
  memberId: string,
  counts: StampCouponCounts,
): void {
  if (!memberId || counts.stamps == null || counts.coupons == null) return;
  storage.setItem(
    LAST_KNOWN_STAMP_PREFIX + memberId,
    JSON.stringify({ stamps: counts.stamps, coupons: counts.coupons }),
  );
}

export function clearLastKnownStampCounts(storage: Pick<CountStorage, 'removeItem'>, memberId: string): void {
  if (!memberId) return;
  storage.removeItem(LAST_KNOWN_STAMP_PREFIX + memberId);
}

type KeyedStorage = {
  length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
};

/** 로그아웃할 때 모든 회원의 저장 개수를 지운다. */
export function clearAllLastKnownStampCounts(storage: KeyedStorage): void {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(LAST_KNOWN_STAMP_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}
