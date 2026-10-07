import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isValid,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { HOLIDAY_RED } from '@/lib/kr-holidays';
import { getTodayDate } from '@/lib/kst-date';

export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const DATETIME_LOCAL_RE = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)/;

export type DayPeriod = '오전' | '오후';

export type MonthCell = {
  date: string;
  day: number;
  weekday: number;
} | null;

export function isDateValue(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = parseISO(value);
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value;
}

export function isTimeValue(value: string): boolean {
  return TIME_RE.test(value);
}

export function isDateTimeLocalValue(value: string): boolean {
  const match = value.match(DATETIME_LOCAL_RE);
  if (!match) return false;
  return isDateValue(match[1]) && isTimeValue(`${match[2]}:${match[3]}`);
}

export function compareYmd(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function isDateDisabled(date: string, min?: string, max?: string): boolean {
  if (!isDateValue(date)) return true;
  if (min && isDateValue(min) && compareYmd(date, min) < 0) return true;
  if (max && isDateValue(max) && compareYmd(date, max) > 0) return true;
  return false;
}

export function weekdayIndex(date: string): number {
  return getDay(parseISO(date));
}

export function formatKoreanDateLabel(value: string): string {
  if (!isDateValue(value)) return '';
  const parsed = parseISO(value);
  const week = DAY_LABELS[getDay(parsed)];
  return `${format(parsed, 'yyyy년 M월 d일')} (${week})`;
}

export function to12Hour(hour24: number): { period: DayPeriod; hour12: number } {
  const period: DayPeriod = hour24 < 12 ? '오전' : '오후';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { period, hour12 };
}

export function to24Hour(period: DayPeriod, hour12: number): number {
  if (hour12 < 1 || hour12 > 12) return 0;
  if (period === '오전') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

export function formatTimeValue(hour24: number, minute: number): string {
  const hour = Math.min(23, Math.max(0, hour24));
  const min = Math.min(59, Math.max(0, minute));
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function parseTimeValue(value: string): { hour: number; minute: number } | null {
  const match = value.match(TIME_RE);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function formatKoreanTimeLabel(value: string): string {
  const parsed = parseTimeValue(value);
  if (!parsed) return '';
  const { period, hour12 } = to12Hour(parsed.hour);
  return `${period} ${hour12}:${String(parsed.minute).padStart(2, '0')}`;
}

export function splitDateTimeLocal(value: string): { date: string; time: string } {
  const match = value.match(DATETIME_LOCAL_RE);
  if (!match || !isDateValue(match[1])) return { date: '', time: '' };
  return { date: match[1], time: `${match[2]}:${match[3]}` };
}

export function joinDateTimeLocal(date: string, time: string): string {
  if (!isDateValue(date) || !isTimeValue(time)) return '';
  return `${date}T${time}`;
}

export function formatKoreanDateTimeLabel(value: string): string {
  const parts = splitDateTimeLocal(value);
  if (!parts.date || !parts.time) return '';
  return `${formatKoreanDateLabel(parts.date)} ${formatKoreanTimeLabel(parts.time)}`;
}

export function todayDate(now: Date = new Date()): string {
  return getTodayDate(now);
}

export function buildMonthCells(viewMonth: Date): MonthCell[] {
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const cells: MonthCell[] = Array.from({ length: getDay(monthStart) }, () => null);
  for (const day of days) {
    cells.push({
      date: format(day, 'yyyy-MM-dd'),
      day: day.getDate(),
      weekday: getDay(day),
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function shiftMonth(viewMonth: Date, delta: number): Date {
  return delta >= 0 ? addMonths(viewMonth, delta) : subMonths(viewMonth, Math.abs(delta));
}

export function shiftDate(date: string, deltaDays: number): string {
  if (!isDateValue(date)) return date;
  return format(addDays(parseISO(date), deltaDays), 'yyyy-MM-dd');
}

export function monthTitle(viewMonth: Date): string {
  return format(viewMonth, 'yyyy년 M월');
}

export function initialViewMonth(value: string, now: Date = new Date()): Date {
  if (isDateValue(value)) return parseISO(value);
  const today = todayDate(now);
  return isDateValue(today) ? parseISO(today) : startOfMonth(now);
}

export function dayTextColor(input: {
  weekday: number;
  holiday: boolean;
  selected: boolean;
  disabled: boolean;
}): string {
  if (input.disabled) return '#D0D5DD';
  if (input.selected) return '#FFFFFF';
  if (input.weekday === 0 || input.weekday === 6 || input.holiday) return HOLIDAY_RED;
  return '#1A1D1F';
}

export const HOUR12_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const hour = i + 1;
  return { value: String(hour), label: String(hour) };
});

export const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, minute) => ({
  value: String(minute).padStart(2, '0'),
  label: String(minute).padStart(2, '0'),
}));

export const PERIOD_OPTIONS: { value: DayPeriod; label: DayPeriod }[] = [
  { value: '오전', label: '오전' },
  { value: '오후', label: '오후' },
];
