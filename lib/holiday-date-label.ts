import { DAY_LABELS, dayTextColor, isDateValue, weekdayIndex } from '@/lib/korean-picker';
import { HOLIDAY_RED, shortHolidayName } from '@/lib/kr-holidays';

export function holidayShortLabel(holidayName?: string | null): string {
  const name = holidayName?.trim() ?? '';
  return name ? shortHolidayName(name) : '';
}

export function formatMonthDay(date: string): string {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return `${month}월 ${day}일`;
}

export function formatWeekdayParen(date: string): string {
  if (!isDateValue(date)) return '';
  return `(${DAY_LABELS[weekdayIndex(date)]})`;
}

/** "10월 9일 (금)" 또는 "10월 9일 (금) 한글날". 섹션 제목에는 넣지 않는다. */
export function formatHolidayDateLine(date: string, holidayName?: string | null): string {
  const base = `${formatMonthDay(date)} ${formatWeekdayParen(date)}`.trim();
  const holiday = holidayShortLabel(holidayName);
  return holiday ? `${base} ${holiday}` : base;
}

/**
 * 토, 일, 공휴일은 HOLIDAY_RED.
 * 평일은 카드에 쓰던 plainColor 를 그대로 둔다.
 */
export function holidayDateTextColor(
  date: string,
  holidayName: string | null | undefined,
  plainColor: string,
): string {
  if (!isDateValue(date)) return plainColor;
  const color = dayTextColor({
    weekday: weekdayIndex(date),
    holiday: Boolean(holidayName?.trim()),
    selected: false,
    disabled: false,
  });
  return color === HOLIDAY_RED ? HOLIDAY_RED : plainColor;
}
