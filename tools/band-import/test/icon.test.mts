import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

class SkipFallback extends Error {}

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
assert.deepEqual(pngSize(readFileSync(new URL('../gui/favicon.png', import.meta.url))), [128, 128]);

// make-app.sh: sips/iconutil이 있으면(macOS) iconset을 만들어 iconutil로 .icns를 만든다
const work = mkdtempSync(join(tmpdir(), 'band-app-test-'));
try {
  const bin = join(work, 'bin');
  execFileSync('mkdir', ['-p', bin]);
  const calls = join(work, 'calls.log');
  writeFileSync(
    join(bin, 'sips'),
    `#!/bin/bash\necho "sips $*" >> "${calls}"\nout="\${@: -1}"\ncp "$4" "$out"\n`,
  );
  writeFileSync(
    join(bin, 'iconutil'),
    `#!/bin/bash\necho "iconutil $*" >> "${calls}"\nls "$3" > "${join(work, 'iconset.txt')}"\necho fake-icns > "$5"\n`,
  );
  chmodSync(join(bin, 'sips'), 0o755);
  chmodSync(join(bin, 'iconutil'), 0o755);
  execFileSync('bash', [join(MAC_DIR, 'make-app.sh'), join(work, 'out')], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    stdio: 'pipe',
  });
  const app = join(work, 'out', 'Band 가져오기.app');
  assert.deepEqual(readFileSync(join(work, 'iconset.txt'), 'utf8').trim().split('\n').sort(), [
    'icon_128x128.png', 'icon_128x128@2x.png', 'icon_16x16.png', 'icon_16x16@2x.png', 'icon_256x256.png',
    'icon_256x256@2x.png', 'icon_32x32.png', 'icon_32x32@2x.png', 'icon_512x512.png', 'icon_512x512@2x.png',
  ]);
  const log = readFileSync(calls, 'utf8');
  assert.ok(log.includes('sips -z 1024 1024'));
  assert.match(log, /iconutil -c icns .*AppIcon\.iconset -o .*Resources\/AppIcon\.icns/);
  assert.equal(readFileSync(join(app, 'Contents/Resources/AppIcon.icns'), 'utf8'), 'fake-icns\n');
  assert.match(readFileSync(join(app, 'Contents/Info.plist'), 'utf8'), /<key>CFBundleIconFile<\/key><string>AppIcon<\/string>/);

  // sips/iconutil이 없으면 커밋된 .icns를 복사한다 (Mac에서는 /usr/bin에 실제 도구가 있어 건너뛴다)
  if (existsSync('/usr/bin/sips')) throw new SkipFallback();
  const noMac = join(work, 'out2');
  execFileSync('bash', [join(MAC_DIR, 'make-app.sh'), noMac], {
    env: { ...process.env, PATH: '/usr/bin:/bin' },
    stdio: 'pipe',
  });
  const copied = join(noMac, 'Band 가져오기.app', 'Contents/Resources/AppIcon.icns');
  assert.ok(existsSync(copied));
  assert.ok(readFileSync(copied).equals(icns));
  assert.deepEqual(readdirSync(join(noMac, 'Band 가져오기.app', 'Contents')).sort(), ['Info.plist', 'MacOS', 'Resources']);
} catch (err) {
  if (!(err instanceof SkipFallback)) throw err;
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log('band-import icon tests passed');
