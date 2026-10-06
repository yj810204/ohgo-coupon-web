import assert from 'node:assert/strict';
import { parseBandPostUrl } from '../src/url.mts';

const expected = {
  bandId: '88348442',
  postId: '2925',
  canonicalUrl: 'https://band.us/band/88348442/post/2925',
};

assert.deepEqual(parseBandPostUrl('https://band.us/band/88348442/post/2925'), expected);
assert.deepEqual(parseBandPostUrl('https://www.band.us/band/88348442/post/2925'), expected);
assert.deepEqual(parseBandPostUrl('https://m.band.us/band/88348442/post/2925/'), expected);
assert.deepEqual(parseBandPostUrl('  https://band.us/band/88348442/post/2925?referrer=feed#c1 '), expected);
assert.deepEqual(parseBandPostUrl('http://band.us/band/88348442/post/2925'), expected);

for (const bad of [
  'band.us/band/88348442/post/2925',
  'https://band.us/band/88348442',
  'https://band.us/band/88348442/post/',
  'https://band.us/band/abc/post/2925',
  'https://band.us/band/88348442/post/2925/comment',
  'https://evilband.us/band/88348442/post/2925',
  'https://band.us.example.com/band/88348442/post/2925',
  'ftp://band.us/band/88348442/post/2925',
]) {
  assert.throws(() => parseBandPostUrl(bad), Error, bad);
}

console.log('band-import url tests passed');
