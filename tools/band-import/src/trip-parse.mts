import type { ExtractedPost } from './schema.mts';

const KST_OFFSET_MS = 9 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** trip_guides 한 행 */
export type TripRow = {
  /** YYYY-MM-DD */
  date: string;
  species: string;
  /** HH:MM */
  departureTime: string;
  returnTime: string;
  price: number | null;
  notes: string;
  /** 미리보기에서 체크된 채로 시작할지(휴항, 취소 줄은 꺼 둔다) */
  selected?: boolean;
};

/** 여러 행이 함께 쓰는 값 + 행 목록 */
export type TripDraft = {
  rows: TripRow[];
  destination: string;
  capacity: number | null;
  contact: string;
};

export type TripParse = {
  draft: TripDraft;
  /** 필수인데 찾지 못한 칸 이름 */
  missing: string[];
  /** 운영자에게 보여 줄 참고 문구 */
  hints: string[];
  /** weekly: "5일 (월) 감성돔 06시 출항" 같은 날짜별 줄에서 만듦 */
  source: 'weekly' | 'single';
};

export const TRIP_REQUIRED_LABELS = { dates: '날짜', destination: '목적지', departureTime: '출항 시간' } as const;
export const MAX_TRIP_ROWS = 31;

export const FISH_SPECIES = [
  '갑오징어', '무늬오징어', '한치', '쭈꾸미', '주꾸미', '문어', '갈치', '참돔', '감성돔', '벵에돔', '돌돔', '광어',
  '우럭', '농어', '도다리', '가자미', '참가자미', '볼락', '열기', '삼치', '방어', '부시리', '고등어', '전갱이',
  '전어', '민어', '대구', '붉바리', '능성어', '쏨뱅이', '노래미', '백조기', '보구치', '숭어', '학꽁치', '타이라바',
];

export function kstDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 조황 게시판이 정렬하고 화면에 보여주는 시각(community_photos.created_at).
 * 사진 날짜가 Band 글의 한국 날짜와 같으면 그 시각을 쓰고, 아니면 그날 12:00 KST.
 */
export function catchBoardTime(photoDate: string, bandCreatedAt: string | null | undefined): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(photoDate)) throw new Error('사진 날짜 형식이 잘못되었습니다');
  if (bandCreatedAt && kstDate(bandCreatedAt) === photoDate) {
    const t = Date.parse(bandCreatedAt);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return new Date(`${photoDate}T12:00:00+09:00`).toISOString();
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

/**
 * 연도 없는 날짜: 기준일 해의 날짜가 기준일보다 60일 넘게 이전이면 다음 해,
 * 300일 넘게 이후면 지난해로 본다(12월 말 일정을 1월에 가져온 경우)
 */
function withYear(ref: string, m: number, d: number): string | null {
  const year = Number(ref.slice(0, 4));
  const same = ymd(year, m, d);
  if (!same) return null;
  if (Date.parse(same) < Date.parse(ref) - 60 * DAY_MS) return ymd(year + 1, m, d);
  if (Date.parse(same) > Date.parse(ref) + 300 * DAY_MS) return ymd(year - 1, m, d);
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
    /(?<!최소\s*(?:출항\s*)?)(?:정원|인원|모집|선착순)\s*[:：]?\s*(?:최대\s*)?(\d{1,3})\s*(?:명|분|인)/.exec(body) ??
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

const WEEKDAYS = '일월화수목금토';
const DAY_LINE = /^[\s\-*•▶►]*(?:(\d{1,2})\s*월\s*(\d{1,2})\s*일|(\d{1,2})\s*일|(\d{1,2})\s*[./]\s*(\d{1,2}))\s*(?:\(\s*([월화수목금토일])\s*(?:요일)?\s*\))?(.*)$/;
const RANGE_HEADER = /(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*[~∼\-]\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/;
const STATUS = /예약\s*마감|마감|만석|자리\s*여유|여유|예약\s*가능|휴항|출항\s*취소|취소|대기/;
const OFF_STATUS = /휴항|취소/;
const PM_BEFORE = /(오후|저녁|야간|밤)\s*$/;
const SPECIES_RE = new RegExp([...FISH_SPECIES].sort((a, b) => b.length - a.length).join('|'), 'g');
/** 계좌 번호가 있는 줄: 비고에 절대 넣지 않는다 */
const ACCOUNT_LINE = /은행|뱅크|농협|신협|수협|우체국|새마을금고|계좌|입금|예금주|(?<!\d)(?!01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d))\d{3,6}[-\s]\d{2,6}[-\s]\d{4,}/;

type DayLine = { index: number; month: number | null; day: number; weekday: string | null; rest: string };

function readDayLine(line: string, index: number): DayLine | null {
  const m = DAY_LINE.exec(line);
  if (!m) return null;
  const rest = m[7] ?? '';
  if (/^\s*[~∼\-]/.test(rest)) return null;
  if (m[1]) return { index, month: +m[1], day: +m[2], weekday: m[6] ?? null, rest };
  if (m[3]) return { index, month: null, day: +m[3], weekday: m[6] ?? null, rest };
  return { index, month: +m[4], day: +m[5], weekday: m[6] ?? null, rest };
}

function speciesIn(text: string): { name: string; index: number }[] {
  return [...text.matchAll(SPECIES_RE)].map((m) => ({ name: m[0], index: m.index! }));
}

/** 한 줄의 어종별 구간: "감성돔 06시 출항 마감, 오후 문어 13시 출항" -> 두 구간 */
type Segment = { species: string[]; departure: string; returnTime: string; status: string };

function lineSegments(rest: string): Segment[] {
  const found = speciesIn(rest);
  const cuts = found.length ? found : [{ name: '', index: 0 }];
  const raw = cuts.map((s, i) => {
    const start = i === 0 ? 0 : s.index;
    const end = i + 1 < cuts.length ? cuts[i + 1].index : rest.length;
    return { species: s.name, text: rest.slice(start, end), pm: PM_BEFORE.test(rest.slice(0, s.index)) };
  });
  const out: Segment[] = [];
  let carry: string[] = [];
  for (const seg of raw) {
    const names = [...carry, ...(seg.species ? [seg.species] : [])];
    const times = findTimes(seg.text);
    const status = (STATUS.exec(seg.text)?.[0] ?? '').replace(/\s+/g, '');
    if (times.length === 0 && !status) {
      carry = names;
      continue;
    }
    carry = [];
    const shift = (t: FoundTime | undefined) => {
      if (!t) return '';
      const explicit = /오전|오후|새벽|아침|낮|저녁|밤/.test(seg.text.slice(Math.max(0, t.index - 3), t.end));
      const h = Number(t.time.slice(0, 2));
      return seg.pm && !explicit && h < 12 ? `${String(h + 12).padStart(2, '0')}${t.time.slice(2)}` : t.time;
    };
    const dep = times[0];
    let ret: FoundTime | undefined;
    const next = times[1];
    if (next) {
      const between = seg.text.slice(dep.end, next.index);
      if (/[~∼\-]|입항|귀항|철수|복귀/.test(between) || /^\s*(입항|귀항|철수|복귀)/.test(seg.text.slice(next.end))) ret = next;
    }
    const departure = shift(dep);
    const returnTime = shift(ret);
    out.push({ species: names, departure, returnTime: returnTime === departure ? '' : returnTime, status });
  }
  if (carry.length && out.length) out[out.length - 1].species.push(...carry);
  return out;
}

/** 날짜별 줄이 아닌 안내 줄에서 그 어종의 값을 찾는다. 값이 여러 개면 정하지 않는다 */
function noticeValues(lines: string[], dayIdx: Set<number>, species: string, pick: (line: string, next: string) => string | number | null): (string | number)[] {
  const values = new Set<string | number>();
  lines.forEach((line, i) => {
    if (dayIdx.has(i) || ACCOUNT_LINE.test(line)) return;
    if (!speciesIn(line).some((s) => s.name === species)) return;
    const next = lines[i + 1] ?? '';
    const v = pick(line, /^\s*\(/.test(next) && !dayIdx.has(i + 1) ? next : '');
    if (v !== null) values.add(v);
  });
  return [...values];
}

function noticeReturn(line: string, next: string): string | null {
  for (const text of [line, next]) {
    const times = findTimes(text);
    const t = times.find((tm) => /^\s*(입항|귀항|철수|복귀)/.test(text.slice(tm.end)));
    if (t) return t.time;
  }
  return null;
}

/** 날짜별 출항 줄에서 행을 만든다. 줄이 없으면 빈 목록 */
export function parseWeeklyRows(body: string, ref: string): { rows: TripRow[]; hints: string[] } {
  const lines = body.split('\n');
  const hints: string[] = [];
  const header = RANGE_HEADER.exec(body);
  const range = header ? { startMonth: +header[1], startDay: +header[2], endMonth: header[3] ? +header[3] : +header[1] } : null;
  const refMonth = Number(ref.slice(5, 7));
  const refDay = Number(ref.slice(8, 10));

  const dayLines = lines.map(readDayLine).filter((d): d is DayLine => d !== null);
  const parsed = dayLines
    .map((d) => ({ d, segments: lineSegments(d.rest) }))
    .filter(({ d, segments }) => segments.length > 0 && (segments.some((s) => s.departure) || speciesIn(d.rest).length > 0));
  const dayIdx = new Set(parsed.map(({ d }) => d.index));

  const rows: TripRow[] = [];
  const priceCache = new Map<string, number | null>();
  const returnCache = new Map<string, string>();
  for (const { d, segments } of parsed) {
    let month = d.month;
    if (month === null) {
      if (range) month = range.startMonth === range.endMonth || d.day >= range.startDay ? range.startMonth : range.endMonth;
      else month = d.day < refDay - 20 ? (refMonth % 12) + 1 : refMonth;
    }
    const date = withYear(ref, month, d.day);
    if (!date) {
      hints.push(`날짜를 알 수 없는 줄을 건너뛰었습니다: ${lines[d.index].trim()}`);
      continue;
    }
    if (d.weekday && WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] !== d.weekday) {
      hints.push(`${date}은(는) ${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}요일인데 글에는 (${d.weekday})로 적혀 있습니다. 날짜를 확인하세요.`);
    }
    for (const seg of segments) {
      const main = seg.species[0] ?? '';
      if (main && !priceCache.has(main)) {
        const prices = noticeValues(lines, dayIdx, main, (line) => findPrice(line)) as number[];
        priceCache.set(main, prices.length === 1 ? prices[0] : null);
        if (prices.length > 1) hints.push(`${main} 선비가 여러 개(${prices.map((p) => `${p / 10000}만원`).join(', ')})라 요금을 비워 두었습니다`);
        const rets = noticeValues(lines, dayIdx, main, noticeReturn) as string[];
        returnCache.set(main, rets.length === 1 ? rets[0] : '');
        if (rets.length > 1) hints.push(`${main} 입항 시간이 여러 개(${rets.join(', ')})라 입항 예정을 비워 두었습니다`);
      }
      rows.push({
        date,
        species: seg.species.join(', '),
        departureTime: seg.departure,
        returnTime: seg.returnTime || (main ? returnCache.get(main) ?? '' : ''),
        price: main ? priceCache.get(main) ?? null : null,
        notes: seg.status,
        selected: !OFF_STATUS.test(seg.status),
      });
    }
  }
  if (rows.length > MAX_TRIP_ROWS) {
    hints.push(`출조 줄이 ${rows.length}개라 앞의 ${MAX_TRIP_ROWS}개만 넣었습니다`);
    rows.length = MAX_TRIP_ROWS;
  }
  return { rows, hints };
}

/** 계좌 줄과 해시태그만 있는 줄을 뺀 본문 */
function notesFromBody(body: string): string {
  const kept = body
    .split('\n')
    .filter((l) => !ACCOUNT_LINE.test(l) && !/^\s*(#\S+\s*)+$/.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return kept.length > 2000 ? `${kept.slice(0, 1999)}…` : kept;
}

/**
 * 일정 글을 출조 안내(trip_guides) 입력값으로 바꾼다.
 * knownDestinations: 앱에 이미 등록된 목적지, 많이 쓴 순서. 글에 목적지가 없으면 첫 번째를 넣는다
 */
export function parseTripGuide(post: ExtractedPost, knownDestinations: string[] = []): TripParse {
  const ref = postRefDate(post);
  const body = post.body;
  const hints: string[] = [];

  let destination = findDestination(body, knownDestinations);
  if (!destination && knownDestinations[0]) {
    destination = knownDestinations[0];
    hints.push(`글에 목적지가 없어 앱에서 가장 많이 쓴 목적지 "${destination}"를 넣었습니다. 다르면 고치세요.`);
  }
  const shared = { destination, capacity: findCapacity(body), contact: findContact(body) };

  const weekly = parseWeeklyRows(body, ref);
  if (weekly.rows.length > 0) {
    const draft: TripDraft = { ...shared, rows: weekly.rows };
    hints.push(...weekly.hints);
    const covered = new Set(weekly.rows.map((r) => r.date));
    const others = [...new Set(findDates(body, ref).map((d) => d.date))].filter((d) => !covered.has(d) && d >= ref);
    if (others.length) hints.push(`출조 줄에 없는 날짜도 글에 있습니다: ${others.join(', ')} (필요하면 "줄 추가"로 넣으세요)`);
    if (weekly.rows.some((r) => r.notes)) hints.push('예약마감, 자리여유 같은 상태는 앱에 따로 칸이 없어 비고에 넣었습니다.');
    return { draft, missing: missingTripFields(draft), hints, source: 'weekly' };
  }

  const scheduleDates = [...new Set(post.schedules.map((s) => kstDate(s.startAt)).filter((d): d is string => !!d))];
  const textDates = [...new Set(findDates(body, ref).map((d) => d.date))];
  let dates: string[];
  if (scheduleDates.length) {
    dates = scheduleDates;
  } else {
    const upcoming = textDates.filter((d) => d >= ref);
    dates = upcoming.length ? [upcoming[0]] : textDates.slice(0, 1);
    const others = textDates.filter((d) => !dates.includes(d));
    if (others.length) hints.push(`다른 날짜 후보: ${others.join(', ')} (같은 일정이면 "줄 추가"로 날짜를 더하세요)`);
    if (dates.length && dates[0] < ref) hints.push(`찾은 날짜 ${dates[0]}가 게시일(${ref})보다 이전입니다. 확인하세요.`);
  }

  const times = findTripTimes(body);
  const timed = post.schedules.find((s) => s.isAllDay === false && s.startAt);
  const departureTime = times.departure ?? (timed ? kstTime(timed.startAt) : null) ?? '';
  const returnTime = times.return ?? (timed?.endAt ? kstTime(timed.endAt) : null) ?? '';
  const row: Omit<TripRow, 'date'> = {
    species: findSpecies(body),
    departureTime,
    returnTime: returnTime && returnTime !== departureTime ? returnTime : '',
    price: findPrice(body),
    notes: notesFromBody(body),
    selected: true,
  };
  const draft: TripDraft = { ...shared, rows: (dates.length ? dates : ['']).map((date) => ({ date, ...row })) };
  return { draft, missing: missingTripFields(draft), hints, source: 'single' };
}

export function missingTripFields(draft: TripDraft): string[] {
  const missing: string[] = [];
  if (draft.rows.length === 0 || draft.rows.some((r) => !r.date.trim())) missing.push(TRIP_REQUIRED_LABELS.dates);
  if (!draft.destination.trim()) missing.push(TRIP_REQUIRED_LABELS.destination);
  if (draft.rows.some((r) => !r.departureTime.trim())) missing.push(TRIP_REQUIRED_LABELS.departureTime);
  return missing;
}

/** 저장 직전 검사. 오류 문구 목록을 돌려준다 */
export function validateTripDraft(draft: TripDraft): string[] {
  const errors = missingTripFields(draft).map((name) => `${name}을(를) 입력하세요`);
  if (draft.rows.length === 0) errors.push('저장할 출조 줄을 1개 이상 고르세요');
  if (draft.rows.length > MAX_TRIP_ROWS) errors.push(`출조는 한 번에 ${MAX_TRIP_ROWS}건까지 등록할 수 있습니다`);
  draft.rows.forEach((r, i) => {
    const at = `${i + 1}번째 줄`;
    if (r.date && (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !ymd(+r.date.slice(0, 4), +r.date.slice(5, 7), +r.date.slice(8, 10)))) errors.push(`${at} 날짜 형식이 잘못되었습니다: ${r.date} (예: 2026-10-12)`);
    for (const [name, value] of [['출항 시간', r.departureTime], ['입항 예정', r.returnTime]] as const) {
      if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) errors.push(`${at} ${name} 형식이 잘못되었습니다: ${value} (예: 05:30)`);
    }
    if (r.price !== null && (!Number.isInteger(r.price) || r.price < 0)) errors.push(`${at} 1인 요금은 0 이상의 정수여야 합니다`);
  });
  if (draft.capacity !== null && (!Number.isInteger(draft.capacity) || draft.capacity < 0)) errors.push('정원은 0 이상의 정수여야 합니다');
  return errors;
}

/** 날짜 칸 입력("2026-10-12" 또는 "10/13")을 YYYY-MM-DD로 바꾼다. 못 읽으면 그대로 */
export function parseDateInput(input: string, ref: string): string {
  const part = input.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(part);
  return (iso ? ymd(+iso[1], +iso[2], +iso[3]) : findDates(part, ref)[0]?.date ?? null) ?? part;
}
