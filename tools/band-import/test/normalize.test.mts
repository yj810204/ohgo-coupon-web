import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAuthKeyUrl, isBandApiHost, parseAuthKeyScript } from '../src/auth-state.mts';
import {
  bandContentToText,
  deriveTitle,
  findPostInJson,
  findScheduleLikeLines,
  imageFileName,
  normalizeApiPost,
  attachmentPhotoIds,
  normalizeDomSnapshot,
  parseJsonLoose,
  toIso,
  toOriginalImageUrl,
} from '../src/normalize.mts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/get-post.json', import.meta.url), 'utf8'));

// 단건 응답, 배치 응답 배열 모두에서 post를 찾는다
assert.equal(findPostInJson(fixture, '2925')?.post_no, 2925);
assert.equal(findPostInJson([{ result_data: { emotions: [] } }, fixture], '2925')?.post_no, 2925);
assert.equal(findPostInJson(fixture, '2926'), null);
assert.equal(findPostInJson({ post_no: 2925 }, '2925'), null, 'content/attachment 없는 객체는 post가 아님');

// bapi.band.us/v2.0.0/batch 응답: result_data.batch_result[] 안에 단건 응답이 객체 또는 문자열로 들어 있다
const batch = { result_code: 1, result_data: { batch_result: [fixture, { result_code: 1, result_data: { emotions: [] } }] } };
assert.equal(findPostInJson(batch, '2925')?.post_no, 2925);
const batchString = { result_code: 1, result_data: { batch_result: [{ status: 200, body: JSON.stringify(fixture) }] } };
assert.equal(findPostInJson(batchString, '2925')?.post_no, 2925);
assert.deepEqual(parseJsonLoose('cb_1({"a":1});'), { a: 1 });
assert.deepEqual(parseJsonLoose(' {"a":1} '), { a: 1 });
assert.equal(parseJsonLoose('var x = 1'), undefined);
assert.equal(findPostInJson(parseJsonLoose(`jQuery123(${JSON.stringify(fixture)})`), '2925')?.post_no, 2925);

const post = normalizeApiPost(findPostInJson(fixture, '2925')!);
assert.equal(post.author, '오고피싱 선장');
assert.equal(post.createdAt, new Date(1791264865874).toISOString());
assert.equal(post.body, '10월 12일 갈치 출항 안내\n출항 05:30 다대포항\n정원 12명 & 요금 문의\n#갈치');
assert.deepEqual(post.images, [
  { url: 'https://coresos-phinf.pstatic.net/a/test/one.jpg', width: 1080, height: 1440 },
  { url: 'https://coresos-phinf.pstatic.net/a/test/two.png', width: 800, height: 600 },
]);
assert.deepEqual(post.schedules, [
  {
    name: '갈치 출조',
    description: '새벽 출항',
    startAt: new Date(1791747000000).toISOString(),
    endAt: new Date(1791768600000).toISOString(),
    isAllDay: false,
  },
]);

// camelCase / 단일 schedule 변형도 허용
const camel = normalizeApiPost({
  postNo: 1,
  content: 'x',
  attachment: { photo: [{ photoUrl: 'https://a.pstatic.net/p.jpg' }], schedule: { name: '단일', startAt: '2026-10-12T05:30:00+09:00' } },
});
assert.equal(camel.images[0].url, 'https://a.pstatic.net/p.jpg');
assert.equal(camel.schedules[0].startAt, '2026-10-11T20:30:00.000Z');
assert.equal(normalizeApiPost({ post_no: 1 }).body, '');

assert.equal(bandContentToText('a&lt;b&gt;&#44;&#x41;<br/>\r\n<br>\n\n\nc  '), 'a<b>,A\n\nc');
assert.equal(bandContentToText('<band:refer user_no="1">홍길동</band:refer>님 감사'), '홍길동님 감사');

assert.equal(deriveTitle('\n  첫 줄 제목  \n둘째 줄'), '첫 줄 제목');
assert.equal(deriveTitle(''), '');
assert.equal(deriveTitle('가'.repeat(80)).length, 60);

assert.deepEqual(
  findScheduleLikeLines(
    [
      '오늘 조황 좋았습니다',
      '2026.10.12 출항',
      '10월 13일 예약 가능',
      '출항 05:30',
      '오후 2시 입항',
      '6시 반 집결',
      '10/14 갈치',
      '3시간 낚시',
      '씨알 40cm 1/2 정도',
    ].join('\n'),
  ),
  ['2026.10.12 출항', '10월 13일 예약 가능', '출항 05:30', '오후 2시 입항', '6시 반 집결', '10/14 갈치', '씨알 40cm 1/2 정도'],
);

assert.equal(toIso(1791264865874), new Date(1791264865874).toISOString());
assert.equal(toIso(1791264865), new Date(1791264865000).toISOString());
assert.equal(toIso('1791264865874'), new Date(1791264865874).toISOString());
assert.equal(toIso(null), null);
assert.equal(toIso('not a date'), null);

assert.equal(
  toOriginalImageUrl('https://coresos-phinf.pstatic.net/a/x.jpg?type=w720'),
  'https://coresos-phinf.pstatic.net/a/x.jpg',
);
assert.equal(toOriginalImageUrl('https://example.com/x.jpg?type=w720'), 'https://example.com/x.jpg?type=w720');

const dom = normalizeDomSnapshot({
  author: '선장',
  createdText: '10월 6일',
  bodyText: '본문\n\n\n\n끝',
  imageUrls: ['https://a.pstatic.net/1.jpg?type=w720', 'https://a.pstatic.net/1.jpg?type=s150'],
});
assert.equal(dom.body, '본문\n\n끝');
assert.deepEqual(dom.images, [{ url: 'https://a.pstatic.net/1.jpg', width: null, height: null }]);

assert.equal(imageFileName(0, 'https://a/x.png', 'image/jpeg; charset=binary'), '01.jpg');
assert.equal(imageFileName(9, 'https://a/x.PNG', null), '10.png');
assert.equal(imageFileName(2, 'https://a/x.jpeg', 'application/octet-stream'), '03.jpg');
assert.equal(imageFileName(3, 'https://a/x', null), '04.jpg');

assert.deepEqual(parseAuthKeyScript('new M({ signedUser: false, authenticateState : "NONE" })'), { state: 'none', raw: 'NONE' });
assert.deepEqual(parseAuthKeyScript('new M({ signedUser: true, authenticateState : "USER" })'), { state: 'user', raw: 'USER' });
assert.deepEqual(parseAuthKeyScript('new M({ signedUser: true, authenticateState : "LIMITED" })'), { state: 'none', raw: 'LIMITED' });
assert.deepEqual(parseAuthKeyScript('authenticateState: "USER"'), { state: 'user', raw: 'USER' });
assert.deepEqual(parseAuthKeyScript('signedUser: true'), { state: 'user', raw: 'signedUser=true' });
assert.deepEqual(parseAuthKeyScript('var x = 1'), { state: 'unknown', raw: null });
assert.ok(isAuthKeyUrl('https://auth.band.us/s/login/getKey?_t=1&callback=cb'));
assert.ok(!isAuthKeyUrl('https://auth.band.us/login_page'));
assert.ok(isBandApiHost('api.band.us'));
assert.ok(isBandApiHost('api-us.band.us'));
assert.ok(isBandApiHost('bapi.band.us'));
assert.ok(isBandApiHost('bapi-us.band.us'));
assert.ok(!isBandApiHost('auth.band.us'));
assert.ok(!isBandApiHost('evilband.us'));
assert.ok(!isBandApiHost('api.band.us.evil.com'));

// 실제 2925 응답처럼 attachment.photo가 { 사진id: 사진 } 객체인 경우: 본문 attachment 태그 순서를 따른다
const mapPost = normalizeApiPost({
  post_no: 2925,
  content: '조황입니다\n<band:attachment type="photo" id="P3" />\n<b>감성돔</b>\n<band:attachment type="video" id="V1" /><band:attachment type="photo" id="P1"/>\n',
  attachment: {
    photo: {
      P1: { photo_url: 'https://coresos-phinf.pstatic.net/a/1.jpg', width: 10, height: 20 },
      P2: { photo_url: 'https://coresos-phinf.pstatic.net/a/2.png', width: 30, height: 40 },
      P3: { photo_url: 'https://coresos-phinf.pstatic.net/a/3.jpg', width: 50, height: 60 },
      V1: { photo_url: 'https://coresos-phinf.pstatic.net/a/v.jpg', video: { video_id: 1 } },
    },
  },
});
assert.deepEqual(
  mapPost.images.map((i) => i.url.split('/').pop()),
  ['3.jpg', '1.jpg', '2.png'],
  '태그 순서(P3, P1) 다음 태그에 없는 사진(P2), 동영상은 뺀다',
);
assert.deepEqual(mapPost.images[0], { url: 'https://coresos-phinf.pstatic.net/a/3.jpg', width: 50, height: 60 });
assert.equal(mapPost.body, '조황입니다\n\n감성돔', '본문에는 attachment 태그가 남지 않는다');
assert.deepEqual(attachmentPhotoIds('<band:attachment id="A" type="photo" /> <band:attachment type="poll" id="Q"/>'), ['A']);
const arrayOrdered = normalizeApiPost({
  post_no: 1,
  content: '<band:attachment type="photo" id="22" /><band:attachment type="photo" id="11" />',
  attachment: { photo: [{ photo_no: 11, photo_url: 'https://a.pstatic.net/11.jpg' }, { photo_no: 22, photo_url: 'https://a.pstatic.net/22.jpg' }] },
});
assert.deepEqual(arrayOrdered.images.map((i) => i.url.split('/').pop()), ['22.jpg', '11.jpg'], '배열도 태그 순서를 따른다');

console.log('band-import normalize tests passed');
