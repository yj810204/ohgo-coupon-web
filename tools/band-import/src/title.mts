import { FISH_SPECIES } from './trip-parse.mts';

const WEEKDAY = '\\s*\\([월화수목금토일]\\)';
const DAY_DATE = `(?:\\d{1,2}월\\s*)?\\d{1,2}일(?:${WEEKDAY})?`;
const SLASH_DATE = `\\d{1,2}[./]\\d{1,2}${WEEKDAY}`;
const LEAD_DATE = new RegExp(`^(${DAY_DATE}|${SLASH_DATE})(?=[^\\s.,!?~()\\]간차째동])`);
const LEAD_DATE_WORD = new RegExp(`^(?:오늘|금일|내일|명일|모레)\\s*(?=${DAY_DATE}|${SLASH_DATE})`);
const MID_WEEKDAY_DATE = new RegExp(`((?:\\d{1,2}월\\s*)?\\d{1,2}일${WEEKDAY})(?=[^\\s.,!?~)\\]])`, 'g');
const EVENT_WEEK = /\s*이벤트\s*(\d+)\s*주차\s*/g;
const SPECIES = [...FISH_SPECIES].sort((a, b) => b.length - a.length).join('|');
const SPECIES_REPORT = new RegExp(`(?:${SPECIES})\\s*(?:조황|조과)`, 'g');
const TRAILING_IS = /(\S)(입니다[.!~]*)$/;

/**
 * Band 제목에서 붙어 있는 덩어리를 띄우고 맨 앞의 "오늘/내일" 같은 날짜 말을 뺀다.
 * 예: "오늘6일(화)이벤트4주차감성돔조황입니다." -> "6일(화) 이벤트4주차 감성돔조황 입니다."
 */
export function normalizeTitle(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim();
  t = t.replace(LEAD_DATE_WORD, '');
  t = t.replace(LEAD_DATE, '$1 ');
  t = t.replace(MID_WEEKDAY_DATE, '$1 ');
  t = t.replace(EVENT_WEEK, (_m, n: string) => ` 이벤트${n}주차 `);
  t = t.replace(SPECIES_REPORT, (m: string, at: number, s: string) => (at > 0 && !/\s/.test(s[at - 1]) ? ` ${m}` : m));
  t = t.trim().replace(TRAILING_IS, '$1 $2');
  return t
    .replace(/\s+([.,!?~)\]])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
