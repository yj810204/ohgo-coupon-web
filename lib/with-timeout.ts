export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`timeout ${ms}`);
    this.name = 'TimeoutError';
  }
}

/** 제한 시간 안에 끝나지 않으면 TimeoutError. 원래 작업은 취소하지 않는다. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** 시간 초과나 실패면 fallback. 화면을 기다리게 두지 않을 때 쓴다. */
export function withTimeoutFallback<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return withTimeout(promise, ms).catch(() => fallback);
}
