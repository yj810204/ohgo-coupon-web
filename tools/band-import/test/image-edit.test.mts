import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createBrowserImageEditor, editedFileName, isNoopEdit, parseImageEdit } from '../src/image-edit.mts';
import type { ImageEdit } from '../src/image-edit.mts';

// ---------- 입력값 검사 ----------
assert.deepEqual(parseImageEdit({ rotate: 90, flipH: true, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 } }), { rotate: 90, flipH: true, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 } });
assert.deepEqual(parseImageEdit({}), { rotate: 0, flipH: false, crop: null });
assert.equal(parseImageEdit({ crop: { x: 0, y: 0, w: 1, h: 1 } }).crop, null, '전체 범위는 자르지 않는 것');
assert.equal(parseImageEdit({ flipH: 'yes' }).flipH, false, 'true만 뒤집기');
assert.throws(() => parseImageEdit({ rotate: 45 }), /회전 값/);
assert.throws(() => parseImageEdit({ crop: { x: 0.6, y: 0, w: 0.6, h: 1 } }), /자르기 범위/);
assert.throws(() => parseImageEdit({ crop: { x: -0.1, y: 0, w: 0.5, h: 0.5 } }), /자르기 범위/);
assert.throws(() => parseImageEdit({ crop: { x: 0, y: 0, w: 0, h: 0.5 } }), /자르기 범위/);
assert.throws(() => parseImageEdit({ crop: { x: 'a', y: 0, w: 0.5, h: 0.5 } }), /자르기 범위/);
assert.equal(isNoopEdit(parseImageEdit({ rotate: 0 })), true);
assert.equal(editedFileName('01.jpg'), 'edited_01.jpg');
assert.equal(editedFileName('03.png'), 'edited_03.png');
assert.equal(editedFileName('04.webp'), 'edited_04.jpg');
assert.equal(editedFileName('05.JPEG'), 'edited_05.jpg');

// ---------- 실제 Chromium으로 편집 ----------
// 40x20 그림: 왼쪽 절반 빨강, 오른쪽 절반 파랑, 왼쪽 위 10x10 초록, 오른쪽 아래 10x10 투명
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const make = async (type: string) =>
  Buffer.from(
    await page.evaluate(async (type) => {
      const c = new OffscreenCanvas(40, 20);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#f00';
      ctx.fillRect(0, 0, 20, 20);
      ctx.fillStyle = '#00f';
      ctx.fillRect(20, 0, 20, 20);
      ctx.fillStyle = '#0f0';
      ctx.fillRect(0, 0, 10, 10);
      ctx.clearRect(30, 10, 10, 10);
      const buf = new Uint8Array(await (await c.convertToBlob({ type, quality: 1 })).arrayBuffer());
      return btoa(String.fromCharCode(...buf));
    }, type),
    'base64',
  );
type Px = [number, number, number, number];
const read = async (bytes: Buffer, type: string) =>
  page.evaluate(
    async ({ b64, type }) => {
      const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([raw], { type }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      return { w: bmp.width, h: bmp.height, data: Array.from(ctx.getImageData(0, 0, bmp.width, bmp.height).data) };
    },
    { b64: bytes.toString('base64'), type },
  );
const at = (img: { w: number; data: number[] }, x: number, y: number): Px => img.data.slice((y * img.w + x) * 4, (y * img.w + x) * 4 + 4) as Px;
const color = ([r, g, b, a]: Px) => (a < 128 ? 'clear' : r > 180 && g < 90 && b < 90 ? 'red' : g > 180 && r < 90 && b < 90 ? 'green' : b > 180 && r < 90 && g < 90 ? 'blue' : r > 230 && g > 230 && b > 230 ? 'white' : `?${r},${g},${b},${a}`);

const png = await make('image/png');
const jpg = await make('image/jpeg');
const editor = await createBrowserImageEditor();
try {
  const run = async (src: Buffer, type: string, edit: Partial<ImageEdit>) => {
    const out = await editor.apply(src, type, { rotate: 0, flipH: false, crop: null, ...edit });
    const img = await read(out.bytes, out.contentType);
    assert.equal(img.w, out.width);
    assert.equal(img.h, out.height);
    return { out, img, c: (x: number, y: number) => color(at(img, x, y)) };
  };

  // 시계 방향 90도: 가로세로가 바뀌고 왼쪽 위 초록이 오른쪽 위로
  const r90 = await run(png, 'image/png', { rotate: 90 });
  assert.deepEqual([r90.img.w, r90.img.h], [20, 40]);
  assert.deepEqual([r90.c(15, 5), r90.c(5, 5), r90.c(15, 30), r90.c(5, 35)], ['green', 'red', 'blue', 'clear']);

  const r270 = await run(png, 'image/png', { rotate: 270 });
  assert.deepEqual([r270.img.w, r270.img.h], [20, 40]);
  assert.deepEqual([r270.c(5, 35), r270.c(15, 5), r270.c(15, 25)], ['green', 'clear', 'red']);

  const r180 = await run(png, 'image/png', { rotate: 180 });
  assert.deepEqual([r180.img.w, r180.img.h], [40, 20]);
  assert.deepEqual([r180.c(35, 15), r180.c(5, 5), r180.c(25, 5)], ['green', 'clear', 'red']);

  // 좌우 뒤집기: 초록이 오른쪽 위로, 투명한 곳이 왼쪽 아래로 (PNG 투명 유지)
  const flip = await run(png, 'image/png', { flipH: true });
  assert.equal(flip.out.contentType, 'image/png');
  assert.deepEqual([...flip.out.bytes.subarray(1, 4)].map((b) => String.fromCharCode(b)).join(''), 'PNG');
  assert.deepEqual([flip.c(35, 5), flip.c(5, 15), flip.c(15, 5), flip.c(25, 15)], ['green', 'clear', 'blue', 'red']);
  assert.equal(at(flip.img, 5, 15)[3], 0, '투명 배경은 그대로');

  // 돌린 뒤 화면 기준으로 뒤집기: 90도 회전에서 오른쪽 위였던 초록이 왼쪽 위로
  const rf = await run(png, 'image/png', { rotate: 90, flipH: true });
  assert.deepEqual([rf.img.w, rf.img.h], [20, 40]);
  assert.deepEqual([rf.c(5, 5), rf.c(15, 5), rf.c(15, 35)], ['green', 'red', 'clear']);

  // 자르기: 오른쪽 위 1/4은 모두 파랑
  const crop = await run(png, 'image/png', { crop: { x: 0.5, y: 0, w: 0.5, h: 0.5 } });
  assert.deepEqual([crop.img.w, crop.img.h], [20, 10]);
  assert.deepEqual([crop.c(0, 0), crop.c(19, 9)], ['blue', 'blue']);

  // 돌린 그림 기준 자르기(1:1): 90도 회전 20x40의 위쪽 20x20
  const rc = await run(png, 'image/png', { rotate: 90, crop: { x: 0, y: 0, w: 1, h: 0.5 } });
  assert.deepEqual([rc.img.w, rc.img.h], [20, 20]);
  assert.deepEqual([rc.c(15, 5), rc.c(5, 15)], ['green', 'red']);

  // JPEG 원본은 JPEG로, 투명한 곳은 없다
  const j = await run(jpg, 'image/jpeg', { rotate: 90, crop: { x: 0, y: 0.5, w: 1, h: 0.5 } });
  assert.equal(j.out.contentType, 'image/jpeg');
  assert.ok(j.out.bytes[0] === 0xff && j.out.bytes[1] === 0xd8, 'JPEG');
  assert.deepEqual([j.img.w, j.img.h], [20, 20]);
  assert.equal(j.c(10, 15), 'blue');
  assert.ok(j.img.data.every((v, i) => i % 4 !== 3 || v === 255), 'JPEG는 불투명');

  // 투명 PNG를 JPEG로 바꾸는 경우(webp/gif 원본 등)는 흰 배경
  const asJpeg = await editor.apply(png, 'image/webp', { rotate: 0, flipH: false, crop: null });
  assert.equal(asJpeg.contentType, 'image/jpeg');
  assert.equal(color(at(await read(asJpeg.bytes, 'image/jpeg'), 35, 15)), 'white');

  await assert.rejects(editor.apply(Buffer.from('not an image'), 'image/jpeg', { rotate: 90, flipH: false, crop: null }), /사진을 읽지 못했습니다/);
} finally {
  await editor.close();
  await browser.close();
}
console.log('band-import image edit tests passed');
