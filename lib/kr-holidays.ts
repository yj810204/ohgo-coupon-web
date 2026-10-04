import fallbackData from './kr-holidays-fallback.json' with { type: 'json' };

export type KrHoliday = { date: string; name: string };

/** 'YYYY-MM-DD' -> 공휴일 이름 (같은 날 여러 개면 ", " 로 합침) */
export type KrHolidayMap = Record<string, string>;

export type KrHolidaySource = 'kasi' | 'stored' | 'fallback' | 'none';

export type KrHolidayYearPayload = {
  year: number;
  holidays: KrHoliday[];
  source: KrHolidaySource;
  fetchedAt: string | null;
};

export const HOLIDAY_RED = '#FF3B30';

export const HOLIDAY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const FALLBACK = fallbackData as Record<string, KrHoliday[]>;

export function fallbackHolidays(year: number): KrHoliday[] | null {
  const list = FALLBACK[String(year)];
  return list ? list.map((h) => ({ ...h })) : null;
}

export function fallbackYears(): number[] {
  return Object.keys(FALLBACK).map(Number).sort((a, b) => a - b);
}

/** 같은 날짜 이름을 합치고 날짜순 정렬 */
export function mergeHolidays(items: KrHoliday[]): KrHoliday[] {
  const byDate = new Map<string, string[]>();
  for (const item of items) {
    if (!HOLIDAY_DATE_RE.test(item.date)) continue;
    const names = byDate.get(item.date) ?? [];
    for (const part of item.name.split(',')) {
      const name = part.trim();
      if (name && !names.includes(name)) names.push(name);
    }
    byDate.set(item.date, names);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, names]) => ({ date, name: names.join(', ') }));
}

export function holidaysToMap(items: KrHoliday[]): KrHolidayMap {
  const map: KrHolidayMap = {};
  for (const item of mergeHolidays(items)) map[item.date] = item.name;
  return map;
}

const SHORT_NAMES: Record<string, string> = {
  '1월1일': '신정',
  '기독탄신일': '성탄절',
  '대체공휴일': '대체휴일',
  '임시공휴일': '임시휴일',
  '전국동시지방선거': '지방선거',
  '대통령선거': '대선',
  '국회의원선거': '총선',
};

function shortSingleName(raw: string): string {
  const name = raw.trim();
  const compact = name.replace(/\s+/g, '').replace(/\(.*?\)/g, '');
  if (SHORT_NAMES[compact]) return SHORT_NAMES[compact];
  if (compact.includes('지방선거')) return '지방선거';
  if (compact.includes('대통령')) return '대선';
  if (compact.includes('국회의원')) return '총선';
  return name;
}

/** 달력 칸에 들어갈 짧은 이름. 전체 이름은 title/aria-label 로 노출한다. */
export function shortHolidayName(name: string): string {
  const parts = name
    .split(',')
    .map((p) => shortSingleName(p))
    .filter(Boolean);
  return [...new Set(parts)].join(', ');
}
