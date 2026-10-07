import type { Browser } from 'playwright';

/** 앱 업로드 API(/api/community/upload-photo)와 같은 한도 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

/** 앱 lib/image-process.ts의 기본값(긴 변 1600px, 품질 0.82)을 중심으로 점점 줄인다 */
export const REENCODE_STEPS = [
  { maxEdge: 2560, quality: 0.85 },
  { maxEdge: 2048, quality: 0.82 },
  { maxEdge: 1600, quality: 0.82 },
  { maxEdge: 1280, quality: 0.75 },
  { maxEdge: 1024, quality: 0.7 },
];

export type Reencode = (bytes: Buffer, contentType: string, step: { maxEdge: number; quality: number }) => Promise<Buffer>;

export type PreparedImage = { bytes: Buffer; contentType: string; ext: string; resized: boolean; originalBytes: number };

export function extOf(fileName: string): string {
  return (/\.([a-z0-9]+)$/i.exec(fileName)?.[1] ?? '').toLowerCase();
}

/** 5MB 이하이고 앱이 받는 형식이면 그대로, 아니면 JPEG로 줄여서 돌려준다 */
export async function prepareImage(bytes: Buffer, fileName: string, reencode: Reencode, limit = MAX_UPLOAD_BYTES): Promise<PreparedImage> {
  const ext = extOf(fileName);
  const contentType = TYPES[ext];
  if (contentType && bytes.length <= limit) {
    return { bytes, contentType, ext: ext === 'jpeg' ? 'jpg' : ext, resized: false, originalBytes: bytes.length };
  }
  for (const step of REENCODE_STEPS) {
    const out = await reencode(bytes, contentType ?? 'application/octet-stream', step);
    if (out.length <= limit) return { bytes: out, contentType: 'image/jpeg', ext: 'jpg', resized: true, originalBytes: bytes.length };
  }
  throw new Error(`${fileName}: 5MB 이하로 줄이지 못했습니다`);
}

/** Playwright Chromium의 canvas로 JPEG 재압축한다. 다 쓰면 close()를 부른다 */
export async function createBrowserReencoder(): Promise<{ reencode: Reencode; close: () => Promise<void> }> {
  let browser: Browser | null = null;
  const reencode: Reencode = async (bytes, contentType, { maxEdge, quality }) => {
    if (!browser) {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({ headless: true });
    }
    const page = await browser.newPage();
    try {
      const b64 = await page.evaluate(
        async ({ data, type, maxEdge, quality }) => {
          const raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([raw], { type }));
          const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
          const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
          const buf = new Uint8Array(await blob.arrayBuffer());
          let s = '';
          for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          return btoa(s);
        },
        { data: bytes.toString('base64'), type: contentType, maxEdge, quality },
      );
      return Buffer.from(b64, 'base64');
    } finally {
      await page.close();
    }
  };
  return {
    reencode,
    close: async () => {
      await (browser as Browser | null)?.close();
      browser = null;
    },
  };
}
