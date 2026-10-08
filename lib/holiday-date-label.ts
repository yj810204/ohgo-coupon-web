import { DAY_LABELS, dayTextColor, isDateValue, weekdayIndex } from '@/lib/korean-picker';
import { HOLIDAY_RED, shortHolidayName } from '@/lib/kr-holidays';

export type TideTitleParts = {
  /** "10월 9일" 또는 "오늘의 물때" */
  lead: string;
  /** 날짜 제목일 때만 "물때" */
  suffix: string;
  /** 짧은 공휴일 이름. 없으면 빈 문자열 */
  holiday: string;
  /** 토, 일, 공휴일이면 날짜 부분을 빨간색으로 */
  accentLead: boolean;
};

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

/** "10월 9일 (금)" 또는 "10월 9일 (금) 한글날" */
export function formatHolidayDateLine(date: string, holidayName?: string | null): string {
  const base = `${formatMonthDay(date)} ${formatWeekdayParen(date)}`.trim();
  const holiday = holidayShortLabel(holidayName);
  return holiday ? `${base} ${holiday}` : base;
}

export function tideSectionTitleParts(
  date: string,
  today: string,
  holidayName?: string | null,
): TideTitleParts {
  const holiday = holidayShortLabel(holidayName);
  const isToday = date === today;
  const accentLead =
    !isToday && holidayDateTextColor(date, holidayName, '#1A1D1F') === HOLIDAY_RED;
  return {
    lead: isToday ? '오늘의 물때' : formatMonthDay(date),
    suffix: isToday ? '' : '물때',
    holiday,
    accentLead,
  };
}

/** "10월 9일 물때", 공휴일이면 "10월 9일 물때 한글날". 오늘이면 "오늘의 물때". */
export function formatTideSectionTitle(date: string, today: string, holidayName?: string | null): string {
  const parts = tideSectionTitleParts(date, today, holidayName);
  return [parts.lead, parts.suffix, parts.holiday].filter(Boolean).join(' ');
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
