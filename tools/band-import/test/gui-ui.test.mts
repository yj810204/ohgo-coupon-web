import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createGuiServer } from '../src/gui-server.mts';
import type { OhgoService, PrepareResult, PushRequest } from '../src/ohgo-service.mts';

// 실제 화면(gui/index.html)을 Chromium에서 열어 조황 사진 순서 바꾸기를 확인한다
const dir = mkdtempSync(join(tmpdir(), 'band-gui-ui-'));
const outRoot = join(dir, 'out');
const FILES = ['01.jpg', '02.jpg', '03.png', '04.jpg'];
mkdirSync(join(outRoot, '2925'), { recursive: true });
const png = readFileSync(new URL('../gui/favicon.png', import.meta.url));
for (const f of FILES) writeFileSync(join(outRoot, '2925', f), png);

const prep: PrepareResult = {
  postId: '2925',
  bandId: '88348442',
  sourceUrl: 'https://band.us/band/88348442/post/2925',
  title: '감성돔 조황',
  refDate: '2026-10-06',
  classification: { kind: 'catch', scores: { catch: 9, schedule: 0 }, reasons: ['제목에 조황'] },
  photo: { title: '감성돔 조황', description: '손맛 보셨습니다', photoDate: '2026-10-06', images: FILES },
  photoWarnings: [],
  trip: { rows: [], destination: '', capacity: null, contact: '' },
  tripSource: 'single',
  tripMissing: [],
  tripHints: [],
  tripDuplicates: {},
  ledger: null,
  remoteWarnings: [],
};
const pushes: PushRequest[] = [];
const ohgo: OhgoService = {
  state: async () => ({ baseUrl: 'https://ohgo.test', supabaseUrl: 'https://x.supabase.co', configError: null, user: { name: '선장', userId: 'u', savedAt: 'now' } }),
  login: async () => ohgo.state(),
  logout: async () => ohgo.state(),
  prepare: async () => structuredClone(prep),
  checkPush: () => {},
  push: async (req) => {
    pushes.push(req);
    return { kind: req.kind, target: 'community_photos', rowIds: ['r1'], links: ['https://ohgo.test/community/r1'], title: 't', resizedImages: 0 };
  },
  isAppLink: () => false,
};
const gui = createGuiServer({
  outRoot,
  userDataDir: join(dir, 'profile'),
  htmlPath: new URL('../gui/index.html', import.meta.url).pathname,
  openPath: () => {},
  ohgo,
  runLogin: async () => {},
  runFetch: async () => {
    throw new Error('unused');
  },
});
await new Promise<void>((r) => gui.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(gui.server.address() as AddressInfo).port}`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/?t=${gui.token}`);
  await page.evaluate(() => (window as unknown as { loadOhgo: (id: string) => Promise<void> }).loadOhgo('2925'));
  const thumbs = page.locator('#pThumbs .thumb');
  await thumbs.first().waitFor();
  const shown = async () => thumbs.evaluateAll((els) => els.map((el) => `${(el as HTMLElement).dataset.file}:${el.querySelector('.num')!.textContent}`));
  assert.deepEqual(await shown(), ['01.jpg:1', '02.jpg:2', '03.png:3', '04.jpg:4']);
  assert.equal(await thumbs.first().locator('button.mv').first().isDisabled(), true, '첫 사진은 앞으로 못 간다');

  // ▶ 버튼: 01을 한 칸 뒤로
  await thumbs.nth(0).locator('button.mv').nth(1).click();
  assert.deepEqual(await shown(), ['02.jpg:1', '01.jpg:2', '03.png:3', '04.jpg:4']);

  // 03을 빼면 번호가 당겨지고, 순서를 바꿔도 뺀 상태는 그 사진에 남는다
  await page.locator('#pThumbs .thumb[data-file="03.png"] img').click();
  assert.deepEqual(await shown(), ['02.jpg:1', '01.jpg:2', '03.png:뺌', '04.jpg:3']);
  await page.locator('#pThumbs .thumb[data-file="03.png"] button.mv').first().click();
  assert.deepEqual(await shown(), ['02.jpg:1', '03.png:뺌', '01.jpg:2', '04.jpg:3']);
  assert.match(await page.locator('#pCount').textContent() ?? '', /^3장 올림/);

  // 끌어다 놓기: 04를 맨 앞으로
  await page.locator('#pThumbs .thumb[data-file="04.jpg"]').dragTo(page.locator('#pThumbs .thumb[data-file="02.jpg"]'));
  assert.deepEqual(await shown(), ['04.jpg:1', '02.jpg:2', '03.png:뺌', '01.jpg:3']);

  await page.locator('#pushBtn').click();
  await page.locator('#pushResult:not(.hidden)').waitFor();
  assert.deepEqual(pushes[0].photo!.images, ['04.jpg', '02.jpg', '01.jpg'], '보이는 순서대로, 뺀 사진 없이 보낸다');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  gui.server.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log('band-import gui ui tests passed');
