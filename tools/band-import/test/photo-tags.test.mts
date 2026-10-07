import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendAlwaysBoarders, attendanceFromFirebase, buildBoarderList, loadAlwaysSelectable, loadBoarders, parsePhotoTag, personFromFirebaseUser, PhotoTagError, publishPhotoTags, readPhotoTags, writePhotoTags } from '../src/photo-tags.mts';
import type { RosterPerson, TagClient } from '../src/photo-tags.mts';

const person = (id: string, extra: Partial<RosterPerson> = {}): RosterPerson => ({
  id,
  name: id,
  crew: false,
  canNotify: true,
  ...extra,
});

const people = new Map<string, RosterPerson>([
  ['cap', person('cap', { name: '선장', crew: true, canNotify: false })],
  ['sail', person('sail', { name: '선원', crew: true, canNotify: false })],
  ['hong', person('hong', { name: '홍길동' })],
  ['guest', person('guest', { name: '김손님', canNotify: false })],
]);

{
  const list = buildBoarderList('2026-10-06', {
    members: ['cap', 'hong'],
    confirmed_members: { '2': ['guest', 'sail'], '1': ['hong', 'cap'], skip: ['hong'] },
  }, people);
  assert.equal(list.source, 'confirmed');
  assert.deepEqual(list.trips.map((trip) => trip.trip), [1, 2]);
  assert.deepEqual(list.trips[0].boarders, [{ id: 'hong', name: '홍길동', canNotify: true }]);
  assert.deepEqual(list.trips[1].boarders, [{ id: 'guest', name: '김손님', canNotify: false }]);
}

{
  const list = buildBoarderList('2026-10-06', { members: ['sail', 'hong', 'missing'], confirmed_members: {} }, people);
  assert.equal(list.source, 'roster');
  assert.deepEqual(list.trips, [{ trip: 1, boarders: [{ id: 'hong', name: '홍길동', canNotify: true }] }]);
}

assert.equal(buildBoarderList('2026-10-06', null, people).source, 'empty');

{
  const empty = buildBoarderList('2026-10-06', null, people);
  const testers = appendAlwaysBoarders(empty, [
    { id: 'lee', name: '이영우', canNotify: true },
    { id: 'jung', name: '정영남', canNotify: false },
  ]);
  assert.equal(testers.source, 'testers');
  assert.deepEqual(testers.trips[0].boarders.map((boarder) => boarder.name), ['이영우', '정영남']);
  const listed = appendAlwaysBoarders(buildBoarderList('2026-10-06', { members: ['hong'], confirmed_members: {} }, people), [
    { id: 'lee', name: '이영우', canNotify: true },
    { id: 'hong', name: '홍길동', canNotify: false },
  ]);
  assert.equal(listed.source, 'roster');
  assert.deepEqual(listed.trips[0].boarders.map((boarder) => boarder.id), ['hong', 'lee']);
}

{
  const client = {
    async select(table: string, query: string) {
      assert.equal(table, 'profiles');
      assert.match(query, /role=eq\.admin/);
      return [
        { id: 'captain', name: '다른관리자', expo_push_token: 'x' },
        { id: 'ohgo', name: '오고피씽', expo_push_token: null },
        { id: 'lee', name: '이영우', expo_push_token: 'ExponentPushToken[lee]' },
      ];
    },
    async insert() { return ''; },
  };
  const boarders = await loadAlwaysSelectable(client);
  assert.deepEqual(boarders, [
    { id: 'lee', name: '이영우', canNotify: true },
    { id: 'ohgo', name: '오고피씽', canNotify: false },
  ]);
}

{
  const attendance = attendanceFromFirebase({ members: [], confirmedMembers: { '1': ['hong', 'cap'] } });
  const rosterPeople = new Map([
    ['hong', personFromFirebaseUser('hong', { name: '홍길동', expoPushToken: 'ExponentPushToken[hong]' })!],
    ['cap', personFromFirebaseUser('cap', { name: '선장', role: 'captain', expoPushToken: 'ExponentPushToken[cap]' })!],
  ]);
  const list = buildBoarderList('2026-10-06', attendance, rosterPeople);
  assert.equal(list.source, 'confirmed');
  assert.deepEqual(list.trips[0].boarders, [{ id: 'hong', name: '홍길동', canNotify: true }]);
}

{
  const queries: string[] = [];
  const list = await loadBoarders({
    async select(table, query) {
      queries.push(`${table} ${query}`);
      if (table === 'attendance' && query.includes('confirmed_members')) {
        throw new Error('attendance 조회 실패: column attendance.confirmed_members does not exist (HTTP 400)');
      }
      if (table === 'attendance') return [{ members: ['hong', 'sail'] }];
      if (table === 'profiles') return [{ id: 'hong', name: '홍길동', role: 'member', expo_push_token: 'ExponentPushToken[hong]' }, { id: 'sail', name: '선원', role: 'member', expo_push_token: null }];
      if (table === 'boarding_info') return [{ user_id: 'sail', trip_role: 'sailor' }];
      return [];
    },
    async insert() {
      return 'x';
    },
  }, '2026-10-06');
  assert.equal(queries.filter((query) => query.startsWith('attendance')).length, 2);
  assert.equal(list.source, 'roster');
  assert.deepEqual(list.trips[0].boarders, [{ id: 'hong', name: '홍길동', canNotify: true }]);
}
assert.throws(() => parsePhotoTag({ trip: 0, userIds: [] }), PhotoTagError);
assert.deepEqual(parsePhotoTag({ trip: 2, userIds: ['a', 'a'] }), { trip: 2, userIds: ['a'] });

{
  const dir = mkdtempSync(join(tmpdir(), 'photo-tags-'));
  try {
    writePhotoTags(dir, { '01.jpg': { trip: 1, userIds: ['hong'] }, '../x': { trip: 1, userIds: ['hong'] } });
    assert.deepEqual(readPhotoTags(dir), { '01.jpg': { trip: 1, userIds: ['hong'] } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const pushes: { to: string; body: string }[] = [];
  const client: TagClient = {
    async select(table, query) {
      if (table === 'profiles' && query.includes('hong')) return [{ id: 'hong', name: '홍길동', expo_push_token: 'ExponentPushToken[hong]' }];
      if (table === 'profiles') return [];
      if (table === 'guest_profiles') return [{ id: 'guest-open', name: '김손님', merged_to: null }];
      return [];
    },
    async insert(table, row) {
      inserts.push({ table, row });
      return `${table}-${inserts.length}`;
    },
  };
  const result = await publishPhotoTags({
    client,
    fetchImpl: async (_url, init) => {
      pushes.push(JSON.parse(String(init?.body)) as { to: string; body: string });
      return new Response(JSON.stringify({ data: { status: 'ok' } }), { status: 200 });
    },
    captainId: 'captain',
    tripDate: '2026-10-06',
    photos: [
      { file: '01.jpg', url: 'https://cdn/1.jpg' },
      { file: '02.jpg', url: 'https://cdn/2.jpg' },
    ],
    tags: {
      '01.jpg': { trip: 1, userIds: ['hong', 'guest-open'] },
      '02.jpg': { trip: 1, userIds: ['hong'] },
    },
    log: () => {},
  });
  assert.equal(inserts.filter((row) => row.table === 'captain_photos').length, 2);
  assert.equal(inserts.find((row) => row.row.user_name === '김손님')?.row.user_id, null);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].to, 'ExponentPushToken[hong]');
  assert.match(pushes[0].body, /2장/);
  assert.deepEqual(result.notified, ['홍길동']);
  assert.deepEqual(result.silent, ['김손님']);
}

{
  const skipped = await publishPhotoTags({
    client: { select: async () => [], insert: async () => 'x' },
    fetchImpl: async () => new Response(null, { status: 500 }),
    captainId: 'captain',
    tripDate: null,
    photos: [{ file: '01.jpg', url: 'https://cdn/1.jpg' }],
    tags: { '01.jpg': { trip: 1, userIds: ['hong'] } },
    log: () => {},
  });
  assert.match(skipped.note, /사진 날짜가 없어/);
  assert.equal(skipped.photos, 0);
}

{
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const client: TagClient = {
    async select(table, query) {
      if (table === 'profiles' && query.includes('name=in.')) {
        return [{ id: 'profile-lee', name: '이종산', phone: '01011112222', dob: '900101', expo_push_token: null }];
      }
      if (table === 'profiles' || table === 'guest_profiles') return [];
      return [];
    },
    async insert(table, row) {
      inserts.push({ table, row });
      return `${table}-${inserts.length}`;
    },
  };
  await publishPhotoTags({
    client,
    fetchImpl: async () => new Response(JSON.stringify({ data: { status: 'ok' } }), { status: 200 }),
    captainId: 'captain',
    tripDate: '2026-10-06',
    photos: [{ file: '01.jpg', url: 'https://cdn/1.jpg' }],
    tags: { '01.jpg': { trip: 1, userIds: ['roster-lee'] } },
    firebaseUsers: new Map([['roster-lee', { name: '이종산', token: 'ExponentPushToken[roster]', phone: '010-1111-2222', dob: '900101' }]]),
    log: () => {},
  });
  const tag = inserts.find((row) => row.table === 'captain_photo_tags')?.row;
  assert.equal(tag?.user_id, 'profile-lee');
  assert.equal(tag?.user_name, '이종산');
}

{
  const pushes: string[] = [];
  const result = await publishPhotoTags({
    client: {
      async select(table, query) {
        if (table === 'profiles' && query.includes('profile-jung')) {
          return [{ id: 'profile-jung', name: '정영남', legacy_uuid: 'firestore-jung', expo_push_token: 'ExponentPushToken[expo-go]' }];
        }
        return [];
      },
      async insert() { return 'photo-1'; },
    },
    fetchImpl: async (_url, init) => {
      pushes.push(JSON.parse(String(init?.body)).to);
      return new Response(JSON.stringify({ data: { status: 'ok' } }), { status: 200 });
    },
    captainId: 'captain',
    tripDate: '2026-10-06',
    photos: [{ file: '01.jpg', url: 'https://cdn/1.jpg' }],
    tags: { '01.jpg': { trip: 1, userIds: ['profile-jung'] } },
    liveToken: async () => null,
    log: () => {},
  });
  assert.equal(pushes.length, 0);
  assert.match(result.note, /오고피씽 앱 알림 토큰이 없어 보내지 않음: 정영남/);
}
