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

export type HolidayDateParts = {
  /** "10월 9일 (금)" */
  dateLine: string;
  /** "한글날". 공휴일이 아니면 빈 문자열 */
  holidayLine: string;
};

/** 카드 안 날짜. 공휴일 이름은 다음 줄이다. */
export function holidayDateParts(date: string, holidayName?: string | null): HolidayDateParts {
  return {
    dateLine: `${formatMonthDay(date)} ${formatWeekdayParen(date)}`.trim(),
    holidayLine: holidayShortLabel(holidayName),
  };
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
