import type { BrowserContext, Page } from 'playwright';
import { trackLoginState } from './browser.mts';
import type { LoginState } from './auth-state.mts';
import { isBandApiHost } from './auth-state.mts';
import { classifyPost } from './classify.mts';
import { isLoginUrl, loginRequiredReason } from './check-login.mts';
import type { ListPost, PostKind } from './check-state.mts';
import { snippetOf, toKstIso } from './check-state.mts';
import { deriveTitle, normalizeApiPost, parseJsonLoose } from './normalize.mts';
import { EXTRACTED_SCHEMA_VERSION } from './schema.mts';
import type { ExtractedPost, ExtractedSchedule } from './schema.mts';

type Json = unknown;
type Rec = Record<string, unknown>;

function pick(obj: Rec, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

/**
 * fetch와 같이 Band JSON 전체를 보며 post_no와 content/attachment가 있는 글을 모은다.
 * findPostInJson은 글 번호 하나를 찾고, 목록 확인은 같은 조건으로 여러 글을 모은다.
 */
export function findPostsInJson(json: Json, maxDepth = 10): Rec[] {
  const seen = new Set<unknown>();
  const seenNo = new Set<string>();
  const found: Rec[] = [];
  const walk = (node: Json, depth: number): void => {
    if (typeof node === 'string' && depth <= maxDepth && /^\s*[[{]/.test(node) && /post_no|postNo/.test(node)) {
      const inner = parseJsonLoose(node);
      if (inner !== undefined) walk(inner, depth + 1);
      return;
    }
    if (depth > maxDepth || node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const rec = node as Rec;
    const postNo = pick(rec, 'post_no', 'postNo');
    if (postNo !== undefined && ('content' in rec || 'attachment' in rec)) {
      const id = String(postNo);
      if (!seenNo.has(id)) {
        seenNo.add(id);
        found.push(rec);
      }
    }
    for (const value of Object.values(rec)) walk(value, depth + 1);
  };
  walk(json, 0);
  return found;
}

const TARGET_POSTS = 20;
const MAX_POSTS = 40;
const NOT_LOGGED_IN_GRACE_MS = 5000;

export type FeedDomPost = {
  postNo: string;
  author: string | null;
  text: string;
  photoCount: number | null;
};

export type FeedCollectResult =
  | { ok: true; posts: ListPost[] }
  | { ok: false; status: 'login_required' | 'error'; message: string };

type Raw = Record<string, unknown>;

function kindFromParts(body: string, photoCount: number, schedules: ExtractedSchedule[], createdAt: string | null): PostKind {
  const images = Array.from({ length: photoCount }, (_, index) => ({
    index,
    sourceUrl: '',
    file: `${String(index + 1).padStart(2, '0')}.jpg`,
    width: null,
    height: null,
  }));
  const extracted: ExtractedPost = {
    schemaVersion: EXTRACTED_SCHEMA_VERSION,
    source: { url: '', bandId: '', postId: '', fetchedAt: createdAt ?? new Date(0).toISOString() },
    extractedVia: 'api',
    author: null,
    createdAt,
    title: deriveTitle(body),
    body,
    images,
    schedules,
    scheduleLikeLines: [],
    warnings: [],
  };
  const classified = classifyPost(extracted, photoCount);
  if (classified.scores.catch === 0 && classified.scores.schedule === 0) return '기타';
  return classified.kind === 'catch' ? '조황' : '일정';
}

/** 목록 API의 post 객체를 알림용 한 줄로 바꾼다. 다른 밴드 글은 null */
export function listPostFromRaw(raw: Raw, bandId: string): ListPost | null {
  const postNoRaw = raw.post_no ?? raw.postNo;
  const postNo = typeof postNoRaw === 'number' ? postNoRaw : typeof postNoRaw === 'string' && /^\d+$/.test(postNoRaw) ? Number(postNoRaw) : NaN;
  if (!Number.isInteger(postNo)) return null;
  const bandNo = raw.band_no ?? raw.bandNo;
  if (bandNo !== undefined && bandNo !== null && String(bandNo) !== bandId) return null;
  const normalized = normalizeApiPost(raw);
  const explicit = raw.photo_count ?? raw.photoCount;
  const photoCount = typeof explicit === 'number' && Number.isFinite(explicit) ? explicit : normalized.images.length;
  const createdAt = toKstIso(normalized.createdAt);
  const body = normalized.body;
  const post: ListPost = {
    postNo,
    url: `https://band.us/band/${bandId}/post/${postNo}`,
    createdAt,
    author: normalized.author,
    snippet: snippetOf(body),
    photoCount,
  };
  if (body.trim() || photoCount > 0 || normalized.schedules.length > 0) {
    post.kind = kindFromParts(body, photoCount, normalized.schedules, createdAt);
  }
  return post;
}

export function listPostFromDom(dom: FeedDomPost, bandId: string): ListPost | null {
  if (!/^\d+$/.test(dom.postNo)) return null;
  const postNo = Number(dom.postNo);
  const text = dom.text.trim();
  const post: ListPost = {
    postNo,
    url: `https://band.us/band/${bandId}/post/${postNo}`,
    createdAt: null,
    author: dom.author,
    snippet: snippetOf(text),
    photoCount: dom.photoCount,
  };
  if (text || (dom.photoCount ?? 0) > 0) {
    post.kind = kindFromParts(text, dom.photoCount ?? 0, [], null);
  }
  return post;
}

/** 브라우저 안에서 실행된다. 게시글 링크(/band/{id}/post/{no})를 모아 DOM 폴백으로 쓴다 */
export function readFeedDom(bandId: string): FeedDomPost[] {
  const re = new RegExp(`/band/${bandId}/post/(\\d+)`);
  const seen = new Set<string>();
  const posts: FeedDomPost[] = [];
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"]'));
  for (const anchor of anchors) {
    const href = anchor.href || anchor.getAttribute('href') || '';
    const match = href.match(re);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    const card = anchor.closest('article, li, .postWrap, [data-post-no]') ?? anchor.parentElement ?? anchor;
    const textEl = card.querySelector<HTMLElement>('.txtBody, .dPostTextView, .postText');
    const authorEl = card.querySelector<HTMLElement>('.postWriterInfoWrap .text');
    const rawText = (textEl?.innerText || anchor.innerText || '').trim();
    let photos = 0;
    let oversized = false;
    const imgs = card.querySelectorAll('img');
    if (imgs.length > 40) oversized = true;
    else {
      for (const img of Array.from(imgs)) {
        const src = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (/pstatic\.net/.test(src)) photos += 1;
      }
    }
    posts.push({
      postNo: match[1],
      author: authorEl?.textContent?.trim() || null,
      text: rawText,
      photoCount: oversized ? null : photos,
    });
    if (posts.length >= 40) break;
  }
  return posts;
}

function remember(map: Map<number, ListPost>, post: ListPost | null): void {
  if (!post || map.has(post.postNo) || map.size >= MAX_POSTS) return;
  map.set(post.postNo, post);
}

function watchFeedApi(context: BrowserContext, bandId: string, posts: Map<number, ListPost>): void {
  context.on('response', async (res) => {
    if (posts.size >= MAX_POSTS) return;
    let url: URL;
    try {
      url = new URL(res.url());
    } catch {
      return;
    }
    if (!isBandApiHost(url.hostname)) return;
    const contentType = res.headers()['content-type'] ?? '';
    if (!/json|javascript|text\/plain/.test(contentType)) return;
    try {
      const json = parseJsonLoose(await res.text());
      if (json === undefined) return;
      for (const raw of findPostsInJson(json)) remember(posts, listPostFromRaw(raw, bandId));
    } catch {
      // 이미 닫힌 응답
    }
  });
}

function authRaw(state: LoginState, raw: string | null): string | null {
  if (raw) return raw;
  if (state === 'user') return 'USER';
  if (state === 'none') return 'NONE';
  return null;
}

/**
 * 밴드 글 목록을 연다. API 응답의 post_no를 먼저 모으고, 없으면 화면의 게시글 링크를 쓴다.
 * 오고피씽이나 Band에 글을 쓰지 않는다.
 */
export async function collectBandPosts(args: {
  context: BrowserContext;
  bandId: string;
  pageUrl: string;
  timeoutMs: number;
  log?: (msg: string) => void;
}): Promise<FeedCollectResult> {
  const { context, bandId, pageUrl, timeoutMs } = args;
  const log = args.log ?? (() => {});
  const posts = new Map<number, ListPost>();
  const login = trackLoginState(context);
  watchFeedApi(context, bandId, posts);
  const page: Page = context.pages()[0] ?? (await context.newPage());

  const deadline = Date.now() + timeoutMs;
  log(`열기: ${pageUrl}`);
  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: Math.max(1, deadline - Date.now()) });
  } catch (err) {
    const message = (err as Error).message;
    if (/Timeout/i.test(message)) return { ok: false, status: 'error', message: `밴드 목록을 ${Math.round(timeoutMs / 1000)}초 안에 열지 못했습니다.` };
    return { ok: false, status: 'error', message: `밴드 목록을 열지 못했습니다: ${message}` };
  }

  let noneSince: number | null = null;
  let idle = 0;
  while (Date.now() < deadline && posts.size < TARGET_POSTS) {
    const url = page.url();
    const signals = () => ({ url, authenticateState: authRaw(login.current(), login.lastRaw()) });
    if (posts.size === 0 && isLoginUrl(url)) {
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) ?? '').catch(() => '');
      const reason = loginRequiredReason({ ...signals(), bodyText }, 0);
      if (reason) return { ok: false, status: 'login_required', message: reason };
    }
    if (login.current() === 'none') {
      noneSince ??= Date.now();
      if (posts.size === 0 && Date.now() - noneSince > NOT_LOGGED_IN_GRACE_MS) break;
    } else {
      noneSince = null;
    }
    const before = posts.size;
    await page.evaluate(() => window.scrollTo(0, document.body?.scrollHeight ?? 0)).catch(() => {});
    await page.waitForTimeout(700);
    if (posts.size === before) idle += 1;
    else idle = 0;
    if (posts.size > 0 && idle >= 3) break;
    if (posts.size === 0 && idle >= 4) {
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) ?? '').catch(() => '');
      const reason = loginRequiredReason({ ...signals(), bodyText }, 0);
      if (reason) return { ok: false, status: 'login_required', message: reason };
    }
    if (posts.size === 0 && login.current() === 'user' && idle >= 8) break;
  }

  let via: 'api' | 'dom' = 'api';
  if (posts.size === 0) {
    const dom = await page.evaluate(readFeedDom, bandId).catch(() => [] as FeedDomPost[]);
    for (const item of dom) remember(posts, listPostFromDom(item, bandId));
    if (posts.size > 0) via = 'dom';
  }

  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) ?? '').catch(() => '');
  const reason = loginRequiredReason(
    { url: page.url(), authenticateState: authRaw(login.current(), login.lastRaw()), bodyText },
    posts.size,
  );
  if (reason) return { ok: false, status: 'login_required', message: reason };
  if (posts.size === 0) {
    return { ok: false, status: 'error', message: '게시글 목록을 읽지 못했습니다. Band 화면 구조가 바뀌었거나 시간이 초과되었습니다.' };
  }
  log(`게시글 ${posts.size}개 (${via === 'api' ? 'API' : '화면 링크'})`);
  return { ok: true, posts: [...posts.values()] };
}
