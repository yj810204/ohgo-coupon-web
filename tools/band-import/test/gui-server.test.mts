import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FetchOptions } from '../src/commands.mts';
import { buildExtracted } from '../src/extracted.mts';
import { createGuiServer, toPushRequest } from '../src/gui-server.mts';
import { OhgoRequestRejected } from '../src/ohgo-service.mts';
import type { OhgoService, PushRequest } from '../src/ohgo-service.mts';
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

  assert.ok(page.text.includes('<link rel="icon" type="image/png" href="/favicon.png">'));
  const favicon = await fetch(`${base}/favicon.png`);
  assert.equal(favicon.status, 200);
  assert.equal(favicon.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await favicon.arrayBuffer()).subarray(1, 4).toString('ascii'), 'PNG');

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

  // 오고피씽 서비스가 없으면 등록 API는 503
  assert.equal((await call('/api/ohgo/state')).status, 503);

  assert.equal((await call('/api/quit', {})).status, 200);
  assert.equal(quitCalled, 1);
} finally {
  server.close();
}

// ---------- 오고피씽 등록 API ----------
const pushes: PushRequest[] = [];
const ohgoCalls: string[] = [];
let releasePush: () => void = () => {};
let loggedIn = false;
const fakeOhgo: OhgoService = {
  state: async () => ({ baseUrl: 'https://ohgo.test', supabaseUrl: 'https://x.supabase.co', configError: null, user: loggedIn ? { name: '선장', userId: 'u', savedAt: 'now' } : null }),
  login: async (creds) => {
    ohgoCalls.push(`login ${JSON.stringify(creds)}`);
    if ('name' in creds && creds.name !== '선장') throw new OhgoRequestRejected('관리자 계정이 아닙니다', 403);
    loggedIn = true;
    return fakeOhgo.state();
  },
  logout: async () => {
    loggedIn = false;
    return fakeOhgo.state();
  },
  prepare: async (postId) => {
    ohgoCalls.push(`prepare ${postId}`);
    if (postId !== '2925') throw new OhgoRequestRejected('가져온 결과가 없습니다', 404);
    return { postId } as Awaited<ReturnType<OhgoService['prepare']>>;
  },
  checkPush: (req) => {
    if (req.postId === 'dup') throw new OhgoRequestRejected('이미 등록한 게시글입니다', 409, 'DUPLICATE');
  },
  push: (req, log) => {
    pushes.push(req);
    log('사진 올리는 중 1/1');
    return new Promise((resolve) => {
      releasePush = () => resolve({ kind: req.kind, target: 'community_photos', rowIds: ['r1'], links: ['https://ohgo.test/community/r1'], title: 't', resizedImages: 0 });
    });
  },
  isAppLink: (url) => url.startsWith('https://ohgo.test/'),
};
const opened2: string[] = [];
const gui2 = createGuiServer({
  outRoot,
  userDataDir,
  htmlPath: new URL('../gui/index.html', import.meta.url).pathname,
  openPath: (p) => opened2.push(p),
  ohgo: fakeOhgo,
  runLogin: async () => {},
  runFetch: async () => {
    throw new Error('unused');
  },
});
await new Promise<void>((r) => gui2.server.listen(0, '127.0.0.1', r));
const base2 = `http://127.0.0.1:${(gui2.server.address() as AddressInfo).port}`;
const call2 = async (path: string, body?: unknown, auth = true) => {
  const res = await fetch(base2 + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: auth ? { 'x-gui-token': gui2.token } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 응답 JSON을 테스트에서 자유롭게 읽는다
  return { status: res.status, json: (await res.json()) as Record<string, any> };
};
try {
  assert.equal((await call2('/api/ohgo/state', undefined, false)).status, 403, '등록 API도 토큰이 필요하다');
  assert.equal((await call2('/api/ohgo/push', { postId: '2925', kind: 'catch' }, false)).status, 403);
  assert.equal((await call2('/api/ohgo/state')).json.user, null);

  const denied = await call2('/api/ohgo/login', { name: '손님', dob: '900101' });
  assert.equal(denied.status, 403);
  assert.match(denied.json.error, /관리자 계정이 아닙니다/);
  const ok = await call2('/api/ohgo/login', { name: '선장', dob: '800101' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.name, '선장');
  await call2('/api/ohgo/login', { email: 'a@b.c', password: 'pw' });
  assert.equal(ohgoCalls[2], 'login {"email":"a@b.c","password":"pw"}');

  assert.equal((await call2('/api/ohgo/prepare', { postId: '2925' })).status, 200);
  assert.equal((await call2('/api/ohgo/prepare', { postId: '1' })).status, 404);

  assert.equal((await call2('/api/ohgo/push', { postId: '2925', kind: 'nope' })).status, 400);
  const dup = await call2('/api/ohgo/push', { postId: 'dup', kind: 'catch', photo: {} });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.code, 'DUPLICATE');

  const started = await call2('/api/ohgo/push', { postId: '2925', kind: 'catch', photo: { title: 't', description: 'd', images: ['01.jpg'] } });
  assert.equal(started.status, 202);
  assert.equal(started.json.job.kind, 'push');
  assert.equal((await call2('/api/ohgo/push', { postId: '2925', kind: 'catch', photo: {} })).status, 409, '등록 중에는 다시 받지 않는다');
  assert.equal((await call2('/api/fetch', { url: 'https://band.us/band/88348442/post/2925' })).status, 409);
  releasePush();
  let st2 = (await call2('/api/state')).json;
  for (let i = 0; i < 50 && st2.busy; i++) {
    await new Promise((r) => setTimeout(r, 20));
    st2 = (await call2('/api/state')).json;
  }
  assert.equal(st2.job.status, 'done');
  assert.deepEqual(st2.job.result.links, ['https://ohgo.test/community/r1']);
  assert.deepEqual(st2.job.logs, ['사진 올리는 중 1/1']);
  assert.deepEqual(pushes[0], { postId: '2925', kind: 'catch', force: false, photo: { title: 't', description: 'd', photoDate: null, images: ['01.jpg'] } });

  assert.equal((await call2('/api/ohgo/open-link', { url: 'https://ohgo.test/community/r1' })).status, 200);
  assert.equal((await call2('/api/ohgo/open-link', { url: 'file:///etc/passwd' })).status, 400, '오고피씽 주소만 연다');
  assert.deepEqual(opened2, ['https://ohgo.test/community/r1']);

  assert.equal((await call2('/api/ohgo/logout', {})).json.user, null);
} finally {
  gui2.server.close();
  rmSync(dir, { recursive: true, force: true });
}

// 화면에서 온 일정 입력값 해석
const tripReq = toPushRequest({
  postId: '2925',
  kind: 'schedule',
  force: true,
  trip: {
    refDate: '2026-10-06',
    destination: '형제섬',
    capacity: '10',
    contact: '010-3597-4100',
    rows: [
      { date: '2026-10-12', species: '감성돔', departureTime: '05:00', price: '120,000', notes: '자리여유', selected: true },
      { date: '10/13', departureTime: '06:00', returnTime: '13:00', price: '' },
    ],
  },
});
assert.deepEqual(tripReq, {
  postId: '2925',
  kind: 'schedule',
  force: true,
  trip: {
    destination: '형제섬',
    capacity: 10,
    contact: '010-3597-4100',
    rows: [
      { date: '2026-10-12', species: '감성돔', departureTime: '05:00', returnTime: '', price: 120000, notes: '자리여유' },
      { date: '2026-10-13', species: '', departureTime: '06:00', returnTime: '13:00', price: null, notes: '' },
    ],
  },
});
assert.equal(toPushRequest({ postId: '1', kind: 'schedule', trip: { rows: Array.from({ length: 50 }, () => ({})) } }).trip!.rows.length, 32, '너무 많은 줄은 잘라서 검사에서 걸리게 한다');
assert.deepEqual(toPushRequest({ postId: '1', kind: 'schedule', trip: { rows: 'x' } }).trip!.rows, []);
assert.ok(Number.isNaN(toPushRequest({ postId: '1', kind: 'schedule', trip: { capacity: '열명' } }).trip!.capacity), '숫자가 아니면 검사에서 걸린다');
assert.throws(() => toPushRequest({ postId: '1' }), /등록 종류/);

console.log('band-import gui-server tests passed');
