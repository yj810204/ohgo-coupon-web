export function stampListCacheKey(uuid: string): string {
  return `stamps:list:${uuid}`;
}

export function couponCountCacheKey(uuid: string): string {
  return `stamps:couponCount:${uuid}`;
}

export type StampCouponCounts = { stamps: number | null; coupons: number | null };

/** 성공한 값만 반영한다. 시간 초과나 실패는 로딩(null) 또는 마지막 값을 유지한다. */
export function applyStampCouponLoad(
  prev: StampCouponCounts,
  result: {
    stamps: PromiseSettledResult<string[]>;
    coupons: PromiseSettledResult<number>;
  },
): StampCouponCounts {
  return {
    stamps: result.stamps.status === 'fulfilled' ? result.stamps.value.length : prev.stamps,
    coupons: result.coupons.status === 'fulfilled' ? result.coupons.value : prev.coupons,
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
