import assert from 'node:assert/strict';
import { getTodayDate, getTodayRange, parseKstDate } from './kst-date.ts';

// 2026-09-23 08:35 KST = 2026-09-22 23:35 UTC (실서비스 버그 시각)
const earlyKstMorning = new Date('2026-09-22T23:35:00.000Z');
assert.equal(
  earlyKstMorning.toISOString().split('T')[0],
  '2026-09-22',
  'toISOString()는 UTC라 KST 오전에는 전날이 된다',
);
assert.equal(
  getTodayDate(earlyKstMorning),
  '2026-09-23',
  'KST 오전(UTC는 아직 22일)에도 쿠폰/스탬프 날짜는 23일',
);

const { start, end } = getTodayRange(earlyKstMorning);
assert.equal(start.toISOString(), '2026-09-22T15:00:00.000Z');
assert.equal(end.toISOString(), '2026-09-23T14:59:59.999Z');
assert.ok(earlyKstMorning >= start && earlyKstMorning <= end);

const issuedKst = parseKstDate('2026-09-23');
assert.ok(issuedKst >= start && issuedKst <= end, 'KST 발급일 문자열은 당일 범위에 들어가야 한다');
assert.ok(parseKstDate('2026-09-22') < start, '전날 KST 발급일은 당일 범위 밖');

assert.equal(getTodayDate(new Date('2026-09-22T14:59:59.000Z')), '2026-09-22');
assert.equal(getTodayDate(new Date('2026-09-22T15:00:00.000Z')), '2026-09-23');

console.log('kst-date tests passed');
