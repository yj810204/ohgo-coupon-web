import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExtracted } from '../src/extracted.mts';
import { editedFileName } from '../src/image-edit.mts';
import { PUSH_LOG_FILE, readPushRuns } from '../src/push-log.mts';
import { createBrowserReencoder, MAX_UPLOAD_BYTES, prepareImage } from '../src/image-prep.mts';
import { LEDGER_FILE, readLedger } from '../src/ledger.mts';
import { ensureFreshSession, OHGO_SESSION_FILE, readOhgoSession, saveOhgoSession } from '../src/ohgo-auth.mts';
import { imageFileName, normalizeApiPost, normalizeDomSnapshot } from '../src/normalize.mts';
import { newPhotoObjectPath, publicPhotoUrl } from '../src/ohgo-client.mts';
import { findSupabaseConfigInText, resolveOhgoConfig } from '../src/ohgo-config.mts';
import { createOhgoService, OhgoRequestRejected } from '../src/ohgo-service.mts';
import type { PushRequest } from '../src/ohgo-service.mts';
import { catchBoardTime } from '../src/trip-parse.mts';
import { parseBandPostUrl } from '../src/url.mts';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload: Record<string, unknown>) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;

const REF = 'abcdefghijklmnopqrst';
const SB = `https://${REF}.supabase.co`;
const SITE = 'https://ohgo.test';
const ANON = jwt({ iss: 'supabase', ref: REF, role: 'anon' });
const SERVICE = jwt({ iss: 'supabase', ref: REF, role: 'service_role' });
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const now = () => Math.floor(Date.now() / 1000);
const token = (sub: string, n: number, exp = now() + 3600) => jwt({ sub, role: 'authenticated', exp, n });

// ---------- 가짜 오고피씽 웹 + Supabase ----------
type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };
const calls: Call[] = [];
const storage = new Map<string, { type: string; size: number }>();
const rows: Record<string, Record<string, unknown>[]> = { community_photos: [], trip_guides: [], captain_photos: [], captain_photo_tags: [] };
const roster = {
  attendance: [] as Record<string, unknown>[],
  guests: [] as Record<string, unknown>[],
  boarding: [] as { user_id: string; trip_role: string }[],
  guestBoarding: [] as { guest_id: string; trip_role: string }[],
  extraProfiles: [] as { id: string; name: string; role: string; expo_push_token: string | null }[],
};
const idsIn = (param: string | null): string[] | null => {
  if (!param?.startsWith('in.(') || !param.endsWith(')')) return null;
  return param
    .slice(4, -1)
    .split(',')
    .map((id) => id.replace(/^"|"$/g, ''))
    .filter(Boolean);
};
const tripDateQueries: string[] = [];
const fake = {
  issued: 0,
  validTokens: new Map<string, string>(),
  missingColumns: new Set<string>(),
  failTripInsertAt: -1,
  tripInserts: 0,
  /** n번째(0부터) 사진 올리기를 거절한다 */
  rejectUploadAt: -1,
  uploads: 0,
  /** 권한이 없어 Storage 삭제가 아무것도 안 지우고 200으로 답하는 경우 */
  storageDeleteNoop: false,
  /** 저장은 되지만 image_urls가 빈 채로 읽히는 경우 */
  dropImageUrls: false,
  /** 공개 주소가 열리지 않는 경우 */
  publicBroken: false,
  /** 갱신 요청을 가로챈다. Response를 돌려주면 그것을 쓰고, null이면 평소대로 */
  onRefresh: null as ((token: string) => Response | null) | null,
};

function issue(sub: string, exp?: number) {
  fake.issued++;
  const access = token(sub, fake.issued, exp);
  const refresh = `refresh-${fake.issued}`;
  fake.validTokens.set(access, sub);
  fake.validTokens.set(refresh, sub);
  return { access_token: access, refresh_token: refresh, expires_at: exp ?? now() + 3600 };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fakeFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const method = init.method ?? 'GET';
  const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
  let body: unknown = init.body;
  if (typeof body === 'string' && headers['content-type']?.includes('json')) body = JSON.parse(body);
  calls.push({ method, url: url.toString(), headers, body });
  const bearer = headers.authorization?.replace(/^Bearer /, '') ?? '';
  const who = fake.validTokens.get(bearer) ?? null;

  if (url.origin === 'https://exp.host') return json(200, { data: { status: 'ok' } });
  if (url.origin === SITE) {
    if (url.pathname === '/') return new Response('<script src="/_next/static/chunks/a.js"></script><script src="/_next/static/chunks/b.js"></script><script src="https://cdn.other/x.js"></script>');
    if (url.pathname === '/_next/static/chunks/a.js') return new Response(`var k="${SERVICE}"`);
    if (url.pathname === '/_next/static/chunks/b.js') return new Response(`createClient("${SB}","${ANON}")`);
    if (url.pathname === '/api/auth/legacy-login' && method === 'POST') {
      const b = body as { name: string; dob: string; register: boolean };
      assert.equal(b.register, false, '가입하지 않는다');
      if (b.name === '없음') return json(404, { ok: false, code: 'NOT_REGISTERED', error: '등록된 회원 정보가 없습니다.' });
      const t = issue(b.name === '관리자' ? ADMIN_ID : USER_ID);
      return json(200, { access_token: t.access_token, refresh_token: t.refresh_token, user: { name: b.name, isAdmin: b.name === '관리자' } });
    }
  }
  if (url.origin === SB) {
    const path = url.pathname;
    if (path.startsWith('/storage/v1/object/public/photos/') && method === 'HEAD') {
      const key = decodeURIComponent(path.slice('/storage/v1/object/public/photos/'.length));
      const obj = storage.get(key);
      if (!obj || fake.publicBroken) return new Response(null, { status: 400, headers: { 'content-type': 'application/json' } });
      return new Response(null, { status: 200, headers: { 'content-type': obj.type } });
    }
    if (headers.apikey !== ANON) return json(401, { message: 'no apikey' });
    if (path === '/auth/v1/token') {
      const b = body as Record<string, string>;
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        if (fake.onRefresh) {
          const custom = fake.onRefresh(b.refresh_token);
          if (custom) return custom;
        }
        const sub = fake.validTokens.get(b.refresh_token);
        if (!sub) return json(400, { error_description: 'Invalid Refresh Token' });
        fake.validTokens.delete(b.refresh_token);
        return json(200, issue(sub));
      }
      if (b.email === 'admin@ohgo.test' && b.password === 'pw') return json(200, issue(ADMIN_ID));
      return json(400, { error_description: 'Invalid login credentials' });
    }
    if (path === '/rest/v1/profiles') {
      const idParam = url.searchParams.get('id') ?? '';
      const many = idsIn(idParam);
      if (many) {
        const catalog = [
          { id: ADMIN_ID, name: '오고 선장', role: 'admin', expo_push_token: null },
          { id: USER_ID, name: '손님', role: 'member', expo_push_token: null },
          ...roster.extraProfiles,
        ];
        return json(200, catalog.filter((profile) => many.includes(profile.id)));
      }
      const id = idParam.replace('eq.', '');
      if (!who || who !== id) return json(200, []);
      return json(200, [{ id, name: id === ADMIN_ID ? '오고 선장' : '손님', role: id === ADMIN_ID ? 'admin' : 'user' }]);
    }
    if (path === '/rest/v1/attendance' && method === 'GET') {
      const date = url.searchParams.get('date')?.replace(/^eq\./, '');
      return json(200, roster.attendance.filter((row) => row.date === date));
    }
    if (path === '/rest/v1/guest_profiles' && method === 'GET') {
      const many = idsIn(url.searchParams.get('id'));
      return json(200, many ? roster.guests.filter((row) => many.includes(String(row.id))) : []);
    }
    if (path === '/rest/v1/boarding_info' && method === 'GET') {
      const many = idsIn(url.searchParams.get('user_id'));
      return json(200, many ? roster.boarding.filter((row) => many.includes(row.user_id)) : []);
    }
    if (path === '/rest/v1/guest_boarding_info' && method === 'GET') {
      const many = idsIn(url.searchParams.get('guest_id'));
      return json(200, many ? roster.guestBoarding.filter((row) => many.includes(row.guest_id)) : []);
    }
    const isAdmin = who === ADMIN_ID;
    if (path.startsWith('/storage/v1/object/photos/') && method === 'POST') {
      if (!who) return json(403, { message: 'new row violates row-level security policy' });
      if (fake.uploads++ === fake.rejectUploadAt) {
        return json(413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
      }
      const key = decodeURIComponent(path.slice('/storage/v1/object/photos/'.length));
      storage.set(key, { type: headers['content-type'], size: (body as Uint8Array).length });
      return json(200, { Key: `photos/${key}` });
    }
    if (path === '/storage/v1/object/photos' && method === 'DELETE') {
      if (fake.storageDeleteNoop) return json(200, []);
      const prefixes = (body as { prefixes: string[] }).prefixes.filter((p) => storage.has(p));
      for (const p of prefixes) storage.delete(p);
      return json(200, prefixes.map((name) => ({ name, bucket_id: 'photos' })));
    }
    const table = path.replace('/rest/v1/', '');
    if (table in rows) {
      if (method === 'GET') {
        const date = url.searchParams.get('date');
        if (table === 'trip_guides' && date) {
          tripDateQueries.push(date);
          const existing = [
            { id: 't0', date: '2026-10-12', destination: '나무섬', departure_time: '05:00' },
            { id: 't1', date: '2026-10-07', destination: '낫개', departure_time: '06:00', species: '감성돔' },
          ];
          const wanted = /^in\.\((.*)\)$/.exec(date)?.[1].split(',') ?? [];
          return json(200, existing.filter((r) => wanted.includes(r.date)));
        }
        const byId = url.searchParams.get('id');
        if (byId) {
          const found = rows[table].filter((r) => `eq.${r.id}` === byId);
          return json(200, found.map((r) => ({ id: r.id, image_urls: fake.dropImageUrls ? null : r.image_urls })));
        }
        if (table === 'trip_guides') return json(200, [{ destination: '나무섬' }, { destination: '낫개' }, { destination: '형제섬' }, { destination: '낫개' }, { destination: '낫개' }]);
        const title = url.searchParams.get('title')?.replace('eq.', '');
        return json(200, rows[table].filter((r) => r.title === title).map((r) => ({ id: r.id, created_at: '2026-10-01T00:00:00Z' })));
      }
      if (method === 'POST') {
        if (!isAdmin) return json(403, { code: '42501', message: 'new row violates row-level security policy' });
        const row = body as Record<string, unknown>;
        for (const col of fake.missingColumns) {
          if (col in row) return json(400, { code: 'PGRST204', message: `Could not find the '${col}' column of '${table}' in the schema cache` });
        }
        if (table === 'trip_guides' && fake.tripInserts++ === fake.failTripInsertAt) return json(500, { message: 'boom' });
        const id = `${table}-${rows[table].length + 1}`;
        rows[table].push({ id, ...row });
        return json(201, [{ id }]);
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        rows[table] = rows[table].filter((r) => r.id !== id);
        return new Response(null, { status: 204 });
      }
    }
  }
  return json(404, { message: `unexpected ${method} ${url}` });
}) as typeof fetch;

// ---------- 설정 찾기 ----------
assert.deepEqual(findSupabaseConfigInText(`a="${SERVICE}" b="${SB}" c="${ANON}"`), { supabaseUrl: SB, anonKey: ANON }, 'service_role 키는 건너뛴다');
assert.equal(findSupabaseConfigInText('nothing'), null);
const discovered = await resolveOhgoConfig({ OHGO_BASE_URL: SITE }, fakeFetch);
assert.deepEqual(discovered, { baseUrl: SITE, supabaseUrl: SB, anonKey: ANON, projectRef: REF, source: 'discovered' });
assert.ok(!calls.some((c) => c.url.startsWith('https://cdn.other')), '다른 도메인 스크립트는 읽지 않는다');
const fromEnv = await resolveOhgoConfig({ OHGO_SUPABASE_URL: SB, OHGO_SUPABASE_ANON_KEY: ANON }, fakeFetch);
assert.equal(fromEnv.source, 'env');
assert.equal(fromEnv.baseUrl, 'https://ohgo.codejaka.com', '기본값은 운영 주소');
await assert.rejects(resolveOhgoConfig({ OHGO_SUPABASE_URL: SB, OHGO_SUPABASE_ANON_KEY: SERVICE }), /service_role 키는 쓰지 않습니다/);
await assert.rejects(resolveOhgoConfig({ OHGO_SUPABASE_URL: SB }), /함께 지정/);
await assert.rejects(resolveOhgoConfig({ OHGO_BASE_URL: 'http://ohgo.test' }), /https여야/);

assert.match(newPhotoObjectPath('jpg', 1700000000000, 0.123456789), /^community\/photos\/photo_1700000000000_[a-z0-9]{1,7}\.jpg$/);
assert.equal(publicPhotoUrl(SB, 'community/photos/a b.jpg'), `${SB}/storage/v1/object/public/photos/community/photos/a%20b.jpg`);

// ---------- 준비: 가져온 결과 두 개(조황, 일정) ----------
const work = mkdtempSync(join(tmpdir(), 'band-ohgo-test-'));
const dir = join(work, 'ohgo-local');
const outRoot = join(work, 'out');
function writePost(postId: string, body: string, files: Record<string, Buffer>) {
  const ref = parseBandPostUrl(`https://band.us/band/88348442/post/${postId}`);
  const names = Object.keys(files);
  const extracted = buildExtracted({
    ref,
    via: 'api',
    post: { author: '선장', createdAt: '2026-10-06T01:00:00.000Z', body, images: [], schedules: [] },
    images: names.map((file, index) => ({ index, sourceUrl: `https://x/${file}`, file, width: 10, height: 10 })),
    fetchedAt: new Date('2026-10-07T00:00:00.000Z'),
  });
  mkdirSync(join(outRoot, postId), { recursive: true });
  writeFileSync(join(outRoot, postId, 'extracted.json'), JSON.stringify(extracted));
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(outRoot, postId, name), bytes);
}
const big = Buffer.alloc(MAX_UPLOAD_BYTES + 10, 1);
writePost('100', '오늘 참돔 조황입니다\n손님들 손맛 보셨습니다\n마릿수 좋았어요', { '01.jpg': Buffer.from('small-jpeg'), '02.png': big, '03.jpg': Buffer.from('x') });
writePost('200', '[출조 안내] 10월 12일 참돔 출조\n형제섬 갑니다\n출항 05:00 ~ 14:00\n정원 10명', {});

const reencodeSteps: number[] = [];
const editorCalls: string[] = [];
const service = createOhgoService({
  dir,
  outRoot,
  env: { OHGO_BASE_URL: SITE },
  fetchImpl: fakeFetch,
  createReencoder: async () => ({
    reencode: async (_bytes, _type, step) => {
      reencodeSteps.push(step.maxEdge);
      return step.maxEdge > 2048 ? Buffer.alloc(MAX_UPLOAD_BYTES + 1) : Buffer.from('jpeg-small');
    },
    close: async () => {},
  }),
  createImageEditor: async () => ({
    apply: async (bytes, type, edit) => {
      editorCalls.push(`${type} ${bytes.toString()} ${JSON.stringify(edit)}`);
      return { bytes: Buffer.from(`edited-${bytes.toString()}`), contentType: 'image/jpeg', width: 20, height: 40 };
    },
    close: async () => {},
  }),
});

// ---------- 로그인 ----------
let st = await service.state();
assert.deepEqual(st, { baseUrl: SITE, supabaseUrl: SB, configError: null, user: null });
await assert.rejects(service.login({ name: '없음', dob: '800101' }), /등록된 회원 정보가 없습니다/);
await assert.rejects(service.login({ name: '일반', dob: '800101' }), (err: Error & { status?: number }) => {
  assert.match(err.message, /관리자 계정이 아닙니다/);
  assert.equal(err.status, 403);
  return true;
});
assert.equal(readOhgoSession(dir), null, '관리자가 아니면 세션을 저장하지 않는다');
await assert.rejects(service.login({ email: 'admin@ohgo.test', password: 'wrong' }), /Invalid login credentials/);
st = await service.state();
assert.equal(st.user, null);

// 로그인 전에는 등록할 수 없다
const catchReq: PushRequest = {
  postId: '100',
  kind: 'catch',
  photo: { title: '오늘 참돔 조황입니다', description: '손님들 손맛 보셨습니다', photoDate: '2026-10-06', images: ['01.jpg', '02.png'] },
};
assert.throws(() => service.checkPush(catchReq), (err: OhgoRequestRejected) => err.status === 401);

st = await service.login({ name: '관리자', dob: '800101' });
assert.equal(st.user?.name, '오고 선장');
assert.equal(st.user?.userId, ADMIN_ID);
const sessionPath = join(dir, OHGO_SESSION_FILE);
assert.equal(statSync(sessionPath).mode & 0o777, 0o600, '세션 파일은 0600');
assert.equal(statSync(dir).mode & 0o777, 0o700, '세션 폴더는 0700');
const sessionText = readFileSync(sessionPath, 'utf8');
assert.ok(!sessionText.includes('800101'), '생년월일은 저장하지 않는다');

// ---------- 미리보기 ----------
const prepCatch = await service.prepare('100');
assert.equal(prepCatch.classification.kind, 'catch');
assert.deepEqual(prepCatch.photo.images, ['01.jpg', '02.png', '03.jpg']);
assert.equal(prepCatch.refDate, '2026-10-06');
assert.equal(prepCatch.sourceCreatedAt, '2026-10-06T01:00:00.000Z');
assert.equal(prepCatch.ledger, null);
assert.deepEqual(prepCatch.remoteWarnings.filter((w) => w.includes('조황 게시판')), []);

const prepTrip = await service.prepare('200');
assert.equal(prepTrip.classification.kind, 'schedule');
assert.equal(prepTrip.trip.destination, '형제섬', '앱에 있던 목적지로 채운다');
assert.deepEqual(prepTrip.trip.rows.map((r) => [r.date, r.departureTime, r.returnTime]), [['2026-10-12', '05:00', '14:00']]);
assert.equal(prepTrip.tripSource, 'single');
assert.deepEqual(prepTrip.tripMissing, []);
assert.ok(prepTrip.remoteWarnings.some((w) => w.includes('2026-10-12에 이미 등록된 출조 일정 1개: 05:00 나무섬')));
assert.deepEqual(prepTrip.tripDuplicates, { '2026-10-12': ['05:00 나무섬'] });

// 운영자가 가져온 실제 주간 일정 글: 7줄이 7건, 목적지는 앱에서 가장 많이 쓴 낫개
const WEEKLY_BODY = readFileSync(new URL('./fixtures/schedule-post-weekly.txt', import.meta.url), 'utf8');
{
  const ref = parseBandPostUrl('https://band.us/band/88348442/post/300');
  const dom = normalizeDomSnapshot({ author: '오고피씽', createdText: null, bodyText: WEEKLY_BODY, imageUrls: [] });
  const extracted = buildExtracted({ ref, via: 'dom', post: dom, images: [], fetchedAt: new Date('2026-10-06T23:00:00.000Z') });
  mkdirSync(join(outRoot, '300'), { recursive: true });
  writeFileSync(join(outRoot, '300', 'extracted.json'), JSON.stringify(extracted));
}
const prepWeekly = await service.prepare('300');
assert.equal(prepWeekly.classification.kind, 'schedule');
assert.equal(prepWeekly.tripSource, 'weekly');
assert.equal(prepWeekly.trip.destination, '낫개');
assert.equal(prepWeekly.trip.contact, '010-3597-4100');
assert.deepEqual(
  prepWeekly.trip.rows.map((r) => [r.date, r.species, r.departureTime, r.returnTime, r.price, r.notes]),
  [
    ['2026-10-05', '감성돔', '06:00', '', 100000, '예약마감'],
    ['2026-10-06', '감성돔', '07:00', '', 100000, '자리여유'],
    ['2026-10-07', '감성돔', '06:00', '', 100000, '자리여유'],
    ['2026-10-08', '감성돔', '06:00', '', 100000, '자리여유'],
    ['2026-10-09', '감성돔', '06:00', '', 100000, '예약마감'],
    ['2026-10-10', '감성돔', '06:00', '', 100000, '자리여유'],
    ['2026-10-11', '감성돔', '06:00', '', 100000, '자리여유'],
  ],
);
assert.deepEqual(prepWeekly.tripDuplicates, { '2026-10-07': ['06:00 낫개 감성돔'] }, '날짜마다 앱에 이미 있는 일정을 알려 준다');
assert.equal(tripDateQueries.at(-1), 'in.(2026-10-05,2026-10-06,2026-10-07,2026-10-08,2026-10-09,2026-10-10,2026-10-11)', '한 번에 묻는다');
// 실제 2925 글처럼 화면(DOM)에서 읽은 글: createdAt 없음, 이벤트 글이라 예약 단어와 다음 출조 날짜가 있음
const DOM_BODY = [
  '오늘6일(화)이벤트4주차감성돔조황입니다.',
  '이벤트 기간 중 감성돔 최대어 시상합니다',
  '오늘도 손님들 고생 많으셨습니다',
  '다음 출조는 10월 8일(목) 06:00 출항',
  '예약 문의 010-1234-5678',
  '자리 얼마 남지 않았습니다 선착순 마감',
].join('\n');
function writeDomPost(postId: string, listed: string[], onDisk: string[]) {
  const ref = parseBandPostUrl(`https://band.us/band/88348442/post/${postId}`);
  const dom = normalizeDomSnapshot({
    author: '오고피씽',
    createdText: '10월 6일 오후 3:12',
    bodyText: DOM_BODY,
    imageUrls: listed.map((f) => `https://coresos-phinf.pstatic.net/a/${postId}/${f}?type=w720`),
  });
  const extracted = buildExtracted({
    ref,
    via: 'dom',
    post: dom,
    images: dom.images.map((img, index) => ({
      index,
      sourceUrl: img.url,
      file: imageFileName(index, img.url, listed[index].endsWith('.png') ? 'image/png' : 'image/jpeg'),
      width: null,
      height: null,
    })),
    fetchedAt: new Date('2026-10-07T00:00:00.000Z'),
  });
  mkdirSync(join(outRoot, postId), { recursive: true });
  writeFileSync(join(outRoot, postId, 'extracted.json'), JSON.stringify(extracted));
  for (const f of onDisk) writeFileSync(join(outRoot, postId, f), Buffer.from(`img-${f}`));
  writeFileSync(join(outRoot, postId, 'network-log.json'), '[]');
}
const ELEVEN = Array.from({ length: 11 }, (_, i) => `${String(i + 1).padStart(2, '0')}.${i < 8 ? 'jpg' : 'png'}`);
writeDomPost('2925', ELEVEN, ELEVEN);
const prepDom = await service.prepare('2925');
assert.equal(prepDom.classification.kind, 'catch', `사진 11장 조황 글은 조황으로 분류: ${prepDom.classification.reasons.join(', ')}`);
assert.deepEqual(prepDom.photo.images, ELEVEN);
assert.deepEqual(prepDom.photoWarnings, []);
assert.equal(prepDom.photo.title, '6일(화) 이벤트4주차 감성돔조황 입니다.');
assert.ok(prepDom.photo.description.startsWith('이벤트 기간 중'), '제목 줄은 내용에서 뺀다');
assert.equal(prepDom.photo.photoDate, null);
assert.doesNotThrow(() => service.checkPush({ postId: '2925', kind: 'catch', photo: prepDom.photo }));

// 다시 가져오기가 사진을 못 읽어 extracted.json 목록이 비어도 폴더에 받아 둔 사진을 쓴다
writeDomPost('2926', [], [...ELEVEN.slice().reverse(), '12.heic']);
const prepStale = await service.prepare('2926');
assert.deepEqual(prepStale.photo.images, ELEVEN, '번호 순으로 정렬');
assert.ok(prepStale.photoWarnings.some((w) => w.includes('폴더에 있는 사진 11장도 넣었습니다')));
assert.ok(prepStale.photoWarnings.some((w) => w.includes('12.heic')), '올릴 수 없는 형식은 알리고 뺀다');

// 목록에는 있는데 지워진 사진은 빼고 알린다
writeDomPost('2927', ['01.jpg', '02.jpg'], ['01.jpg']);
const prepGone = await service.prepare('2927');
assert.deepEqual(prepGone.photo.images, ['01.jpg']);
assert.ok(prepGone.photoWarnings.some((w) => w.includes('폴더에 없는 사진: 02.jpg')));
writeDomPost('2928', [], []);
assert.ok((await service.prepare('2928')).photoWarnings.some((w) => w.includes('올릴 사진이 없습니다')));

await assert.rejects(service.prepare('999'), /먼저 가져오기/);
await assert.rejects(service.prepare('../x'), /잘못된 게시글 번호/);

// ---------- 조황 등록 ----------
assert.throws(() => service.checkPush({ ...catchReq, photo: { ...catchReq.photo!, images: ['09.jpg'] } }), /사진 파일이 없습니다: 09.jpg/);
assert.throws(() => service.checkPush({ ...catchReq, photo: { ...catchReq.photo!, images: [] } }), /사진이 1장 이상/);

fake.missingColumns.add('photo_date');
const logs: string[] = [];
const pushed = await service.push(catchReq, (m) => logs.push(m));
fake.missingColumns.clear();
assert.equal(pushed.target, 'community_photos');
assert.equal(pushed.resizedImages, 1);
assert.deepEqual(reencodeSteps, [2560, 2048], '한 단계씩 줄이다 5MB 이하가 되면 멈춘다');
assert.ok(logs.some((l) => l.includes('02.png') && l.includes('줄였습니다')));
const photoRow = rows.community_photos[0];
assert.equal(pushed.links[0], `${SITE}/community/${photoRow.id}`);
assert.equal(photoRow.uploaded_by, ADMIN_ID);
assert.equal(photoRow.uploaded_by_name, '오고 선장');
assert.equal(photoRow.board_type, 'photo');
assert.equal(photoRow.title, '오늘 참돔 조황입니다');
assert.equal(photoRow.description, '손님들 손맛 보셨습니다');
assert.equal(photoRow.comment_count, 0);
assert.equal(photoRow.created_at, '2026-10-06T01:00:00.000Z', '사진 날짜가 Band 글과 같은 날이면 그 시각으로 올린다');
assert.ok(logs.some((l) => l.includes('게시판에는 2026-10-06 10:00')));
assert.equal(catchBoardTime('2026-10-05', '2026-10-06T01:00:00.000Z'), '2026-10-05T03:00:00.000Z', '다른 날이면 12:00 KST');
assert.equal(catchBoardTime('2026-10-06', null), '2026-10-06T03:00:00.000Z', '시각을 모르면 12:00 KST');
assert.throws(() => catchBoardTime('10/6', null), /사진 날짜/);
assert.ok(!('photo_date' in photoRow), '없는 칸(photo_date)은 빼고 다시 저장');
assert.ok(!('content' in photoRow), '서식을 살리지 않으면 content를 쓰지 않는다');
const urls = photoRow.image_urls as string[];
assert.equal(urls.length, 2);
const keys = [...storage.keys()];
assert.equal(keys.length, 2);
assert.match(keys[0], /^community\/photos\/photo_\d+_[a-z0-9]+\.jpg$/);
assert.match(keys[1], /^community\/photos\/photo_\d+_[a-z0-9]+\.jpg$/, '줄인 PNG는 JPEG로 올린다');
assert.equal(storage.get(keys[1])!.type, 'image/jpeg');
assert.ok(urls.every((u, i) => u === publicPhotoUrl(SB, keys[i])));
const uploads = calls.filter((c) => c.url.includes('/storage/v1/object/photos/'));
assert.ok(uploads.every((c) => c.headers.authorization !== `Bearer ${ANON}`), '사진은 관리자 토큰으로 올린다');
assert.ok(uploads.every((c) => c.headers['x-upsert'] === 'false'));

// 장부: 같은 글은 막고, 체크하면 다시 등록
const ledger = readLedger(dir);
const entry = ledger.entries[`${REF}/88348442/100`];
assert.equal(entry.target, 'community_photos');
assert.deepEqual(entry.rowIds, [photoRow.id]);
assert.equal(entry.sourceUrl, 'https://band.us/band/88348442/post/100');
assert.equal(entry.by, '오고 선장');
assert.equal(statSync(join(dir, LEDGER_FILE)).mode & 0o777, 0o600);
assert.throws(() => service.checkPush(catchReq), (err: OhgoRequestRejected) => {
  assert.equal(err.status, 409);
  assert.equal(err.code, 'DUPLICATE');
  assert.match(err.message, /이미 등록한 게시글입니다 .*조황 게시판/);
  return true;
});
assert.equal((await service.prepare('100')).ledger?.rowIds[0], photoRow.id);
assert.ok((await service.prepare('100')).remoteWarnings.some((w) => w.includes('같은 제목의 글이 1개')));
service.checkPush({ ...catchReq, force: true });

// 글 저장이 실패하면 올린 사진을 지운다
fake.validTokens.clear();
saveOhgoSession(dir, { ...readOhgoSession(dir)!, ...(() => { const t = issue(ADMIN_ID); return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at }; })() });
const before = storage.size;
fake.missingColumns.add('title');
await assert.rejects(service.push({ ...catchReq, force: true }, () => {}), /community_photos 저장 실패/);
fake.missingColumns.clear();
assert.equal(storage.size, before, '실패하면 올린 사진을 정리한다');
assert.equal(rows.community_photos.length, 1);

// 사진 날짜를 Band 글과 다른 날로 고치면 그날 12:00 KST로 올린다
{
  await service.push({ ...catchReq, force: true, photo: { ...catchReq.photo!, photoDate: '2026-10-04' } }, () => {});
  const shifted = rows.community_photos.at(-1)!;
  assert.equal(shifted.photo_date, '2026-10-04');
  assert.equal(shifted.created_at, '2026-10-04T03:00:00.000Z');
  rows.community_photos.pop();
}

// 화면에서 바꾼 순서대로 올리고, 뺀 사진은 올리지 않는다
{
  const order = ['03.jpg', '11.png', '01.jpg', '07.jpg'];
  const uploadsBefore = calls.filter((c) => c.url.includes('/storage/v1/object/photos/')).length;
  await service.push({ postId: '2925', kind: 'catch', photo: { ...prepDom.photo, images: order } }, () => {});
  const sent = calls.filter((c) => c.url.includes('/storage/v1/object/photos/')).slice(uploadsBefore);
  assert.deepEqual(sent.map((c) => Buffer.from(c.body as Uint8Array).toString()), order.map((f) => `img-${f}`), '올리는 순서');
  const row = rows.community_photos.at(-1)!;
  const keysInOrder = sent.map((c) => decodeURIComponent(new URL(c.url).pathname.slice('/storage/v1/object/photos/'.length)));
  assert.deepEqual(row.image_urls, keysInOrder.map((k) => publicPhotoUrl(SB, k)), 'image_urls도 같은 순서');
  assert.equal(new URL(sent[1].url).pathname.endsWith('.png'), true, 'PNG는 그대로 PNG');
  rows.community_photos.pop();
}

// 사진 편집: 원본은 두고 edited_NN 파일을 만들어 그것을 올린다
{
  const edit = { rotate: 90 as const, flipH: true, crop: { x: 0, y: 0, w: 1, h: 0.5 } };
  const edits = await service.editImage('2925', '02.jpg', edit);
  assert.deepEqual(editorCalls, [`image/jpeg img-02.jpg ${JSON.stringify(edit)}`]);
  assert.equal(edits['02.jpg'].output, 'edited_02.jpg');
  assert.deepEqual([edits['02.jpg'].width, edits['02.jpg'].height], [20, 40]);
  assert.equal(readFileSync(join(outRoot, '2925', '02.jpg'), 'utf8'), 'img-02.jpg', '원본은 그대로');
  assert.equal(readFileSync(join(outRoot, '2925', 'edited_02.jpg'), 'utf8'), 'edited-img-02.jpg');
  const again = await service.prepare('2925');
  assert.deepEqual(again.photo.images, ELEVEN, '편집본은 사진 목록에 따로 들어가지 않는다');
  assert.deepEqual(Object.keys(again.photoEdits), ['02.jpg']);
  assert.deepEqual(again.photoEdits['02.jpg'].edit, edit);

  const uploadsBefore = calls.filter((c) => c.url.includes('/storage/v1/object/photos/')).length;
  const editLogs: string[] = [];
  await service.push({ postId: '2925', kind: 'catch', force: true, photo: { ...prepDom.photo, images: ['02.jpg', '01.jpg'] } }, (m) => editLogs.push(m));
  const sent = calls.filter((c) => c.url.includes('/storage/v1/object/photos/')).slice(uploadsBefore);
  assert.deepEqual(sent.map((c) => Buffer.from(c.body as Uint8Array).toString()), ['edited-img-02.jpg', 'img-01.jpg'], '편집한 사진을 올린다');
  assert.ok(editLogs.some((l) => l.includes('02.jpg: 편집한 사진(edited_02.jpg)을 올립니다')));
  rows.community_photos.pop();

  await assert.rejects(service.editImage('2925', 'edited_02.jpg', edit), /편집할 수 없는 사진입니다/);
  await assert.rejects(service.editImage('2925', '../100/01.jpg', edit), /편집할 수 없는 사진입니다/);
  await assert.rejects(service.editImage('../x', '01.jpg', edit), /잘못된 게시글 번호/);

  const reverted = await service.revertImage('2925', '02.jpg');
  assert.deepEqual(reverted, {});
  assert.equal(existsSync(join(outRoot, '2925', 'edited_02.jpg')), false, '편집본을 지운다');
  assert.deepEqual((await service.prepare('2925')).photoEdits, {});

  // 아무것도 바꾸지 않은 편집은 되돌리기와 같다
  await service.editImage('2925', '03.jpg', { rotate: 180, flipH: false, crop: null });
  assert.deepEqual(await service.editImage('2925', '03.jpg', { rotate: 0, flipH: false, crop: null }), {});
  assert.equal(existsSync(join(outRoot, '2925', 'edited_03.jpg')), false);
}

// 운영자 신고: 11장을 모두 편집하고 2장을 뺀 뒤 등록했는데 앱에 사진이 없었다
{
  const pid = '2925';
  for (const f of ELEVEN) await service.editImage(pid, f, { rotate: 90, flipH: false, crop: null });
  const chosen = ELEVEN.filter((f) => f !== '04.jpg' && f !== '10.png');
  const req: PushRequest = { postId: pid, kind: 'catch', force: true, photo: { ...prepDom.photo, images: chosen } };
  const rowsBefore = rows.community_photos.length;
  const storageBefore = storage.size;
  const runs = () => readPushRuns(join(outRoot, pid));
  const uploadCalls = () => calls.filter((c) => c.method === 'POST' && c.url.includes('/storage/v1/object/photos/'));

  // 서버가 두 번째 사진을 거절하고, 첫 사진 정리도 권한 때문에 조용히 안 되는 경우
  fake.uploads = 0;
  fake.rejectUploadAt = 1;
  fake.storageDeleteNoop = true;
  const failLogs: string[] = [];
  await assert.rejects(service.push(req, (m) => failLogs.push(m)), (err: Error) => {
    assert.match(err.message, /^사진 2\/9 \(02\.jpg의 편집본 edited_02\.jpg\) 올리기 실패: 사진 업로드 실패: The object exceeded the maximum allowed size \(HTTP 413\)\. 사진이 서버가 받는 크기보다 큽니다/);
    assert.match(err.message, /조황 게시판에 글은 만들지 않았습니다/);
    assert.match(err.message, /올린 사진 1장은 서버 권한 때문에 지우지 못해 Storage에 남았습니다/);
    assert.match(err.message, /자세한 기록: out\/2925\/push-log\.json/);
    return true;
  });
  fake.rejectUploadAt = -1;
  fake.storageDeleteNoop = false;
  assert.equal(rows.community_photos.length, rowsBefore, '사진이 하나라도 실패하면 글을 만들지 않는다');
  assert.equal(storage.size, storageBefore + 1, '못 지운 1장이 남는다');
  const failed = runs().at(-1)!;
  assert.equal(failed.ok, false);
  assert.equal(failed.user, '오고 선장');
  assert.equal(failed.supabase, REF);
  assert.deepEqual(failed.images.map((i) => [i.file, i.ok]), [['edited_01.jpg', true], ['edited_02.jpg', false]]);
  assert.equal(failed.images[0].fileBytes, Buffer.byteLength('edited-img-01.jpg'));
  assert.equal(failed.images[0].contentType, 'image/jpeg');
  assert.ok(failed.requests.some((r) => r.status === 413 && r.reply.includes('maximum allowed size')), '서버 응답을 남긴다');
  assert.ok(failed.messages.some((m) => m.includes('지우지 못한 사진')));
  assert.ok(failLogs.some((m) => m.includes('자세한 기록')));
  const logText = readFileSync(join(outRoot, pid, PUSH_LOG_FILE), 'utf8');
  const sess = readOhgoSession(dir)!;
  assert.ok(!logText.includes(sess.accessToken) && !logText.includes(sess.refreshToken) && !logText.includes(ANON), '토큰과 키는 기록하지 않는다');
  storage.delete(failed.images[0].objectPath!);

  // 저장은 됐는데 image_urls가 빈 채로 읽히면 글과 사진을 지우고 알린다
  fake.dropImageUrls = true;
  await assert.rejects(service.push(req, () => {}), /사진 목록\(image_urls\)이 비어 있습니다 \(올린 사진 9장\)\n저장한 글은 지웠습니다/);
  fake.dropImageUrls = false;
  assert.equal(rows.community_photos.length, rowsBefore);
  assert.equal(storage.size, storageBefore, '올린 사진도 지운다');

  // 공개 주소로 사진이 안 열려도 마찬가지
  fake.publicBroken = true;
  await assert.rejects(service.push(req, () => {}), /사진 1이 앱에서 열리지 않습니다 \(HTTP 400/);
  fake.publicBroken = false;
  assert.equal(rows.community_photos.length, rowsBefore);
  assert.equal(storage.size, storageBefore);

  // 정상: 편집본 9장이 고른 순서대로 올라가고, 다시 읽어 확인까지 한다
  const okLogs: string[] = [];
  const before = uploadCalls().length;
  await service.push(req, (m) => okLogs.push(m));
  const sent = uploadCalls().slice(before);
  assert.deepEqual(sent.map((c) => Buffer.from(c.body as Uint8Array).toString()), chosen.map((f) => `edited-img-${f}`));
  const row = rows.community_photos.at(-1)!;
  assert.equal((row.image_urls as string[]).length, 9);
  assert.ok(okLogs.includes('앱에서 사진 9장이 열리는 것을 확인했습니다'));
  const ok = runs().at(-1)!;
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.rowIds, [row.id]);
  assert.deepEqual(ok.images.map((i) => i.file), chosen.map((f) => editedFileName(f)));
  assert.equal(runs().length, 5, '최근 5번만 남긴다');
  rows.community_photos.pop();
  for (const f of ELEVEN) await service.revertImage(pid, f);
}

// Band 본문 서식(글자색, 굵게): 켜면 content에 안전한 HTML, description은 평문 그대로
{
  const ref = parseBandPostUrl('https://band.us/band/88348442/post/2940');
  const content = '오늘 감성돔 조황입니다\n<band:color value="color02">4짜</band:color> <b>대박</b> <i>났어요</i>\n<band:attachment type="photo" id="P1" />\n<band:hashtag id="1">#낫개</band:hashtag>';
  const post = normalizeApiPost({ post_no: 2940, content, attachment: {} });
  const extracted = buildExtracted({ ref, via: 'api', post, images: [{ index: 0, sourceUrl: 'https://x/01.jpg', file: '01.jpg', width: 1, height: 1 }], fetchedAt: new Date('2026-10-07T00:00:00.000Z') });
  mkdirSync(join(outRoot, '2940'), { recursive: true });
  writeFileSync(join(outRoot, '2940', 'extracted.json'), JSON.stringify(extracted));
  writeFileSync(join(outRoot, '2940', '01.jpg'), 'img-01.jpg');
  const p = await service.prepare('2940');
  const HTML = '<p><span style="color:#ff3445;">4짜</span> <strong>대박</strong> <i>났어요</i></p>';
  assert.equal(p.photo.useFormatting, true, '서식이 있으면 기본으로 켠다');
  assert.equal(p.photoFormatted.html, HTML);
  assert.equal(p.photo.description, '4짜 대박 났어요');
  assert.deepEqual(p.photo.hashtags, ['낫개']);

  // 편집창에서 고친 HTML은 걸러서 저장한다. 허용하지 않은 태그는 글자만 남긴다
  const formattedLogs: string[] = [];
  await service.push({ postId: '2940', kind: 'catch', photo: { ...p.photo, content: '<span style="color:#4f77fd"><b>고침</b></span>' } }, (m) => formattedLogs.push(m));
  const edited = rows.community_photos.at(-1)!;
  assert.equal(edited.content, '<p><span style="color:#4f77fd;"><strong>고침</strong></span></p>');
  assert.equal(edited.description, '고침');
  assert.ok(formattedLogs.some((l) => l.includes('편집한 글자색과 굵게를 살려')));
  rows.community_photos.pop();

  await service.push({ postId: '2940', kind: 'catch', force: true, photo: { ...p.photo, content: '<img src=x onerror=alert(1)>안녕' } }, () => {});
  const stripped = rows.community_photos.at(-1)!;
  assert.equal(stripped.content, undefined);
  assert.equal(stripped.description, '안녕');
  rows.community_photos.pop();

  const formattedLogs2: string[] = [];
  await service.push({ postId: '2940', kind: 'catch', force: true, photo: p.photo }, (m) => formattedLogs2.push(m));
  const row = rows.community_photos.at(-1)!;
  assert.equal(row.content, HTML);
  assert.equal(row.description, '4짜 대박 났어요', 'description은 평문');
  assert.deepEqual(row.hashtags, ['낫개']);
  assert.ok(formattedLogs2.some((l) => l.includes('글자색, 배경색, 굵게, 기울임, 밑줄, 취소선, 글자 크기를 살려')));
  rows.community_photos.pop();

  await service.push({ postId: '2940', kind: 'catch', force: true, photo: { ...p.photo, useFormatting: false } }, () => {});
  assert.ok(!('content' in rows.community_photos.at(-1)!), '끄면 서식 없이');
  rows.community_photos.pop();

  // 예전에 가져온 결과(rawContent 없음)는 서식 없이
  assert.equal(prepDom.photo.useFormatting, false);
  assert.equal(prepDom.photoFormatted.html, null);
}

// ---------- 일정 등록 ----------
const tripReq: PushRequest = {
  postId: '200',
  kind: 'schedule',
  trip: { ...prepTrip.trip, contact: '010-1111-2222', rows: [prepTrip.trip.rows[0], { ...prepTrip.trip.rows[0], date: '2026-10-13' }] },
};
assert.throws(
  () => service.checkPush({ ...tripReq, trip: { ...tripReq.trip!, destination: ' ', rows: [{ ...prepTrip.trip.rows[0], departureTime: '' }] } }),
  /목적지을\(를\) 입력하세요\n출항 시간을\(를\) 입력하세요/,
);

// 만료된 토큰은 갱신해서 쓴다
const expiring = readOhgoSession(dir)!;
saveOhgoSession(dir, { ...expiring, expiresAt: now() - 10 });
fake.missingColumns.add('contact');
const tripDone = await service.push(tripReq, () => {});
fake.missingColumns.clear();
assert.notEqual(readOhgoSession(dir)!.accessToken, expiring.accessToken, '갱신한 토큰을 저장한다');
assert.ok(readOhgoSession(dir)!.expiresAt > now());
assert.equal(tripDone.rowIds.length, 2);
assert.deepEqual(tripDone.links, [`${SITE}/admin-trip-guide`]);
assert.deepEqual(
  rows.trip_guides.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'id'))),
  ['2026-10-12', '2026-10-13'].map((date) => ({
    date,
    destination: '형제섬',
    departure_time: '05:00',
    return_time: '14:00',
    species: '참돔',
    capacity: 10,
    notes: prepTrip.trip.rows[0].notes,
  })),
  '없는 칸(contact)은 빼고 저장',
);
assert.equal(readLedger(dir).entries[`${REF}/88348442/200`].target, 'trip_guides');

// 여러 날 중 하나라도 실패하면 저장한 일정을 지운다
fake.failTripInsertAt = fake.tripInserts + 1;
await assert.rejects(service.push({ ...tripReq, force: true }, () => {}), /trip_guides 저장 실패: boom/);
assert.equal(rows.trip_guides.length, 2, '실패한 묶음은 남기지 않는다');

// 주간 일정: 체크한 줄만 한 번에 저장, 상태는 비고로
const weeklyReq: PushRequest = {
  postId: '300',
  kind: 'schedule',
  trip: { ...prepWeekly.trip, rows: prepWeekly.trip.rows.filter((r) => r.date !== '2026-10-07') },
};
fake.failTripInsertAt = fake.tripInserts + 3;
await assert.rejects(service.push(weeklyReq, () => {}), /trip_guides 저장 실패: boom/);
assert.equal(rows.trip_guides.length, 2, '4번째 줄에서 실패하면 앞의 3건도 지운다');
const weeklyLogs: string[] = [];
const weeklyDone = await service.push(weeklyReq, (m) => weeklyLogs.push(m));
assert.equal(weeklyDone.rowIds.length, 6);
assert.ok(weeklyLogs.some((l) => l.includes('저장 중 6/6: 2026-10-11 06:00 낫개 감성돔')));
assert.deepEqual(
  rows.trip_guides.slice(2).map((r) => [r.date, r.departure_time, r.destination, r.species, r.price, r.notes, r.contact, 'return_time' in r]),
  [
    ['2026-10-05', '06:00', '낫개', '감성돔', 100000, '예약마감', '010-3597-4100', false],
    ['2026-10-06', '07:00', '낫개', '감성돔', 100000, '자리여유', '010-3597-4100', false],
    ['2026-10-08', '06:00', '낫개', '감성돔', 100000, '자리여유', '010-3597-4100', false],
    ['2026-10-09', '06:00', '낫개', '감성돔', 100000, '예약마감', '010-3597-4100', false],
    ['2026-10-10', '06:00', '낫개', '감성돔', 100000, '자리여유', '010-3597-4100', false],
    ['2026-10-11', '06:00', '낫개', '감성돔', 100000, '자리여유', '010-3597-4100', false],
  ],
);
assert.equal(readLedger(dir).entries[`${REF}/88348442/300`].title, '2026-10-05 ~ 2026-10-11 낫개 6건');
assert.throws(() => service.checkPush(weeklyReq), (err: OhgoRequestRejected) => err.code === 'DUPLICATE');

// 다른 페이지 주소는 열지 않는다
assert.equal(service.isAppLink(`${SITE}/community/x`), true);
assert.equal(service.isAppLink('https://evil.test/'), false);
assert.equal(service.isAppLink(`${SITE}.evil.test/`), false);

// 로그인 갱신: 겹쳐도 토큰은 한 번만 바꾸고, 새 토큰은 바로 파일에 남는다
{
  const refreshCount = () => calls.filter((c) => c.url.includes('grant_type=refresh_token')).length;
  const saved = readOhgoSession(dir)!;
  saveOhgoSession(dir, { ...saved, expiresAt: now() - 30 });
  const before = refreshCount();
  const [first, second] = await Promise.all([ensureFreshSession(discovered, dir, fakeFetch), ensureFreshSession(discovered, dir, fakeFetch)]);
  assert.equal(refreshCount(), before + 1, '같은 토큰으로 두 번 갱신하지 않는다');
  assert.equal(first.refreshToken, second.refreshToken);
  assert.equal(readOhgoSession(dir)!.refreshToken, first.refreshToken, '돌린 토큰이 파일에 있다');
  assert.notEqual(first.refreshToken, saved.refreshToken);
  assert.equal(existsSync(join(dir, 'session.lock')), false, '잠금을 푼다');

  // 갱신 중에 죽은 잠금(한 시간 전)은 치우고 다시 갱신한다
  saveOhgoSession(dir, { ...readOhgoSession(dir)!, expiresAt: now() - 30 });
  writeFileSync(join(dir, 'session.lock'), '');
  const old = new Date(Date.now() - 120_000);
  utimesSync(join(dir, 'session.lock'), old, old);
  await ensureFreshSession(discovered, dir, fakeFetch);
  assert.equal(existsSync(join(dir, 'session.lock')), false);
  assert.ok(readOhgoSession(dir)!.expiresAt > now());

  // 서버가 "이미 쓴 토큰"이라고 해도, 다른 쪽이 새 토큰을 저장해 뒀으면 그것을 쓴다
  saveOhgoSession(dir, { ...readOhgoSession(dir)!, expiresAt: now() - 30 });
  const handed = issue(ADMIN_ID);
  const beforeHandoff = refreshCount();
  fake.onRefresh = (token) => {
    const kept = readOhgoSession(dir)!;
    assert.equal(token, kept.refreshToken);
    saveOhgoSession(dir, { ...kept, accessToken: handed.access_token, refreshToken: handed.refresh_token, expiresAt: handed.expires_at });
    fake.onRefresh = null;
    return json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' });
  };
  const reused = await ensureFreshSession(discovered, dir, fakeFetch);
  assert.equal(reused.refreshToken, handed.refresh_token);
  assert.equal(refreshCount(), beforeHandoff + 1, '저장돼 있는 새 토큰을 또 갱신하지 않는다');

  // 토큰이 서버에 없으면 사진을 한 장도 올리지 않고 다시 로그인을 요구한다
  saveOhgoSession(dir, { ...readOhgoSession(dir)!, expiresAt: now() - 30 });
  fake.onRefresh = () => json(400, { error_description: 'Invalid Refresh Token: Refresh Token Not Found' });
  const storageBefore = storage.size;
  const uploadsBefore = calls.filter((c) => c.method === 'POST' && c.url.includes('/storage/v1/object/photos/')).length;
  await assert.rejects(service.push({ ...catchReq, force: true }, () => {}), (err: OhgoRequestRejected) => {
    assert.equal(err.code, 'LOGIN_REQUIRED');
    assert.match(err.message, /다시 로그인을 누르세요/);
    assert.match(err.message, /Refresh Token Not Found/);
    return true;
  });
  fake.onRefresh = null;
  assert.equal(storage.size, storageBefore, '로그인이 안 되면 사진을 올리지 않는다');
  assert.equal(calls.filter((c) => c.method === 'POST' && c.url.includes('/storage/v1/object/photos/')).length, uploadsBefore);
  await service.login({ name: '관리자', dob: '800101' });
  assert.ok(readOhgoSession(dir)!.expiresAt > now(), '다시 로그인하면 새 토큰이 저장된다');
}

// 사진 날짜의 확정 승선자를 태그하면, 등록할 때 내 조황 사진으로 저장하고 회원당 알림은 한 번만 보낸다
{
  const member = '33333333-3333-3333-3333-333333333333';
  const merged = '44444444-4444-4444-4444-444444444444';
  roster.extraProfiles = [
    { id: member, name: '홍길동', role: 'member', expo_push_token: 'ExponentPushToken[hong]' },
    { id: merged, name: '이순신', role: 'member', expo_push_token: 'ExponentPushToken[lee]' },
  ];
  roster.guests = [
    { id: 'guest-open', name: '김손님', merged_to: null },
    { id: 'guest-sailor', name: '선원김', merged_to: null },
    { id: 'guest-merged', name: '합친손님', merged_to: merged },
  ];
  roster.guestBoarding = [{ guest_id: 'guest-sailor', trip_role: 'sailor' }];
  roster.attendance = [{
    date: '2026-10-06',
    members: [member, 'guest-open'],
    confirmed_members: { '1': [member, ADMIN_ID, 'guest-sailor'], '2': ['guest-open', 'guest-merged'] },
  }];
  const boarders = await service.listBoarders('2026-10-06');
  assert.equal(boarders.source, 'confirmed');
  assert.deepEqual(boarders.trips[0].boarders, [{ id: member, name: '홍길동', canNotify: true }]);
  assert.deepEqual(boarders.trips[1].boarders, [
    { id: 'guest-open', name: '김손님', canNotify: false },
    { id: merged, name: '합친손님', canNotify: true },
  ]);
  await assert.rejects(service.listBoarders('10/06'), /사진 날짜 형식이 잘못되었습니다/);
  await service.savePhotoTags('2925', '01.jpg', { trip: 1, userIds: [member, 'guest-open'] });
  await service.savePhotoTags('2925', '02.jpg', { trip: 2, userIds: [member, merged] });
  assert.deepEqual((await service.prepare('2925')).photoTags['01.jpg'], { trip: 1, userIds: [member, 'guest-open'] });
  const logs: string[] = [];
  const pushed = await service.push({
    postId: '2925',
    kind: 'catch',
    force: true,
    photo: { ...prepDom.photo, photoDate: '2026-10-06', images: ['01.jpg', '02.jpg'] },
  }, (message) => logs.push(message));
  assert.equal(rows.captain_photos.length, 2);
  assert.equal(rows.captain_photos[0].trip_date, '2026-10-06');
  assert.deepEqual(rows.captain_photos[0].image_urls, [rows.community_photos.at(-1)!.image_urls[0]]);
  const tags = rows.captain_photo_tags;
  assert.equal(tags.filter((row) => row.user_id === member).length, 2);
  assert.equal(tags.find((row) => row.user_name === '김손님')?.user_id, null);
  assert.equal(tags.filter((row) => row.user_id === merged).length, 1);
  const expo = calls.filter((call) => call.url.startsWith('https://exp.host/'));
  assert.equal(expo.length, 2, '같은 회원은 사진이 여러 장이어도 알림 한 번');
  const bodies = expo.map((call) => call.body as { to: string; body: string; data: { screen: string } });
  assert.deepEqual(bodies.map((body) => body.to).sort(), ['ExponentPushToken[hong]', 'ExponentPushToken[lee]']);
  assert.ok(bodies.every((body) => body.data.screen === 'my-photos' && body.body.includes('2026-10-06')));
  assert.match(bodies.find((body) => body.to.includes('hong'))!.body, /2장/);
  assert.match(pushed.tagNote, /홍길동/);
  assert.match(pushed.tagNote, /앱이 없어 알림을 보내지 않음: 김손님/);
  assert.ok(logs.some((line) => line.includes('김손님')));
  await service.savePhotoTags('2925', '01.jpg', { trip: 1, userIds: [] });
  await service.savePhotoTags('2925', '02.jpg', { trip: 1, userIds: [] });
  assert.equal((await service.prepare('2925')).photoTags['01.jpg'], undefined);
  roster.attendance = [];
  roster.guests = [];
  roster.extraProfiles = [];
  roster.guestBoarding = [];
}

// 로그아웃
st = await service.logout();
assert.equal(st.user, null);
assert.equal(readOhgoSession(dir), null);

// 장부가 깨졌으면 멈춘다
writeFileSync(join(dir, LEDGER_FILE), '{broken');
assert.throws(() => readLedger(dir), /등록 장부.*읽지 못했습니다/);

// 설정을 못 찾으면 상태에 이유를 보여 준다
const offline = createOhgoService({ dir: join(work, 'x'), outRoot, env: { OHGO_BASE_URL: 'https://nowhere.test' }, fetchImpl: fakeFetch });
const offState = await offline.state();
assert.match(offState.configError ?? '', /Supabase 설정을 찾지 못했습니다/);
const offPrep = await offline.prepare('200');
assert.equal(offPrep.classification.kind, 'schedule', '네트워크 없이도 미리보기는 된다');
assert.ok(offPrep.remoteWarnings.length > 0);

// ---------- 실제 Chromium으로 다시 압축 ----------
const png = readFileSync(new URL('../gui/favicon.png', import.meta.url));
const encoder = await createBrowserReencoder();
try {
  const asIs = await prepareImage(png, 'a.png', encoder.reencode);
  assert.equal(asIs.resized, false);
  assert.equal(asIs.contentType, 'image/png');
  const shrunk = await prepareImage(png, 'a.png', encoder.reencode, png.length - 1);
  assert.equal(shrunk.resized, true);
  assert.equal(shrunk.contentType, 'image/jpeg');
  assert.equal(shrunk.ext, 'jpg');
  assert.ok(shrunk.bytes[0] === 0xff && shrunk.bytes[1] === 0xd8, 'JPEG');
  assert.ok(shrunk.bytes.length < png.length);
  await assert.rejects(prepareImage(png, 'a.png', encoder.reencode, 10), /5MB 이하로 줄이지 못했습니다/);
} finally {
  await encoder.close();
}

rmSync(work, { recursive: true, force: true });
console.log('band-import ohgo service tests passed');
