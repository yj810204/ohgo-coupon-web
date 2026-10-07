import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { chromium } from 'playwright';
import type { BrowserContext, Page } from 'playwright';
import { isAuthKeyUrl, parseAuthKeyScript } from './auth-state.mts';
import type { AuthKeyInfo, LoginState } from './auth-state.mts';

export type BrowserOptions = {
  userDataDir: string;
  headless: boolean;
  userAgent?: string;
};

export function resolveUserDataDir(fromEnv: string | undefined, fallback: string): string {
  const dir = fromEnv && fromEnv.trim() ? fromEnv.trim() : fallback;
  return isAbsolute(dir) ? dir : resolve(dir);
}

export function hasProfile(userDataDir: string): boolean {
  return existsSync(userDataDir) && readdirSync(userDataDir).length > 0;
}

export async function openContext({ userDataDir, headless, userAgent }: BrowserOptions): Promise<BrowserContext> {
  if (!isAbsolute(userDataDir)) throw new Error(`user-data 경로는 절대 경로여야 합니다: ${userDataDir}`);
  mkdirSync(userDataDir, { recursive: true });
  // 기본 headless는 chrome-headless-shell(별도 실행 파일)이라 headed와 같은 Chromium으로 맞춘다.
  // BAND_BROWSER_CHANNEL=chrome 이면 설치된 Chrome을 쓴다.
  const channel = process.env.BAND_BROWSER_CHANNEL || (headless ? 'chromium' : undefined);
  try {
    return await chromium.launchPersistentContext(userDataDir, {
      headless,
      channel,
      userAgent,
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      viewport: { width: 1280, height: 900 },
    });
  } catch (err) {
    const message = (err as Error).message;
    if (/ProcessSingleton|SingletonLock|profile.*in use|already running/i.test(message)) {
      throw new Error(`다른 브라우저 창이 같은 프로필을 쓰고 있습니다. 열려 있는 login/fetch 창을 닫고 다시 실행하세요.\n(${userDataDir})`);
    }
    throw err;
  }
}

export type LoginTracker = {
  current: () => LoginState;
  /** 마지막으로 받은 authenticateState 원문 (진단용) */
  lastRaw: () => string | null;
  responses: () => number;
};

/** 컨텍스트의 모든 탭/팝업에서 Band 로그인 상태 응답을 추적한다 */
export function trackLoginState(context: BrowserContext): LoginTracker {
  let latest: AuthKeyInfo = { state: 'unknown', raw: null };
  let count = 0;
  context.on('response', async (res) => {
    if (!isAuthKeyUrl(res.url())) return;
    try {
      const info = parseAuthKeyScript(await res.text());
      count += 1;
      if (info.state !== 'unknown') latest = info;
    } catch {
      // 탐색 중 닫힌 응답은 무시
    }
  });
  return { current: () => latest.state, lastRaw: () => latest.raw, responses: () => count };
}

export class WindowClosedError extends Error {
  constructor() {
    super('브라우저 창이 닫혀 작업을 멈췄습니다. 다시 실행하세요.');
  }
}

export function isTargetClosedError(err: unknown): boolean {
  return err instanceof Error && /Target page, context or browser has been closed|Browser has been closed|Target closed/i.test(err.message);
}

/** 사용자가 창을 닫으면 true. 컨텍스트가 닫히거나 마지막 탭이 닫힌 경우 */
export function watchWindowClosed(context: BrowserContext): () => boolean {
  let closed = false;
  context.on('close', () => {
    closed = true;
  });
  const watchPage = (page: Page) =>
    page.on('close', () => {
      if (context.pages().length === 0) closed = true;
    });
  context.pages().forEach(watchPage);
  context.on('page', watchPage);
  return () => closed;
}

export async function waitForLoginState(
  tracker: LoginTracker,
  timeoutMs: number,
  until: (s: LoginState) => boolean = (s) => s !== 'unknown',
  isClosed: () => boolean = () => false,
): Promise<LoginState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isClosed()) throw new WindowClosedError();
    if (until(tracker.current())) return tracker.current();
    await new Promise((r) => setTimeout(r, 500));
  }
  return tracker.current();
}
