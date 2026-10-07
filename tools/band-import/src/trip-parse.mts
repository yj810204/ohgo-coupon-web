import type { ExtractedPost } from './schema.mts';

const KST_OFFSET_MS = 9 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export type TripDraft = {
  /** YYYY-MM-DD. 여러 날이면 날마다 한 건씩 등록한다 */
  dates: string[];
  destination: string;
  /** HH:MM */
  departureTime: string;
  returnTime: string;
  species: string;
  capacity: number | null;
  price: number | null;
  contact: string;
  notes: string;
};

export type TripParse = {
  draft: TripDraft;
  /** 필수인데 찾지 못한 칸 이름 */
  missing: string[];
  /** 운영자에게 보여 줄 참고 문구 */
  hints: string[];
};

export const TRIP_REQUIRED_LABELS = { dates: '날짜', destination: '목적지', departureTime: '출항 시간' } as const;

export const FISH_SPECIES = [
  '갑오징어', '무늬오징어', '한치', '쭈꾸미', '주꾸미', '문어', '갈치', '참돔', '감성돔', '벵에돔', '돌돔', '광어',
  '우럭', '농어', '도다리', '가자미', '참가자미', '볼락', '열기', '삼치', '방어', '부시리', '고등어', '전갱이',
  '전어', '민어', '대구', '붉바리', '능성어', '쏨뱅이', '노래미', '백조기', '보구치', '숭어', '학꽁치',
];

export function kstDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function kstTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + KST_OFFSET_MS).toISOString().slice(11, 16);
}

function ymd(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 연도 없는 날짜: 기준일 해의 날짜가 기준일보다 60일 넘게 이전이면 다음 해로 본다 */
function withYear(ref: string, m: number, d: number): string | null {
  const year = Number(ref.slice(0, 4));
  const same = ymd(year, m, d);
  if (!same) return null;
  if (Date.parse(same) < Date.parse(ref) - 60 * DAY_MS) return ymd(year + 1, m, d);
  return same;
}

export type FoundDate = { date: string; index: number };

/** 본문에서 날짜를 찾는다. ref는 게시일(KST, YYYY-MM-DD) */
export function findDates(text: string, ref: string): FoundDate[] {
  const found: FoundDate[] = [];
  let masked = text;
  const take = (re: RegExp, toDate: (m: RegExpExecArray) => string | null) => {
    for (const m of masked.matchAll(re)) {
      const date = toDate(m as RegExpExecArray);
      if (date) found.push({ date, index: m.index! });
      masked = masked.slice(0, m.index!) + ' '.repeat(m[0].length) + masked.slice(m.index! + m[0].length);
    }
  };
  take(/(20\d{2})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})\s*일?/g, (m) => ymd(+m[1], +m[2], +m[3]));
  take(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g, (m) => withYear(ref, +m[1], +m[2]));
  take(/(?<![\d./])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/:])/g, (m) => withYear(ref, +m[1], +m[2]));
  take(/(?<![\d./])(\d{1,2})\.(\d{1,2})\s*(?=\(\s*[월화수목금토일])/g, (m) => withYear(ref, +m[1], +m[2]));
  take(/오늘|내일|모레/g, (m) => addDays(ref, { 오늘: 0, 내일: 1, 모레: 2 }[m[0] as '오늘' | '내일' | '모레']));
  return found.sort((a, b) => a.index - b.index);
}

export type FoundTime = { time: string; index: number; end: number };

export function findTimes(line: string): FoundTime[] {
  const out: FoundTime[] = [];
  const re = /(오전|오후|새벽|아침|낮|저녁|밤)?\s*(?<![\d.:/])(\d{1,2})\s*(?::\s*(\d{2})|시(?![간작])\s*(?:(\d{1,2})\s*분|(반))?)/g;
  for (const m of line.matchAll(re)) {
    let hour = Number(m[2]);
    const minute = m[3] !== undefined ? Number(m[3]) : m[4] !== undefined ? Number(m[4]) : m[5] ? 30 : 0;
    if (hour > 24 || minute > 59) continue;
    const period = m[1];
    if ((period === '오후' || period === '저녁' || period === '밤') && hour < 12) hour += 12;
    if (period === '낮' && hour < 7) hour += 12;
    if (hour === 24) hour = 0;
    out.push({
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      index: m.index!,
      end: m.index! + m[0].length,
    });
  }
  return out;
}

const DEPART_WORDS = /출항|출조|출발/g;
/** 출항 시각이 없을 때만 쓴다 */
const GATHER_WORDS = /집결|승선|모임/g;
const RETURN_WORDS = /입항|귀항|철수|도착|종료|복귀|하선/g;

/** "출항 05:30"처럼 단어 뒤의 시각을 우선하고, "05:30 출항"처럼 앞의 시각은 가까울 때만 쓴다 */
function nearest(times: FoundTime[], positions: number[], used: Set<FoundTime>): FoundTime | null {
  let best: FoundTime | null = null;
  let bestDist = 14;
  for (const t of times) {
    if (used.has(t)) continue;
    for (const p of positions) {
      const dist = t.index >= p + 2 ? t.index - (p + 2) : p >= t.end ? (p - t.end) * 2 + 3 : 0;
      if (dist < bestDist) {
        best = t;
        bestDist = dist;
      }
    }
  }
  return best;
}

type Hit = { line: string; times: FoundTime[]; time: FoundTime };

function scanFor(lines: string[], words: RegExp, skip: (t: FoundTime, line: string) => boolean = () => false): Hit | null {
  for (const line of lines) {
    const times = findTimes(line);
    if (times.length === 0) continue;
    const positions = [...line.matchAll(words)].map((m) => m.index!);
    if (positions.length === 0) continue;
    const used = new Set(times.filter((t) => skip(t, line)));
    const time = nearest(times, positions, used);
    if (time) return { line, times, time };
  }
  return null;
}

export function findTripTimes(body: string): { departure: string | null; return: string | null } {
  const lines = body.split('\n');
  const dep = scanFor(lines, DEPART_WORDS) ?? scanFor(lines, GATHER_WORDS);
  const sameAsDep = (t: FoundTime, line: string) => !!dep && dep.line === line && dep.time.index === t.index;
  let ret = scanFor(lines, RETURN_WORDS, sameAsDep)?.time.time ?? null;
  // "출항 05:30 ~ 14:00" 처럼 출항 시각 바로 뒤에 물결표로 이어진 시각은 입항 예정으로 본다
  if (!ret && dep) {
    const next = dep.times[dep.times.indexOf(dep.time) + 1];
    if (next && /^\s*[~∼-]\s*$/.test(dep.line.slice(dep.time.end, next.index))) ret = next.time;
  }
  return { departure: dep?.time.time ?? null, return: ret };
}

function cleanValue(raw: string, max: number): string {
  const v = raw
    .split(/[,/|\n]|\s{2,}|\s(?=[가-힣]+\s*[:：])/)[0]
    .replace(/^[\s:：\-]+|[\s.,!~]+$/g, '')
    .trim();
  return v.length > max ? v.slice(0, max).trim() : v;
}

function labeled(body: string, label: RegExp, max: number): string {
  for (const line of body.split('\n')) {
    const m = label.exec(line);
    if (!m) continue;
    const value = cleanValue(line.slice(m.index + m[0].length), max);
    if (value) return value;
  }
  return '';
}

const DESTINATION_LABEL = /(?:출조\s*(?:지역|장소|지)|목적지|행선지|포인트|낚시\s*장소|어장)\s*(?:[:：]|은|는)?\s*/;
const SPECIES_LABEL = /(?:대상\s*어종|목표\s*어종|대상어|어종)\s*(?:[:：]|은|는)?\s*/;

export function findDestination(body: string, known: string[] = []): string {
  const fromLabel = labeled(body, DESTINATION_LABEL, 30);
  if (fromLabel) return fromLabel;
  const hits = known
    .map((name) => name.trim())
    .filter((name) => name.length >= 2)
    .map((name) => ({ name, index: body.indexOf(name) }))
    .filter((h) => h.index >= 0)
    .sort((a, b) => a.index - b.index || b.name.length - a.name.length);
  return hits[0]?.name ?? '';
}

export function findSpecies(body: string): string {
  const fromLabel = labeled(body, SPECIES_LABEL, 40);
  if (fromLabel) return fromLabel;
  const hits = FISH_SPECIES.map((name) => ({ name, index: body.indexOf(name) }))
    .filter((h) => h.index >= 0)
    .sort((a, b) => a.index - b.index);
  const names: string[] = [];
  for (const { name } of hits) {
    if (names.some((n) => n.includes(name) || name.includes(n))) continue;
    names.push(name);
    if (names.length === 3) break;
  }
  return names.join(', ');
}

export function findCapacity(body: string): number | null {
  const m =
    /(?:정원|인원|모집|선착순)\s*[:：]?\s*(?:최대\s*)?(\d{1,3})\s*(?:명|분|인)/.exec(body) ??
    /(\d{1,3})\s*(?:명|분|인)\s*(?:한정|모집|정원|까지)/.exec(body);
  const n = m ? Number(m[1]) : NaN;
  return n > 0 && n < 200 ? n : null;
}

export function findPrice(body: string): number | null {
  const m = /(?:선비|요금|비용|가격|회비|1인|1명|승선료)\s*[:：]?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(만\s*)?원/.exec(body);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, '')) * (m[2] ? 10000 : 1);
  return n >= 1000 && n < 10_000_000 ? Math.round(n) : null;
}

export function findContact(body: string): string {
  const m = /(?<!\d)(01[016789])[-.\s]?(\d{3,4})[-.\s]?(\d{4})(?!\d)/.exec(body);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

export function postRefDate(post: Pick<ExtractedPost, 'createdAt' | 'source'>): string {
  return kstDate(post.createdAt) ?? kstDate(post.source.fetchedAt) ?? new Date().toISOString().slice(0, 10);
}

/** 일정 글을 출조 안내(trip_guides) 입력값으로 바꾼다. knownDestinations는 앱에 이미 등록된 목적지 */
export function parseTripGuide(post: ExtractedPost, knownDestinations: string[] = []): TripParse {
  const ref = postRefDate(post);
  const body = post.body;
  const hints: string[] = [];

  const scheduleDates = [...new Set(post.schedules.map((s) => kstDate(s.startAt)).filter((d): d is string => !!d))];
  const textDates = [...new Set(findDates(body, ref).map((d) => d.date))];
  let dates: string[];
  if (scheduleDates.length) {
    dates = scheduleDates;
  } else {
    const upcoming = textDates.filter((d) => d >= ref);
    dates = upcoming.length ? [upcoming[0]] : textDates.slice(0, 1);
    const others = textDates.filter((d) => !dates.includes(d));
    if (others.length) hints.push(`다른 날짜 후보: ${others.join(', ')} (여러 날이면 날짜 칸에 쉼표로 추가하세요)`);
    if (dates.length && dates[0] < ref) hints.push(`찾은 날짜 ${dates[0]}가 게시일(${ref})보다 이전입니다. 확인하세요.`);
  }

  const times = findTripTimes(body);
  const timed = post.schedules.find((s) => s.isAllDay === false && s.startAt);
  const departureTime = times.departure ?? (timed ? kstTime(timed.startAt) : null) ?? '';
  const returnTime = times.return ?? (timed?.endAt ? kstTime(timed.endAt) : null) ?? '';

  const draft: TripDraft = {
    dates,
    destination: findDestination(body, knownDestinations),
    departureTime,
    returnTime: returnTime && returnTime !== departureTime ? returnTime : '',
    species: findSpecies(body),
    capacity: findCapacity(body),
    price: findPrice(body),
    contact: findContact(body),
    notes: body.length > 2000 ? `${body.slice(0, 1999)}…` : body,
  };
  return { draft, missing: missingTripFields(draft), hints };
}

export function missingTripFields(draft: TripDraft): string[] {
  const missing: string[] = [];
  if (draft.dates.length === 0) missing.push(TRIP_REQUIRED_LABELS.dates);
  if (!draft.destination.trim()) missing.push(TRIP_REQUIRED_LABELS.destination);
  if (!draft.departureTime.trim()) missing.push(TRIP_REQUIRED_LABELS.departureTime);
  return missing;
}

/** 저장 직전 검사. 오류 문구 목록을 돌려준다 */
export function validateTripDraft(draft: TripDraft): string[] {
  const errors = missingTripFields(draft).map((name) => `${name}을(를) 입력하세요`);
  for (const d of draft.dates) if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !ymd(+d.slice(0, 4), +d.slice(5, 7), +d.slice(8, 10))) errors.push(`날짜 형식이 잘못되었습니다: ${d} (예: 2026-10-12)`);
  if (draft.dates.length > 31) errors.push('날짜는 한 번에 31개까지 등록할 수 있습니다');
  for (const [name, value] of [['출항 시간', draft.departureTime], ['입항 예정', draft.returnTime]] as const) {
    if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) errors.push(`${name} 형식이 잘못되었습니다: ${value} (예: 05:30)`);
  }
  for (const [name, value] of [['정원', draft.capacity], ['1인 요금', draft.price]] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) errors.push(`${name}은(는) 0 이상의 정수여야 합니다`);
  }
  return errors;
}

/** 날짜 칸 입력("2026-10-12, 10/13")을 YYYY-MM-DD 목록으로 바꾼다 */
export function parseDateList(input: string, ref: string): string[] {
  const out: string[] = [];
  for (const part of input.split(/[,\n]/).map((p) => p.trim()).filter(Boolean)) {
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(part);
    const found = iso ? ymd(+iso[1], +iso[2], +iso[3]) : findDates(part, ref)[0]?.date ?? null;
    out.push(found ?? part);
  }
  return [...new Set(out)];
}
