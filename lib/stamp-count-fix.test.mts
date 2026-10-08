import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeLegacyUuid } from './legacy-uuid.ts';
import {
  memberIdCandidates,
  peekCachedMemberId,
  readCachedMemberId,
  resolveMemberId,
  type ProfileLookup,
} from './member-id-resolution.ts';
import { CACHE_WAIT_MS, cachedFetch, invalidateCache, subscribeCache } from './query-cache.ts';
import {
  applyStampCacheEvent,
  applyStampCouponLoad,
  couponCountCacheKey,
  shouldRetryStampLoad,
  stampListCacheKey,
} from './stamp-count-state.ts';
import { storedUserFromProfile } from './stored-user.ts';
import { TimeoutError } from './with-timeout.ts';

const authId = '0f03d93d-0000-4000-8000-000000000001';
const legacyId = 'a69705b7-0000-4000-8000-000000000002';
const normalId = '11111111-1111-4111-8111-111111111111';

test('unresolved member ends the placeholder at 0', () => {
  const ended = applyStampCouponLoad(
    { stamps: null, coupons: null },
    {
      stamps: { status: 'rejected', reason: new Error('회원 정보를 확인하지 못했습니다.') },
      coupons: { status: 'rejected', reason: new Error('회원 정보를 확인하지 못했습니다.') },
    },
  );
  assert.deepEqual(ended, { stamps: 0, coupons: 0 });
  assert.equal(shouldRetryStampLoad({ attempts: 0, failed: true }), true);
  assert.equal(shouldRetryStampLoad({ attempts: 2, failed: true }), false);
});

test('rejected fetch notifies subscribers and ends the placeholder', async () => {
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
  assert.equal(counts.stamps, 0);
  assert.equal(counts.coupons, 0);
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
