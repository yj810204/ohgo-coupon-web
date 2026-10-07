/**
 * 실제 Band에 접속하지 않고 Playwright 라우트로 band.us / auth / api / 이미지 응답을 흉내 내
 * fetch 흐름(API 인터셉트, DOM 폴백, 비로그인 감지, 이미지 저장, extracted.json)을 검증한다.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext } from 'playwright';
import { openContext } from '../src/browser.mts';
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
    ? `fetch('https://api-us.band.us/v2.0.0/get_post?band_no=88348442&post_no=2925&resolution_type=4')`
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
    if (url.hostname === 'band.us' && url.pathname === '/band/88348442/post/2925') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageHtml(scenario) });
    }
    if (url.hostname === 'auth.band.us') {
      // 실제 Band처럼 요청에 실린 세션 쿠키로만 로그인 상태를 정한다
      const signed = /(^|;\s*)band_session=ok(;|$)/.test((await route.request().allHeaders()).cookie ?? '');
      return route.fulfill({
        contentType: 'text/javascript',
        body: `var cfg = { signedUser: ${signed}, authenticateState : "${signed ? 'USER' : 'NONE'}" };`,
      });
    }
    if (url.hostname === 'api-us.band.us') {
      return route.fulfill({
        contentType: 'application/json;charset=UTF-8',
        headers: { 'access-control-allow-origin': '*' },
        body: fixture,
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
    await saveSession(loginContext, userDataDir);
    await loginContext.close();

    // fetch: 같은 프로필을 headless로 다시 연다. 세션 쿠키는 이 시점에 사라져 있다
    const context = await openContext({ userDataDir, headless: true });
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
await withScenario({ loggedIn: false, restore: true, api: true, dom: false }, async (context, outRoot) => {
  const { extracted } = await fetchBandPost({ context, ref, outRoot, timeoutMs: 15_000, log: quiet, download });
  assert.equal(extracted.extractedVia, 'api');
});

assert.deepEqual(requestedImages, [
  'https://coresos-phinf.pstatic.net/a/test/one.jpg',
  'https://coresos-phinf.pstatic.net/a/test/two.png',
  'https://coresos-phinf.pstatic.net/a/dom/1.jpg',
  'https://coresos-phinf.pstatic.net/a/test/one.jpg',
  'https://coresos-phinf.pstatic.net/a/test/two.png',
]);

console.log('band-import offline fetch tests passed');
