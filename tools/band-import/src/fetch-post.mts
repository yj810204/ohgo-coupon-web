import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext } from 'playwright';
import { isBandCookie } from './session-store.mts';
import { isBandApiHost } from './auth-state.mts';
import { trackLoginState } from './browser.mts';
import { buildExtracted } from './extracted.mts';
import {
  findPostInJson,
  imageFileName,
  normalizeApiPost,
  normalizeDomSnapshot,
  parseJsonLoose,
} from './normalize.mts';
import type { DomSnapshot, NormalizedPost } from './normalize.mts';
import type { ExtractedImage, ExtractedPost } from './schema.mts';
import type { BandPostRef } from './url.mts';

const IMAGE_DOWNLOAD_GAP_MS = 400;
const NOT_LOGGED_IN_GRACE_MS = 5000;

export class NotLoggedInError extends Error {}

function writeNetworkLog(outRoot: string, postId: string, entries: NetworkLogEntry[]): string {
  const outDir = join(outRoot, postId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'network-log.json'), `${JSON.stringify(entries, null, 2)}\n`);
  return outDir;
}

type Captured = { post: Record<string, unknown>; url: string };

/** 진단용. 토큰이 들어갈 수 있는 쿼리스트링은 남기지 않는다 */
export type NetworkLogEntry = { url: string; status: number; contentType: string; matched: boolean };

function captureApiPost(
  context: BrowserContext,
  postId: string,
): { get: () => Captured | null; log: () => NetworkLogEntry[] } {
  let captured: Captured | null = null;
  const entries: NetworkLogEntry[] = [];
  context.on('response', async (res) => {
    let url: URL;
    try {
      url = new URL(res.url());
    } catch {
      return;
    }
    if (!isBandApiHost(url.hostname)) return;
    const contentType = res.headers()['content-type'] ?? '';
    if (!/json|javascript|text\/plain/.test(contentType)) return;
    const entry: NetworkLogEntry = {
      url: `${url.origin}${url.pathname}`,
      status: res.status(),
      contentType,
      matched: false,
    };
    entries.push(entry);
    if (captured) return;
    try {
      const json = parseJsonLoose(await res.text());
      const post = json === undefined ? null : findPostInJson(json, postId);
      if (post && !captured) {
        captured = { post, url: entry.url };
        entry.matched = true;
      }
    } catch {
      // 이미 닫힌 응답
    }
  });
  return { get: () => captured, log: () => entries };
}

/** 브라우저 안에서 실행된다. Band 웹 게시글 상세 템플릿(postWrap / dPostTextView) 기준 */
function readPostDom(): DomSnapshot | null {
  const root =
    document.querySelector('.postWrap.-postDetailPage') ??
    document.querySelector('.postMain') ??
    null;
  if (!root) return null;
  const bodyEl = root.querySelector('.dPostTextView .txtBody') ?? root.querySelector('.txtBody');
  if (!bodyEl) return null;
  const author = root.querySelector('.postWriterInfoWrap .text')?.textContent?.trim() || null;
  const createdText = root.querySelector('.postWriterInfoWrap time')?.textContent?.trim() || null;
  // 아직 화면에 안 나온 사진은 src가 비어 있고 data-src 같은 곳에 주소가 있다
  const isPstatic = (src: string | null | undefined): src is string => !!src && /^https?:\/\/[^/]*pstatic\.net\//.test(src);
  const imageUrls: string[] = [];
  for (const img of Array.from(root.querySelectorAll<HTMLImageElement>('.postBody img, ._uploadedPhotoList img'))) {
    const srcset = (img.getAttribute('data-srcset') || img.getAttribute('srcset') || '').split(',')[0]?.trim().split(/\s+/)[0];
    const src = [img.currentSrc, img.src, img.getAttribute('data-src'), img.getAttribute('data-original'), img.getAttribute('data-lazy-src'), srcset].find(isPstatic);
    if (src && !imageUrls.includes(src)) imageUrls.push(src);
  }
  return {
    author,
    createdText,
    bodyText: (bodyEl as HTMLElement).innerText ?? bodyEl.textContent ?? '',
    imageUrls,
  };
}

export type ImageDownloader = (url: string) => Promise<{ body: Buffer; contentType: string | null }>;

export function browserImageDownloader(context: BrowserContext): ImageDownloader {
  return async (url) => {
    const res = await context.request.get(url, { headers: { Referer: 'https://band.us/' } });
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    return { body: await res.body(), contentType: res.headers()['content-type'] ?? null };
  };
}

async function downloadImages(
  download: ImageDownloader,
  images: NormalizedPost['images'],
  outDir: string,
  log: (msg: string) => void,
): Promise<ExtractedImage[]> {
  const result: ExtractedImage[] = [];
  for (const [index, img] of images.entries()) {
    let file: string | null = null;
    try {
      const { body, contentType } = await download(img.url);
      file = imageFileName(index, img.url, contentType);
      writeFileSync(join(outDir, file), body);
      log(`  이미지 ${index + 1}/${images.length} 저장: ${file}`);
    } catch (err) {
      log(`  이미지 ${index + 1}/${images.length} 실패: ${(err as Error).message}`);
    }
    result.push({ index, sourceUrl: img.url, file, width: img.width, height: img.height });
    if (index < images.length - 1) await new Promise((r) => setTimeout(r, IMAGE_DOWNLOAD_GAP_MS));
  }
  return result;
}

export async function fetchBandPost(args: {
  context: BrowserContext;
  ref: BandPostRef;
  outRoot: string;
  timeoutMs: number;
  log?: (msg: string) => void;
  download?: ImageDownloader;
}): Promise<{ extracted: ExtractedPost; outDir: string }> {
  const { context, ref, outRoot, timeoutMs } = args;
  const log = args.log ?? console.log;
  const login = trackLoginState(context);
  const api = captureApiPost(context, ref.postId);
  const page = context.pages()[0] ?? (await context.newPage());

  log(`열기: ${ref.canonicalUrl}`);
  await page.goto(ref.canonicalUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

  const deadline = Date.now() + timeoutMs;
  let noneSince: number | null = null;
  let dom: DomSnapshot | null = null;
  while (Date.now() < deadline) {
    if (api.get()) break;
    dom = await page.evaluate(readPostDom).catch(() => null);
    if (dom && dom.bodyText.trim()) {
      // API 응답이 DOM보다 늦게 오는 경우를 위해 잠깐 더 기다린다
      await page.waitForTimeout(1500);
      break;
    }
    // 로그인 상태 응답이 NONE이어도 토큰 갱신이나 재요청 뒤 게시글이 뜰 수 있어 바로 실패하지 않는다
    if (login.current() === 'none') {
      noneSince ??= Date.now();
      if (Date.now() - noneSince > NOT_LOGGED_IN_GRACE_MS) break;
    } else {
      noneSince = null;
    }
    await page.waitForTimeout(500);
  }

  const warnings: string[] = [];
  let via: 'api' | 'dom';
  let post: NormalizedPost;
  const captured = api.get();
  if (captured) {
    via = 'api';
    post = normalizeApiPost(captured.post);
    log(`API 응답에서 게시글을 찾았습니다 (${captured.url})`);
  } else if (dom && dom.bodyText.trim()) {
    via = 'dom';
    post = normalizeDomSnapshot(dom);
    warnings.push('API 응답을 찾지 못해 화면(DOM)에서 추출했습니다. 이미지가 일부만 잡혔을 수 있습니다');
    log('API 응답을 찾지 못해 DOM에서 추출합니다');
  } else {
    writeNetworkLog(outRoot, ref.postId, api.log());
    const bandCookies = (await context.cookies()).filter(isBandCookie).length;
    const diag = `(로그인 상태: ${login.lastRaw() ?? '응답 없음'}, Band 쿠키 ${bandCookies}개)`;
    if (login.current() === 'none') {
      throw new NotLoggedInError(`Band에 로그인되어 있지 않습니다 ${diag}. 로그인을 다시 실행하세요.`);
    }
    const blocked = await page
      .getByText('멤버만 볼 수 있습니다')
      .isVisible()
      .catch(() => false);
    throw new Error(
      blocked
        ? `게시글을 볼 권한이 없습니다(밴드 멤버 로그인 필요) ${diag}. 로그인 후 다시 시도하세요.`
        : `게시글을 ${Math.round(timeoutMs / 1000)}초 안에 읽지 못했습니다 ${diag}. --headed 로 화면을 확인해 보세요.`,
    );
  }

  const outDir = writeNetworkLog(outRoot, ref.postId, api.log());
  if (captured) {
    writeFileSync(join(outDir, 'api-post.json'), `${JSON.stringify(captured.post, null, 2)}\n`);
  }

  log(`이미지 ${post.images.length}개 다운로드`);
  const images = await downloadImages(args.download ?? browserImageDownloader(context), post.images, outDir, log);
  const extracted = buildExtracted({ ref, via, post, images, fetchedAt: new Date(), warnings });
  writeFileSync(join(outDir, 'extracted.json'), `${JSON.stringify(extracted, null, 2)}\n`);
  return { extracted, outDir };
}
