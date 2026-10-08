import type { BrowserContext } from 'playwright';
import { hasProfile, openContext } from './browser.mts';
import { collectBandPosts } from './check-feed.mts';
import type { FeedCollectResult } from './check-feed.mts';
import { acquireCheckLock, CHECK_BAND_ID, CHECK_BAND_URL, diffNewPosts, kstIso, readCheckState, writeCheckState } from './check-state.mts';
import type { CheckBody } from './check-state.mts';
import { OHGO_DIR, USER_DATA_DIR } from './commands.mts';
import { ensurePrivateDir } from './local-store.mts';
import { readSession, restoreSession, saveSession, toHeadedUserAgent } from './session-store.mts';

const CHECK_TIMEOUT_MS = 60_000;

type Log = (msg: string) => void;

export type RunCheckOptions = {
  log?: Log;
  /** JSON 한 줄을 내보낸 뒤에야 본 글 목록을 저장한다 */
  report?: (body: CheckBody) => void;
  userDataDir?: string;
  ohgoDir?: string;
  bandId?: string;
  now?: () => Date;
  /** 테스트에서 브라우저 대신 목록 결과를 넣는다 */
  collect?: () => Promise<FeedCollectResult>;
};

/** login이 저장한 User-Agent로 창 없는 브라우저만 연다. 창을 띄우거나 로그인을 묻지 않는다. */
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

async function browseBandPosts(userDataDir: string, bandId: string, log: Log): Promise<FeedCollectResult> {
  const context = await openHeadlessContext(userDataDir);
  try {
    const { restored } = await restoreSession(context, userDataDir);
    if (restored) log(`저장된 세션 쿠키 ${restored}개 복원`);
    const result = await collectBandPosts({ context, bandId, pageUrl: CHECK_BAND_URL, timeoutMs: CHECK_TIMEOUT_MS, log });
    if (result.ok) {
      await saveSession(context, userDataDir).catch((err: Error) => log(`세션 갱신 저장 실패: ${err.message}`));
    }
    return result;
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * 밴드 새 글을 확인만 한다. 오고피씽에 등록하거나 Band에 글을 쓰지 않는다.
 * 성공한 뒤에만 본 글 번호를 저장한다. 로그인 만료와 그 밖 실패는 본 목록을 바꾸지 않는다.
 */
export async function runCheck(options: RunCheckOptions = {}): Promise<number> {
  const log = options.log ?? (() => {});
  const report = options.report ?? (() => {});
  const userDataDir = options.userDataDir ?? USER_DATA_DIR;
  const ohgoDir = options.ohgoDir ?? OHGO_DIR;
  const bandId = options.bandId ?? CHECK_BAND_ID;
  const checkedAt = kstIso((options.now ?? (() => new Date()))());
  let reported = false;
  const once = (body: CheckBody): void => {
    if (reported) return;
    reported = true;
    report(body);
  };

  ensurePrivateDir(ohgoDir);
  const lock = acquireCheckLock(ohgoDir);
  if (!lock) {
    once({ status: 'error', checkedAt, message: 'already running' });
    return 1;
  }
  try {
    let outcome: FeedCollectResult;
    if (options.collect) {
      outcome = await options.collect();
    } else if (!hasProfile(userDataDir) || !readSession(userDataDir)) {
      once({
        status: 'login_required',
        checkedAt,
        message: '저장된 Band 로그인이 없습니다. npm run band:login 을 실행하세요.',
      });
      return 2;
    } else {
      outcome = await browseBandPosts(userDataDir, bandId, log);
    }

    if (!outcome.ok) {
      once({ status: outcome.status, checkedAt, message: outcome.message });
      return outcome.status === 'login_required' ? 2 : 1;
    }

    const state = readCheckState(ohgoDir);
    const diff = diffNewPosts(state, outcome.posts, checkedAt, bandId);
    once({ status: 'ok', checkedAt, baseline: diff.baseline, newPosts: diff.newPosts });
    try {
      writeCheckState(ohgoDir, diff.next);
    } catch (err) {
      log(`확인 상태 저장 실패: ${(err as Error).message}`);
    }
    return 0;
  } catch (err) {
    once({ status: 'error', checkedAt, message: (err as Error).message });
    return 1;
  } finally {
    lock.release();
  }
}
