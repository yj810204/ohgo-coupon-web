import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from 'playwright';

/**
 * 사진 한 장 편집: 먼저 시계 방향으로 rotate만큼 돌리고, 돌린 화면 기준으로 좌우를 뒤집은 뒤 자른다.
 * crop은 그렇게 돌리고 뒤집은 그림 위의 0~1 비율 좌표다.
 */
export type CropRect = { x: number; y: number; w: number; h: number };
export type ImageEdit = { rotate: 0 | 90 | 180 | 270; flipH: boolean; crop: CropRect | null };

export type EditRecord = { edit: ImageEdit; output: string; width: number; height: number; updatedAt: string };
export type EditMap = Record<string, EditRecord>;

export type EditedImage = { bytes: Buffer; contentType: string; width: number; height: number };
export type ImageEditor = {
  apply(bytes: Buffer, contentType: string, edit: ImageEdit): Promise<EditedImage>;
  close(): Promise<void>;
};

export const EDITS_FILE = 'edits.json';
export const JPEG_QUALITY = 0.9;
const MAX_EDGE = 8192;

export class ImageEditError extends Error {}

/** 화면에서 온 편집값을 정해진 모양으로만 받는다 */
export function parseImageEdit(raw: unknown): ImageEdit {
  const v = (raw ?? {}) as Record<string, unknown>;
  const rotate = Number(v.rotate ?? 0);
  if (![0, 90, 180, 270].includes(rotate)) throw new ImageEditError('회전 값이 잘못되었습니다');
  let crop: CropRect | null = null;
  if (v.crop !== null && v.crop !== undefined) {
    const c = v.crop as Record<string, unknown>;
    const [x, y, w, h] = [c.x, c.y, c.w, c.h].map(Number);
    const ok = [x, y, w, h].every(Number.isFinite) && x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.000001 && y + h <= 1.000001;
    if (!ok) throw new ImageEditError('자르기 범위가 잘못되었습니다');
    crop = { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
    if (crop.x === 0 && crop.y === 0 && crop.w >= 0.999999 && crop.h >= 0.999999) crop = null;
  }
  return { rotate: rotate as ImageEdit['rotate'], flipH: v.flipH === true, crop };
}

export function isNoopEdit(e: ImageEdit): boolean {
  return e.rotate === 0 && !e.flipH && e.crop === null;
}

/** 01.jpg → edited_01.jpg, 03.png → edited_03.png (PNG만 투명 배경을 살리려고 PNG로 둔다) */
export function editedFileName(original: string): string {
  const stem = original.replace(/\.[^.]+$/, '');
  return `edited_${stem}.${/\.png$/i.test(original) ? 'png' : 'jpg'}`;
}

export function readEdits(outDir: string): EditMap {
  const path = join(outDir, EDITS_FILE);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as EditMap) : {};
  } catch {
    return {};
  }
}

export function writeEdits(outDir: string, edits: EditMap): void {
  const path = join(outDir, EDITS_FILE);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(edits, null, 2)}\n`);
  renameSync(tmp, path);
}

/** 편집본이 실제로 있으면 그 파일 이름, 아니면 원본 이름 */
export function uploadFileFor(outDir: string, file: string, edits: EditMap): string {
  const rec = edits[file];
  return rec && rec.output === editedFileName(file) && existsSync(join(outDir, rec.output)) ? rec.output : file;
}

/** Playwright Chromium의 canvas로 돌리기, 뒤집기, 자르기를 한다. 다 쓰면 close()를 부른다 */
export async function createBrowserImageEditor(): Promise<ImageEditor> {
  let browser: Browser | null = null;
  return {
    async apply(bytes, contentType, edit) {
      if (!browser) {
        const { chromium } = await import('playwright');
        browser = await chromium.launch({ headless: true });
      }
      const page = await browser.newPage();
      try {
        const keepPng = contentType === 'image/png';
        const out = await page.evaluate(
          async ({ data, type, edit, keepPng, quality, maxEdge }) => {
            const raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
            const bitmap = await createImageBitmap(new Blob([raw], { type }));
            const W = bitmap.width;
            const H = bitmap.height;
            const turned = edit.rotate % 180 !== 0;
            const RW = turned ? H : W;
            const RH = turned ? W : H;
            const c = edit.crop ?? { x: 0, y: 0, w: 1, h: 1 };
            const sx = Math.round(c.x * RW);
            const sy = Math.round(c.y * RH);
            const sw = Math.max(1, Math.min(RW - sx, Math.round(c.w * RW)));
            const sh = Math.max(1, Math.min(RH - sy, Math.round(c.h * RH)));
            if (sw > maxEdge || sh > maxEdge) throw new Error(`사진이 너무 큽니다 (${sw}x${sh})`);
            const canvas = new OffscreenCanvas(sw, sh);
            const ctx = canvas.getContext('2d')!;
            if (!keepPng) {
              ctx.fillStyle = '#fff';
              ctx.fillRect(0, 0, sw, sh);
            }
            ctx.translate(-sx, -sy);
            ctx.translate(RW / 2, RH / 2);
            if (edit.flipH) ctx.scale(-1, 1);
            ctx.rotate((edit.rotate * Math.PI) / 180);
            ctx.drawImage(bitmap, -W / 2, -H / 2);
            const blob = await canvas.convertToBlob(keepPng ? { type: 'image/png' } : { type: 'image/jpeg', quality });
            const buf = new Uint8Array(await blob.arrayBuffer());
            let s = '';
            for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
            return { b64: btoa(s), width: sw, height: sh };
          },
          { data: bytes.toString('base64'), type: contentType, edit, keepPng, quality: JPEG_QUALITY, maxEdge: MAX_EDGE },
        );
        return { bytes: Buffer.from(out.b64, 'base64'), contentType: keepPng ? 'image/png' : 'image/jpeg', width: out.width, height: out.height };
      } catch (err) {
        const msg = (err as Error).message;
        throw new ImageEditError(/InvalidStateError|decode|source image/i.test(msg) ? '사진을 읽지 못했습니다' : msg.replace(/^page\.evaluate: (Error: )?/, '').split('\n')[0]);
      } finally {
        await page.close();
      }
    },
    async close() {
      await (browser as Browser | null)?.close();
      browser = null;
    },
  };
}
