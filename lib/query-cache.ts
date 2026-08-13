/**
 * 가벼운 메모리 캐시 + in-flight 중복 요청 병합.
 * 읽기 경로 전용. 쓰기 함수는 캐시를 우회해야 한다.
 */

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

export function cachedFetch<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    return Promise.resolve(hit.value as T);
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = fn()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      inflight.delete(key);
      return value;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

/** prefix 없으면 전체 무효화. prefix 있으면 해당 키로 시작하는 항목만 제거 */
export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function peekCache<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit || hit.expiresAt <= Date.now()) return undefined;
  return hit.value as T;
}
