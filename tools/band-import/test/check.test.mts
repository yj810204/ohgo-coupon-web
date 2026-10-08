/**
 * 새 글 확인의 상태/차이 계산과 로그인 만료 판정.
 * 실제 Band에는 접속하지 않고 픽스처와 주입한 목록만 쓴다.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAuthKeyScript } from '../src/auth-state.mts';
import { isLoginUrl, loginRequiredReason } from '../src/check-login.mts';
import { findPostsInJson, listPostFromRaw } from '../src/check-feed.mts';
import {
  acquireCheckLock,
  CHECK_LOCK_FILE,
  CHECK_STATE_FILE,
  diffNewPosts,
  kstIso,
  readCheckState,
  snippetOf,
  toKstIso,
} from '../src/check-state.mts';
import type { ListPost } from '../src/check-state.mts';
import { runCheck } from '../src/check-run.mts';
import { ensurePrivateDir } from '../src/local-store.mts';

const fixtureDir = new URL('./fixtures/', import.meta.url);
const feed = JSON.parse(readFileSync(new URL('check-feed.json', fixtureDir), 'utf8'));
const authNone = readFileSync(new URL('check-auth-none.js', fixtureDir), 'utf8');
const authUser = readFileSync(new URL('check-auth-user.js', fixtureDir), 'utf8');
const memberHtml = readFileSync(new URL('check-member-only.html', fixtureDir), 'utf8');
const loginUrl = readFileSync(new URL('check-login-url.txt', fixtureDir), 'utf8').trim();

const none = parseAuthKeyScript(authNone);
const user = parseAuthKeyScript(authUser);
assert.equal(none.state, 'none');
assert.equal(none.raw, 'NONE');
assert.equal(user.state, 'user');

assert.equal(isLoginUrl(loginUrl), true);
assert.equal(isLoginUrl('https://nid.naver.com/nidlogin.login'), true);
assert.equal(isLoginUrl('https://band.us/band/88348442'), false);

assert.equal(
  loginRequiredReason({ url: loginUrl, authenticateState: null, bodyText: '' }, 0),
  'Band 로그인 페이지로 이동했습니다. npm run band:login 을 다시 실행하세요.',
);
assert.equal(
  loginRequiredReason({ url: 'https://band.us/band/88348442', authenticateState: none.raw, bodyText: '' }, 0),
  'Band 로그인이 만료되었습니다 (상태: NONE). npm run band:login 을 다시 실행하세요.',
);
assert.match(
  loginRequiredReason({ url: 'https://band.us/band/88348442', authenticateState: user.raw, bodyText: memberHtml }, 0) ?? '',
  /멤버만/,
);
assert.equal(
  loginRequiredReason({ url: 'https://band.us/band/88348442', authenticateState: 'NONE', bodyText: '로그인' }, 3),
  null,
  '글을 읽었으면 로그인 만료로 보지 않는다',
);
assert.equal(loginRequiredReason({ url: 'https://band.us/band/88348442', authenticateState: user.raw, bodyText: '글 목록' }, 0), null);

const rawPosts = findPostsInJson(feed);
assert.equal(rawPosts.length, 3);
const listed = rawPosts.map((raw) => listPostFromRaw(raw, '88348442')).filter((p): p is ListPost => p !== null);
assert.deepEqual(listed.map((p) => p.postNo), [3100, 3099]);
assert.equal(listed[0].author, '오고피싱 선장');
assert.equal(listed[0].url, 'https://band.us/band/88348442/post/3100');
assert.equal(listed[0].photoCount, 2);
assert.equal(listed[0].kind, '조황');
assert.equal(listed[1].kind, '일정');
assert.equal(listed[1].photoCount, 0);
assert.equal(listed[0].createdAt, toKstIso(new Date(1791417600000).toISOString()));
assert.ok(listed[0].createdAt?.endsWith('+09:00'));
assert.equal(snippetOf('가'.repeat(80)).length, 60);

const hello = listPostFromRaw(
  { post_no: 7, band_no: 88348442, content: '안녕하세요 반갑습니다', attachment: {}, created_at: 1791417600000, author: { name: '선장' } },
  '88348442',
);
assert.equal(hello?.kind, '기타');

const wrapped = findPostsInJson({ result_data: JSON.stringify(feed.result_data) });
assert.equal(wrapped.length, 3);

function post(postNo: number, createdAt: string | null, snippet = `글 ${postNo}`): ListPost {
  return {
    postNo,
    url: `https://band.us/band/88348442/post/${postNo}`,
    createdAt,
    author: '선장',
    snippet,
    photoCount: 1,
    kind: '기타',
  };
}

const checkedAt = '2026-10-08T19:00:00.000+09:00';
const first = diffNewPosts(null, [post(10, '2026-10-08T10:00:00.000+09:00'), post(9, '2026-10-07T10:00:00.000+09:00')], checkedAt, '88348442');
assert.equal(first.baseline, true);
assert.deepEqual(first.newPosts, []);
assert.deepEqual(Object.keys(first.next.seen).sort(), ['10', '9']);

const second = diffNewPosts(
  first.next,
  [post(11, '2026-10-08T12:00:00.000+09:00'), post(10, '2026-10-08T10:00:00.000+09:00'), post(1, '2026-10-01T00:00:00.000+09:00')],
  checkedAt,
  '88348442',
);
assert.equal(second.baseline, false);
assert.deepEqual(second.newPosts.map((p) => p.postNo), [11]);
assert.equal(second.next.seen['11'], '2026-10-08T12:00:00.000+09:00');
assert.ok(!('1' in second.next.seen), '가장 최근 글보다 2일 넘게 오래된 글은 알리지 않고 본 목록에도 넣지 않는다');

const third = diffNewPosts(second.next, [post(11, '2026-10-08T12:00:00.000+09:00'), post(10, '2026-10-08T10:00:00.000+09:00')], checkedAt, '88348442');
assert.deepEqual(third.newPosts, []);

assert.equal(kstIso(new Date('2026-10-08T01:00:00.000Z')), '2026-10-08T10:00:00.000+09:00');

const dir = mkdtempSync(join(tmpdir(), 'band-check-'));
try {
  const bodies: unknown[] = [];
  const collect = async () => ({ ok: true as const, posts: listed });
  let stateDuringReport = true;
  const code = await runCheck({
    ohgoDir: dir,
    userDataDir: join(dir, 'no-profile'),
    log: () => {},
    now: () => new Date('2026-10-08T10:00:00.000Z'),
    collect,
    report: (body) => {
      stateDuringReport = existsSync(join(dir, CHECK_STATE_FILE));
      bodies.push(body);
    },
  });
  assert.equal(code, 0);
  assert.equal(stateDuringReport, false);
  assert.equal((bodies[0] as { baseline: boolean }).baseline, true);
  assert.deepEqual((bodies[0] as { newPosts: unknown[] }).newPosts, []);
  const saved = readCheckState(dir);
  assert.deepEqual(Object.keys(saved?.seen ?? {}).sort(), ['3099', '3100']);
  assert.equal(statSync(join(dir, CHECK_STATE_FILE)).mode & 0o777, 0o600);
  assert.equal(statSync(dir).mode & 0o777, 0o700);

  const again = await runCheck({
    ohgoDir: dir,
    log: () => {},
    now: () => new Date('2026-10-08T11:00:00.000Z'),
    collect: async () => ({
      ok: true,
      posts: [...listed, post(3101, '2026-10-08T19:30:00.000+09:00', '오늘 감성돔 조황 추가')],
    }),
    report: (body) => bodies.push(body),
  });
  assert.equal(again, 0);
  const fresh = bodies[1] as { baseline: boolean; newPosts: ListPost[] };
  assert.equal(fresh.baseline, false);
  assert.deepEqual(fresh.newPosts.map((p) => p.postNo), [3101]);

  const quiet = await runCheck({
    ohgoDir: dir,
    log: () => {},
    collect: async () => ({
      ok: true,
      posts: [...listed, post(3101, '2026-10-08T19:30:00.000+09:00', '오늘 감성돔 조황 추가')],
    }),
    report: (body) => bodies.push(body),
  });
  assert.equal(quiet, 0);
  assert.deepEqual((bodies[2] as { newPosts: unknown[] }).newPosts, []);

  const beforeFail = readFileSync(join(dir, CHECK_STATE_FILE), 'utf8');
  const expired = await runCheck({
    ohgoDir: dir,
    log: () => {},
    collect: async () => ({ ok: false as const, status: 'login_required' as const, message: 'Band 로그인이 만료되었습니다 (상태: NONE). npm run band:login 을 다시 실행하세요.' }),
    report: (body) => bodies.push(body),
  });
  assert.equal(expired, 2);
  assert.equal((bodies[3] as { status: string }).status, 'login_required');
  assert.equal(readFileSync(join(dir, CHECK_STATE_FILE), 'utf8'), beforeFail);

  const broken = await runCheck({
    ohgoDir: dir,
    log: () => {},
    collect: async () => ({ ok: false as const, status: 'error' as const, message: '밴드 목록을 60초 안에 열지 못했습니다.' }),
    report: (body) => bodies.push(body),
  });
  assert.equal(broken, 1);
  assert.equal(readFileSync(join(dir, CHECK_STATE_FILE), 'utf8'), beforeFail);

  const held = acquireCheckLock(dir);
  assert.ok(held);
  assert.equal(statSync(join(dir, CHECK_LOCK_FILE)).mode & 0o777, 0o600);
  const overlap = await runCheck({
    ohgoDir: dir,
    log: () => {},
    collect: async () => {
      throw new Error('겹치면 브라우저를 열면 안 된다');
    },
    report: (body) => bodies.push(body),
  });
  assert.equal(overlap, 1);
  assert.deepEqual(bodies[5], { status: 'error', checkedAt: bodies[5] && (bodies[5] as { checkedAt: string }).checkedAt, message: 'already running' });
  assert.equal((bodies[5] as { message: string }).message, 'already running');
  held.release();
  assert.equal(existsSync(join(dir, CHECK_LOCK_FILE)), false);

  writeFileSync(join(dir, CHECK_LOCK_FILE), JSON.stringify({ pid: 2_147_483_647, startedAt: Date.now() }));
  chmodSync(join(dir, CHECK_LOCK_FILE), 0o600);
  const recovered = acquireCheckLock(dir);
  assert.ok(recovered, '죽은 프로세스의 잠금은 걷어 낸다');
  recovered?.release();

  writeFileSync(join(dir, CHECK_STATE_FILE), '{');
  const corrupt = await runCheck({
    ohgoDir: dir,
    log: () => {},
    collect: async () => ({ ok: true as const, posts: listed }),
    report: (body) => bodies.push(body),
  });
  assert.equal(corrupt, 1);
  assert.equal((bodies[6] as { status: string }).status, 'error');
  assert.equal(readFileSync(join(dir, CHECK_STATE_FILE), 'utf8'), '{');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const cliDir = mkdtempSync(join(tmpdir(), 'band-check-cli-'));
try {
  ensurePrivateDir(cliDir);
  const res = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings=ExperimentalWarning', 'tools/band-import/src/check-cli.mts', 'check'],
    {
      cwd: join(import.meta.dirname, '..', '..', '..'),
      env: { ...process.env, BAND_OHGO_DIR: cliDir, BAND_USER_DATA_DIR: join(cliDir, 'empty-profile') },
      encoding: 'utf8',
    },
  );
  const lines = res.stdout.split('\n').filter((line) => line.length > 0);
  assert.equal(lines.length, 1, res.stdout);
  assert.equal(res.status, 2);
  const body = JSON.parse(lines[0]) as { status: string; message: string };
  assert.equal(body.status, 'login_required');
  assert.match(body.message, /로그인/);
  assert.equal(existsSync(join(cliDir, CHECK_STATE_FILE)), false);
  assert.equal(res.stdout.endsWith('\n'), true);
} finally {
  rmSync(cliDir, { recursive: true, force: true });
}

console.log('band-import check tests passed');
