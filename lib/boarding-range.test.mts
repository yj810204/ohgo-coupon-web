import assert from 'node:assert/strict';
import {
  buildBoardingCsv,
  countDays,
  countTripCreditedInRange,
  eachDateInRange,
  isInstantInRange,
  kstRangeInstants,
  normalizeRange,
  parseAttendanceTrips,
  rangePreset,
  summarizeMembers,
} from '@/lib/boarding-range';
import { stampBusinessDate } from '@/lib/kst-instant';

const range = { startDate: '2026-09-01', endDate: '2026-11-30' };
const { start, end } = kstRangeInstants(range);

assert.equal(start.toISOString(), '2026-08-31T15:00:00.000Z', '시작은 9/1 00:00 KST');
assert.equal(end.toISOString(), '2026-11-30T14:59:59.999Z', '끝은 11/30 23:59:59.999 KST');

const earlyStart = new Date('2026-09-01T05:30:00+09:00');
assert.equal(earlyStart.toISOString(), '2026-08-31T20:30:00.000Z');
assert.ok(earlyStart >= start && earlyStart <= end, '9/1 05:30 KST 는 포함 (UTC 로는 8/31)');
assert.ok(isInstantInRange(earlyStart, range));
assert.equal(
  stampBusinessDate({ date: '2026-08-31', timestamp: earlyStart }),
  '2026-09-01',
  '구앱의 UTC date 필드보다 timestamp 의 KST 날짜를 쓴다'
);

const lateEnd = new Date('2026-11-30T23:50:00+09:00');
assert.ok(lateEnd >= start && lateEnd <= end, '11/30 23:50 KST 는 포함');
assert.ok(isInstantInRange(lateEnd, range));

const afterEnd = new Date('2026-12-01T00:00:00+09:00');
assert.ok(afterEnd > end, '12/1 00:00 KST 는 제외');
assert.equal(isInstantInRange(afterEnd, range), false);

const beforeStart = new Date('2026-08-31T23:59:59+09:00');
assert.ok(beforeStart < start, '8/31 23:59 KST 는 제외');
assert.equal(isInstantInRange(beforeStart, range), false);

const utcMidnightBug = new Date('2026-11-30');
assert.ok(lateEnd > utcMidnightBug, '예전처럼 new Date("2026-11-30") 을 끝으로 쓰면 11/30 저녁이 빠진다');

assert.equal(countDays('2026-09-01', '2026-11-30'), 91);
const days = eachDateInRange(range);
assert.equal(days.length, 91);
assert.equal(days[0], '2026-09-01');
assert.equal(days[days.length - 1], '2026-11-30');

assert.equal(normalizeRange('2026-11-30', '2026-09-01').ok, false);
assert.equal(normalizeRange('2026-02-30', '2026-03-01').ok, false);
assert.equal(normalizeRange('2026-01-01', '2027-12-31').ok, false, '최대 기간 초과');
assert.equal(normalizeRange('2026-09-01', '2026-09-01').ok, true, '하루도 된다');

const kstEarlyOct = new Date('2026-09-30T16:00:00Z');
assert.deepEqual(rangePreset('this-month', kstEarlyOct), { startDate: '2026-10-01', endDate: '2026-10-31' }, 'UTC 9/30 이 KST 10/1 이면 이번 달은 10월');
assert.deepEqual(rangePreset('last-month', kstEarlyOct), { startDate: '2026-09-01', endDate: '2026-09-30' });
assert.deepEqual(rangePreset('last-month', new Date('2026-01-15T03:00:00Z')), {
  startDate: '2025-12-01',
  endDate: '2025-12-31',
});
assert.deepEqual(rangePreset('this-month', new Date('2028-02-10T03:00:00Z')), {
  startDate: '2028-02-01',
  endDate: '2028-02-29',
});
assert.deepEqual(rangePreset('this-year', kstEarlyOct), { startDate: '2026-01-01', endDate: '2026-12-31' });

assert.equal(
  countTripCreditedInRange(
    {
      'tripCredited_2026-09-01_1': true,
      'tripCredited_2026-11-30_2': true,
      'tripCredited_2026-12-01_1': true,
      'tripCredited_2026-08-31_1': true,
      'tripCredited_2026-10-10_1': false,
      tripCount: 12,
    },
    range
  ),
  2
);

const trips = [
  ...parseAttendanceTrips('2026-09-01', { confirmedMembers: { '1': ['a', 'old-b'], '2': ['a'] } }, {
    trip1: { confirmed: true },
    trip2: { confirmed: true },
  }),
  ...parseAttendanceTrips('2026-09-02', { members: ['x'] }, { trip1: { confirmed: true } }),
  ...parseAttendanceTrips('2026-09-03', { confirmedMembers: { '1': ['b', 'old-b'] } }, null),
];
assert.equal(trips.length, 4);
assert.equal(trips.find((t) => t.date === '2026-09-02')?.hasMemberList, false, '명단 없는 예전 확정 항차');
assert.deepEqual(trips.find((t) => t.date === '2026-09-02')?.memberIds, [], '작업 중 members 는 승선으로 세지 않는다');

const canonical: Record<string, string> = { 'old-b': 'b' };
const members = summarizeMembers({
  trips,
  canonicalOf: (id) => canonical[id] ?? id,
  nameOf: (id) => ({ a: '김', b: '이' })[id] ?? id,
  stampsOf: (id) => (id === 'a' ? 2 : 1),
  tripCreditedOf: () => 0,
});
const a = members.find((m) => m.id === 'a');
const b = members.find((m) => m.id === 'b');
assert.equal(a?.boardings, 2);
assert.equal(b?.boardings, 2, '병합된 옛 id 는 실계정에 합치고, 같은 항차 중복은 한 번');
assert.equal(members.some((m) => m.id === 'old-b'), false);

const csv = buildBoardingCsv({
  range,
  trips,
  members,
  nameOf: (id) => ({ a: '김', b: '이, 주니어' })[id] ?? id,
  canonicalOf: (id) => canonical[id] ?? id,
});
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes('"이, 주니어"'), '쉼표가 든 이름은 따옴표로 감싼다');
assert.ok(csv.includes('명단 없음'));

console.log('boarding-range tests passed');
