import assert from 'node:assert/strict';
import {
  birthKey,
  buildMatchIndex,
  compareWithConfirmed,
  countMemberBoardings,
  guestPersonKey,
  identityKey,
  isCounted,
  ledgerDocId,
  matchRosterRow,
  mergeEntry,
  planMergeMoves,
  planTripCountSync,
  presetRange,
  summarizeRange,
  toCsv,
  validateRange,
  type LedgerEntry,
} from './boarding-ledger.shared.ts';

function entry(p: Partial<LedgerEntry> & { date: string; tripNumber: number; personKey: string }): LedgerEntry {
  return {
    id: ledgerDocId(p.date, p.tripNumber, p.personKey),
    userId: p.personKey.startsWith('guest_') ? null : p.personKey,
    name: '',
    birth: '',
    role: 'passenger',
    status: 'matched',
    sources: ['ROSTER_IMAGE'],
    matchMethod: 'exact',
    needsReview: false,
    evidence: {},
    createdBy: 'test',
    ...p,
  };
}

// 키
assert.equal(birthKey('1970-01-02'), '700102');
assert.equal(birthKey('700102'), '700102');
assert.equal(birthKey('70012'), '');
assert.equal(identityKey(' 홍 길동 ', '19700102'), '홍길동|700102');
assert.equal(guestPersonKey('홍길동', ''), 'guest_홍길동_nobirth');
assert.equal(ledgerDocId('2026-09-28', 1, 'u1'), '2026-09-28_1_u1');

// 매칭
const index = buildMatchIndex([
  { userId: 'a', name: '이종산', birth: '19600101' },
  { userId: 'b', name: '김완석', birth: '650505' },
  { userId: 'c', name: '박동명', birth: '19700101' },
  { userId: 'd', name: '박동명', birth: '19800101' },
]);
assert.deepEqual(matchRosterRow({ name: '이종산', birth: '19600101' }, index), {
  userId: 'a',
  method: 'exact',
  needsReview: false,
});
assert.equal(matchRosterRow({ name: '김완석', birth: '19650505' }, index).userId, 'b', '6자리·8자리 생년월일도 같은 사람');
assert.deepEqual(
  matchRosterRow({ name: '김완석', birth: '19650' }, index, [{ userId: 'b', name: '김완석', birth: '' }]),
  { userId: 'b', method: 'roster-name', needsReview: false },
  '생년월일을 못 읽어도 확정 명단에 같은 이름이 하나면 그 사람'
);
assert.deepEqual(
  matchRosterRow({ name: '', birth: '19650505' }, index, [
    { userId: 'b', name: '김완석', birth: '650505' },
    { userId: 'a', name: '이종산', birth: '600101' },
  ]),
  { userId: 'b', method: 'roster-birth', needsReview: false },
  '이름을 못 읽어도 확정 명단에 생년월일이 하나만 같으면 그 사람'
);
assert.equal(
  matchRosterRow(
    { name: '', birth: '19700101' },
    buildMatchIndex([
      { userId: 'p', name: '가나다', birth: '19700101' },
      { userId: 'q', name: '라마바', birth: '700101' },
    ])
  ).userId,
  null,
  '생년월일이 같은 회원이 여럿이면 맞추지 않는다'
);
assert.deepEqual(matchRosterRow({ name: '이종산', birth: '19600102' }, index), {
  userId: 'a',
  method: 'name-birth-near',
  needsReview: true,
});
assert.equal(matchRosterRow({ name: '박동명', birth: '19900101' }, index).userId, null, '동명이인이 모호하면 맞추지 않는다');
assert.deepEqual(matchRosterRow({ name: '김완삭', birth: '19650505' }, index), {
  userId: 'b',
  method: 'name-birth-near',
  needsReview: true,
}, '이름 한 글자 오인식');
assert.deepEqual(matchRosterRow({ name: '', birth: '19650505' }, index), {
  userId: 'b',
  method: 'birth-only',
  needsReview: true,
});
assert.equal(matchRosterRow({ name: '없는사람', birth: '19700101' }, index).method, 'none');
assert.equal(
  matchRosterRow({ name: '이종산', birth: '19600101' }, index, [], (id) => (id === 'a' ? 'a2' : id)).userId,
  'a2',
  '병합된 계정은 최종 계정으로'
);

// 근거 합치기
const img = entry({ date: '2026-09-28', tripNumber: 1, personKey: 'a', sources: ['ROSTER_IMAGE'] });
const conf = entry({ date: '2026-09-28', tripNumber: 1, personKey: 'a', sources: ['CONFIRM'], matchMethod: 'confirm' });
assert.deepEqual(mergeEntry(img, conf).sources, ['ROSTER_IMAGE', 'CONFIRM']);
const voided = { ...img, status: 'void' as const, voidReason: '오인식' };
const afterVoid = mergeEntry(voided, conf);
assert.equal(afterVoid.status, 'void', '사람이 제외한 행은 새 근거가 와도 제외 유지');
assert.deepEqual(afterVoid.sources, ['ROSTER_IMAGE', 'CONFIRM']);
const manual = { ...img, matchMethod: 'manual' as const, userId: 'z', personKey: 'a' };
assert.equal(mergeEntry(manual, conf).userId, 'z', '수동 연결은 덮지 않는다');

// 집계 대상
assert.equal(isCounted(img), true);
assert.equal(isCounted(voided), false);
assert.equal(isCounted(entry({ date: '2026-01-01', tripNumber: 1, personKey: 'a', sources: ['STAMP'], needsReview: true })), false);
assert.equal(isCounted(entry({ date: '2026-01-01', tripNumber: 1, personKey: 'a', sources: ['STAMP'], needsReview: false })), true);

// 승선 횟수
const rows = [
  img,
  entry({ date: '2026-09-29', tripNumber: 1, personKey: 'a' }),
  entry({ date: '2026-09-29', tripNumber: 2, personKey: 'a' }),
  voided,
  entry({ date: '2026-09-29', tripNumber: 1, personKey: 'guest_손님_700101', name: '손님' }),
  entry({ date: '2026-09-29', tripNumber: 1, personKey: 'cap', role: 'crew', name: '선장' }),
];
assert.equal(countMemberBoardings(rows, 'a'), 3);
const changes = planTripCountSync(rows, new Map([['a', { tripCount: 5, name: '이종산' }], ['x', { tripCount: 2, name: '누구' }]]));
assert.deepEqual(
  changes.map((c) => [c.userId, c.from, c.to]),
  [
    ['a', 5, 3],
    ['x', 2, 0],
    ['cap', 0, 1],
  ]
);

// 병합 이동
const moves = planMergeMoves(
  [entry({ date: '2026-09-28', tripNumber: 1, personKey: 'old' })],
  'a',
  new Map([[img.id, img]])
);
assert.deepEqual(moves.remove, ['2026-09-28_1_old']);
assert.equal(moves.upsert[0]!.id, img.id);
assert.equal(moves.upsert[0]!.userId, 'a');

// 대조
assert.deepEqual(compareWithConfirmed(['a', 'b'], ['b', 'c']), { onlyInLedger: ['a'], onlyInConfirmed: ['c'] });

// 기간
assert.deepEqual(presetRange('thisMonth', '2026-09-29'), { startDate: '2026-09-01', endDate: '2026-09-30' });
assert.deepEqual(presetRange('lastMonth', '2026-01-15'), { startDate: '2025-12-01', endDate: '2025-12-31' });
assert.deepEqual(presetRange('lastMonth', '2028-03-01'), { startDate: '2028-02-01', endDate: '2028-02-29' });
assert.deepEqual(presetRange('thisYear', '2026-09-29'), { startDate: '2026-01-01', endDate: '2026-12-31' });
assert.ok('error' in validateRange('2026-11-30', '2026-09-01'));

const summary = summarizeRange(rows, { startDate: '2026-09-29', endDate: '2026-09-30' });
assert.equal(summary.totals.trips, 2);
assert.equal(summary.totals.passengers, 3, '선원은 승객 수에서 뺀다');
assert.equal(summary.totals.guests, 1);
assert.deepEqual(summary.members.map((m) => [m.userId, m.boardings]), [['a', 2]]);
assert.equal(summary.trips[0]!.tripNumber, 2);

// CSV
assert.ok(toCsv([['이름', 'a,b']]).startsWith('\uFEFF이름,"a,b"'));

console.log('boarding-ledger tests passed');
