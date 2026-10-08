import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeLegacyUuid } from './legacy-uuid.ts';
import {
  fastMemberIdCandidates,
  memberIdCandidates,
  MEMBER_ID_LOOKUP_WAIT_MS,
  peekCachedMemberId,
  readCachedMemberId,
  resolveMemberId,
  seedCachedMemberId,
  selectExistingMemberId,
  type ProfileLookup,
} from './member-id-resolution.ts';
import { CACHE_WAIT_MS, cachedFetch, invalidateCache, subscribeCache } from './query-cache.ts';
import {
  applyStampCacheEvent,
  applyStampCouponLoad,
  clearAllLastKnownStampCounts,
  countsAfterMemberChange,
  couponCountCacheKey,
  initialStampRetryState,
  isMemberUnconfirmed,
  memberUnconfirmedError,
  parseServerStampCounts,
  planStampCacheError,
  planStampFailure,
  planStampSuccess,
  readLastKnownStampCounts,
  resetStampRetryForResume,
  serverCountsMatchViewer,
  shouldKeepSlowStampRetry,
  shouldRetryStampLoad,
  STAMP_SLOW_RETRY_WINDOW_MS,
  stampCountPresentation,
  stampListCacheKey,
  stampLoadFailed,
  writeLastKnownStampCounts,
  type StampRetryState,
} from './stamp-count-state.ts';
import { storedUserFromProfile } from './stored-user.ts';
import { TimeoutError } from './with-timeout.ts';

const authId = '0f03d93d-0000-4000-8000-000000000001';
const legacyId = 'a69705b7-0000-4000-8000-000000000002';
const normalId = '11111111-1111-4111-8111-111111111111';

test('a failed first load stays empty instead of showing 0', () => {
  const ended = applyStampCouponLoad(
    { stamps: null, coupons: null },
    {
      stamps: { status: 'rejected', reason: new Error('세션이 없어 스탬프를 불러오지 못했습니다.') },
      coupons: { status: 'rejected', reason: new Error('세션이 없어 스탬프를 불러오지 못했습니다.') },
    },
  );
  assert.deepEqual(ended, { stamps: null, coupons: null });
  assert.equal(shouldRetryStampLoad({ attempts: 0, failed: true }), true);
  assert.equal(shouldRetryStampLoad({ attempts: 2, failed: true }), true);
  assert.equal(shouldRetryStampLoad({ attempts: 3, failed: true }), false);
});

test('rejected fetch notifies subscribers without turning an empty load into 0', async () => {
  invalidateCache();
  const uuid = 'rejected-user';
  let counts = { stamps: null as number | null, coupons: null as number | null };
  const unsub = subscribeCache((key, value, error) => {
    counts = applyStampCacheEvent(uuid, counts, key, value, error);
  });
  await assert.rejects(
    cachedFetch(stampListCacheKey(uuid), 1_000, async () => {
      throw new Error('member-unresolved');
    }, 500),
  );
  await assert.rejects(
    cachedFetch(couponCountCacheKey(uuid), 1_000, async () => {
      throw new Error('member-unresolved');
    }, 500),
  );
  assert.equal(counts.stamps, null);
  assert.equal(counts.coupons, null);
  unsub();
  invalidateCache();
});

test('timeout keeps the placeholder, then a late success shows the real count', async () => {
  invalidateCache();
  const uuid = 'slow-user';
  const key = stampListCacheKey(uuid);
  let counts = { stamps: null as number | null, coupons: null as number | null };
  const unsub = subscribeCache((cacheKey, value, error) => {
    counts = applyStampCacheEvent(uuid, counts, cacheKey, value, error);
  });
  const pending = cachedFetch(
    key,
    45_000,
    () =>
      new Promise<string[]>((resolve) => {
        setTimeout(() => resolve(['s1', 's2', 's3', 's4', 's5']), CACHE_WAIT_MS + 200);
      }),
    CACHE_WAIT_MS,
  );
  await assert.rejects(pending, (error: unknown) => error instanceof TimeoutError);
  counts = applyStampCouponLoad(counts, {
    stamps: { status: 'rejected', reason: new TimeoutError(CACHE_WAIT_MS) },
    coupons: { status: 'rejected', reason: new TimeoutError(CACHE_WAIT_MS) },
  });
  assert.equal(counts.stamps, null);
  assert.equal(counts.coupons, null);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(counts.stamps, 5);
  unsub();
  invalidateCache();
});

test('persisted fbUid is tried before the auth uid', async () => {
  const seen: string[] = [];
  const result = await resolveMemberId({
    userId: authId,
    hint: { name: '정영남', dob: '', fbUid: legacyId },
    lookupProfile: async () => ({ status: 'unknown' }),
    refreshSession: async () => undefined,
    findDoc: async (candidate) => {
      seen.push(candidate);
      return { id: candidate, missing: candidate !== legacyId };
    },
  });
  assert.equal(result.id, legacyId);
  assert.equal(seen[0], legacyId);
  assert.equal(memberIdCandidates(authId, { status: 'unknown' }, { fbUid: legacyId })[0], legacyId);
});

test('profile lookup re-saves an empty birth date and legacy id', () => {
  const saved = storedUserFromProfile(
    { id: authId, name: '정영남', dob: '19810204', role: 'admin', legacy_uuid: legacyId },
    { uuid: authId, name: '정영남', dob: '', isAdmin: true },
  );
  assert.equal(saved.dob, '19810204');
  assert.equal(saved.fbUid, legacyId);
  assert.equal(saved.uuid, authId);
  assert.equal(saved.isAdmin, true);
});

test('normal member whose auth uid is the Firestore id is unchanged', async () => {
  const seen: string[] = [];
  const profile: ProfileLookup = {
    status: 'found',
    legacyUuid: null,
    name: '김회원',
    dob: '19900101',
  };
  const result = await resolveMemberId({
    userId: normalId,
    hint: { name: '김회원', dob: '19900101' },
    lookupProfile: async () => profile,
    findDoc: async (candidate) => {
      seen.push(candidate);
      return { id: candidate, missing: candidate !== normalId };
    },
  });
  assert.equal(result.id, normalId);
  assert.deepEqual(seen, [normalId]);
});

test('empty profile is not cached as no member, and a server id can resolve it', async () => {
  invalidateCache();
  let lookups = 0;
  const id = await readCachedMemberId('empty-profile', () =>
    resolveMemberId({
      userId: 'empty-profile',
      lookupProfile: async () => {
        lookups += 1;
        return { status: 'unknown' };
      },
      refreshSession: async () => undefined,
      findDoc: async (candidate) => ({ id: candidate, missing: true }),
    }).then((result) => result.id),
  );
  assert.equal(id, null);
  assert.equal(peekCachedMemberId('empty-profile'), undefined);
  assert.equal(lookups, 2);

  const fromServer = await resolveMemberId({
    userId: authId,
    lookupProfile: async () => ({ status: 'unknown' }),
    refreshSession: async () => undefined,
    lookupServerMemberId: async () => legacyId,
    findDoc: async (candidate) => ({ id: candidate, missing: candidate !== legacyId }),
  });
  assert.equal(fromServer.id, legacyId);
  invalidateCache();
});

test('legacy_uuid still wins when nothing is persisted', async () => {
  const name = '정영남';
  const dob = '19810204';
  assert.equal(computeLegacyUuid(name, dob).length > 0, true);
  const result = await resolveMemberId({
    userId: authId,
    lookupProfile: async () => ({
      status: 'found',
      legacyUuid: legacyId,
      name,
      dob,
    }),
    findDoc: async (candidate) => ({ id: candidate, missing: candidate !== legacyId }),
  });
  assert.equal(result.id, legacyId);
});

test('a known count is kept when a later load fails', () => {
  const kept = applyStampCouponLoad(
    { stamps: 1, coupons: 0 },
    {
      stamps: { status: 'rejected', reason: new Error('offline') },
      coupons: { status: 'rejected', reason: new Error('offline') },
    },
  );
  assert.deepEqual(kept, { stamps: 1, coupons: 0 });
});

test('late error after the outer timeout schedules a retry and then shows the value', async () => {
  invalidateCache();
  const uuid = 'late-error-user';
  const key = stampListCacheKey(uuid);
  let counts = { stamps: null as number | null, coupons: null as number | null };
  let tracker = initialStampRetryState();
  let delayMs = 0;
  const unsub = subscribeCache((cacheKey, value, error) => {
    counts = applyStampCacheEvent(uuid, counts, cacheKey, value, error);
    const plan = planStampCacheError(tracker, error);
    if (plan?.retry) {
      tracker = plan.state;
      delayMs = plan.delayMs;
    }
    if (!error && counts.stamps != null) tracker = planStampSuccess().state;
  });
  let fail = true;
  const pending = cachedFetch(
    key,
    45_000,
    () =>
      new Promise<string[]>((resolve, reject) => {
        setTimeout(() => {
          if (fail) reject(new Error('firestore-blocked'));
          else resolve(['stamp-1']);
        }, CACHE_WAIT_MS + 80);
      }),
    CACHE_WAIT_MS,
  );
  await assert.rejects(pending, (error: unknown) => error instanceof TimeoutError);
  assert.equal(
    stampLoadFailed({
      stamps: { status: 'rejected', reason: new TimeoutError(CACHE_WAIT_MS) },
      coupons: { status: 'fulfilled', value: 0 },
    }),
    false,
  );
  assert.equal(counts.stamps, null);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(tracker.attempts, 1);
  assert.equal(delayMs, 1_200);
  assert.equal(counts.stamps, null);
  fail = false;
  const loaded = await cachedFetch(key, 45_000, async () => ['stamp-1'], CACHE_WAIT_MS);
  assert.deepEqual(loaded, ['stamp-1']);
  assert.equal(counts.stamps, 1);
  assert.equal(tracker.attempts, 0);
  unsub();
  invalidateCache();
});

test('an inner member lookup timeout is a failure that retries', () => {
  const reason = new TimeoutError(MEMBER_ID_LOOKUP_WAIT_MS);
  assert.equal(MEMBER_ID_LOOKUP_WAIT_MS <= 10_000 && MEMBER_ID_LOOKUP_WAIT_MS >= 8_000, true);
  assert.equal(
    stampLoadFailed({
      stamps: { status: 'rejected', reason },
      coupons: { status: 'rejected', reason },
    }),
    true,
  );
  const plan = planStampCacheError(initialStampRetryState(), reason);
  assert.equal(plan?.retry, true);
  assert.equal(plan?.delayMs, 1_200);
  assert.equal(planStampCacheError(initialStampRetryState(), new TimeoutError(CACHE_WAIT_MS)), null);
});

test('retries exhausted show a retry state instead of 0 or a placeholder', () => {
  let tracker = initialStampRetryState();
  const delays: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const plan = planStampFailure(tracker);
    tracker = plan.state;
    if (plan.retry) delays.push(plan.delayMs);
  }
  assert.deepEqual(delays, [1_200, 2_400, 4_800]);
  assert.equal(tracker.exhausted, true);
  assert.equal(planStampFailure(tracker).retry, false);
  const counts = applyStampCouponLoad(
    { stamps: null, coupons: null },
    {
      stamps: { status: 'rejected', reason: new Error('회원 정보를 확인하지 못했습니다.') },
      coupons: { status: 'rejected', reason: new Error('회원 정보를 확인하지 못했습니다.') },
    },
  );
  assert.equal(stampCountPresentation(counts.stamps, tracker.exhausted), 'retry');
  assert.equal(stampCountPresentation(counts.coupons, tracker.exhausted), 'retry');
  assert.notEqual(counts.stamps, 0);
  assert.equal(stampCountPresentation(null, false), 'pending');
  assert.equal(stampCountPresentation(0, true), 'value');
});

test('resume and online reset attempts so a later load can recover', () => {
  let tracker: StampRetryState = { attempts: 4, failed: true, exhausted: true };
  tracker = resetStampRetryForResume(tracker);
  assert.equal(tracker.attempts, 0);
  assert.equal(tracker.exhausted, false);
  assert.equal(tracker.failed, true);
  const plan = planStampFailure(tracker);
  assert.equal(plan.retry, true);
  assert.equal(plan.delayMs, 1_200);
  const counts = applyStampCacheEvent(authId, { stamps: null, coupons: null }, stampListCacheKey(authId), ['only']);
  assert.equal(counts.stamps, 1);
  assert.equal(planStampSuccess().state.attempts, 0);
});

test('fbUid fast path skips profile and session refresh', async () => {
  let profileCalls = 0;
  let refreshCalls = 0;
  let serverCalls = 0;
  const result = await resolveMemberId({
    userId: authId,
    hint: { name: '정영남', dob: '', fbUid: legacyId, storedUuid: authId },
    lookupProfile: async () => {
      profileCalls += 1;
      return { status: 'unknown' };
    },
    refreshSession: async () => {
      refreshCalls += 1;
    },
    lookupServerMemberId: async () => {
      serverCalls += 1;
      return null;
    },
    findDoc: async (candidate) => ({ id: candidate, missing: candidate !== legacyId }),
  });
  assert.equal(result.id, legacyId);
  assert.equal(profileCalls, 0);
  assert.equal(refreshCalls, 0);
  assert.equal(serverCalls, 0);
  assert.deepEqual(fastMemberIdCandidates(authId, { fbUid: legacyId, storedUuid: authId }), [legacyId]);
  assert.deepEqual(fastMemberIdCandidates(authId, { storedUuid: authId }), []);
});

test('legacy uuid wins over an existing login-id document', async () => {
  const seen: string[] = [];
  const result = await resolveMemberId({
    userId: authId,
    hint: { storedUuid: authId, name: '정영남', dob: '' },
    lookupProfile: async () => ({
      status: 'found',
      legacyUuid: legacyId,
      name: '정영남',
      dob: '',
    }),
    findDoc: async (candidate) => {
      seen.push(candidate);
      return { id: candidate, missing: false };
    },
  });
  assert.equal(result.id, legacyId);
  assert.deepEqual(seen, [legacyId]);
  assert.equal(
    memberIdCandidates(authId, { status: 'found', legacyUuid: legacyId, name: '정영남', dob: '' }).includes(authId),
    false,
  );
});

test('login id is used only when the profile has no legacy uuid', async () => {
  const seen: string[] = [];
  const result = await resolveMemberId({
    userId: normalId,
    hint: { storedUuid: normalId, name: '김회원', dob: '19900101' },
    lookupProfile: async () => ({
      status: 'found',
      legacyUuid: null,
      name: '김회원',
      dob: '19900101',
    }),
    findDoc: async (candidate) => {
      seen.push(candidate);
      return { id: candidate, missing: candidate !== normalId };
    },
  });
  assert.equal(result.id, normalId);
  assert.equal(seen[0], normalId);
  assert.equal(
    memberIdCandidates(normalId, { status: 'found', legacyUuid: null, name: '김회원', dob: '19900101' })[0],
    normalId,
  );
});

test('local fbUid seeds the in-memory member id without a profile lookup', async () => {
  invalidateCache();
  seedCachedMemberId(authId, legacyId);
  let loads = 0;
  const id = await readCachedMemberId(authId, async () => {
    loads += 1;
    return 'other-id';
  });
  assert.equal(id, legacyId);
  assert.equal(loads, 0);
  assert.equal(peekCachedMemberId(authId), legacyId);
  invalidateCache();
});

test('last known counts are readable immediately and an unconfirmed id clears them', () => {
  const mem = new Map<string, string>();
  const storage = {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, value: string) => {
      mem.set(key, value);
    },
    removeItem: (key: string) => {
      mem.delete(key);
    },
  };
  assert.equal(readLastKnownStampCounts(storage, authId), null);
  writeLastKnownStampCounts(storage, authId, { stamps: 1, coupons: 0 });
  writeLastKnownStampCounts(storage, authId, { stamps: null, coupons: 0 });
  assert.deepEqual(readLastKnownStampCounts(storage, authId), { stamps: 1, coupons: 0 });
  assert.equal(stampCountPresentation(1, false), 'value');
  const cleared = applyStampCacheEvent(
    authId,
    { stamps: 1, coupons: 0 },
    stampListCacheKey(authId),
    undefined,
    memberUnconfirmedError(),
  );
  assert.equal(cleared.stamps, null);
  assert.equal(cleared.coupons, 0);
  assert.equal(isMemberUnconfirmed(memberUnconfirmedError()), true);
  assert.equal(stampCountPresentation(cleared.stamps, true), 'retry');
});

test('switching member clears the previous counts unless that member has a saved value', () => {
  assert.deepEqual(countsAfterMemberChange(undefined, { stamps: 4, coupons: 2 }), { stamps: null, coupons: null });
  assert.deepEqual(countsAfterMemberChange(normalId, null), { stamps: null, coupons: null });
  assert.deepEqual(countsAfterMemberChange(legacyId, { stamps: 1, coupons: 0 }), { stamps: 1, coupons: 0 });
});

test('logout clears every saved stamp count and leaves other keys', () => {
  const mem = new Map<string, string>([
    ['ohgo-stamp-counts:' + authId, JSON.stringify({ stamps: 1, coupons: 0 })],
    ['ohgo-stamp-counts:' + legacyId, JSON.stringify({ stamps: 3, coupons: 1 })],
    ['userInfo', '{}'],
  ]);
  const storage = {
    get length() {
      return mem.size;
    },
    key(index: number) {
      return [...mem.keys()][index] ?? null;
    },
    removeItem(key: string) {
      mem.delete(key);
    },
  };
  clearAllLastKnownStampCounts(storage);
  assert.equal(mem.has('ohgo-stamp-counts:' + authId), false);
  assert.equal(mem.has('ohgo-stamp-counts:' + legacyId), false);
  assert.equal(mem.get('userInfo'), '{}');
});

test('server stamp counts ignore a body that is not a real count', () => {
  assert.deepEqual(parseServerStampCounts({ userId: authId, memberId: legacyId, stamps: 1, coupons: 0 }), {
    userId: authId,
    memberId: legacyId,
    stamps: 1,
    coupons: 0,
  });
  assert.equal(parseServerStampCounts({ memberId: legacyId, stamps: 1, coupons: 0 }), null);
  assert.equal(parseServerStampCounts({ memberId: legacyId, stamps: null, coupons: 0 }), null);
  assert.equal(parseServerStampCounts({ stamps: 0, coupons: 0 }), null);
  assert.equal(shouldKeepSlowStampRetry(STAMP_SLOW_RETRY_WINDOW_MS, true), true);
  assert.equal(shouldKeepSlowStampRetry(STAMP_SLOW_RETRY_WINDOW_MS + 1, true), false);
  assert.equal(shouldKeepSlowStampRetry(1_000, false), false);
});

test('a missing member doc is not a zero count', async () => {
  const seen: string[] = [];
  const id = await selectExistingMemberId(
    authId,
    { status: 'found', legacyUuid: legacyId, name: '정영남', dob: '' },
    async (candidate) => {
      seen.push(candidate);
      return { id: candidate, missing: true };
    },
  );
  assert.equal(id, null);
  assert.deepEqual(seen, [legacyId]);
  assert.equal(seen.includes(authId), false);
});

test('a merged member doc resolves to the live document', async () => {
  const canonicalId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const id = await selectExistingMemberId(
    authId,
    { status: 'found', legacyUuid: legacyId, name: '정영남', dob: '' },
    async (candidate) => {
      if (candidate === legacyId) return { id: canonicalId, missing: false };
      return { id: candidate, missing: true };
    },
  );
  assert.equal(id, canonicalId);
});

test('no legacy uuid and no login-id doc stays unresolved', async () => {
  const seen: string[] = [];
  const id = await selectExistingMemberId(
    normalId,
    { status: 'found', legacyUuid: null, name: '김회원', dob: '19900101' },
    async (candidate) => {
      seen.push(candidate);
      return { id: candidate, missing: true };
    },
  );
  assert.equal(id, null);
  assert.equal(seen[0], normalId);
  assert.equal(seen.includes(normalId), true);
});

test('server counts are shown only for the member on screen', () => {
  const own = { userId: authId, memberId: legacyId, stamps: 2, coupons: 1 };
  assert.equal(serverCountsMatchViewer(own, { uuid: authId, fbUid: legacyId, legacyUuid: legacyId }), true);
  assert.equal(serverCountsMatchViewer(own, { uuid: authId }), true);
  assert.equal(serverCountsMatchViewer(own, { uuid: normalId, fbUid: legacyId }), true);
  assert.equal(serverCountsMatchViewer({ userId: normalId, memberId: normalId }, { uuid: authId, fbUid: legacyId }), false);
  assert.equal(serverCountsMatchViewer(own, { uuid: '', fbUid: '', legacyUuid: '' }), false);
  assert.equal(serverCountsMatchViewer(own, null), false);
});
