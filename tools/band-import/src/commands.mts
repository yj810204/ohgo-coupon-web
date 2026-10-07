import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page } from 'playwright';
import { hasProfile, openContext, resolveUserDataDir, trackLoginState, waitForLoginState } from './browser.mts';
import type { LoginTracker } from './browser.mts';
import { fetchBandPost, NotLoggedInError } from './fetch-post.mts';
import type { ImageDownloader } from './fetch-post.mts';
import type { ExtractedPost } from './schema.mts';
import { validateExtracted } from './schema.mts';
import { countSessionOnly, readSession, restoreSession, saveSession, toHeadedUserAgent } from './session-store.mts';
import { parseBandPostUrl } from './url.mts';

export const TOOL_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const USER_DATA_DIR = resolveUserDataDir(process.env.BAND_USER_DATA_DIR, join(TOOL_ROOT, 'user-data'));
export const DEFAULT_OUT_DIR = join(TOOL_ROOT, 'out');
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

export type Log = (msg: string) => void;

async function confirmLoginAfterReload(page: Page, tracker: LoginTracker): Promise<boolean> {
  const before = tracker.responses();
  await page.goto('https://band.us/', { waitUntil: 'domcontentloaded' });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && tracker.responses() === before) await page.waitForTimeout(500);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  return tracker.responses() > before && tracker.current() === 'user';
}

async function persistLogin(context: BrowserContext, page: Page, userDataDir: string, log: Log): Promise<void> {
  const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => undefined);
  const snapshot = await saveSession(context, userDataDir, userAgent);
  log(
    `세션 저장: Band 쿠키 ${snapshot.cookies.length}개(브라우저를 닫으면 사라지는 세션 쿠키 ${countSessionOnly(snapshot.cookies)}개 포함)`,
  );
}

export async function runLogin({ log = console.log, userDataDir = USER_DATA_DIR }: { log?: Log; userDataDir?: string } = {}): Promise<void> {
  log(`브라우저 프로필: ${userDataDir}`);
  const context = await openContext({ userDataDir, headless: false });
  try {
    const tracker = trackLoginState(context);
    const { restored } = await restoreSession(context, userDataDir);
    if (restored) log(`저장된 세션 쿠키 ${restored}개 복원`);
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto('https://band.us/', { waitUntil: 'domcontentloaded' });
    const first = await waitForLoginState(tracker, 15_000);
    if (first === 'user') {
      log('이미 로그인되어 있습니다. 세션을 그대로 사용합니다.');
      await persistLogin(context, page, userDataDir, log);
      return;
    }
    log('열린 브라우저 창에서 Band에 로그인하세요. 로그인이 끝나면 자동으로 저장하고 닫습니다.');
    const state = await waitForLoginState(tracker, LOGIN_TIMEOUT_MS, (s) => s === 'user');
    if (state !== 'user') {
      throw new Error('로그인을 확인하지 못했습니다(10분 초과). 다시 실행해 주세요.');
    }
    // 로그인 직후 리다이렉트와 토큰 발급이 끝날 때까지 기다린 뒤 새로고침으로 한 번 더 확인한다
    await page.waitForTimeout(3000);
    if (!(await confirmLoginAfterReload(page, tracker))) {
      throw new Error(`새로고침 후 로그인 상태를 확인하지 못했습니다(상태: ${tracker.lastRaw() ?? '응답 없음'}). 다시 실행해 주세요.`);
    }
    await persistLogin(context, page, userDataDir, log);
    log('로그인 확인. 세션을 저장했습니다.');
  } finally {
    await context.close();
  }
}

/**
 * headless에서도 login 때와 같은 User-Agent를 쓴다. 저장본이 없으면 한 번 띄워서 읽은 값에서 HeadlessChrome만 바꾼다.
 */
async function openHeadlessContext(userDataDir: string): Promise<BrowserContext> {
  const saved = readSession(userDataDir)?.userAgent;
  if (saved) return openContext({ userDataDir, headless: true, userAgent: toHeadedUserAgent(saved) });
  const probe = await openContext({ userDataDir, headless: true });
  const page = probe.pages()[0] ?? (await probe.newPage());
  const current = await page.evaluate(() => navigator.userAgent);
  if (current === toHeadedUserAgent(current)) return probe;
  await probe.close();
  return openContext({ userDataDir, headless: true, userAgent: toHeadedUserAgent(current) });
}

export type FetchOptions = {
  url: string;
  headless: boolean;
  /** headless에서 로그인이 안 된 것으로 보이면 창 모드로 한 번 더 시도한다 */
  headedFallback?: boolean;
  timeoutMs?: number;
  outRoot?: string;
  userDataDir?: string;
  log?: Log;
  download?: ImageDownloader;
  /** 테스트에서 가짜 Band 응답 라우트를 붙일 때 쓴다 */
  prepareContext?: (context: BrowserContext) => Promise<void>;
};

export async function runFetch(options: FetchOptions): Promise<{ extracted: ExtractedPost; outDir: string }> {
  const {
    url,
    headless,
    headedFallback = true,
    timeoutMs = 30_000,
    outRoot = DEFAULT_OUT_DIR,
    userDataDir = USER_DATA_DIR,
    log = console.log,
  } = options;
  const ref = parseBandPostUrl(url);
  if (!hasProfile(userDataDir)) {
    throw new Error('저장된 Band 로그인 프로필이 없습니다. 먼저 로그인을 실행하세요.');
  }
  if (!readSession(userDataDir)) {
    log('주의: 세션 저장본이 없습니다. 로그인이 풀려 있으면 로그인을 한 번 다시 실행하세요.');
  }

  const attempt = async (asHeadless: boolean) => {
    log(`브라우저 프로필: ${userDataDir} (${asHeadless ? '창 없이' : '창 모드'})`);
    const context = asHeadless ? await openHeadlessContext(userDataDir) : await openContext({ userDataDir, headless: false });
    try {
      const { restored } = await restoreSession(context, userDataDir);
      if (restored) log(`저장된 세션 쿠키 ${restored}개 복원`);
      await options.prepareContext?.(context);
      const result = await fetchBandPost({ context, ref, outRoot, timeoutMs, log, download: options.download });
      // Band가 갱신한 토큰 쿠키를 다음 실행에서도 쓰도록 저장본을 새로 고친다
      await saveSession(context, userDataDir);
      const errors = validateExtracted(result.extracted);
      if (errors.length) throw new Error(`extracted.json 스키마 오류:\n${errors.join('\n')}`);
      return result;
    } finally {
      await context.close();
    }
  };

  try {
    return await attempt(headless);
  } catch (err) {
    if (!(headless && headedFallback && err instanceof NotLoggedInError)) throw err;
    log(`${err.message}\n창 모드로 다시 시도합니다.`);
    return attempt(false);
  }
}
