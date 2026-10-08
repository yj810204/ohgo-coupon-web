import assert from 'node:assert/strict';
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
  applyStampCouponLoad,
  countsFromCacheValue,
  stampListCacheKey,
} from './stamp-count-state.ts';
import { TimeoutError } from './with-timeout.ts';

const authId = '0f03d93d-0000-4000-8000-000000000001';
const legacyId = 'a69705b7-0000-4000-8000-000000000002';
const normalId = '11111111-1111-4111-8111-111111111111';

invalidateCache();

// 1.5초를 넘긴 조회는 0으로 굳지 않고, 끝나면 실제 개수로 바뀐다.
{
  const uuid = 'slow-user';
  const key = stampListCacheKey(uuid);
  let counts = { stamps: null as number | null, coupons: null as number | null };
  const unsub = subscribeCache((cacheKey, value) => {
    const next = countsFromCacheValue(uuid, cacheKey, value);
    if (next) counts = { ...counts, ...next };
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
  assert.deepEqual(countsFromCacheValue(uuid, key, ['s1', 's2', 's3', 's4', 's5']), { stamps: 5 });
  unsub();
  invalidateCache();
}

// 빈 프로필은 회원 없음으로 캐시하지 않는다. 세션 갱신 뒤에도 없으면 null이고 캐시는 비어 있다.
{
  let lookups = 0;
  let refreshes = 0;
  const id = await readCachedMemberId('empty-profile', () =>
    resolveMemberId({
      userId: 'empty-profile',
      lookupProfile: async () => {
        lookups += 1;
        return { status: 'unknown' };
      },
      refreshSession: async () => {
        refreshes += 1;
      },
      findDoc: async (candidate) => ({ id: candidate, missing: true }),
    }).then((result) => result.id),
  );
  assert.equal(id, null);
  assert.equal(refreshes, 1);
  assert.equal(lookups, 2);
  assert.equal(peekCachedMemberId('empty-profile'), undefined);
  let secondLookups = 0;
  await readCachedMemberId('empty-profile', () =>
    resolveMemberId({
      userId: 'empty-profile',
      lookupProfile: async () => {
        secondLookups += 1;
        return { status: 'unknown' };
      },
      findDoc: async (candidate) => ({ id: candidate, missing: true }),
    }).then((result) => result.id),
  );
  assert.equal(secondLookups, 1);
  invalidateCache();
}

// legacy_uuid가 있으면 그 Firestore id를 로그인 id보다 먼저 쓴다.
{
  const seen: string[] = [];
  const profile: ProfileLookup = {
    status: 'found',
    legacyUuid: legacyId,
    name: '정영남',
    dob: '1970-01-01',
  };
  const result = await resolveMemberId({
    userId: authId,
    lookupProfile: async () => profile,
    findDoc: async (candidate) => {
      seen.push(candidate);
      return { id: candidate, missing: candidate !== legacyId };
    },
  });
  assert.equal(result.id, legacyId);
  assert.equal(seen[0], legacyId);
  assert.equal(memberIdCandidates(authId, profile)[0], legacyId);
}

// 프로필이 비어도 기기에 저장된 이름+생년월일로 레거시 id를 찾는다.
{
  const name = '정영남';
  const dob = '19700101';
  const fromDevice = computeLegacyUuid(name, dob);
  let refreshes = 0;
  const result = await resolveMemberId({
    userId: authId,
    hint: { name, dob },
    lookupProfile: async () => ({ status: 'unknown' }),
    refreshSession: async () => {
      refreshes += 1;
    },
    findDoc: async (candidate) => ({ id: candidate, missing: candidate !== fromDevice }),
  });
  assert.equal(refreshes, 1);
  assert.equal(result.id, fromDevice);
  assert.notEqual(fromDevice, authId);
}

// 로그인 id와 Firestore id가 같은 회원은 그대로다. 이름+생일 후보는 보지 않는다.
{
  const seen: string[] = [];
  const result = await resolveMemberId({
    userId: normalId,
    hint: { name: '김회원', dob: '19900101' },
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
  assert.deepEqual(seen, [normalId]);
}

// 성공한 0은 유지하고, 실패한 뒤의 값은 0으로 바꾸지 않는다.
{
  const loaded = applyStampCouponLoad(
    { stamps: null, coupons: null },
    {
      stamps: { status: 'fulfilled', value: [] },
      coupons: { status: 'fulfilled', value: 0 },
    },
  );
  assert.deepEqual(loaded, { stamps: 0, coupons: 0 });
  const kept = applyStampCouponLoad(loaded, {
    stamps: { status: 'rejected', reason: new Error('timeout') },
    coupons: { status: 'rejected', reason: new Error('timeout') },
  });
  assert.deepEqual(kept, { stamps: 0, coupons: 0 });
}

console.log('stamp count fix ok');
