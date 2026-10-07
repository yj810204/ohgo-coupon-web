import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FetchOptions } from '../src/commands.mts';
import { buildExtracted } from '../src/extracted.mts';
import { createGuiServer } from '../src/gui-server.mts';
import { parseBandPostUrl } from '../src/url.mts';

const dir = mkdtempSync(join(tmpdir(), 'band-gui-test-'));
const outRoot = join(dir, 'out');
const userDataDir = join(dir, 'profile');
const opened: string[] = [];
const fetchCalls: FetchOptions[] = [];
let quitCalled = 0;
let releaseLogin: () => void = () => {};

const { server, token } = createGuiServer({
  outRoot,
  userDataDir,
  htmlPath: new URL('../gui/index.html', import.meta.url).pathname,
  openPath: (p) => opened.push(p),
  onQuit: () => quitCalled++,
  runLogin: ({ log }) =>
    new Promise<void>((resolve) => {
      log('로그인 대기');
      releaseLogin = resolve;
    }),
  runFetch: async (opts) => {
    fetchCalls.push(opts);
    opts.log?.('열기\n이미지 1개 다운로드');
    if (opts.url.endsWith('/9')) throw new Error('Band에 로그인되어 있지 않습니다');
    const ref = parseBandPostUrl(opts.url);
    const outDir = join(outRoot, ref.postId);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, '01.jpg'), 'jpg-bytes');
    const extracted = buildExtracted({
      ref,
      via: 'dom',
      post: { author: null, createdAt: null, body: '10월 12일 출항\n본문', images: [], schedules: [] },
      images: [
        { index: 0, sourceUrl: 'https://a.pstatic.net/1.jpg', file: '01.jpg', width: null, height: null },
        { index: 1, sourceUrl: 'https://a.pstatic.net/2.jpg', file: null, width: null, height: null },
      ],
      fetchedAt: new Date(),
    });
    return { extracted, outDir };
  },
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const call = async (path: string, body?: unknown, auth = true) => {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: auth ? { 'x-gui-token': token } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // HTML 또는 바이너리
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 응답 JSON을 테스트에서 자유롭게 읽는다
  return { status: res.status, json: json as Record<string, any>, text };
};
const waitIdle = async () => {
  for (let i = 0; i < 100; i++) {
    const { json } = await call('/api/state');
    if (!json.busy) return json;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('작업이 끝나지 않음');
};

try {
  // 토큰 없이는 화면도 API도 열리지 않는다
  assert.equal((await call('/', undefined, false)).status, 403);
  assert.equal((await call('/api/state', undefined, false)).status, 403);
  assert.equal((await call('/api/fetch', { url: 'https://band.us/band/1/post/2' }, false)).status, 403);
  const page = await call(`/?t=${token}`, undefined, false);
  assert.equal(page.status, 200);
  assert.ok(page.text.includes(`const TOKEN = '${token}'`));
  assert.ok(page.text.includes('가져오기'));
  assert.ok(!page.text.includes('\u00b7'), 'UI 문구에 가운뎃점을 쓰지 않는다');

  let state = (await call('/api/state')).json;
  assert.equal(state.busy, false);
  assert.equal(state.hasProfile, false);
  assert.equal(state.job, null);

  const bad = await call('/api/fetch', { url: 'https://band.us/band/1' });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /게시글 경로/);

  // 가져오기 성공: 기본은 창 모드(headless false)
  assert.equal((await call('/api/fetch', { url: 'https://band.us/band/88348442/post/2925' })).status, 202);
  state = await waitIdle();
  assert.equal(state.job.kind, 'fetch');
  assert.equal(state.job.status, 'done');
  assert.deepEqual(state.job.logs, ['열기', '이미지 1개 다운로드']);
  assert.equal(fetchCalls[0].headless, false);
  assert.equal(fetchCalls[0].outRoot, outRoot);
  assert.deepEqual(
    {
      postId: state.job.result.postId,
      title: state.job.result.title,
      imageCount: state.job.result.imageCount,
      imageFiles: state.job.result.imageFiles,
      scheduleLikeLines: state.job.result.scheduleLikeLines,
    },
    { postId: '2925', title: '10월 12일 출항', imageCount: 2, imageFiles: ['01.jpg'], scheduleLikeLines: ['10월 12일 출항'] },
  );

  await call('/api/fetch', { url: 'https://band.us/band/88348442/post/2925', headless: true });
  await waitIdle();
  assert.equal(fetchCalls[1].headless, true);

  // 결과 이미지와 폴더 열기
  const img = await fetch(`${base}/out/2925/01.jpg?t=${token}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal(await img.text(), 'jpg-bytes');
  assert.equal((await fetch(`${base}/out/2925/01.jpg`)).status, 403);
  assert.equal((await call('/out/2925/..%2F..%2Fsecret.jpg')).status, 404);
  assert.equal((await call('/out/2925/extracted.sh')).status, 404);
  assert.equal((await call('/api/open', { postId: '2925' })).status, 200);
  assert.deepEqual(opened, [join(outRoot, '2925')]);
  assert.equal((await call('/api/open', { postId: '../../etc' })).status, 200, 'postId가 숫자가 아니면 out 폴더를 연다');
  assert.equal(opened[1], outRoot);

  // 실패한 작업은 오류 메시지를 남긴다
  await call('/api/fetch', { url: 'https://band.us/band/88348442/post/9' });
  state = await waitIdle();
  assert.equal(state.job.status, 'error');
  assert.match(state.job.error, /로그인되어 있지 않습니다/);

  // 작업 중에는 다른 작업을 받지 않는다
  assert.equal((await call('/api/login', {})).status, 202);
  assert.equal((await call('/api/fetch', { url: 'https://band.us/band/88348442/post/2925' })).status, 409);
  assert.equal((await call('/api/login', {})).status, 409);
  assert.equal((await call('/api/state')).json.job.logs[0], '로그인 대기');
  releaseLogin();
  state = await waitIdle();
  assert.equal(state.job.kind, 'login');
  assert.equal(state.job.status, 'done');

  assert.equal((await call('/api/quit', {})).status, 200);
  assert.equal(quitCalled, 1);
} finally {
  server.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log('band-import gui-server tests passed');
