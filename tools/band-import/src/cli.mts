import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { BrowserContext, Page } from 'playwright';
import { hasProfile, openContext, resolveUserDataDir, trackLoginState, waitForLoginState } from './browser.mts';
import type { LoginTracker } from './browser.mts';
import { fetchBandPost } from './fetch-post.mts';
import { validateExtracted } from './schema.mts';
import { countSessionOnly, readSession, restoreSession, saveSession } from './session-store.mts';
import { parseBandPostUrl } from './url.mts';

const TOOL_ROOT = fileURLToPath(new URL('..', import.meta.url));
const USER_DATA_DIR = resolveUserDataDir(process.env.BAND_USER_DATA_DIR, join(TOOL_ROOT, 'user-data'));
const DEFAULT_OUT_DIR = join(TOOL_ROOT, 'out');
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

const USAGE = `사용법:
  npm run band:login
  npm run band:fetch -- <band 게시글 URL> [--headed] [--timeout 30] [--out DIR] [--dry-run]
  npm run band:validate -- <extracted.json>

예:
  npm run band:fetch -- https://band.us/band/88348442/post/2925`;

async function confirmLoginAfterReload(page: Page, tracker: LoginTracker): Promise<boolean> {
  const before = tracker.responses();
  await page.goto('https://band.us/', { waitUntil: 'domcontentloaded' });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && tracker.responses() === before) await page.waitForTimeout(500);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  return tracker.responses() > before && tracker.current() === 'user';
}

async function persistLogin(context: BrowserContext): Promise<void> {
  const snapshot = await saveSession(context, USER_DATA_DIR);
  console.log(
    `세션 저장: Band 쿠키 ${snapshot.cookies.length}개(브라우저를 닫으면 사라지는 세션 쿠키 ${countSessionOnly(snapshot.cookies)}개 포함)`,
  );
}

async function login(): Promise<void> {
  console.log(`브라우저 프로필: ${USER_DATA_DIR}`);
  const context = await openContext({ userDataDir: USER_DATA_DIR, headless: false });
  try {
    const tracker = trackLoginState(context);
    const { restored } = await restoreSession(context, USER_DATA_DIR);
    if (restored) console.log(`저장된 세션 쿠키 ${restored}개 복원`);
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto('https://band.us/', { waitUntil: 'domcontentloaded' });
    const first = await waitForLoginState(tracker, 15_000);
    if (first === 'user') {
      console.log('이미 로그인되어 있습니다. 세션을 그대로 사용합니다.');
      await persistLogin(context);
      return;
    }
    console.log('열린 브라우저 창에서 Band에 로그인하세요. 로그인이 끝나면 자동으로 저장하고 닫습니다.');
    const state = await waitForLoginState(tracker, LOGIN_TIMEOUT_MS, (s) => s === 'user');
    if (state !== 'user') {
      throw new Error('로그인을 확인하지 못했습니다(10분 초과). 다시 실행해 주세요.');
    }
    // 로그인 직후 리다이렉트와 토큰 발급이 끝날 때까지 기다린 뒤 새로고침으로 한 번 더 확인한다
    await page.waitForTimeout(3000);
    if (!(await confirmLoginAfterReload(page, tracker))) {
      throw new Error(`새로고침 후 로그인 상태를 확인하지 못했습니다(상태: ${tracker.lastRaw() ?? '응답 없음'}). 다시 실행해 주세요.`);
    }
    await persistLogin(context);
    console.log('로그인 확인. 세션을 저장했습니다.');
  } finally {
    await context.close();
  }
}

async function fetchCommand(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      headed: { type: 'boolean', default: false },
      timeout: { type: 'string', default: '30' },
      out: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (positionals.length !== 1) throw new Error(`게시글 URL 하나가 필요합니다.\n\n${USAGE}`);
  const ref = parseBandPostUrl(positionals[0]);
  const outRoot = values.out ?? DEFAULT_OUT_DIR;
  const timeoutSec = Number(values.timeout);
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) throw new Error('--timeout 은 초 단위 양수여야 합니다');

  if (values['dry-run']) {
    console.log(
      JSON.stringify(
        {
          ...ref,
          outDir: join(outRoot, ref.postId),
          userDataDir: USER_DATA_DIR,
          hasProfile: hasProfile(USER_DATA_DIR),
          savedSessionAt: readSession(USER_DATA_DIR)?.savedAt ?? null,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!hasProfile(USER_DATA_DIR)) {
    throw new Error('저장된 Band 로그인 프로필이 없습니다. 먼저 `npm run band:login` 을 실행하세요.');
  }

  console.log(`브라우저 프로필: ${USER_DATA_DIR}`);
  const context = await openContext({ userDataDir: USER_DATA_DIR, headless: !values.headed });
  try {
    const { restored } = await restoreSession(context, USER_DATA_DIR);
    if (restored) console.log(`저장된 세션 쿠키 ${restored}개 복원`);
    if (!readSession(USER_DATA_DIR)) {
      console.log('주의: 세션 저장본이 없습니다. 로그인이 풀려 있으면 `npm run band:login` 을 한 번 다시 실행하세요.');
    }
    const { extracted, outDir } = await fetchBandPost({
      context,
      ref,
      outRoot,
      timeoutMs: timeoutSec * 1000,
    });
    // Band가 갱신한 토큰 쿠키를 다음 실행에서도 쓰도록 저장본을 새로 고친다
    await saveSession(context, USER_DATA_DIR);
    const errors = validateExtracted(extracted);
    if (errors.length) throw new Error(`extracted.json 스키마 오류:\n${errors.join('\n')}`);
    console.log('');
    console.log(`제목: ${extracted.title || '(없음)'}`);
    console.log(`추출 방식: ${extracted.extractedVia}, 이미지 ${extracted.images.length}개, 일정 ${extracted.schedules.length}개`);
    if (extracted.scheduleLikeLines.length) console.log(`일정 같은 줄: ${extracted.scheduleLikeLines.length}개`);
    for (const w of extracted.warnings) console.log(`주의: ${w}`);
    console.log(`저장: ${relative(process.cwd(), join(outDir, 'extracted.json'))}`);
  } finally {
    await context.close();
  }
}

function validateCommand(argv: string[]): void {
  if (argv.length !== 1) throw new Error(`파일 경로 하나가 필요합니다.\n\n${USAGE}`);
  const errors = validateExtracted(JSON.parse(readFileSync(argv[0], 'utf8')));
  if (errors.length) throw new Error(`스키마 오류:\n${errors.join('\n')}`);
  console.log('스키마 OK');
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'login':
      return login();
    case 'fetch':
      return fetchCommand(rest);
    case 'validate':
      return validateCommand(rest);
    default:
      console.log(USAGE);
      if (command && command !== 'help' && command !== '--help') process.exitCode = 1;
  }
}

main().catch((err: Error) => {
  console.error(`오류: ${err.message}`);
  process.exitCode = 1;
});
