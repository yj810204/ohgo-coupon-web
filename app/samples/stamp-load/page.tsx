'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import AvatarHeader from '@/components/home/AvatarHeader';
import StampCouponSummary from '@/components/home/StampCouponSummary';
import { useStampCouponCounts, type StampCountLoader } from '@/hooks/useStampCouponCounts';
import { MEMBER_ID_LOOKUP_WAIT_MS } from '@/lib/member-id-resolution';
import { readLastKnownStampCounts, stampCountPresentation } from '@/lib/stamp-count-state';
import { withTimeout } from '@/lib/with-timeout';

const MEMBER = 'a69705b7-b51a-5073-bea7-12a2e107eebe';

function prepareStoredCounts(mode: string, uuid: string) {
  if (typeof window === 'undefined') return;
  const key = `ohgo-stamp-counts:${uuid}`;
  if (mode === 'cached') {
    localStorage.setItem(key, JSON.stringify({ stamps: 1, coupons: 0 }));
    return;
  }
  localStorage.removeItem(key);
}

function makeLoader(mode: string): StampCountLoader {
  const started = Date.now();
  const blockMs = 20_000;
  const load = async (kind: 'stamps' | 'coupons') => {
    if (mode === 'empty') throw new Error('회원 정보를 확인하지 못했습니다.');
    if (mode === 'blocked') {
      const remain = started + blockMs - Date.now();
      if (remain > 0) {
        await withTimeout(new Promise((resolve) => setTimeout(resolve, remain)), MEMBER_ID_LOOKUP_WAIT_MS);
      }
    } else if (mode === 'cold') {
      await new Promise((resolve) => setTimeout(resolve, 400));
    } else if (mode === 'cached') {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    return kind === 'stamps' ? ['stamp-1'] : 0;
  };
  return {
    getStamps: async () => (await load('stamps')) as string[],
    getCouponCount: async () => (await load('coupons')) as number,
  };
}

function StampLoadDemo({ mode }: { mode: string }) {
  const uuid = `${MEMBER}-${mode}`;
  prepareStoredCounts(mode, uuid);
  const loader = useMemo(() => (mode === 'route' ? undefined : makeLoader(mode)), [mode]);
  const { counts, exhausted, reload } = useStampCouponCounts(uuid, loader);
  const known = typeof window === 'undefined' ? null : readLastKnownStampCounts(window.localStorage, uuid);

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
          stampRetry={stampCountPresentation(counts.stamps, exhausted) === 'retry'}
          couponRetry={stampCountPresentation(counts.coupons, exhausted) === 'retry'}
          onRetry={reload}
          stampHref="/samples/stamp"
          couponHref="/samples/coupons"
          onQrScan={() => false}
        />
      </div>
      <p data-known={known ? 'yes' : 'no'} style={{ position: 'absolute', left: -9999 }}>
        {mode}
      </p>
    </div>
  );
}

function StampLoadFromQuery() {
  const mode = useSearchParams().get('case') || 'cold';
  return <StampLoadDemo key={mode} mode={mode} />;
}

/** 스탬프 개수 로딩 측정용. case=cold|cached|blocked|empty */
export default function StampLoadSamplePage() {
  return (
    <Suspense fallback={null}>
      <StampLoadFromQuery />
    </Suspense>
  );
}
