import assert from 'node:assert/strict';
import { formatKstClock, kstDateTimeMs, parseKstDateTime, slackWindows } from './tide-forecast.ts';

const highAt = parseKstDateTime('2026-09-22 05:33:00');
const lowAt = parseKstDateTime('2026-09-22 11:48:00');

assert.equal(highAt, Date.parse('2026-09-22T05:33:00+09:00'));
assert.equal(lowAt, Date.parse('2026-09-22T11:48:00+09:00'));
assert.equal(formatKstClock(highAt), '05:33');
assert.equal(formatKstClock(lowAt), '11:48');

const viewStart = kstDateTimeMs('2026-09-22', 4);
const viewEnd = kstDateTimeMs('2026-09-22', 18);
const events = [
  { type: 'high' as const, time: '05:33', heightCm: 95, deltaCm: null, at: highAt },
  { type: 'low' as const, time: '11:48', heightCm: 51, deltaCm: null, at: lowAt },
];
const windows = slackWindows(events, viewStart, viewEnd);
assert.equal(windows.length, 2);
assert.deepEqual(windows.map((item) => item.event.type), ['high', 'low']);
assert.equal(formatKstClock(windows[0].from), '04:33');
assert.equal(formatKstClock(windows[0].to), '06:33');
assert.equal(formatKstClock(windows[1].from), '10:48');
assert.equal(formatKstClock(windows[1].to), '12:48');

const utcWindows = slackWindows(
  [
    { type: 'high', time: '05:33', heightCm: 95, deltaCm: null, at: Date.parse('2026-09-22T05:33:00Z') },
    { type: 'low', time: '11:48', heightCm: 51, deltaCm: null, at: Date.parse('2026-09-22T11:48:00Z') },
  ],
  viewStart,
  viewEnd,
);
assert.equal(
  utcWindows.some((item) => item.event.type === 'low'),
  false,
  'UTC로 파싱된 간조는 KST 출조 창(04–18) 밖으로 밀려 물돌이가 빠진다',
);

console.log('tide-kst tests passed');
