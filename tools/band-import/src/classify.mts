import type { ExtractedPost } from './schema.mts';
import { normalizeTitle } from './title.mts';
import { findDates, findTripTimes, kstDate, parseWeeklyRows, postRefDate } from './trip-parse.mts';

/** catch: 조황 사진 게시판(community_photos), schedule: 출조 안내(trip_guides) */
export type OhgoKind = 'catch' | 'schedule';

export type Classification = {
  kind: OhgoKind;
  scores: Record<OhgoKind, number>;
  reasons: string[];
};

const SCHEDULE_WORDS = [
  '출조 안내', '출조안내', '출항 안내', '출항안내', '일정', '예약', '모집', '선비', '정원', '출항 예정', '출조 예정',
  '자리', '선착순', '마감', '문의', '공지',
];
const CATCH_WORDS = [
  '조황', '조과', '마릿수', '손님', '쿨러', '씨알', '잡으', '잡았', '낚으', '낚았', '올렸', '대박', '호황', '마리',
  'kg', '키로', '사이즈', '손맛', '수고하셨',
];

function hits(text: string, words: string[]): string[] {
  const lower = text.toLowerCase();
  return words.filter((w) => lower.includes(w.toLowerCase()));
}

const CATCH_TITLE = /조황|조과/;
const SCHEDULE_TITLE = /출조\s*안내|출항\s*안내|모집|일정|예약/;

/** photoCount: 실제로 올릴 수 있는 사진 수. 없으면 extracted.json 기준 */
export function classifyPost(post: ExtractedPost, photoCount?: number): Classification {
  const scores: Record<OhgoKind, number> = { catch: 0, schedule: 0 };
  const reasons: string[] = [];
  const text = `${post.title}\n${post.body}`;
  const ref = postRefDate(post);

  if (CATCH_TITLE.test(post.title)) catchBoost(4, '제목에 조황이라고 적혀 있음');
  if (SCHEDULE_TITLE.test(post.title)) scheduleBoost(4, '제목에 출조 안내나 모집이 적혀 있음');
  const dayRows = parseWeeklyRows(post.body, ref).rows.filter((r) => r.departureTime);
  if (dayRows.length >= 2) scheduleBoost(5, `날짜별 출항 줄 ${dayRows.length}개`);
  if (post.schedules.length > 0) {
    scheduleBoost(3, `Band 일정 첨부 ${post.schedules.length}개`);
  }
  const scheduleHits = hits(text, SCHEDULE_WORDS);
  if (scheduleHits.length) scheduleBoost(Math.min(scheduleHits.length, 2), `일정 단어 ${scheduleHits.slice(0, 4).join(' ')}`);
  const future = findDates(post.body, ref).filter((d) => d.date > ref);
  if (future.length || post.schedules.some((s) => (kstDate(s.startAt) ?? '') > ref)) {
    scheduleBoost(2, '게시일 이후 날짜가 있음');
  }
  if (findTripTimes(post.body).departure) scheduleBoost(1, '출항 시간이 적혀 있음');

  const catchHits = hits(text, CATCH_WORDS);
  if (catchHits.length) catchBoost(Math.min(catchHits.length, 4), `조황 단어 ${catchHits.slice(0, 4).join(' ')}`);
  const photos = photoCount ?? post.images.filter((i) => i.file).length;
  if (photos >= 5) catchBoost(3, `사진 ${photos}장`);
  else if (photos >= 3) catchBoost(2, `사진 ${photos}장`);
  else if (photos > 0) catchBoost(1, `사진 ${photos}장`);

  let kind: OhgoKind;
  if (scores.schedule === scores.catch) kind = photos > 0 ? 'catch' : 'schedule';
  else kind = scores.schedule > scores.catch ? 'schedule' : 'catch';
  return { kind, scores, reasons };

  function scheduleBoost(n: number, why: string) {
    scores.schedule += n;
    reasons.push(`${why} (일정 +${n})`);
  }
  function catchBoost(n: number, why: string) {
    scores.catch += n;
    reasons.push(`${why} (조황 +${n})`);
  }
}

export type PhotoDraft = {
  title: string;
  description: string;
  /** YYYY-MM-DD (KST) */
  photoDate: string | null;
  /** out/{postId}/ 안의 파일 이름 */
  images: string[];
};

/**
 * 조황 글을 조황 사진 게시판 입력값으로 바꾼다.
 * images: 실제로 있는 사진 파일 목록. 없으면 extracted.json 기준
 */
export function buildPhotoDraft(post: ExtractedPost, images?: string[]): PhotoDraft {
  const lines = post.body.split('\n');
  const firstIdx = lines.findIndex((l) => l.trim().length > 0);
  const raw = post.title.trim();
  const title = normalizeTitle(raw);
  let description = post.body;
  const first = firstIdx >= 0 ? lines[firstIdx].trim() : null;
  if (first && (first === raw || first === title)) {
    description = lines.slice(firstIdx + 1).join('\n').replace(/^\n+/, '').trimEnd();
  }
  return {
    title: title.slice(0, 100),
    description,
    photoDate: kstDate(post.createdAt),
    images: images ?? post.images.map((i) => i.file).filter((f): f is string => !!f),
  };
}

export function validatePhotoDraft(draft: PhotoDraft): string[] {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push('제목을 입력하세요');
  if (draft.images.length === 0) errors.push('조황 게시판에는 사진이 1장 이상 필요합니다');
  if (draft.images.length > 30) errors.push('사진은 한 번에 30장까지 올릴 수 있습니다');
  if (draft.images.some((f) => !/^[\w-]+\.(jpe?g|png|gif|webp)$/i.test(f))) errors.push('사진 파일 이름이 잘못되었습니다');
  if (draft.photoDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.photoDate)) errors.push('사진 날짜 형식이 잘못되었습니다 (예: 2026-10-07)');
  return errors;
}
