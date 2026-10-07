import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExtracted } from '../src/extracted.mts';
import { findPostInJson, normalizeApiPost } from '../src/normalize.mts';
import { validateExtracted } from '../src/schema.mts';
import { parseBandPostUrl } from '../src/url.mts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/get-post.json', import.meta.url), 'utf8'));
const ref = parseBandPostUrl('https://band.us/band/88348442/post/2925');
const post = normalizeApiPost(findPostInJson(fixture, ref.postId)!);

const extracted = buildExtracted({
  ref,
  via: 'api',
  post,
  images: [
    { index: 0, sourceUrl: post.images[0].url, file: '01.jpg', width: 1080, height: 1440 },
    { index: 1, sourceUrl: post.images[1].url, file: null, width: 800, height: 600 },
  ],
  fetchedAt: new Date('2026-10-06T22:00:00.000Z'),
});

assert.deepEqual(validateExtracted(extracted), []);
assert.deepEqual(validateExtracted(JSON.parse(JSON.stringify(extracted))), [], 'JSON 왕복 후에도 유효');
assert.equal(extracted.title, '10월 12일 갈치 출항 안내');
assert.deepEqual(extracted.source, {
  url: 'https://band.us/band/88348442/post/2925',
  bandId: '88348442',
  postId: '2925',
  fetchedAt: '2026-10-06T22:00:00.000Z',
});
assert.deepEqual(extracted.scheduleLikeLines, ['10월 12일 갈치 출항 안내', '출항 05:30 다대포항']);
assert.deepEqual(extracted.warnings, ['일부 이미지 다운로드에 실패했습니다']);

const emptyBody = buildExtracted({
  ref,
  via: 'dom',
  post: { author: null, createdAt: null, body: '', images: [], schedules: [] },
  images: [],
  fetchedAt: new Date(),
});
assert.deepEqual(validateExtracted(emptyBody), []);
assert.ok(emptyBody.warnings.includes('본문이 비어 있습니다'));

assert.deepEqual(validateExtracted(null), ['root: 객체가 아님']);
const broken = JSON.parse(JSON.stringify(extracted));
broken.schemaVersion = 2;
broken.source.postId = 'abc';
delete broken.body;
broken.images[0].width = '1080';
broken.schedules[0].startAt = 'nope';
broken.extractedVia = 'scrape';
assert.deepEqual(validateExtracted(broken).sort(), [
  'images[0].width: 타입 불일치',
  'root.body: 누락',
  'root.extractedVia: 타입 불일치',
  'schedules[0].startAt: 타입 불일치',
  'schemaVersion: 1 이어야 함',
  'source.postId: 타입 불일치',
]);

console.log('band-import schema tests passed');
