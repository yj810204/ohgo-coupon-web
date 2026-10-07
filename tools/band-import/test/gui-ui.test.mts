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
  photo: { title: '감성돔 조황', description: '4짜 대박\n#낫개', photoDate: '2026-10-06', images: FILES, useFormatting: true },
  photoWarnings: [],
  photoEdits: {},
  photoFormatted: { html: '<span style="color:#ff3445">4짜</span> <b>대박</b><br>#낫개', text: '4짜 대박\n#낫개' },
  trip: { rows: [], destination: '', capacity: null, contact: '' },
  tripSource: 'single',
  tripMissing: [],
  tripHints: [],
  tripDuplicates: {},
  ledger: null,
  remoteWarnings: [],
};
const pushes: PushRequest[] = [];
const edits: string[] = [];
let editMap: PrepareResult['photoEdits'] = {};
const ohgo: OhgoService = {
  state: async () => ({ baseUrl: 'https://ohgo.test', supabaseUrl: 'https://x.supabase.co', configError: null, user: { name: '선장', userId: 'u', savedAt: 'now' } }),
  login: async () => ohgo.state(),
  logout: async () => ohgo.state(),
  prepare: async () => ({ ...structuredClone(prep), photoEdits: editMap }),
  checkPush: () => {},
  push: async (req) => {
    pushes.push(req);
    return { kind: req.kind, target: 'community_photos', rowIds: ['r1'], links: ['https://ohgo.test/community/r1'], title: 't', resizedImages: 0 };
  },
  editImage: async (_postId, file, edit) => {
    edits.push(`edit ${file} ${JSON.stringify(edit)}`);
    writeFileSync(join(outRoot, '2925', `edited_${file}`), png);
    editMap = { ...editMap, [file]: { edit, output: `edited_${file}`, width: 1, height: 1, updatedAt: '2026-10-07T00:00:00Z' } };
    return editMap;
  },
  revertImage: async (_postId, file) => {
    edits.push(`revert ${file}`);
    editMap = Object.fromEntries(Object.entries(editMap).filter(([f]) => f !== file));
    return editMap;
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
  assert.equal(await thumbs.first().locator('button[title="앞으로"]').isDisabled(), true, '첫 사진은 앞으로 못 간다');

  // ▶ 버튼: 01을 한 칸 뒤로
  await thumbs.nth(0).locator('button[title="뒤로"]').click();
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

  // 편집: 오른쪽으로 돌리고 4:3으로 자르면 그 값이 저장되고, 썸네일은 편집본을 보여 준다
  const thumb02 = page.locator('#pThumbs .thumb[data-file="02.jpg"]');
  await thumb02.locator('button.ed').click();
  await page.locator('#editModal:not(.hidden)').waitFor();
  assert.equal(await page.locator('#edRevert').isDisabled(), true, '편집 전에는 되돌릴 것이 없다');
  await page.locator('#edSave:not([disabled])').waitFor();
  await page.locator('#edRotR').click();
  await page.locator('[data-ratio="4:3"]').click();
  const size = await page.locator('#edSize').textContent();
  const [w, h] = (size ?? '').split(' x ').map(Number);
  assert.ok(Math.abs(w / h - 4 / 3) < 0.02, `4:3 자르기 ${size}`);
  await page.locator('#edSave').click();
  await page.locator('#editModal.hidden').waitFor({ state: 'attached' });
  const saved = JSON.parse(edits[0].replace('edit 02.jpg ', ''));
  assert.equal(saved.rotate, 90);
  assert.equal(saved.flipH, false);
  assert.ok(Math.abs(saved.crop.x) < 1e-6 && Math.abs(saved.crop.w - 1) < 1e-6 && Math.abs(saved.crop.y - 0.125) < 1e-3 && Math.abs(saved.crop.h - 0.75) < 1e-3, JSON.stringify(saved.crop));
  assert.equal(await thumb02.locator('.edited').textContent(), '편집됨');
  assert.match(await thumb02.locator('img').getAttribute('src') ?? '', /edited_02\.jpg/);

  // 뒤집은 상태에서 오른쪽으로 돌리면 화면 기준으로 돈다 (저장값은 270)
  await page.locator('#pThumbs .thumb[data-file="01.jpg"] button.ed').click();
  await page.locator('#edFlip').click();
  await page.locator('#edRotR').click();
  await page.locator('#edSave').click();
  await page.locator('#editModal.hidden').waitFor({ state: 'attached' });
  assert.equal(edits[1], 'edit 01.jpg {"rotate":270,"flipH":true,"crop":null}');

  // 다시 열면 저장한 값으로 열리고, 원본으로 되돌릴 수 있다
  await thumb02.locator('button.ed').click();
  assert.equal(await page.locator('[data-ratio="free"]').getAttribute('class'), 'on');
  assert.equal(await page.locator('#edRevert').isDisabled(), false);
  await page.locator('#edRevert').click();
  await page.locator('#editModal.hidden').waitFor({ state: 'attached' });
  assert.equal(edits[2], 'revert 02.jpg');
  assert.equal(await thumb02.locator('.edited').count(), 0);
  assert.match(await thumb02.locator('img').getAttribute('src') ?? '', /\/02\.jpg/);

  // 취소하면 아무것도 저장하지 않는다
  await thumb02.locator('button.ed').click();
  await page.locator('#edRotL').click();
  await page.keyboard.press('Escape');
  assert.equal(edits.length, 3);

  // 자르기 상자: 오른쪽 아래 모서리를 끌면 줄고, 가운데를 끌면 옮겨진다 (사진 밖으로는 안 나감)
  await page.locator('#pThumbs .thumb[data-file="04.jpg"] button.ed').click();
  await page.locator('#editModal:not(.hidden)').waitFor();
  await page.waitForFunction(() => document.getElementById('edSize')!.textContent !== '');
  const se = await page.locator('#edCrop i[data-h="se"]').boundingBox();
  const canvasBox = await page.locator('#edCanvas').boundingBox();
  await page.mouse.move(se!.x + se!.width / 2, se!.y + se!.height / 2);
  await page.mouse.down();
  await page.mouse.move(se!.x + se!.width / 2 - canvasBox!.width / 2, se!.y + se!.height / 2 - canvasBox!.height / 2, { steps: 4 });
  await page.mouse.up();
  const box = await page.locator('#edCrop').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + canvasBox!.width, box!.y + box!.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.locator('#edSave').click();
  await page.locator('#editModal.hidden').waitFor({ state: 'attached' });
  const dragged = JSON.parse(edits[3].replace('edit 04.jpg ', '')).crop;
  assert.ok(Math.abs(dragged.w - 0.5) < 0.05 && Math.abs(dragged.h - 0.5) < 0.05, `절반 크기 ${JSON.stringify(dragged)}`);
  assert.ok(Math.abs(dragged.x + dragged.w - 1) < 1e-6 && dragged.y < 1e-6, `오른쪽 끝까지 옮김 ${JSON.stringify(dragged)}`);
  assert.deepEqual(await shown(), ['04.jpg:1', '02.jpg:2', '03.png:뺌', '01.jpg:3'], '편집해도 순서와 뺀 사진은 그대로');

  // 본문 서식: 미리보기를 그리고 기본으로 켠다. 내용을 고치면 꺼진다
  type Payload = { photo: { useFormatting: boolean; description: string } };
  const payload = () => page.evaluate(() => (window as unknown as { pushPayload: () => Payload }).pushPayload());
  assert.equal(await page.locator('#fmtBox').isVisible(), true);
  assert.equal(await page.locator('#fmtPreview span').getAttribute('style'), 'color:#ff3445');
  assert.equal(await page.locator('#fmtPreview b').textContent(), '대박');
  assert.equal(await page.locator('#pFormat').isChecked(), true);
  assert.equal((await payload()).photo.useFormatting, true);
  await page.locator('#pDesc').fill('4짜 대박\n#낫개\n고침');
  assert.equal(await page.locator('#pFormat').isChecked(), false, '내용을 고치면 서식을 끈다');
  assert.match(await page.locator('#fmtNote').textContent() ?? '', /서식 없이 고친 내용으로 올립니다/);
  assert.equal(await page.locator('#fmtPreview').isVisible(), false);
  assert.deepEqual((await payload()).photo, { ...(await payload()).photo, useFormatting: false, description: '4짜 대박\n#낫개\n고침' });
  await page.locator('#pFormat').check();
  assert.match(await page.locator('#fmtNote').textContent() ?? '', /고친 내용이 아니라 아래 미리보기가 보입니다/);
  await page.locator('#pDesc').fill('4짜 대박\n#낫개');
  await page.locator('#pFormat').uncheck();
  await page.locator('#pFormat').check();
  assert.equal(await page.locator('#fmtNote').textContent(), '');

  await page.locator('#pushBtn').click();
  await page.locator('#pushResult:not(.hidden)').waitFor();
  assert.deepEqual(pushes[0].photo!.images, ['04.jpg', '02.jpg', '01.jpg'], '보이는 순서대로, 뺀 사진 없이 보낸다');
  assert.equal(pushes[0].photo!.useFormatting, true);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  gui.server.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log('band-import gui ui tests passed');
