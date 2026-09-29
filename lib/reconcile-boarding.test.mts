import assert from 'node:assert/strict';
import {
  classifyBoardCheck,
  classifyBoardingMember,
  collectConfirmedRosterIds,
  collectRosterIds,
  hasConfirmedTrip,
  planMemberCorrection,
} from './reconcile-boarding.shared.ts';
import { getTodayDate } from './kst-date.ts';

assert.equal(
  classifyBoardingMember({ hasStampOnReal: false, hasStampOnOrphan: true, credited: false }),
  'ORPHAN'
);
assert.equal(
  classifyBoardingMember({ hasStampOnReal: true, hasStampOnOrphan: false, credited: false }),
  'OK',
  '스탬프가 있으면 승선 횟수는 출항 확정에서 올리므로 대사 대상이 아니다'
);
assert.equal(
  classifyBoardingMember({ hasStampOnReal: false, hasStampOnOrphan: false, credited: false }),
  'NO_STAMP'
);
assert.equal(
  classifyBoardingMember({ hasStampOnReal: true, hasStampOnOrphan: false, credited: true }),
  'OK'
);
assert.equal(
  classifyBoardingMember({ hasStampOnReal: true, hasStampOnOrphan: true, credited: true }),
  'OK',
  '실계정에 스탬프가 있고 적립됐으면 고아 복사본이 있어도 OK'
);

assert.deepEqual(
  collectRosterIds({
    members: ['a', 'b'],
    confirmedMembers: { '1': ['b', 'c'], '2': ['d'] },
  }).sort(),
  ['a', 'b', 'c', 'd']
);
assert.deepEqual(
  collectRosterIds({
    members: ['a'],
    confirmedMembers: { '1': ['b'], '2': ['c'] },
    tripNumber: 2,
  }).sort(),
  ['a', 'c']
);

const earlyKst = new Date('2026-09-27T21:06:00.000Z');
assert.equal(getTodayDate(earlyKst), '2026-09-28', '구앱 UTC date 필드 대신 timestamp의 KST 날짜를 쓴다');

assert.deepEqual(
  collectConfirmedRosterIds({ '1': ['a', 'b'], '2': ['c'] }, 1).sort(),
  ['a', 'b']
);
assert.equal(hasConfirmedTrip({ '1': ['a'] }, 1), true);
assert.equal(hasConfirmedTrip({ '1': ['a'] }, 2), false);

const kimFlags = {
  onRoster: true,
  isCrew: false,
  hasStamp: false,
  hasOrphanStamp: false,
  tripCredited: true,
  baitAwarded: false,
};
assert.equal(classifyBoardCheck(kimFlags), 'NO_STAMP', '김완석: 승선일수는 있고 스탬프만 없음');
assert.deepEqual(
  planMemberCorrection(kimFlags, { addStamp: true, grantBait: true, creditTrip: true }),
  { addStamp: true, grantBait: true, creditTrip: false, moveOrphan: false },
  '스탬프+미끼만. 이미 반영된 승선일수는 다시 올리지 않는다'
);
assert.deepEqual(
  planMemberCorrection(kimFlags, { addStamp: true }),
  { addStamp: true, grantBait: false, creditTrip: false, moveOrphan: false },
  '미끼는 따로 골라야 한다'
);
assert.deepEqual(
  planMemberCorrection({ ...kimFlags, hasStamp: true, baitAwarded: true }, {
    addStamp: true,
    grantBait: true,
    creditTrip: true,
  }),
  { addStamp: false, grantBait: false, creditTrip: false, moveOrphan: false },
  '이미 반영된 보정은 다시 하지 않는다'
);

const orphanFlags = {
  onRoster: true,
  isCrew: false,
  hasStamp: false,
  hasOrphanStamp: true,
  tripCredited: true,
  baitAwarded: false,
};
assert.equal(classifyBoardCheck(orphanFlags), 'ORPHAN');
assert.deepEqual(
  planMemberCorrection(orphanFlags, { addStamp: true, grantBait: true }),
  { addStamp: false, grantBait: true, creditTrip: false, moveOrphan: true },
  '병합 계정의 스탬프는 옮기고 새 ADMIN 스탬프는 만들지 않는다'
);

const extraFlags = {
  onRoster: false,
  isCrew: false,
  hasStamp: true,
  hasOrphanStamp: false,
  tripCredited: false,
  baitAwarded: true,
};
assert.equal(classifyBoardCheck(extraFlags), 'EXTRA');
assert.deepEqual(
  planMemberCorrection(extraFlags, { addStamp: true, creditTrip: true, grantBait: true }),
  { addStamp: false, grantBait: false, creditTrip: false, moveOrphan: false },
  '명단 밖 회원은 승선일수를 올리지 않는다'
);

const crewFlags = {
  onRoster: true,
  isCrew: true,
  hasStamp: false,
  hasOrphanStamp: false,
  tripCredited: false,
  baitAwarded: false,
};
assert.equal(classifyBoardCheck(crewFlags), 'OK', '선장·선원은 스탬프 누락으로 보지 않는다');
assert.deepEqual(planMemberCorrection(crewFlags, { addStamp: true, creditTrip: true }), {
  addStamp: false,
  grantBait: false,
  creditTrip: false,
  moveOrphan: false,
});

const noTripFlags = {
  onRoster: true,
  isCrew: false,
  hasStamp: true,
  hasOrphanStamp: false,
  tripCredited: false,
  baitAwarded: true,
};
assert.equal(classifyBoardCheck(noTripFlags), 'NO_TRIP');
assert.deepEqual(planMemberCorrection(noTripFlags, { creditTrip: true }), {
  addStamp: false,
  grantBait: false,
  creditTrip: true,
  moveOrphan: false,
});

console.log('reconcile-boarding tests passed');
