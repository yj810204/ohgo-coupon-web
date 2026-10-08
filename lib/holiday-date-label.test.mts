import assert from 'node:assert/strict';
import fallback from './kr-holidays-fallback.json' with { type: 'json' };
import { HOLIDAY_RED, holidaysToMap, type KrHoliday } from './kr-holidays.ts';
import { formatHolidayDateLine, holidayDateTextColor } from './holiday-date-label.ts';

const map = holidaysToMap((fallback as Record<string, KrHoliday[]>)['2026']);
const plain = '#9A9FA5';

const cases = [
  { date: '2026-10-09', line: '10월 9일 (금) 한글날', color: HOLIDAY_RED },
  { date: '2026-10-05', line: '10월 5일 (월) 대체휴일', color: HOLIDAY_RED },
  { date: '2026-10-10', line: '10월 10일 (토)', color: HOLIDAY_RED },
  { date: '2026-10-11', line: '10월 11일 (일)', color: HOLIDAY_RED },
  { date: '2026-10-14', line: '10월 14일 (수)', color: plain },
] as const;

for (const item of cases) {
  const holidayName = map[item.date];
  const line = formatHolidayDateLine(item.date, holidayName);
  assert.equal(line, item.line, item.date);
  assert.equal(holidayDateTextColor(item.date, holidayName, plain), item.color, item.date);
  assert.equal(line.includes('\u00B7'), false);
  assert.equal(line.startsWith('물때'), false);
}

assert.equal(map['2026-10-09'], '한글날');
assert.equal(map['2026-10-05'], '대체공휴일(개천절)');
assert.equal(map['2026-10-10'], undefined);
assert.equal(map['2026-10-11'], undefined);
assert.equal(map['2026-10-14'], undefined);

assert.equal(holidayDateTextColor('2026-10-14', undefined, plain), plain);

console.log('holiday date label ok');
