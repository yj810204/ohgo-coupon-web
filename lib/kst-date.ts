/** 스탬프·쿠폰 등 영업일 기준 캘린더. 서버 TZ(UTC)와 무관하게 Asia/Seoul. */
export const BUSINESS_TIME_ZONE = 'Asia/Seoul';
export const KST_OFFSET = '+09:00';

/** 주어진 시각의 Asia/Seoul 캘린더 날짜 (YYYY-MM-DD). */
export function getTodayDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** YYYY-MM-DD를 KST 자정 Instant로 해석한다. */
export function parseKstDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00${KST_OFFSET}`);
}

/** Asia/Seoul 당일 00:00:00–23:59:59.999 (UTC Instant). */
export function getTodayRange(now: Date = new Date()): { start: Date; end: Date } {
  const dateStr = getTodayDate(now);
  const start = parseKstDate(dateStr);
  const end = new Date(`${dateStr}T23:59:59.999${KST_OFFSET}`);
  return { start, end };
}
