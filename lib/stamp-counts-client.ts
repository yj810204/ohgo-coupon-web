import { parseServerStampCounts, type ServerStampCountBody } from '@/lib/stamp-count-state';

export type ServerStampCounts = ServerStampCountBody;

const FRESH_MS = 5_000;
/** 이 시간 안에 서버 개수가 없으면 브라우저 조회로 넘어간다. */
export const SERVER_STAMP_WAIT_MS = 2_500;

const pending = new Map<string, Promise<ServerStampCounts | null>>();
const fresh = new Map<string, { at: number; value: ServerStampCounts }>();
const controllers = new Map<string, AbortController>();

function storedViewerId(): string | null {
  try {
    const raw = localStorage.getItem('userInfo');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { uuid?: unknown };
    return typeof parsed.uuid === 'string' && parsed.uuid ? parsed.uuid : null;
  } catch {
    return null;
  }
}

async function requestServerStampCounts(signal: AbortSignal): Promise<ServerStampCounts | null> {
  const response = await fetch('/api/me/stamp-counts', {
    credentials: 'include',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) return null;
  return parseServerStampCounts(await response.json());
}

/** 로그아웃하면 다른 회원 응답이 남지 않도록 메모리 캐시를 비운다. */
export function clearServerStampCounts(): void {
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
  pending.clear();
  fresh.clear();
}

/** 홈 스크립트가 평가되자마자, 저장된 로그인 id로 개수 요청을 시작한다. */
export function prefetchServerStampCounts(): void {
  if (typeof window === 'undefined') return;
  const userId = storedViewerId();
  if (!userId) return;
  void loadServerStampCounts(userId, false);
}

export function loadServerStampCounts(userId: string, force = false): Promise<ServerStampCounts | null> {
  if (typeof window === 'undefined' || !userId) return Promise.resolve(null);
  if (!force) {
    const cached = fresh.get(userId);
    if (cached && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached.value);
    const inflight = pending.get(userId);
    if (inflight) return inflight;
  } else {
    controllers.get(userId)?.abort();
  }

  const controller = new AbortController();
  controllers.set(userId, controller);
  const timer = setTimeout(() => controller.abort(), SERVER_STAMP_WAIT_MS);
  const request = requestServerStampCounts(controller.signal)
    .then((value) => {
      if (controllers.get(userId) !== controller) return value;
      if (value && (value.userId === userId || value.memberId === userId)) {
        fresh.set(userId, { at: Date.now(), value });
      }
      return value;
    })
    .catch(() => null)
    .finally(() => {
      clearTimeout(timer);
      if (controllers.get(userId) === controller) controllers.delete(userId);
      if (pending.get(userId) === request) pending.delete(userId);
    });
  pending.set(userId, request);
  return request;
}
