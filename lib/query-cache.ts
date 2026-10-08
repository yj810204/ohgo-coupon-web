/**
 * 가벼운 메모리 캐시 + in-flight 중복 요청 병합.
 * 읽기 경로 전용. 쓰기 함수는 캐시를 우회해야 한다.
 */

import { TimeoutError, withTimeout } from '@/lib/with-timeout';

/** 캐시가 없을 때 이 시간보다 오래 걸리면 기다림을 끊고, 다음 호출이 다시 요청할 수 있게 한다. */
export const CACHE_WAIT_MS = 1_500;

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Set<(key: string, value: unknown, error?: unknown) => void>();

/** 캐시에 값이 들어가거나 요청이 실패하면 호출된다. */
export function subscribeCache(listener: (key: string, value: unknown, error?: unknown) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(key: string, value: unknown, error?: unknown) {
  for (const listener of listeners) {
    try {
      listener(key, value, error);
    } catch {
      /* 구독자가 실패해도 캐시 기록은 유지한다 */
    }
  }
}

export function cachedFetch<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  waitMs: number = CACHE_WAIT_MS,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  const fresh = Boolean(hit && hit.expiresAt > now);
  if (fresh && hit) {
    return Promise.resolve(hit.value as T);
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  // 만료된 값은 바로 돌려주고, 같은 키 요청은 뒤에서 한 번만 갱신한다.
  if (hit && !fresh) {
    if (!pending) start();
    return Promise.resolve(hit.value as T);
  }
  if (pending) return waitFor(pending);
  return waitFor(start());

  function start(): Promise<T> {
    const promise = fn()
      .then((value) => {
        store.set(key, { value, expiresAt: Date.now() + ttlMs });
        publish(key, value);
        if (inflight.get(key) === promise) inflight.delete(key);
        return value;
      })
      .catch((err) => {
        if (inflight.get(key) === promise) inflight.delete(key);
        publish(key, undefined, err);
        if (hit) return hit.value as T;
        throw err;
      });
    inflight.set(key, promise);
    return promise;
  }

  function waitFor(promise: Promise<T>): Promise<T> {
    return withTimeout(promise, waitMs).catch((err) => {
      if (err instanceof TimeoutError) {
        const current = inflight.get(key);
        if (current === promise) inflight.delete(key);
        // 기다림만 끊는다. 끝나서 캐시에 들어가면 subscribeCache가 알린다.
        promise.catch(() => undefined);
        if (hit) return hit.value as T;
      }
      throw err;
    });
  }
}

/** prefix 없으면 전체 무효화. prefix 있으면 해당 키로 시작하는 항목만 제거 */
export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    inflight.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  for (const key of [...inflight.keys()]) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}

export function peekCache<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit || hit.expiresAt <= Date.now()) return undefined;
  return hit.value as T;
}
