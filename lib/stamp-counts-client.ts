import { parseServerStampCounts } from '@/lib/stamp-count-state';

export type ServerStampCounts = { memberId: string; stamps: number; coupons: number };

const FRESH_MS = 5_000;

let pending: Promise<ServerStampCounts | null> | null = null;
let fresh: { at: number; value: ServerStampCounts | null } | null = null;

async function requestServerStampCounts(): Promise<ServerStampCounts | null> {
  const response = await fetch('/api/me/stamp-counts', { credentials: 'include', cache: 'no-store' });
  if (!response.ok) return null;
  return parseServerStampCounts(await response.json());
}

/** 홈 스크립트가 평가되자마자 개수 요청을 시작한다. */
export function prefetchServerStampCounts(): void {
  if (typeof window === 'undefined') return;
  void loadServerStampCounts(false);
}

export function loadServerStampCounts(force = false): Promise<ServerStampCounts | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!force && fresh && Date.now() - fresh.at < FRESH_MS) return Promise.resolve(fresh.value);
  if (!force && pending) return pending;
  const request = requestServerStampCounts()
    .then((value) => {
      fresh = { at: Date.now(), value };
      return value;
    })
    .catch(() => null)
    .finally(() => {
      if (pending === request) pending = null;
    });
  pending = request;
  return request;
}
