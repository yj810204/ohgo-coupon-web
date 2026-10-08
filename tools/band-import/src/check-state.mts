import { chmodSync, closeSync, existsSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonFile, writeJsonPrivate } from './local-store.mts';

/** 확인 명령이 기억하는 파일. ohgo-local(gitignore) 안에 둔다 */
export const CHECK_STATE_FILE = 'band-check-state.json';
export const CHECK_LOCK_FILE = 'band-check.lock';

export const CHECK_BAND_ID = '88348442';
export const CHECK_BAND_URL = `https://band.us/band/${CHECK_BAND_ID}`;

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
/** 죽은 프로세스의 잠금이 남아 있어도 이 시간이 지나면 다시 실행할 수 있다 */
const STALE_LOCK_MS = 3 * 60 * 1000;

export type PostKind = '조황' | '일정' | '기타';

export type ListPost = {
  postNo: number;
  url: string;
  /** 한국 시간 ISO 8601. 모르면 null */
  createdAt: string | null;
  author: string | null;
  snippet: string;
  photoCount: number | null;
  kind?: PostKind;
};

export type CheckState = {
  version: 1;
  bandId: string;
  lastCheckedAt: string | null;
  /** 게시글 번호 -> 그 글의 createdAt (없으면 null) */
  seen: Record<string, string | null>;
};

export type CheckOk = {
  status: 'ok';
  checkedAt: string;
  baseline: boolean;
  newPosts: ListPost[];
};

export type CheckFail = {
  status: 'login_required' | 'error';
  checkedAt: string;
  message: string;
};

export type CheckBody = CheckOk | CheckFail;

export function kstIso(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}.${pad(kst.getUTCMilliseconds(), 3)}+09:00`;
}

/** UTC ISO 또는 epoch를 한국 시간 ISO로 바꾼다 */
export function toKstIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return kstIso(new Date(t));
}

export function snippetOf(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

function isSeenMap(v: unknown): v is Record<string, string | null> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  return Object.entries(v).every(([k, val]) => /^\d+$/.test(k) && (val === null || typeof val === 'string'));
}

function isCheckState(v: unknown): v is CheckState {
  if (typeof v !== 'object' || v === null) return false;
  const rec = v as Record<string, unknown>;
  return rec.version === 1 && typeof rec.bandId === 'string' && (rec.lastCheckedAt === null || typeof rec.lastCheckedAt === 'string') && isSeenMap(rec.seen);
}

/** 파일이 없으면 null(첫 실행). 깨져 있으면 던진다. 조용히 비우면 새 글을 전부 본 것으로 처리하게 된다 */
export function readCheckState(dir: string): CheckState | null {
  const path = join(dir, CHECK_STATE_FILE);
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = readJsonFile<unknown>(path);
  } catch (err) {
    throw new Error(`확인 상태 파일(${path})을 읽지 못했습니다: ${(err as Error).message}`);
  }
  if (!isCheckState(raw)) throw new Error(`확인 상태 파일(${path}) 형식이 잘못되었습니다.`);
  return raw;
}

export function writeCheckState(dir: string, state: CheckState): void {
  writeJsonPrivate(dir, CHECK_STATE_FILE, state);
}

function postTime(createdAt: string | null): number | null {
  if (!createdAt) return null;
  const t = Date.parse(createdAt);
  return Number.isNaN(t) ? null : t;
}

function newestSeenMs(state: CheckState): number | null {
  let max: number | null = null;
  for (const createdAt of Object.values(state.seen)) {
    const t = postTime(createdAt);
    if (t === null) continue;
    if (max === null || t > max) max = t;
  }
  return max;
}

/** 최신 글이 앞으로 오도록 정렬한다 */
export function comparePosts(a: ListPost, b: ListPost): number {
  const at = postTime(a.createdAt);
  const bt = postTime(b.createdAt);
  if (at !== null && bt !== null && at !== bt) return bt - at;
  if (at !== null && bt === null) return -1;
  if (at === null && bt !== null) return 1;
  return b.postNo - a.postNo;
}

/**
 * 첫 실행(상태 없음)은 모은 글을 모두 본 것으로 기록하고 새 글 0건, baseline true.
 * 그 다음은 아직 안 본 글만 새 글이다. 이미 본 글 중 가장 최근 시각보다 2일 더 오래된 글은 알리지 않는다.
 * 새 글은 반환값의 seen에 넣는다. 호출하는 쪽이 알림을 출력한 뒤에 파일을 써야 한다.
 */
export function diffNewPosts(state: CheckState | null, posts: ListPost[], checkedAt: string, bandId: string): { baseline: boolean; newPosts: ListPost[]; next: CheckState } {
  const sorted = [...posts].sort(comparePosts);
  if (state && state.bandId !== bandId && Object.keys(state.seen).length > 0) {
    throw new Error(`확인 상태 파일의 밴드(${state.bandId})가 이번 밴드(${bandId})와 다릅니다.`);
  }
  if (!state || Object.keys(state.seen).length === 0) {
    const seen: Record<string, string | null> = {};
    for (const post of sorted) seen[String(post.postNo)] = post.createdAt;
    return { baseline: true, newPosts: [], next: { version: 1, bandId, lastCheckedAt: checkedAt, seen } };
  }

  const newest = newestSeenMs(state);
  const cutoff = newest === null ? null : newest - TWO_DAYS_MS;
  const seen = { ...state.seen };
  const fresh: ListPost[] = [];
  for (const post of sorted) {
    const key = String(post.postNo);
    if (key in seen) continue;
    const created = postTime(post.createdAt);
    if (cutoff !== null && created !== null && created < cutoff) continue;
    fresh.push(post);
    seen[key] = post.createdAt;
  }
  fresh.sort(comparePosts);
  return { baseline: false, newPosts: fresh, next: { version: 1, bandId, lastCheckedAt: checkedAt, seen } };
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readLock(path: string): { pid: number; startedAt: number } | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { pid?: unknown; startedAt?: unknown };
    if (typeof raw.pid !== 'number' || typeof raw.startedAt !== 'number') return null;
    return { pid: raw.pid, startedAt: raw.startedAt };
  } catch {
    return null;
  }
}

/** 겹치면 null. 죽은 프로세스나 3분이 지난 잠금은 지우고 다시 잡는다 */
export function acquireCheckLock(dir: string): { release: () => void } | null {
  const path = join(dir, CHECK_LOCK_FILE);
  const payload = JSON.stringify({ pid: process.pid, startedAt: Date.now() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx', 0o600);
      writeSync(fd, payload);
      closeSync(fd);
      chmodSync(path, 0o600);
      return {
        release: () => {
          try {
            unlinkSync(path);
          } catch {
            // 이미 없으면 그만
          }
        },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      const info = readLock(path);
      const alive = info ? isProcessAlive(info.pid) : false;
      const stale = !info || !alive || Date.now() - info.startedAt > STALE_LOCK_MS;
      if (!stale) return null;
      try {
        unlinkSync(path);
      } catch {
        return null;
      }
    }
  }
  return null;
}
