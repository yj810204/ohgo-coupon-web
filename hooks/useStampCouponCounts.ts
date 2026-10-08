'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isDevAuthBypass } from '@/lib/dev-auth';
import { cachedFetch, peekCache, subscribeCache } from '@/lib/query-cache';
import { seedCachedMemberId } from '@/lib/member-id-resolution';
import { loadServerStampCounts } from '@/lib/stamp-counts-client';
import {
  applyStampCacheEvent,
  applyStampCouponLoad,
  clearLastKnownStampCounts,
  countsAfterMemberChange,
  couponCountCacheKey,
  initialStampRetryState,
  isMemberUnconfirmed,
  planStampCacheError,
  planStampFailure,
  planStampSuccess,
  readLastKnownStampCounts,
  resetStampRetryForResume,
  serverCountsMatchViewer,
  shouldKeepSlowStampRetry,
  STAMP_SLOW_RETRY_MS,
  stampListCacheKey,
  stampLoadFailed,
  writeLastKnownStampCounts,
  type StampCouponCounts,
  type StampRetryState,
} from '@/lib/stamp-count-state';

const STAMPS_TTL_MS = 45_000;

export type StampCountLoader = {
  getStamps: (uuid: string) => Promise<string[]>;
  getCouponCount: (uuid: string) => Promise<number>;
};

function readStoredUser(uuid: string): { fbUid?: string; legacyUuid?: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('userInfo');
    if (!raw) return null;
    const local = JSON.parse(raw) as { uuid?: string; fbUid?: string; legacyUuid?: string };
    if (local.uuid !== uuid) return null;
    return local;
  } catch {
    return null;
  }
}

function seedStoredMemberId(uuid: string) {
  const local = readStoredUser(uuid);
  if (local?.fbUid) seedCachedMemberId(uuid, local.fbUid);
}

function rememberCounts(uuid: string, counts: StampCouponCounts) {
  if (typeof window === 'undefined') return;
  writeLastKnownStampCounts(window.localStorage, uuid, counts);
}

export function useStampCouponCounts(uuid?: string, loader?: StampCountLoader) {
  const [counts, setCounts] = useState<StampCouponCounts>({ stamps: null, coupons: null });
  const [exhausted, setExhausted] = useState(false);
  const countsRef = useRef(counts);
  const tracker = useRef<StampRetryState>(initialStampRetryState());
  const timer = useRef<number | null>(null);
  const seq = useRef(0);
  const handled = useRef(0);
  const settle = useRef(false);
  const got = useRef({ stamps: false, coupons: false });
  const exhaustedAt = useRef<number | null>(null);
  const forceServer = useRef(false);
  const loaderRef = useRef(loader);
  const uuidRef = useRef(uuid);
  loaderRef.current = loader;
  uuidRef.current = uuid;

  const commit = (next: StampCouponCounts) => {
    countsRef.current = next;
    setCounts(next);
  };

  const clearTimer = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const runRef = useRef<(memberId: string) => Promise<void>>(async () => undefined);

  useLayoutEffect(() => {
    tracker.current = initialStampRetryState();
    exhaustedAt.current = null;
    handled.current = 0;
    if (!uuid || typeof window === 'undefined') {
      commit({ stamps: null, coupons: null });
      setExhausted(false);
      return;
    }
    const known = readLastKnownStampCounts(window.localStorage, uuid);
    commit(countsAfterMemberChange(uuid, known));
    setExhausted(false);
  }, [uuid]);

  useEffect(() => {
    if (!uuid || isDevAuthBypass()) return;
    const memberId = uuid;

    const armSlowRetry = () => {
      clearTimer();
      const started = exhaustedAt.current;
      if (started == null) return;
      timer.current = window.setTimeout(() => {
        timer.current = null;
        if (uuidRef.current !== memberId || !tracker.current.exhausted) return;
        const visible = document.visibilityState === 'visible';
        if (!shouldKeepSlowStampRetry(Date.now() - started, true)) return;
        if (!visible) {
          armSlowRetry();
          return;
        }
        void runRef.current(memberId);
      }, STAMP_SLOW_RETRY_MS);
    };

    const schedule = (plan: ReturnType<typeof planStampFailure>) => {
      tracker.current = plan.state;
      setExhausted(plan.state.exhausted);
      clearTimer();
      if (plan.retry) {
        timer.current = window.setTimeout(() => {
          timer.current = null;
          if (uuidRef.current !== memberId) return;
          void runRef.current(memberId);
        }, plan.delayMs);
        return;
      }
      if (plan.state.exhausted) {
        if (exhaustedAt.current == null) exhaustedAt.current = Date.now();
        armSlowRetry();
      }
    };

    const failOnce = (loadSeq: number, plan: ReturnType<typeof planStampFailure>) => {
      if (handled.current === loadSeq) return;
      handled.current = loadSeq;
      schedule(plan);
    };

    runRef.current = async (id: string) => {
      clearTimer();
      const loadSeq = ++seq.current;
      settle.current = true;
      got.current = { stamps: false, coupons: false };
      seedStoredMemberId(id);
      const custom = loaderRef.current;
      if (!custom) {
        const server = await loadServerStampCounts(id, forceServer.current);
        forceServer.current = false;
        if (loadSeq !== seq.current || uuidRef.current !== id) return;
        const stored = readStoredUser(id);
        if (
          server &&
          serverCountsMatchViewer(server, {
            uuid: id,
            fbUid: stored?.fbUid,
            legacyUuid: stored?.legacyUuid,
          })
        ) {
          const next = { stamps: server.stamps, coupons: server.coupons };
          commit(next);
          rememberCounts(id, next);
          tracker.current = planStampSuccess().state;
          exhaustedAt.current = null;
          setExhausted(false);
          return;
        }
      }
      const [stamps, coupons] = custom
        ? await Promise.allSettled([
            cachedFetch(stampListCacheKey(id), STAMPS_TTL_MS, () => custom.getStamps(id)),
            cachedFetch(couponCountCacheKey(id), STAMPS_TTL_MS, () => custom.getCouponCount(id)),
          ])
        : await (async () => {
            const api = await import('@/utils/stamp-service');
            return Promise.allSettled([api.getStamps(id), api.getCouponCount(id)]);
          })();
      if (loadSeq !== seq.current || uuidRef.current !== id) return;
      const result = {
        stamps: stamps as PromiseSettledResult<string[]>,
        coupons: coupons as PromiseSettledResult<number>,
      };
      const bothOk = result.stamps.status === 'fulfilled' && result.coupons.status === 'fulfilled';
      const next = applyStampCouponLoad(countsRef.current, result);
      commit(next);
      if (bothOk) {
        rememberCounts(id, next);
        tracker.current = planStampSuccess().state;
        exhaustedAt.current = null;
        setExhausted(false);
        return;
      }
      if (stampLoadFailed(result)) failOnce(loadSeq, planStampFailure(tracker.current));
    };

    const applyCached = (key: string, value: unknown, error?: unknown) => {
      if (isMemberUnconfirmed(error)) clearLastKnownStampCounts(window.localStorage, memberId);
      const next = applyStampCacheEvent(memberId, countsRef.current, key, value, error);
      commit(next);
      if (error) {
        if (!settle.current) return;
        const plan = planStampCacheError(tracker.current, error);
        if (plan) failOnce(seq.current, plan);
        return;
      }
      if (key === stampListCacheKey(memberId)) got.current.stamps = true;
      if (key === couponCountCacheKey(memberId)) got.current.coupons = true;
      if (settle.current && got.current.stamps && got.current.coupons) {
        rememberCounts(memberId, next);
        tracker.current = planStampSuccess().state;
        exhaustedAt.current = null;
        setExhausted(false);
        clearTimer();
      }
    };

    const unsubscribe = subscribeCache(applyCached);
    const cachedList = peekCache<string[]>(stampListCacheKey(memberId));
    if (cachedList) applyCached(stampListCacheKey(memberId), cachedList);
    const cachedCoupons = peekCache<number>(couponCountCacheKey(memberId));
    if (typeof cachedCoupons === 'number') applyCached(couponCountCacheKey(memberId), cachedCoupons);
    void runRef.current(memberId);

    const resume = () => {
      const prev = tracker.current;
      if (!prev.failed && !prev.exhausted) return;
      tracker.current = resetStampRetryForResume(prev);
      exhaustedAt.current = null;
      setExhausted(false);
      clearTimer();
      void runRef.current(memberId);
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      resume();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', resume);
    window.addEventListener('online', resume);
    return () => {
      unsubscribe();
      clearTimer();
      seq.current += 1;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('online', resume);
    };
  }, [uuid]);

  const reload = useCallback(() => {
    const memberId = uuidRef.current;
    if (!memberId || isDevAuthBypass()) return;
    tracker.current = initialStampRetryState();
    exhaustedAt.current = null;
    handled.current = 0;
    forceServer.current = true;
    setExhausted(false);
    clearTimer();
    void runRef.current(memberId);
  }, []);

  return { counts, exhausted, reload };
}
