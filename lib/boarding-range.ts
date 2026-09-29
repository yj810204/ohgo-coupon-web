import { KST_OFFSET, getTodayDate } from '@/lib/kst-date';

export const BOARDING_RANGE_MAX_DAYS = 400;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type BoardingDateRange = { startDate: string; endDate: string };

export type BoardingTrip = {
  date: string;
  tripNumber: number;
  /** trips/{date}.trip{n}.confirmed */
  confirmed: boolean;
  /** attendance/{date}.confirmedMembers[n] 가 있으면 true. 예전 확정분은 명단이 없을 수 있다. */
  hasMemberList: boolean;
  memberIds: string[];
};

export type MemberRangeSummary = {
  id: string;
  name: string;
  boardings: number;
  stamps: number;
  tripCredited: number;
  trips: { date: string; tripNumber: number }[];
};

export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function normalizeRange(
  startDate: string,
  endDate: string
): { ok: true; range: BoardingDateRange } | { ok: false; message: string } {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    return { ok: false, message: '시작일과 종료일을 입력해 주세요.' };
  }
  if (startDate > endDate) {
    return { ok: false, message: '시작일이 종료일보다 늦습니다.' };
  }
  if (countDays(startDate, endDate) > BOARDING_RANGE_MAX_DAYS) {
    return { ok: false, message: `기간은 최대 ${BOARDING_RANGE_MAX_DAYS}일까지 조회할 수 있습니다.` };
  }
  return { ok: true, range: { startDate, endDate } };
}

/** 시작일 00:00 KST ~ 종료일 23:59:59.999 KST */
export function kstRangeInstants(range: BoardingDateRange): { start: Date; end: Date } {
  return {
    start: new Date(`${range.startDate}T00:00:00${KST_OFFSET}`),
    end: new Date(`${range.endDate}T23:59:59.999${KST_OFFSET}`),
  };
}

export function isDateInRange(date: string | null | undefined, range: BoardingDateRange): boolean {
  if (!date) return false;
  return date >= range.startDate && date <= range.endDate;
}

export function isInstantInRange(instant: Date, range: BoardingDateRange): boolean {
  return isDateInRange(getTodayDate(instant), range);
}

/** 달력 날짜만 다루므로 UTC 기준으로 하루씩 더한다 (서버 TZ 영향 없음). */
export function eachDateInRange(range: BoardingDateRange): string[] {
  const out: string[] = [];
  const cur = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function countDays(startDate: string, endDate: string): number {
  const a = Date.parse(`${startDate}T00:00:00Z`);
  const b = Date.parse(`${endDate}T00:00:00Z`);
  return Math.floor((b - a) / 86_400_000) + 1;
}

function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export type RangePresetId = 'this-month' | 'last-month' | 'this-year';

export const RANGE_PRESETS: { id: RangePresetId; label: string }[] = [
  { id: 'this-month', label: '이번 달' },
  { id: 'last-month', label: '지난달' },
  { id: 'this-year', label: '올해' },
];

export function rangePreset(id: RangePresetId, now: Date = new Date()): BoardingDateRange {
  const today = getTodayDate(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (id === 'this-year') {
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  }
  if (id === 'last-month') {
    const y = month === 1 ? year - 1 : year;
    const m = month === 1 ? 12 : month - 1;
    return { startDate: `${y}-${pad(m)}-01`, endDate: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}` };
  }
  return {
    startDate: `${year}-${pad(month)}-01`,
    endDate: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
  };
}

/** `tripCredited_{date}_{trip}` 마커 중 기간 안의 것만 센다. */
export function countTripCreditedInRange(
  userData: Record<string, unknown> | null | undefined,
  range: BoardingDateRange
): number {
  if (!userData) return 0;
  let n = 0;
  for (const [key, value] of Object.entries(userData)) {
    const m = /^tripCredited_(\d{4}-\d{2}-\d{2})_(\d+)$/.exec(key);
    if (!m) continue;
    if (!(value === true || value === 'true' || value === 1)) continue;
    if (isDateInRange(m[1], range)) n += 1;
  }
  return n;
}

export function parseAttendanceTrips(
  date: string,
  attendance: Record<string, unknown> | null | undefined,
  tripsDoc: Record<string, unknown> | null | undefined
): BoardingTrip[] {
  const byTrip = new Map<number, BoardingTrip>();
  const confirmed = attendance?.confirmedMembers;
  if (confirmed && typeof confirmed === 'object') {
    for (const [key, value] of Object.entries(confirmed as Record<string, unknown>)) {
      const tripNumber = Number(key);
      if (!Number.isFinite(tripNumber) || tripNumber <= 0 || !Array.isArray(value)) continue;
      byTrip.set(tripNumber, {
        date,
        tripNumber,
        confirmed: false,
        hasMemberList: true,
        memberIds: [...new Set(value.map(String).filter(Boolean))],
      });
    }
  }
  if (tripsDoc) {
    for (let n = 1; n <= 3; n += 1) {
      const t = tripsDoc[`trip${n}`] as { confirmed?: unknown } | undefined;
      if (!t?.confirmed) continue;
      const row = byTrip.get(n);
      if (row) row.confirmed = true;
      else byTrip.set(n, { date, tripNumber: n, confirmed: true, hasMemberList: false, memberIds: [] });
    }
  }
  return [...byTrip.values()].sort((a, b) => a.tripNumber - b.tripNumber);
}

export function sortTripsDesc(trips: BoardingTrip[]): BoardingTrip[] {
  return [...trips].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.tripNumber - a.tripNumber;
  });
}

/**
 * 확정 명단 기준 회원별 승선 횟수. `canonicalOf` 로 병합된 옛 계정을 실계정에 합친다.
 * 같은 날 같은 항차에 두 id 가 한 사람이면 한 번만 센다.
 */
export function summarizeMembers(input: {
  trips: BoardingTrip[];
  canonicalOf: (id: string) => string;
  nameOf: (id: string) => string;
  stampsOf: (id: string) => number;
  tripCreditedOf: (id: string) => number;
}): MemberRangeSummary[] {
  const map = new Map<string, MemberRangeSummary>();
  for (const trip of input.trips) {
    const seen = new Set<string>();
    for (const rawId of trip.memberIds) {
      const id = input.canonicalOf(rawId);
      if (seen.has(id)) continue;
      seen.add(id);
      let row = map.get(id);
      if (!row) {
        row = {
          id,
          name: input.nameOf(id),
          boardings: 0,
          stamps: input.stampsOf(id),
          tripCredited: input.tripCreditedOf(id),
          trips: [],
        };
        map.set(id, row);
      }
      row.boardings += 1;
      row.trips.push({ date: trip.date, tripNumber: trip.tripNumber });
    }
  }
  return [...map.values()].sort(
    (a, b) => b.boardings - a.boardings || a.name.localeCompare(b.name, 'ko')
  );
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 엑셀에서 한글이 깨지지 않도록 BOM 을 붙인다. */
export function buildBoardingCsv(input: {
  range: BoardingDateRange;
  trips: BoardingTrip[];
  members: MemberRangeSummary[];
  nameOf: (id: string) => string;
  canonicalOf: (id: string) => string;
}): string {
  const lines: string[] = [];
  lines.push(['기간', `${input.range.startDate} ~ ${input.range.endDate}`].map(csvCell).join(','));
  lines.push('');
  lines.push(['회원', '승선 횟수', '기간 내 스탬프', '승선일수 반영'].map(csvCell).join(','));
  for (const m of input.members) {
    lines.push([m.name, m.boardings, m.stamps, m.tripCredited].map(csvCell).join(','));
  }
  lines.push('');
  lines.push(['날짜', '항차', '인원', '승선자'].map(csvCell).join(','));
  for (const t of input.trips) {
    const names = [...new Set(t.memberIds.map(input.canonicalOf))].map(input.nameOf);
    lines.push(
      [t.date, `${t.tripNumber}항차`, t.hasMemberList ? names.length : '명단 없음', names.join(' / ')]
        .map(csvCell)
        .join(',')
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
