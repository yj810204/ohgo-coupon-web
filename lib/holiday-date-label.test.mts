import assert from 'node:assert/strict';
import fallback from './kr-holidays-fallback.json' with { type: 'json' };
import { HOLIDAY_RED, holidaysToMap, type KrHoliday } from './kr-holidays.ts';
import { holidayDateParts, holidayDateTextColor } from './holiday-date-label.ts';

const map = holidaysToMap((fallback as Record<string, KrHoliday[]>)['2026']);
const plain = '#9A9FA5';

const cases = [
  { date: '2026-10-09', dateLine: '10월 9일 (금)', holidayLine: '한글날', color: HOLIDAY_RED },
  { date: '2026-10-05', dateLine: '10월 5일 (월)', holidayLine: '대체휴일', color: HOLIDAY_RED },
  { date: '2026-10-10', dateLine: '10월 10일 (토)', holidayLine: '', color: HOLIDAY_RED },
  { date: '2026-10-11', dateLine: '10월 11일 (일)', holidayLine: '', color: HOLIDAY_RED },
  { date: '2026-10-14', dateLine: '10월 14일 (수)', holidayLine: '', color: plain },
] as const;

for (const item of cases) {
  const holidayName = map[item.date];
  const parts = holidayDateParts(item.date, holidayName);
  assert.equal(parts.dateLine, item.dateLine, item.date);
  assert.equal(parts.holidayLine, item.holidayLine, item.date);
  assert.equal(holidayDateTextColor(item.date, holidayName, plain), item.color, item.date);
  assert.equal(parts.dateLine.includes('\u00B7'), false);
  assert.equal(parts.holidayLine.includes('\u00B7'), false);
  assert.equal(parts.dateLine.includes('물때'), false);
}

assert.equal(map['2026-10-09'], '한글날');
assert.equal(map['2026-10-05'], '대체공휴일(개천절)');
assert.equal(map['2026-10-10'], undefined);
assert.equal(map['2026-10-11'], undefined);
assert.equal(map['2026-10-14'], undefined);

assert.equal(holidayDateTextColor('2026-10-14', undefined, plain), plain);

console.log('holiday date label ok');
