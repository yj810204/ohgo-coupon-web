'use client';

import { useEffect, useState } from 'react';
import AvatarHeader from '@/components/home/AvatarHeader';
import StampCouponSummary from '@/components/home/StampCouponSummary';
import { CACHE_WAIT_MS, cachedFetch, subscribeCache } from '@/lib/query-cache';
import {
  countsFromCacheValue,
  couponCountCacheKey,
  stampListCacheKey,
  type StampCouponCounts,
} from '@/lib/stamp-count-state';

const UUID = 'stamp-count-demo';

/** 홈 카드와 같은 캐시 구독. 1.5초를 넘긴 뒤에 실제 개수가 들어온다. */
export default function StampCountSamplePage() {
  const [counts, setCounts] = useState<StampCouponCounts>({ stamps: null, coupons: null });

  useEffect(() => {
    const apply = (key: string, value: unknown) => {
      const next = countsFromCacheValue(UUID, key, value);
      if (next) setCounts((prev) => ({ ...prev, ...next }));
    };
    const unsub = subscribeCache(apply);
    const stamps = Array.from({ length: 7 }, (_, index) => `stamp-${index}`);
    void cachedFetch(
      stampListCacheKey(UUID),
      60_000,
      () => new Promise<string[]>((resolve) => setTimeout(() => resolve(stamps), CACHE_WAIT_MS + 400)),
      CACHE_WAIT_MS,
    ).catch(() => undefined);
    void cachedFetch(
      couponCountCacheKey(UUID),
      60_000,
      () => new Promise<number>((resolve) => setTimeout(() => resolve(2), CACHE_WAIT_MS + 400)),
      CACHE_WAIT_MS,
    ).catch(() => undefined);
    return unsub;
  }, []);

  return (
    <div className="min-vh-100" style={{ backgroundColor: '#F7F8FA' }}>
      <div style={{ backgroundColor: '#ffffff', paddingBottom: 32, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
        <div className="px-3 pt-2" style={{ maxWidth: 480, margin: '0 auto' }}>
          <AvatarHeader userName="오고피씽" myPageHref="/my-page" />
        </div>
      </div>
      <div className="px-3" style={{ maxWidth: 480, margin: '0 auto', marginTop: -24 }}>
        <StampCouponSummary
          stampCount={counts.stamps}
          couponCount={counts.coupons}
          stampHref="/samples/stamp"
          couponHref="/samples/coupons"
          onQrScan={() => false}
        />
      </div>
    </div>
  );
}
