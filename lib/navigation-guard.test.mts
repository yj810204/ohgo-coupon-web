import assert from 'node:assert/strict';
import {
  HISTORY_BACK,
  IDLE_NAV,
  NAV_FALLBACK_MS,
  RSC_GRACE_MS,
  actionOnOnline,
  armHistoryBack,
  armNavigation,
  classifyFetchFailure,
  clearHardNavIfLanded,
  hardNavigate,
  isChunkLoadMessage,
  noteRsc,
  settleNavigation,
  stuckTarget,
} from './navigation-guard.ts';
import { CACHE_WAIT_MS, cachedFetch, invalidateCache } from './query-cache.ts';
import { RESUME_TIMEOUT_MS } from './resume-session.ts';
import { SESSION_NETWORK_MS, middlewareAuthPlan, protectedJwtAllows, sessionGate } from './session-gate.ts';
import { TimeoutError, withTimeout, withTimeoutFallback } from './with-timeout.ts';
import {
  isDefinitiveSignOut,
  resumeAuthSession,
  shouldRefreshAccessToken,
  visibilityIntent,
  type ResumeAuth,
} from './resume-session.ts';

const now = 1_000_000;

assert.equal(NAV_FALLBACK_MS, 3000);
assert.equal(RESUME_TIMEOUT_MS, 1000);
assert.equal(SESSION_NETWORK_MS, 1500);
assert.equal(CACHE_WAIT_MS, 1500);

// 같은 경로는 로더를 켜지 않는다
assert.equal(armNavigation('/main', '/main', now), null);
assert.equal(armNavigation('/main', '/main?tab=1', now), null);

const armed = armNavigation('/main', '/community', now);
assert.ok(armed);
assert.equal(armed.targetPath, '/community');
assert.equal(stuckTarget(armed, '/main', 0, now + NAV_FALLBACK_MS - 1), null);

// 주소만 바뀌고 RSC 가 아직이면 끝난 것이 아니다
const pendingRsc = noteRsc(armed);
assert.equal(settleNavigation(pendingRsc, '/community', 1, now + 500).targetPath, '/community');
assert.equal(stuckTarget(pendingRsc, '/community', 1, now + NAV_FALLBACK_MS), '/community');

// RSC 가 끝나면 감시를 푼다
assert.equal(settleNavigation(pendingRsc, '/community', 0, now + 500).targetPath, null);

// 캐시 이동은 짧은 여유 뒤에 끝난 것으로 본다
assert.equal(settleNavigation(armed, '/community', 0, now + RSC_GRACE_MS - 1).targetPath, '/community');
assert.equal(settleNavigation(armed, '/community', 0, now + RSC_GRACE_MS).targetPath, null);

// 3초가 지나도 주소가 그대로면 그 주소로 다시 연다
assert.equal(stuckTarget(armed, '/main', 0, now + NAV_FALLBACK_MS), '/community');

const back = armHistoryBack('/community', now);
assert.equal(settleNavigation(back, '/main', 0, now + RSC_GRACE_MS).targetPath, null);
assert.equal(stuckTarget(back, '/community', 0, now + NAV_FALLBACK_MS), HISTORY_BACK);

// 배포로 청크가 없어진 경우만 새로고침. 오프라인 실패는 무시
assert.equal(isChunkLoadMessage('ChunkLoadError: Loading chunk 12 failed'), true);
assert.equal(isChunkLoadMessage('Failed to fetch dynamically imported module'), true);
assert.equal(isChunkLoadMessage('프로필 조회 실패'), false);
assert.equal(
  classifyFetchFailure({ url: 'https://ohgo.codejaka.com/_next/static/chunks/abc.js', status: 404, online: true }),
  'reload',
);
assert.equal(
  classifyFetchFailure({ url: 'https://ohgo.codejaka.com/_next/static/chunks/abc.js', status: 404, online: false }),
  'ignore',
);
assert.equal(
  classifyFetchFailure({ url: 'https://ohgo.codejaka.com/community?_rsc=1', status: 500, online: true }),
  'reload',
);
assert.equal(
  classifyFetchFailure({ url: 'https://ohgo.codejaka.com/community?_rsc=1', status: null, online: true }),
  'ignore',
);

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
};
const assigned: string[] = [];
assert.equal(hardNavigate('/community', storage, (url) => assigned.push(url), now), true);
assert.equal(hardNavigate('/community', storage, (url) => assigned.push(url), now + 1000), false);
assert.deepEqual(assigned, ['/community']);
clearHardNavIfLanded(storage, '/community');
assert.equal(hardNavigate('/community', storage, (url) => assigned.push(url), now + 2000), true);

// 오프라인이었다가 온라인이 되면 끝나지 않은 이동만 다시 연다
assert.equal(actionOnOnline(armed, '/main'), '/community');
assert.equal(actionOnOnline(IDLE_NAV, '/main'), null);
assert.equal(actionOnOnline(settleNavigation(pendingRsc, '/community', 0, now + 500), '/community'), null);

// 만료 토큰은 확인하되 다른 주소로 보내지 않는다
assert.equal(sessionGate({ pathname: '/main', expiry: now / 1000 - 10, nowSec: now / 1000 }), 'verify');
assert.equal(sessionGate({ pathname: '/main', expiry: now / 1000 + 600, nowSec: now / 1000 }), 'skip');
assert.equal(sessionGate({ pathname: '/admin', expiry: now / 1000 + 600, nowSec: now / 1000 }), 'verify');

const nowSec = now / 1000;
assert.equal(middlewareAuthPlan({ pathname: '/main', expiry: nowSec + 600, nowSec }), 'skip');
assert.equal(middlewareAuthPlan({ pathname: '/admin', expiry: nowSec + 30, nowSec }), 'allow-jwt');
assert.equal(middlewareAuthPlan({ pathname: '/boarding-ledger', expiry: nowSec - 5, nowSec }), 'network');
assert.equal(protectedJwtAllows(nowSec + 30, nowSec), true);
assert.equal(protectedJwtAllows(nowSec - 5, nowSec), false);
assert.equal(protectedJwtAllows(null, nowSec), false);

const hung = withTimeout(new Promise(() => undefined), 20);
await assert.rejects(hung, (error: unknown) => error instanceof TimeoutError);
assert.equal(await withTimeoutFallback(new Promise(() => undefined), 20, 'fallback'), 'fallback');

// 만료 토큰으로 재개하면 갱신한다
assert.equal(visibilityIntent('hidden'), 'pause');
assert.equal(visibilityIntent('visible'), 'resume');
assert.equal(shouldRefreshAccessToken(100, 90), true);
assert.equal(shouldRefreshAccessToken(200, 90), false);
assert.equal(isDefinitiveSignOut('Invalid Refresh Token'), true);
assert.equal(isDefinitiveSignOut('Failed to fetch'), false);

function mockAuth(options: {
  online: () => boolean;
  expiresAt: number | null;
  refreshError?: string | null;
}): ResumeAuth & { refreshCalls: number; started: number; stopped: number } {
  const auth = {
    refreshCalls: 0,
    started: 0,
    stopped: 0,
    startAutoRefresh() {
      auth.started += 1;
    },
    stopAutoRefresh() {
      auth.stopped += 1;
    },
    async getSession() {
      if (!options.online()) throw new Error('Failed to fetch');
      return { data: { session: options.expiresAt == null ? null : { expires_at: options.expiresAt } }, error: null };
    },
    async refreshSession() {
      auth.refreshCalls += 1;
      if (!options.online()) throw new Error('Failed to fetch');
      if (options.refreshError) return { error: { message: options.refreshError } };
      return { error: null };
    },
  };
  return auth;
}

let online = false;
const flaky = mockAuth({ online: () => online, expiresAt: 50 });
assert.equal(await resumeAuthSession(flaky, 100, 200), 'offline');
assert.equal(flaky.refreshCalls, 0);
online = true;
assert.equal(await resumeAuthSession(flaky, 100, 200), 'refreshed');
assert.equal(flaky.refreshCalls, 1);

const fresh = mockAuth({ online: () => true, expiresAt: 10_000 });
assert.equal(await resumeAuthSession(fresh, 100, 200), 'fresh');
assert.equal(fresh.refreshCalls, 0);

const dead = mockAuth({ online: () => true, expiresAt: 10, refreshError: 'Invalid Refresh Token' });
assert.equal(await resumeAuthSession(dead, 100, 200), 'signed-out');

const stall = mockAuth({ online: () => true, expiresAt: 10 });
stall.refreshSession = () => new Promise(() => undefined);
assert.equal(await resumeAuthSession(stall, 100, 30), 'timeout');

// 캐시 갱신이 멈추면 만료된 값을 바로 주고, 빈 캐시는 기다림을 끊는다
invalidateCache();
let release: (value: string) => void = () => undefined;
const hanging = new Promise<string>((resolve) => {
  release = resolve;
});
cachedFetch('slow', 1000, () => hanging, 30).then(
  () => assert.fail('hanging fetch should time out'),
  (error: unknown) => {
    assert.ok(error instanceof TimeoutError);
  },
);
await new Promise((resolve) => setTimeout(resolve, 50));
release('late');
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(await cachedFetch('slow', 1000, async () => 'next', 30), 'late');

invalidateCache();
const staleHang = cachedFetch('stale', 1, async () => 'first', CACHE_WAIT_MS);
assert.equal(await staleHang, 'first');
await new Promise((resolve) => setTimeout(resolve, 5));
const again = cachedFetch(
  'stale',
  1,
  () => new Promise(() => undefined),
  500,
);
assert.equal(await again, 'first');

console.log('navigation resume tests passed');
