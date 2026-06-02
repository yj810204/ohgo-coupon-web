import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  updateDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface TripGuide {
  id: string;
  date: string;           // YYYY-MM-DD
  destination: string;    // 목적지
  departureTime: string;  // 출발 시간 (HH:mm)
  returnTime?: string;    // 귀항 예정 시간
  species?: string;       // 목표 어종 (참돔, 광어 등)
  capacity?: number;      // 정원
  price?: number;         // 1인 요금
  notes?: string;         // 비고 / 상세내용
  contact?: string;       // 예약 연락처
  createdAt: Timestamp | Date;
}

export type TripGuideInput = Omit<TripGuide, 'id' | 'createdAt'>;

const COL = 'tripGuides';

/** 특정 연월의 출조 목록 가져오기 (YYYY-MM prefix) */
export async function getTripsByMonth(yearMonth: string): Promise<TripGuide[]> {
  const start = `${yearMonth}-01`;
  const end = `${yearMonth}-32`; // 넉넉하게
  const q = query(
    collection(db, COL),
    where('date', '>=', start),
    where('date', '<=', end),
    orderBy('date', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as TripGuide));
}

/** 전체 출조 목록 */
export async function getAllTrips(): Promise<TripGuide[]> {
  const q = query(collection(db, COL), orderBy('date', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as TripGuide));
}

/** 출조 등록 */
export async function addTrip(input: TripGuideInput): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...input,
    createdAt: Timestamp.now(),
  });
  return ref.id;
}

/** 출조 수정 */
export async function updateTrip(id: string, input: Partial<TripGuideInput>): Promise<void> {
  await updateDoc(doc(db, COL, id), input);
}

/** 출조 삭제 */
export async function deleteTrip(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

/** 오늘 날짜 YYYY-MM-DD (로컬) */
export function tripDateToStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 출조일이 오늘 이전이면 true */
export function isPastTripDate(dateStr: string, todayStr = tripDateToStr()): boolean {
  return dateStr < todayStr;
}

/** 월요일 00:00 ~ 일요일 23:59:59 (로컬, anchor가 속한 주) */
export function getWeekRange(anchor: Date = new Date()): { start: Date; end: Date; monday: Date; sunday: Date } {
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

/** 해당 주 월~일 YYYY-MM-DD (7일) */
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

/** 기간 내 출조 목록 (YYYY-MM-DD) */
export async function getTripsInDateRange(startDate: string, endDate: string): Promise<TripGuide[]> {
  const q = query(
    collection(db, COL),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as TripGuide));
}

export function isSameWeek(a: Date, b: Date): boolean {
  return tripDateToStr(getWeekRange(a).monday) === tripDateToStr(getWeekRange(b).monday);
}

/** 오늘이 속한 주(월~일) 안의 날짜 — 이번 주에만 일정 열람 */
export function isInOpenWeek(dateStr: string, today: Date = new Date()): boolean {
  const { monday, sunday } = getWeekRange(today);
  const start = tripDateToStr(monday);
  const end = tripDateToStr(sunday);
  return dateStr >= start && dateStr <= end;
}

/** 달력에서 상세·목록 조회 가능: 이번 주(월~일) 또는 지난 일정 */
export function isTripDateViewable(dateStr: string, todayStr = tripDateToStr()): boolean {
  return isInOpenWeek(dateStr, new Date(`${todayStr}T12:00:00`)) || isPastTripDate(dateStr, todayStr);
}

function daysFromToday(dateStr: string, todayStr: string): number {
  const todayMs = new Date(`${todayStr}T12:00:00`).getTime();
  const targetMs = new Date(`${dateStr}T12:00:00`).getTime();
  return Math.round((targetMs - todayMs) / 86400000);
}

export type TripScheduleDateBadgeVariant = 'past' | 'today' | 'future';

/** 출조 일정 제목 옆 날짜 배지 (지난 일정 / 오늘 / 내일 / 모레 / +3~+5일, +6일 이후 없음) */
export function getTripScheduleDateBadge(
  dateStr: string,
  todayStr = tripDateToStr()
): { label: string; variant: TripScheduleDateBadgeVariant } | null {
  if (dateStr < todayStr) {
    return { label: '지난 일정', variant: 'past' };
  }
  const diff = daysFromToday(dateStr, todayStr);
  if (diff > 5) return null;
  if (diff === 0) return { label: '오늘', variant: 'today' };
  if (diff === 1) return { label: '내일', variant: 'future' };
  if (diff === 2) return { label: '모레', variant: 'future' };
  return { label: `+${diff}일`, variant: 'future' };
}

/** 달력 열 index: 0=일요일 … 6=토요일 */
export function tripCalendarDayNumberColor(
  col: number,
  opts: { isToday: boolean; isSelected: boolean; isMuted: boolean }
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
  opts: { isToday: boolean; isMuted: boolean }
): string {
  const { isToday, isMuted } = opts;
  if (isToday) return '#FFCC00';
  if (!isMuted) return '#1B6FF5';
  if (col === 0) return '#FFB4B0';
  if (col === 6) return '#A8C9F7';
  return '#C5C8CD';
}

/** 리스트·요약용 요일 숫자 색 (0=일 … 6=토) */
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
