import assert from 'node:assert/strict';
import { parseISO } from 'date-fns';
import { HOLIDAY_RED } from './kr-holidays.ts';
import {
  DATETIME_LOCAL_RE,
  DATE_RE,
  DAY_LABELS,
  HOUR12_OPTIONS,
  MINUTE_OPTIONS,
  TIME_RE,
  buildMonthCells,
  compareYmd,
  dayTextColor,
  formatKoreanDateLabel,
  formatKoreanDateTimeLabel,
  formatKoreanTimeLabel,
  formatTimeValue,
  isDateDisabled,
  isDateTimeLocalValue,
  isDateValue,
  isTimeValue,
  joinDateTimeLocal,
  monthTitle,
  parseTimeValue,
  shiftDate,
  splitDateTimeLocal,
  to12Hour,
  to24Hour,
} from './korean-picker.ts';

assert.deepEqual(DAY_LABELS, ['일', '월', '화', '수', '목', '금', '토']);

assert.equal(isDateValue('2026-10-07'), true);
assert.equal(isDateValue('2026-02-31'), false);
assert.equal(isDateValue('10/07/2026'), false);
assert.equal(DATE_RE.test('2026-10-07'), true);

assert.equal(isTimeValue('00:00'), true);
assert.equal(isTimeValue('23:59'), true);
assert.equal(isTimeValue('24:00'), false);
assert.equal(isTimeValue('6:30'), false);
assert.equal(TIME_RE.test('14:05'), true);

assert.equal(isDateTimeLocalValue('2026-10-07T14:05'), true);
assert.equal(isDateTimeLocalValue('2026-10-07T14:05:00'), true);
assert.equal(isDateTimeLocalValue('2026-10-07 14:05'), false);
assert.equal(DATETIME_LOCAL_RE.test('2026-10-07T09:30'), true);

assert.equal(formatKoreanDateLabel('2026-10-07'), '2026년 10월 7일 (수)');
assert.equal(formatKoreanDateLabel('2026-10-03'), '2026년 10월 3일 (토)');
assert.equal(formatKoreanDateLabel(''), '');

assert.equal(formatKoreanTimeLabel('00:00'), '오전 12:00');
assert.equal(formatKoreanTimeLabel('00:30'), '오전 12:30');
assert.equal(formatKoreanTimeLabel('09:05'), '오전 9:05');
assert.equal(formatKoreanTimeLabel('12:00'), '오후 12:00');
assert.equal(formatKoreanTimeLabel('14:05'), '오후 2:05');
assert.equal(formatKoreanTimeLabel('23:59'), '오후 11:59');

assert.equal(formatKoreanDateTimeLabel('2026-10-07T14:05'), '2026년 10월 7일 (수) 오후 2:05');
assert.equal(formatKoreanDateTimeLabel('2026-10-07T14:05:30'), '2026년 10월 7일 (수) 오후 2:05');
assert.equal(splitDateTimeLocal('2026-10-07T14:05:30').time, '14:05');
assert.equal(joinDateTimeLocal('2026-10-07', '14:05'), '2026-10-07T14:05');
assert.equal(joinDateTimeLocal('2026-10-07', ''), '');
assert.equal(joinDateTimeLocal('', '14:05'), '');

for (let hour = 0; hour < 24; hour += 1) {
  for (const minute of [0, 5, 30, 59]) {
    const value = formatTimeValue(hour, minute);
    const parsed = parseTimeValue(value);
    assert.ok(parsed);
    const clock = to12Hour(parsed.hour);
    assert.equal(to24Hour(clock.period, clock.hour12), hour);
    assert.equal(formatTimeValue(hour, minute), value);
    assert.match(value, TIME_RE);
  }
}

assert.equal(HOUR12_OPTIONS.length, 12);
assert.equal(MINUTE_OPTIONS.length, 60);
assert.equal(MINUTE_OPTIONS[0]?.value, '00');
assert.equal(MINUTE_OPTIONS[59]?.value, '59');

assert.equal(compareYmd('2026-10-07', '2026-10-08'), -1);
assert.equal(isDateDisabled('2026-10-06', '2026-10-07', '2026-10-09'), true);
assert.equal(isDateDisabled('2026-10-07', '2026-10-07', '2026-10-09'), false);
assert.equal(isDateDisabled('2026-10-10', '2026-10-07', '2026-10-09'), true);
assert.equal(isDateDisabled('2026-10-08', undefined, undefined), false);

const october = buildMonthCells(parseISO('2026-10-01'));
assert.equal(october[0], null);
assert.equal(october[4]?.date, '2026-10-01');
assert.equal(october[4]?.weekday, 4);
assert.equal(monthTitle(parseISO('2026-10-07')), '2026년 10월');
assert.equal(shiftDate('2026-10-31', 1), '2026-11-01');
assert.equal(shiftDate('2026-10-07', -7), '2026-09-30');

assert.equal(dayTextColor({ weekday: 0, holiday: false, selected: false, disabled: false }), HOLIDAY_RED);
assert.equal(dayTextColor({ weekday: 6, holiday: false, selected: false, disabled: false }), HOLIDAY_RED);
assert.equal(dayTextColor({ weekday: 1, holiday: true, selected: false, disabled: false }), HOLIDAY_RED);
assert.equal(dayTextColor({ weekday: 3, holiday: false, selected: true, disabled: false }), '#FFFFFF');
assert.equal(dayTextColor({ weekday: 0, holiday: true, selected: false, disabled: true }), '#D0D5DD');
assert.equal(dayTextColor({ weekday: 3, holiday: false, selected: false, disabled: false }), '#1A1D1F');

console.log('korean picker ok');
