/**
 * 실제 Band에 접속하지 않고 Playwright 라우트로 band.us / auth / api / 이미지 응답을 흉내 내
 * fetch 흐름(API 인터셉트, DOM 폴백, 비로그인 감지, 이미지 저장, extracted.json)을 검증한다.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext } from 'playwright';
import { openContext, trackLoginState, waitForLoginState, watchWindowClosed, WindowClosedError } from '../src/browser.mts';
import { runFetch } from '../src/commands.mts';
import { restoreSession, saveSession } from '../src/session-store.mts';
import { fetchBandPost } from '../src/fetch-post.mts';
import type { ImageDownloader } from '../src/fetch-post.mts';
import { validateExtracted } from '../src/schema.mts';
import { parseBandPostUrl } from '../src/url.mts';

const fixture = readFileSync(new URL('./fixtures/get-post.json', import.meta.url), 'utf8');
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

type Scenario = {
  /** login 단계에서 Band 세션 쿠키를 받았는지 */
  loggedIn: boolean;
  /** fetch 시작 시 저장된 세션을 복원하는지 */
  restore: boolean;
  api: boolean;
  dom: boolean;
  /** false면 로그인과 상관없이 게시글을 내려준다 */
  membersOnly?: boolean;
};

function pageHtml({ api, dom }: Scenario): string {
  const domMarkup = dom
    ? `<div class="postWrap -postDetailPage"><div class="postMain">
         <div class="postWriterInfoWrap"><strong class="text">DOM 작성자</strong><time class="time">10월 6일</time></div>
         <div class="postBody"><div class="dPostTextView"><div class="postText"><p class="txtBody">DOM 제목<br>11/3 05:00 출항</p></div></div>
           <button class="collageImage"><img class="_image" src="https://coresos-phinf.pstatic.net/a/dom/1.jpg?type=w720"></button>
         </div></div></div>`
    : '';
  const apiScript = api
    ? `fetch('https://bapi.band.us/v2.0.0/batch', { method: 'POST', body: 'payload=[]' })`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <script src="https://auth.band.us/s/login/getKey?_t=1&callback=cb"></script>
    <script>${apiScript}</script>
    ${domMarkup}
  </body></html>`;
}

async function routeFakeBand(context: BrowserContext, scenario: Scenario): Promise<void> {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    // 실제 Band처럼 세션 쿠키로만 로그인 상태를 정하고, headless 표시가 있는 User-Agent는 로그인으로 보지 않는다
    const headers = await route.request().allHeaders();
    const signed =
      /(^|;\s*)band_session=ok(;|$)/.test(headers.cookie ?? '') && !(headers['user-agent'] ?? '').includes('HeadlessChrome');
    if (url.hostname === 'band.us' && url.pathname === '/band/88348442/post/2925') {
      const visible = signed || scenario.membersOnly === false;
      const html = pageHtml(visible ? scenario : { ...scenario, api: false, dom: false });
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    }
    if (url.hostname === 'auth.band.us') {
      return route.fulfill({
        contentType: 'text/javascript',
        body: `var cfg = { signedUser: ${signed}, authenticateState : "${signed ? 'USER' : 'NONE'}" };`,
      });
    }
    if (url.hostname === 'bapi.band.us') {
      return route.fulfill({
        contentType: 'application/json;charset=UTF-8',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          result_code: 1,
          result_data: { batch_result: [JSON.parse(fixture), { result_code: 1, result_data: { emotions: [] } }] },
        }),
      });
    }
    return route.abort();
  });
}

async function withScenario(scenario: Scenario, run: (ctx: BrowserContext, outRoot: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'band-import-test-'));
  const userDataDir = join(dir, 'profile');
  try {
    // login: 헤드 모드에서 세션 쿠키(만료일 없음)를 받고 저장한 뒤 브라우저를 닫는다
    const loginContext = await openContext({ userDataDir, headless: false });
    if (scenario.loggedIn) {
      await loginContext.addCookies([
        { name: 'band_session', value: 'ok', domain: '.band.us', path: '/', expires: -1, secure: true, sameSite: 'None' },
        { name: 'band_persist', value: '1', domain: '.band.us', path: '/', expires: Date.now() / 1000 + 86400 },
      ]);
    }
    const loginPage = loginContext.pages()[0] ?? (await loginContext.newPage());
    const userAgent = await loginPage.evaluate(() => navigator.userAgent);
    await saveSession(loginContext, userDataDir, userAgent);
    await loginContext.close();

    // fetch: 같은 프로필을 headless로 다시 연다. 세션 쿠키는 이 시점에 사라져 있다
    const context = await openContext({ userDataDir, headless: true, userAgent });
    try {
      const jar = (await context.cookies()).map((c) => c.name);
      assert.ok(!jar.includes('band_session'), '재시작 후 세션 쿠키는 프로필에서 사라진다');
      if (scenario.loggedIn) assert.ok(jar.includes('band_persist'), 'headed에서 받은 영속 쿠키는 headless에서도 보인다');
      if (scenario.restore) await restoreSession(context, userDataDir);
      await routeFakeBand(context, scenario);
      await run(context, join(dir, 'out'));
    } finally {
      await context.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ref = parseBandPostUrl('https://band.us/band/88348442/post/2925');
const quiet = () => {};
const requestedImages: string[] = [];
const download: ImageDownloader = async (url) => {
  requestedImages.push(url);
  if (url.endsWith('/two.png')) throw new Error('HTTP 404');
  return { body: PNG_1PX, contentType: 'image/png' };
};

await withScenario({ loggedIn: true, restore: true, api: true, dom: true }, async (context, outRoot) => {
  const { extracted, outDir } = await fetchBandPost({ context, ref, outRoot, timeoutMs: 10_000, log: quiet, download });
  assert.equal(extracted.extractedVia, 'api');
  assert.equal(extracted.author, '오고피싱 선장');
  assert.equal(extracted.title, '10월 12일 갈치 출항 안내');
  assert.equal(extracted.schedules.length, 1);
  assert.deepEqual(
    extracted.images.map((i) => i.file),
    ['01.png', null],
  );
  assert.ok(existsSync(join(outDir, '01.png')));
  assert.ok(existsSync(join(outDir, 'api-post.json')));
  const network = JSON.parse(readFileSync(join(outDir, 'network-log.json'), 'utf8'));
  assert.deepEqual(
    network.filter((e: { matched: boolean }) => e.matched).map((e: { url: string }) => e.url),
    ['https://bapi.band.us/v2.0.0/batch'],
  );
  const onDisk = JSON.parse(readFileSync(join(outDir, 'extracted.json'), 'utf8'));
  assert.deepEqual(validateExtracted(onDisk), []);
  assert.deepEqual(onDisk, extracted);
});

await withScenario({ loggedIn: true, restore: true, api: false, dom: true }, async (context, outRoot) => {
  const { extracted, outDir } = await fetchBandPost({ context, ref, outRoot, timeoutMs: 10_000, log: quiet, download });
  assert.equal(extracted.extractedVia, 'dom');
  assert.equal(extracted.author, 'DOM 작성자');
  assert.equal(extracted.body, 'DOM 제목\n11/3 05:00 출항');
  assert.deepEqual(extracted.scheduleLikeLines, ['11/3 05:00 출항']);
  assert.deepEqual(extracted.images, [
    { index: 0, sourceUrl: 'https://coresos-phinf.pstatic.net/a/dom/1.jpg', file: '01.png', width: null, height: null },
  ]);
  assert.ok(!existsSync(join(outDir, 'api-post.json')));
  assert.equal(extracted.warnings.length, 1);
});

// 운영자 버그 재현: login은 성공했지만 세션 쿠키를 복원하지 않으면 NONE 으로 보인다
await withScenario({ loggedIn: true, restore: false, api: false, dom: false }, async (context, outRoot) => {
  await assert.rejects(
    fetchBandPost({ context, ref, outRoot, timeoutMs: 15_000, log: quiet, download }),
    /로그인되어 있지 않습니다 \(로그인 상태: NONE, Band 쿠키 1개\)/,
  );
});

// 로그인 상태 응답이 NONE이어도 게시글 응답이 오면 실패로 보지 않는다
await withScenario({ loggedIn: false, restore: true, api: true, dom: false, membersOnly: false }, async (context, outRoot) => {
  const { extracted } = await fetchBandPost({ context, ref, outRoot, timeoutMs: 15_000, log: quiet, download });
  assert.equal(extracted.extractedVia, 'api');
});

// runFetch: headless에서도 login 때의 User-Agent를 써서 로그인 상태로 보인다
async function withLoggedInProfile(saveUserAgent: boolean, loggedIn: boolean, run: (userDataDir: string, outRoot: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'band-import-run-'));
  const userDataDir = join(dir, 'profile');
  try {
    const loginContext = await openContext({ userDataDir, headless: false });
    if (loggedIn) {
      await loginContext.addCookies([
        { name: 'band_session', value: 'ok', domain: '.band.us', path: '/', expires: -1, secure: true, sameSite: 'None' },
      ]);
    }
    const page = loginContext.pages()[0] ?? (await loginContext.newPage());
    const ua = await page.evaluate(() => navigator.userAgent);
    await saveSession(loginContext, userDataDir, saveUserAgent ? ua : undefined);
    await loginContext.close();
    await run(userDataDir, join(dir, 'out'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const url = 'https://band.us/band/88348442/post/2925';
for (const saveUserAgent of [true, false]) {
  await withLoggedInProfile(saveUserAgent, true, async (userDataDir, outRoot) => {
    const logs: string[] = [];
    let contexts = 0;
    const { extracted } = await runFetch({
      url,
      headless: true,
      userDataDir,
      outRoot,
      timeoutMs: 10_000,
      log: (m) => logs.push(m),
      download,
      prepareContext: async (context) => {
        contexts++;
        await routeFakeBand(context, { loggedIn: true, restore: true, api: false, dom: true });
      },
    });
    assert.equal(extracted.extractedVia, 'dom');
    assert.equal(contexts, 1, `창 모드 재시도 없이 headless로 끝난다 (UA 저장 ${saveUserAgent})`);
    assert.ok(!logs.some((l) => l.includes('창 모드로 다시')));
  });
}

// headless에서 로그인이 안 되면 창 모드로 한 번 더 시도한다
await withLoggedInProfile(true, false, async (userDataDir, outRoot) => {
  const logs: string[] = [];
  const modes: boolean[] = [];
  await assert.rejects(
    runFetch({
      url,
      headless: true,
      userDataDir,
      outRoot,
      timeoutMs: 10_000,
      log: (m) => logs.push(m),
      download,
      prepareContext: async (context) => {
        modes.push(true);
        await routeFakeBand(context, { loggedIn: false, restore: true, api: false, dom: false });
      },
    }),
    /로그인되어 있지 않습니다/,
  );
  assert.equal(modes.length, 2);
  assert.ok(logs.some((l) => l.includes('창 모드로 다시 시도합니다')));
  assert.ok(logs.some((l) => l.includes('(창 모드)')));
});

assert.deepEqual(requestedImages, [
  'https://coresos-phinf.pstatic.net/a/test/one.jpg',
  'https://coresos-phinf.pstatic.net/a/test/two.png',
  'https://coresos-phinf.pstatic.net/a/dom/1.jpg',
  'https://coresos-phinf.pstatic.net/a/test/one.jpg',
  'https://coresos-phinf.pstatic.net/a/test/two.png',
  'https://coresos-phinf.pstatic.net/a/dom/1.jpg',
  'https://coresos-phinf.pstatic.net/a/dom/1.jpg',
]);

// 대조군: User-Agent를 맞추지 않은 headless는 같은 쿠키로도 로그인 상태로 보이지 않는다
await withLoggedInProfile(true, true, async (userDataDir) => {
  const context = await openContext({ userDataDir, headless: true });
  try {
    await restoreSession(context, userDataDir);
    await routeFakeBand(context, { loggedIn: true, restore: true, api: true, dom: true });
    await assert.rejects(
      fetchBandPost({ context, ref, outRoot: join(userDataDir, '..', 'out'), timeoutMs: 10_000, log: quiet, download }),
      /로그인되어 있지 않습니다/,
    );
  } finally {
    await context.close();
  }
});

// login 창을 닫으면 10분을 기다리지 않고 바로 멈춘다
{
  const dir = mkdtempSync(join(tmpdir(), 'band-import-close-'));
  const context = await openContext({ userDataDir: join(dir, 'profile'), headless: false });
  try {
    const isClosed = watchWindowClosed(context);
    const tracker = trackLoginState(context);
    const page = context.pages()[0] ?? (await context.newPage());
    const started = Date.now();
    setTimeout(() => void page.close(), 300);
    await assert.rejects(waitForLoginState(tracker, 60_000, (s) => s === 'user', isClosed), WindowClosedError);
    assert.ok(Date.now() - started < 5000);
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('band-import offline fetch tests passed');
