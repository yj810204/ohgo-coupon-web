/**
 * 오고피씽 앱 로고(mobile/assets/icon.png)로 Band 가져오기 앱 아이콘을 만든다.
 *   AppIcon.png  1024px 원본 (make-app.sh가 Mac에서 sips/iconutil로 .icns를 만들 때 사용)
 *   AppIcon.icns 미리 만든 .icns (iconutil이 없을 때 make-app.sh가 그대로 복사)
 *   ../gui/favicon.png GUI 창 아이콘
 * 오고피씽 로고에 Band 배지와 동기화 표시를 더해 "Band에서 오고피씽으로 가져오기"를 나타낸다.
 * 사용: npm run band:icon
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const MAC_DIR = new URL('./', import.meta.url);
const logo = readFileSync(new URL('../../../mobile/assets/icon.png', import.meta.url)).toString('base64');

export const BAND_GREEN = '#00C73C';
export const SYNC_PINK = '#FF0A84';

/**
 * 1024 기준 배치. 64px은 배지와 동기화 표시를 키우고 선을 굵게 한다.
 * 32px 이하는 동기화 표시가 몇 픽셀로 뭉개져 빼고, 그만큼 배지를 키워 로고와 b만 또렷하게 보이게 한다.
 * - 바탕: macOS 아이콘 격자의 824 둥근 사각형(여백 100, 모서리 반경 185)
 * - 오고피씽 로고: 왼쪽 위
 * - Band 배지: 오른쪽 아래 초록 둥근 사각형 + 흰 b (직접 그린 단순 도형, Band 로고 파일 아님)
 * - 동기화 표시: 로고와 배지가 맞닿는 곳의 흰 원 + 분홍 두 화살표
 */
export function iconLayout(size: number) {
  if (size <= 32) {
    return { logo: { x: 104, y: 96, size: 620 }, badge: { x: 450, y: 450, size: 474, radius: 110, ring: 34 }, sync: null };
  }
  if (size <= 64) {
    return { logo: { x: 112, y: 104, size: 600 }, badge: { x: 470, y: 470, size: 430, radius: 100, ring: 30 }, sync: { r: 128, ring: 26, line: 44 } };
  }
  return { logo: { x: 120, y: 110, size: 640 }, badge: { x: 540, y: 540, size: 350, radius: 82, ring: 26 }, sync: { r: 112, ring: 22, line: 30 } };
}

// 브라우저 안에서 그린다. 그라데이션과 그림자 없이 단색 도형만 쓴다
async function renderPng(page: import('playwright').Page, size: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    async ({ size, logo, layout, green, pink }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${logo}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(size / 1024, size / 1024);
      ctx.imageSmoothingQuality = 'high';

      ctx.beginPath();
      ctx.roundRect(100, 100, 824, 824, 185);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.save();
      ctx.clip();

      const { logo: l, badge: b, sync } = layout;
      ctx.drawImage(img, l.x, l.y, l.size, l.size);

      // Band 배지: 바탕색 테두리로 로고와 떼어 놓는다
      ctx.beginPath();
      ctx.roundRect(b.x - b.ring, b.y - b.ring, b.size + b.ring * 2, b.size + b.ring * 2, b.radius + b.ring);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.size, b.size, b.radius);
      ctx.fillStyle = green;
      ctx.fill();

      // 흰 b: 세로 기둥 + 아래쪽 고리
      const u = b.size / 350;
      const stemW = 54 * u;
      const bowlR = 78 * u;
      const bowlCx = b.x + 196 * u;
      const bowlCy = b.y + 214 * u;
      const stemX = bowlCx - bowlR;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(stemX, b.y + 62 * u, stemW, bowlCy + bowlR - (b.y + 62 * u), stemW / 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bowlCx + stemW / 2 - 4 * u, bowlCy, bowlR, 0, Math.PI * 2);
      ctx.arc(bowlCx + stemW / 2 - 4 * u, bowlCy, bowlR - stemW, 0, Math.PI * 2, true);
      ctx.fill();

      // 동기화 표시: 배지 왼쪽 위 모서리에 걸친 흰 원 + 서로 쫓는 두 화살표
      if (!sync) {
        ctx.restore();
        return canvas.toDataURL('image/png');
      }
      const cx = b.x + 6;
      const cy = b.y + 6;
      ctx.beginPath();
      ctx.arc(cx, cy, sync.r + sync.ring, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, sync.r, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      const ar = sync.r * 0.56;
      const head = sync.line * 1.25;
      ctx.strokeStyle = pink;
      ctx.fillStyle = pink;
      ctx.lineWidth = sync.line;
      ctx.lineCap = 'butt';
      for (const start of [Math.PI * 1.05, Math.PI * 0.05]) {
        const end = start + Math.PI * 0.62;
        ctx.beginPath();
        ctx.arc(cx, cy, ar, start, end);
        ctx.stroke();
        // 시계 방향 접선 쪽으로 화살촉
        const ex = cx + ar * Math.cos(end);
        const ey = cy + ar * Math.sin(end);
        const tx = -Math.sin(end);
        const ty = Math.cos(end);
        const nx = Math.cos(end);
        const ny = Math.sin(end);
        ctx.beginPath();
        ctx.moveTo(ex + tx * head * 1.1, ey + ty * head * 1.1);
        ctx.lineTo(ex + nx * head, ey + ny * head);
        ctx.lineTo(ex - nx * head, ey - ny * head);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      return canvas.toDataURL('image/png');
    },
    { size, logo, layout: iconLayout(size), green: BAND_GREEN, pink: SYNC_PINK },
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
