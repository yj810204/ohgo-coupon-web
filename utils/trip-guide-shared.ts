export interface TripGuide {
  id: string;
  date: string;
  destination: string;
  departureTime: string;
  returnTime?: string;
  species?: string;
  capacity?: number;
  price?: number;
  notes?: string;
  contact?: string;
  createdAt?: Date | string;
}

export type TripGuideInput = Omit<TripGuide, 'id' | 'createdAt'>;

/** Firestore/Supabase 공통 — undefined 필드 제외 */
export function omitUndefinedFields<T extends object>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export function tripDateToStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isPastTripDate(dateStr: string, todayStr = tripDateToStr()): boolean {
  return dateStr < todayStr;
}

export function tripDepartureDateTime(dateStr: string, departureTime: string): Date | null {
  const m = departureTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function tripDepartureTimestamp(trip: Pick<TripGuide, 'date' | 'departureTime'>): number {
  const d = tripDepartureDateTime(trip.date, trip.departureTime);
  return d?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

export function sortTripsByNearestDeparture<T extends Pick<TripGuide, 'date' | 'departureTime'>>(
  trips: T[],
  now: Date = new Date(),
): T[] {
  const nowMs = now.getTime();
  return [...trips].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    const diff =
      Math.abs(tripDepartureTimestamp(a) - nowMs) - Math.abs(tripDepartureTimestamp(b) - nowMs);
    if (diff !== 0) return diff;
    return tripDepartureTimestamp(a) - tripDepartureTimestamp(b);
  });
}

export function isPastTripSchedule(
  dateStr: string,
  departureTime?: string,
  todayStr = tripDateToStr(),
  now: Date = new Date(),
): boolean {
  if (dateStr < todayStr) return true;
  if (dateStr > todayStr) return false;
  if (!departureTime?.trim()) return false;
  const dep = tripDepartureDateTime(dateStr, departureTime);
  if (!dep) return false;
  return now.getTime() >= dep.getTime();
}

export function getWeekRange(anchor: Date = new Date()): {
  start: Date;
  end: Date;
  monday: Date;
  sunday: Date;
} {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  const diffToMon = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday, monday, sunday };
}

export function getWeekDayDates(anchor: Date = new Date()): string[] {
  const { monday } = getWeekRange(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    return tripDateToStr(dt);
  });
}

export function formatWeekRangeLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.getFullYear()}.${fmt(start)}~${end.getFullYear()}.${fmt(end)}`;
  }
  return `${fmt(start)}~${fmt(end)}`;
}

export function isSameWeek(a: Date, b: Date): boolean {
  return tripDateToStr(getWeekRange(a).monday) === tripDateToStr(getWeekRange(b).monday);
}

export function isInOpenWeek(dateStr: string, today: Date = new Date()): boolean {
  const { monday, sunday } = getWeekRange(today);
  const start = tripDateToStr(monday);
  const end = tripDateToStr(sunday);
  return dateStr >= start && dateStr <= end;
}

export function isTripDateViewable(dateStr: string, todayStr = tripDateToStr()): boolean {
  return isInOpenWeek(dateStr, new Date(`${todayStr}T12:00:00`)) || isPastTripDate(dateStr, todayStr);
}

function daysFromToday(dateStr: string, todayStr: string): number {
  const todayMs = new Date(`${todayStr}T12:00:00`).getTime();
  const targetMs = new Date(`${dateStr}T12:00:00`).getTime();
  return Math.round((targetMs - todayMs) / 86400000);
}

export type TripScheduleDateBadgeVariant = 'past' | 'today' | 'future';

export function getTripScheduleDateBadge(
  dateStr: string,
  todayStr = tripDateToStr(),
  departureTime?: string,
): { label: string; variant: TripScheduleDateBadgeVariant } | null {
  if (isPastTripSchedule(dateStr, departureTime, todayStr)) {
    return { label: '지난 일정', variant: 'past' };
  }
  const diff = daysFromToday(dateStr, todayStr);
  if (diff > 5) return null;
  if (diff === 0) return { label: '오늘', variant: 'today' };
  if (diff === 1) return { label: '내일', variant: 'future' };
  if (diff === 2) return { label: '모레', variant: 'future' };
  return { label: `+${diff}일`, variant: 'future' };
}

export function tripCalendarDayNumberColor(
  col: number,
  opts: { isToday: boolean; isSelected: boolean; isMuted: boolean },
): string {
  const isSun = col === 0;
  const isSat = col === 6;
  const { isToday, isSelected, isMuted } = opts;
  if (isToday) return '#FFFFFF';
  if (isSelected) {
    if (isMuted) {
      if (isSun) return '#E85C5C';
      if (isSat) return '#5B9FE8';
      return '#6F767E';
    }
    return '#1B6FF5';
  }
  if (isMuted) {
    if (isSun) return '#FF8A84';
    if (isSat) return '#7EB3F7';
    return '#9A9FA5';
  }
  if (isSun) return '#FF3B30';
  if (isSat) return '#1B6FF5';
  return '#1A1D1F';
}

export function tripCalendarDotColor(
  col: number,
  opts: { isToday: boolean; isMuted: boolean },
): string {
  const { isToday, isMuted } = opts;
  if (isToday) return '#FFCC00';
  if (!isMuted) return '#1B6FF5';
  if (col === 0) return '#FFB4B0';
  if (col === 6) return '#A8C9F7';
  return '#C5C8CD';
}

export function tripWeekdayNumberColor(dayIdx: number, isMuted: boolean): string {
  if (isMuted) {
    if (dayIdx === 0) return '#FF8A84';
    if (dayIdx === 6) return '#7EB3F7';
    return '#9A9FA5';
  }
  if (dayIdx === 0) return '#FF3B30';
  if (dayIdx === 6) return '#1B6FF5';
  return '#1A1D1F';
}

export function tripWeekdayLabelColor(dayIdx: number, isMuted: boolean): string {
  if (isMuted) {
    if (dayIdx === 0) return '#FF8A84';
    if (dayIdx === 6) return '#7EB3F7';
    return '#9A9FA5';
  }
  if (dayIdx === 0) return '#FF3B30';
  if (dayIdx === 6) return '#1B6FF5';
  return '#6F767E';
}
