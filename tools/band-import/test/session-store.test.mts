import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Cookie } from 'playwright';
import { resolveUserDataDir } from '../src/browser.mts';
import { cookiesToRestore, countSessionOnly, isBandCookie, toHeadedUserAgent } from '../src/session-store.mts';

const cookie = (name: string, domain: string, expires: number, path = '/'): Cookie => ({
  name,
  value: 'v',
  domain,
  path,
  expires,
  httpOnly: true,
  secure: true,
  sameSite: 'None',
});

assert.ok(isBandCookie({ domain: '.band.us' }));
assert.ok(isBandCookie({ domain: 'auth.band.us' }));
assert.ok(isBandCookie({ domain: 'band.us' }));
assert.ok(!isBandCookie({ domain: '.evilband.us' }));
assert.ok(!isBandCookie({ domain: '.naver.com' }));

const now = 1_800_000_000;
const saved = [
  cookie('session', '.band.us', -1),
  cookie('persist', '.band.us', now + 3600),
  cookie('expired', '.band.us', now - 1),
  cookie('auth', 'auth.band.us', -1),
  cookie('nid', '.naver.com', -1),
];
const current = [cookie('persist', '.band.us', now + 3600)];

assert.deepEqual(
  cookiesToRestore(saved, current, now).map((c) => `${c.name}@${c.domain}`),
  ['session@.band.us', 'auth@auth.band.us'],
);
assert.deepEqual(cookiesToRestore(saved, saved, now), []);
assert.equal(cookiesToRestore([cookie('session', '.band.us', -1, '/x')], [cookie('session', '.band.us', -1)], now).length, 1);
assert.equal(countSessionOnly(saved), 3);

assert.equal(resolveUserDataDir(undefined, '/abs/user-data'), '/abs/user-data');
assert.equal(resolveUserDataDir('  ', '/abs/user-data'), '/abs/user-data');
assert.equal(resolveUserDataDir('/other', '/abs/user-data'), '/other');
assert.equal(resolveUserDataDir('rel/profile', '/abs/user-data'), join(process.cwd(), 'rel/profile'));

assert.equal(
  toHeadedUserAgent('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/148.0.0.0 Safari/537.36'),
  'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
);
assert.equal(toHeadedUserAgent('Mozilla/5.0 Chrome/148.0.0.0'), 'Mozilla/5.0 Chrome/148.0.0.0');

console.log('band-import session-store tests passed');
