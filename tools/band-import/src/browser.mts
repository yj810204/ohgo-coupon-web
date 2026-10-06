import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
import type { BrowserContext, Page } from 'playwright';
import { isAuthKeyUrl, parseAuthKeyScript } from './auth-state.mts';
import type { LoginState } from './auth-state.mts';

export type BrowserOptions = {
  userDataDir: string;
  headless: boolean;
};

export function hasProfile(userDataDir: string): boolean {
  return existsSync(userDataDir) && readdirSync(userDataDir).length > 0;
}

export async function openContext({ userDataDir, headless }: BrowserOptions): Promise<BrowserContext> {
  mkdirSync(userDataDir, { recursive: true });
  // BAND_BROWSER_CHANNEL=chrome 이면 Playwright 번들 Chromium 대신 설치된 Chrome을 쓴다
  const channel = process.env.BAND_BROWSER_CHANNEL || undefined;
  return chromium.launchPersistentContext(userDataDir, {
    headless,
    channel,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1280, height: 900 },
  });
}

/** 페이지에서 Band 로그인 상태 응답을 계속 추적한다 */
export function trackLoginState(page: Page): { current: () => LoginState } {
  let state: LoginState = 'unknown';
  page.on('response', async (res) => {
    if (!isAuthKeyUrl(res.url())) return;
    try {
      const parsed = parseAuthKeyScript(await res.text());
      if (parsed !== 'unknown') state = parsed;
    } catch {
      // 탐색 중 닫힌 응답은 무시
    }
  });
  return { current: () => state };
}

export async function waitForLoginState(
  tracker: { current: () => LoginState },
  timeoutMs: number,
  until: (s: LoginState) => boolean = (s) => s !== 'unknown',
): Promise<LoginState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (until(tracker.current())) return tracker.current();
    await new Promise((r) => setTimeout(r, 500));
  }
  return tracker.current();
}
