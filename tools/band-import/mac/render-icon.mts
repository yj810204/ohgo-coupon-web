/**
 * 오고피씽 앱 로고(mobile/assets/icon.png)로 Band 가져오기 앱 아이콘을 만든다.
 *   AppIcon.png  1024px 원본 (make-app.sh가 Mac에서 sips/iconutil로 .icns를 만들 때 사용)
 *   AppIcon.icns 미리 만든 .icns (iconutil이 없을 때 make-app.sh가 그대로 복사)
 *   ../gui/favicon.png GUI 창 아이콘
 * 사용: npm run band:icon
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const MAC_DIR = new URL('./', import.meta.url);
const logo = readFileSync(new URL('../../../mobile/assets/icon.png', import.meta.url)).toString('base64');

// macOS 아이콘 격자: 1024 캔버스 안에 824 둥근 사각형(여백 100, 모서리 반경 약 185)
async function renderPng(page: import('playwright').Page, size: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    async ({ size, logo }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${logo}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const s = size / 1024;
      ctx.beginPath();
      ctx.roundRect(100 * s, 100 * s, 824 * s, 824 * s, 185 * s);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.clip();
      const logoSize = 700 * s;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (size - logoSize) / 2, (size - logoSize) / 2, logoSize, logoSize);
      return canvas.toDataURL('image/png');
    },
    { size, logo },
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** PNG 조각을 담는 .icns. 타입별 픽셀 크기는 Apple 규격(icp4=16 … ic10=1024) */
const ICNS_TYPES: [string, number][] = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic11', 32],
  ['icp6', 64],
  ['ic12', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic13', 256],
  ['ic09', 512],
  ['ic14', 512],
  ['ic10', 1024],
];

export function encodeIcns(entries: { type: string; png: Buffer }[]): Buffer {
  const chunks = entries.map(({ type, png }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 'ascii');
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const pngs = new Map<number, Buffer>();
    for (const size of new Set([...ICNS_TYPES.map(([, s]) => s), 128])) pngs.set(size, await renderPng(page, size));
    writeFileSync(new URL('AppIcon.png', MAC_DIR), pngs.get(1024)!);
    writeFileSync(
      new URL('AppIcon.icns', MAC_DIR),
      encodeIcns(ICNS_TYPES.map(([type, size]) => ({ type, png: pngs.get(size)! }))),
    );
    writeFileSync(new URL('../gui/favicon.png', MAC_DIR), pngs.get(128)!);
    console.log('아이콘을 만들었습니다: tools/band-import/mac/AppIcon.png, AppIcon.icns, gui/favicon.png');
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
