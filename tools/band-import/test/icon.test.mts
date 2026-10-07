import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAND_GREEN, iconLayout } from '../mac/render-icon.mts';

const MAC_DIR = fileURLToPath(new URL('../mac/', import.meta.url));

function pngSize(png: Buffer): [number, number] {
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

// 커밋된 .icns: Apple 규격 타입별 PNG 크기가 맞아야 한다
const icns = readFileSync(join(MAC_DIR, 'AppIcon.icns'));
assert.equal(icns.subarray(0, 4).toString('ascii'), 'icns');
assert.equal(icns.readUInt32BE(4), icns.length);
const entries = new Map<string, [number, number]>();
for (let off = 8; off < icns.length; ) {
  const type = icns.subarray(off, off + 4).toString('ascii');
  const len = icns.readUInt32BE(off + 4);
  entries.set(type, pngSize(icns.subarray(off + 8, off + len)));
  off += len;
}
const expected: Record<string, number> = {
  icp4: 16, icp5: 32, ic11: 32, icp6: 64, ic12: 64, ic07: 128, ic08: 256, ic13: 256, ic09: 512, ic14: 512, ic10: 1024,
};
assert.deepEqual([...entries.keys()].sort(), Object.keys(expected).sort());
for (const [type, size] of Object.entries(expected)) assert.deepEqual(entries.get(type), [size, size], type);

assert.deepEqual(pngSize(readFileSync(join(MAC_DIR, 'AppIcon.png'))), [1024, 1024]);

// 배치: 64px 이상은 동기화 표시가 있고, 32px 이하는 빼는 대신 Band 배지를 바탕(824)의 절반 넘게 키운다
assert.equal(BAND_GREEN, '#00C73C');
for (const size of [64, 128, 256, 512, 1024]) assert.ok(iconLayout(size).sync, `${size}px 동기화 표시`);
for (const size of [16, 32]) {
  const layout = iconLayout(size);
  assert.equal(layout.sync, null);
  assert.ok(layout.badge.size / 824 > 0.5, `${size}px 배지 크기`);
}
for (const size of [16, 32, 64, 1024]) {
  const { badge } = iconLayout(size);
  assert.ok(badge.x + badge.size <= 924 && badge.y + badge.size <= 924, '배지는 바탕 안에 들어간다');
}
assert.ok(iconLayout(16).badge.size > iconLayout(64).badge.size, '작은 크기일수록 배지가 크다');
assert.ok(iconLayout(64).badge.size > iconLayout(1024).badge.size, '작은 크기일수록 배지가 크다');
assert.deepEqual(pngSize(readFileSync(new URL('../gui/favicon.png', import.meta.url))), [128, 128]);

// make-app.sh: sips/iconutil이 있어도 다시 만들지 않고 커밋된 .icns를 그대로 복사한다
const work = mkdtempSync(join(tmpdir(), 'band-app-test-'));
try {
  const bin = join(work, 'bin');
  mkdirSync(bin);
  const calls = join(work, 'calls.log');
  for (const tool of ['sips', 'iconutil']) {
    writeFileSync(join(bin, tool), `#!/bin/bash\necho "${tool} $*" >> "${calls}"\nexit 1\n`);
    chmodSync(join(bin, tool), 0o755);
  }
  execFileSync('bash', [join(MAC_DIR, 'make-app.sh'), join(work, 'out')], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    stdio: 'pipe',
  });
  assert.equal(existsSync(calls), false, 'sips, iconutil을 부르지 않는다');
  const app = join(work, 'out', 'Band 가져오기.app');
  assert.ok(readFileSync(join(app, 'Contents/Resources/AppIcon.icns')).equals(icns));
  assert.deepEqual(readdirSync(join(app, 'Contents/Resources')), ['AppIcon.icns']);
  assert.deepEqual(readdirSync(join(app, 'Contents')).sort(), ['Info.plist', 'MacOS', 'Resources']);
  assert.match(readFileSync(join(app, 'Contents/Info.plist'), 'utf8'), /<key>CFBundleIconFile<\/key><string>AppIcon<\/string>/);

  // 커밋된 .icns가 없으면 band:icon 안내와 함께 실패한다
  const fakeTool = join(work, 'tool');
  mkdirSync(join(fakeTool, 'mac'), { recursive: true });
  copyFileSync(join(MAC_DIR, 'make-app.sh'), join(fakeTool, 'mac', 'make-app.sh'));
  let stderr = '';
  try {
    execFileSync('bash', [join(fakeTool, 'mac', 'make-app.sh'), join(work, 'out2')], { stdio: 'pipe' });
    assert.fail('아이콘이 없으면 실패해야 한다');
  } catch (err) {
    stderr = String((err as { stderr?: Buffer }).stderr ?? '');
  }
  assert.match(stderr, /npm run band:icon/);
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log('band-import icon tests passed');
