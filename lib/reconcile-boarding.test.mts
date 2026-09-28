import assert from 'node:assert/strict';
import { classifyBoardingMember, collectRosterIds } from './reconcile-boarding.shared.ts';
import { getTodayDate } from './kst-date.ts';

assert.equal(
  classifyBoardingMember({ hasStampOnReal: false, hasStampOnOrphan: true, credited: false }),
  'ORPHAN'
);
assert.equal(
  classifyBoardingMember({ hasStampOnReal: true, hasStampOnOrphan: false, credited: false }),
  'NO_TRIPCOUNT'
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

console.log('reconcile-boarding tests passed');
