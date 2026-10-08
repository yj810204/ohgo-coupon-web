'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AvatarHeader from '@/components/home/AvatarHeader';
import StampCouponSummary from '@/components/home/StampCouponSummary';
import { CACHE_WAIT_MS, cachedFetch, subscribeCache } from '@/lib/query-cache';
import {
  applyStampCacheEvent,
  couponCountCacheKey,
  stampListCacheKey,
  type StampCouponCounts,
} from '@/lib/stamp-count-state';

function StampCountDemo({ mode }: { mode: string }) {
  const uuid = `stamp-count-${mode}`;
  const [counts, setCounts] = useState<StampCouponCounts>({ stamps: null, coupons: null });

  useEffect(() => {
    const apply = (key: string, value: unknown, error?: unknown) => {
      setCounts((prev) => applyStampCacheEvent(uuid, prev, key, value, error));
    };
    const unsub = subscribeCache(apply);
    const listKey = stampListCacheKey(uuid);
    const countKey = couponCountCacheKey(uuid);
    if (mode === 'unresolved') {
      const fail = async () => {
        throw new Error('회원 정보를 확인하지 못했습니다.');
      };
      void cachedFetch(listKey, 60_000, fail, 400).catch(() => undefined);
      void cachedFetch(countKey, 60_000, fail, 400).catch(() => undefined);
    } else if (mode === 'legacy') {
      void cachedFetch(listKey, 60_000, async () => ['stamp-1'], 400).catch(() => undefined);
      void cachedFetch(countKey, 60_000, async () => 0, 400).catch(() => undefined);
    } else {
      const stamps = Array.from({ length: 7 }, (_, index) => `stamp-${index}`);
      void cachedFetch(
        listKey,
        60_000,
        () => new Promise<string[]>((resolve) => setTimeout(() => resolve(stamps), CACHE_WAIT_MS + 400)),
        CACHE_WAIT_MS,
      ).catch(() => undefined);
      void cachedFetch(
        countKey,
        60_000,
        () => new Promise<number>((resolve) => setTimeout(() => resolve(2), CACHE_WAIT_MS + 400)),
        CACHE_WAIT_MS,
      ).catch(() => undefined);
    }
    return unsub;
  }, [mode, uuid]);

  return (
    <div className="min-vh-100" style={{ backgroundColor: '#F7F8FA' }}>
      <div style={{ backgroundColor: '#ffffff', paddingBottom: 32, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
        <div className="px-3 pt-2" style={{ maxWidth: 480, margin: '0 auto' }}>
          <AvatarHeader userName="정영남" myPageHref="/my-page" />
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

function StampCountFromQuery() {
  const mode = useSearchParams().get('case') || 'slow';
  return <StampCountDemo key={mode} mode={mode} />;
}

/** ?case=unresolved 는 실패 후 0, ?case=legacy 는 저장된 회원 id의 1개/0장 */
export default function StampCountSamplePage() {
  return (
    <Suspense fallback={null}>
      <StampCountFromQuery />
    </Suspense>
  );
}
