import type { ExtractedSchedule } from './schema.mts';

type Json = unknown;
type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pick(obj: Rec, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

/**
 * Band 웹 API 응답(단건 또는 배치 응답 배열)에서 post_no가 일치하는 post 객체를 찾는다.
 * 경로나 래핑 구조가 바뀌어도 동작하도록 응답 전체를 탐색한다.
 */
export function findPostInJson(json: Json, postId: string, maxDepth = 8): Rec | null {
  const seen = new Set<unknown>();
  const walk = (node: Json, depth: number): Rec | null => {
    if (depth > maxDepth || node === null || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const rec = node as Rec;
    const postNo = pick(rec, 'post_no', 'postNo');
    if (postNo !== undefined && String(postNo) === postId && ('content' in rec || 'attachment' in rec)) {
      return rec;
    }
    for (const value of Object.values(rec)) {
      const found = walk(value, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(json, 0);
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Band 본문 마크업(<band:refer>, <br> 등)을 평문으로 바꾼다 */
export function bandContentToText(content: string): string {
  const text = content
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function deriveTitle(body: string, maxLength = 60): string {
  const first = body.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return first.length > maxLength ? `${first.slice(0, maxLength - 1).trimEnd()}…` : first;
}

const DATE_PATTERNS = [
  /\b\d{4}\s*[.\-/]\s*\d{1,2}\s*[.\-/]\s*\d{1,2}/,
  /\d{1,2}\s*월\s*\d{1,2}\s*일/,
  /(^|[^\d/])\d{1,2}\/\d{1,2}(?![\d/])/,
];
const TIME_PATTERNS = [
  /(^|[^\d])([01]?\d|2[0-3]):[0-5]\d(?!\d)/,
  /(오전|오후|새벽|아침|저녁|밤)\s*\d{1,2}\s*시/,
  /\d{1,2}\s*시(\s*\d{1,2}\s*분|\s*반)?(?![간작])/,
];

export function isScheduleLikeLine(line: string): boolean {
  return [...DATE_PATTERNS, ...TIME_PATTERNS].some((re) => re.test(line));
}

export function findScheduleLikeLines(body: string): string[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && isScheduleLikeLine(l));
}

/** epoch(ms 또는 s) 숫자/문자열 또는 날짜 문자열을 ISO로 바꾼다 */
export function toIso(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  let ms: number;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    const n = Number(value);
    ms = n < 1e12 ? n * 1000 : n;
  } else if (typeof value === 'string') {
    ms = Date.parse(value);
  } else {
    return null;
  }
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function asNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export type RawImage = { url: string; width: number | null; height: number | null };

export type NormalizedPost = {
  author: string | null;
  createdAt: string | null;
  body: string;
  images: RawImage[];
  schedules: ExtractedSchedule[];
};

function listOf(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function normalizeSchedule(raw: unknown): ExtractedSchedule | null {
  if (!isRecord(raw)) return null;
  const name = asString(pick(raw, 'name', 'title'));
  if (!name) return null;
  const isAllDay = pick(raw, 'is_all_day', 'isAllDay');
  return {
    name,
    description: asString(pick(raw, 'description')),
    startAt: toIso(pick(raw, 'start_at', 'startAt')),
    endAt: toIso(pick(raw, 'end_at', 'endAt')),
    isAllDay: typeof isAllDay === 'boolean' ? isAllDay : null,
  };
}

/** api.band.us get_post 응답의 post 객체(snake_case, 일부 camelCase 허용)를 정규화한다 */
export function normalizeApiPost(post: Rec): NormalizedPost {
  const attachment = isRecord(post.attachment) ? post.attachment : {};

  const images: RawImage[] = [];
  const seenUrls = new Set<string>();
  const photos = [...listOf(attachment.photo), ...listOf(post.photos)];
  for (const p of photos) {
    if (!isRecord(p)) continue;
    if (isRecord(p.video) || p.is_video === true) continue;
    const url = asString(pick(p, 'photo_url', 'photoUrl', 'url'));
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    images.push({ url, width: asNumber(p.width), height: asNumber(p.height) });
  }

  const rawSchedules: unknown[] = [];
  if (attachment.schedule) rawSchedules.push(attachment.schedule);
  for (const group of listOf(pick(attachment, 'schedule_group', 'scheduleGroup'))) {
    if (isRecord(group)) rawSchedules.push(...listOf(group.schedules));
  }
  const schedules = rawSchedules
    .map(normalizeSchedule)
    .filter((s): s is ExtractedSchedule => s !== null);

  const author = isRecord(post.author) ? asString(post.author.name) : null;
  const content = typeof post.content === 'string' ? post.content : '';

  return {
    author,
    createdAt: toIso(pick(post, 'created_at', 'createdAt')),
    body: bandContentToText(content),
    images,
    schedules,
  };
}

/** pstatic 썸네일 URL(?type=w720 등)에서 원본 URL을 얻는다 */
export function toOriginalImageUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('pstatic.net')) u.searchParams.delete('type');
    return u.toString();
  } catch {
    return url;
  }
}

export type DomSnapshot = {
  author: string | null;
  createdText: string | null;
  bodyText: string;
  imageUrls: string[];
};

export function normalizeDomSnapshot(snap: DomSnapshot): NormalizedPost {
  const urls = [...new Set(snap.imageUrls.map(toOriginalImageUrl))];
  return {
    author: snap.author,
    createdAt: null,
    body: snap.bodyText.replace(/\n{3,}/g, '\n\n').trim(),
    images: urls.map((url) => ({ url, width: null, height: null })),
    schedules: [],
  };
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export function imageFileName(index: number, url: string, contentType: string | null): string {
  const type = contentType?.split(';')[0].trim().toLowerCase() ?? '';
  let ext = EXT_BY_TYPE[type];
  if (!ext) {
    const m = /\.([a-z0-9]{3,4})$/i.exec(new URL(url).pathname);
    ext = m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
  }
  return `${String(index + 1).padStart(2, '0')}.${ext}`;
}
