import { TimeoutError } from '@/lib/with-timeout';

export function stampListCacheKey(uuid: string): string {
  return `stamps:list:${uuid}`;
}

export function couponCountCacheKey(uuid: string): string {
  return `stamps:couponCount:${uuid}`;
}

export type StampCouponCounts = { stamps: number | null; coupons: number | null };

export const STAMP_LOAD_RETRY_LIMIT = 2;

function isInFlightTimeout(reason: unknown): boolean {
  return reason instanceof TimeoutError;
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

/** 캐시 구독으로 들어온 성공·실패를 개수에 반영한다. 시간 초과 알림은 무시한다. */
export function applyStampCacheEvent(
  uuid: string,
  prev: StampCouponCounts,
  key: string,
  value: unknown,
  error?: unknown,
): StampCouponCounts {
  if (error) return prev;
  const next = countsFromCacheValue(uuid, key, value);
  if (!next) return prev;
  return { ...prev, ...next };
}

export function stampLoadFailed(result: {
  stamps: PromiseSettledResult<unknown>;
  coupons: PromiseSettledResult<unknown>;
}): boolean {
  const failed = (item: PromiseSettledResult<unknown>) =>
    item.status === 'rejected' && !isInFlightTimeout(item.reason);
  return failed(result.stamps) || failed(result.coupons);
}

/** 진행 중 시간 초과가 아닌 실패만, 횟수 안에서 다시 시도한다. */
export function shouldRetryStampLoad(input: { attempts: number; failed: boolean; limit?: number }): boolean {
  return input.failed && input.attempts < (input.limit ?? STAMP_LOAD_RETRY_LIMIT);
}
