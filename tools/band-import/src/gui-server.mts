import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasProfile } from './browser.mts';
import type { FetchOptions, Log } from './commands.mts';
import type { PhotoDraft } from './classify.mts';
import { ImageEditError, parseImageEdit } from './image-edit.mts';
import { parsePhotoTag, PhotoTagError } from './photo-tags.mts';
import type { OhgoService, PushRequest, PushResult } from './ohgo-service.mts';
import { OhgoRequestRejected } from './ohgo-service.mts';
import { OhgoAuthError } from './ohgo-auth.mts';
import type { TripDraft } from './trip-parse.mts';
import { MAX_TRIP_ROWS, parseDateInput } from './trip-parse.mts';
import type { ExtractedPost } from './schema.mts';
import { readSession } from './session-store.mts';
import { parseBandPostUrl } from './url.mts';

export type GuiDeps = {
  runLogin: (opts: { log: Log }) => Promise<void>;
  runFetch: (opts: FetchOptions) => Promise<{ extracted: ExtractedPost; outDir: string }>;
  openPath: (path: string) => void;
  outRoot: string;
  userDataDir: string;
  htmlPath: string;
  /** 오고피씽 등록. 없으면 등록 API는 503을 돌려준다 */
  ohgo?: OhgoService;
  onQuit?: () => void;
};

type JobResult = {
  postId: string;
  outDir: string;
  title: string;
  extractedVia: ExtractedPost['extractedVia'];
  imageFiles: string[];
  imageCount: number;
  scheduleCount: number;
  scheduleLikeLines: string[];
  warnings: string[];
};

type Job = {
  id: number;
  kind: 'login' | 'fetch' | 'push';
  status: 'running' | 'done' | 'error';
  logs: string[];
  error: string | null;
  errorCode: string | null;
  result: JobResult | PushResult | null;
};

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 512 * 1024) throw new Error('요청이 너무 큽니다');
  }
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return typeof parsed === 'object' && parsed !== null ? parsed : {};
}

export function createGuiServer(deps: GuiDeps): { server: Server; token: string; isBusy: () => boolean } {
  const token = randomBytes(16).toString('hex');
  let seq = 0;
  let job: Job | null = null;
  const isBusy = () => job?.status === 'running';

  const startJob = (kind: Job['kind'], work: (log: Log) => Promise<Job['result']>) => {
    const current: Job = { id: ++seq, kind, status: 'running', logs: [], error: null, errorCode: null, result: null };
    job = current;
    const log: Log = (msg) => {
      current.logs.push(...msg.split('\n'));
      if (current.logs.length > 500) current.logs.splice(0, current.logs.length - 500);
    };
    work(log).then(
      (result) => {
        current.result = result;
        current.status = 'done';
      },
      (err: Error & { code?: unknown }) => {
        current.error = err.message;
        current.errorCode = typeof err.code === 'string' ? err.code : null;
        current.status = 'error';
      },
    );
    return current;
  };

  const state = () => {
    const session = readSession(deps.userDataDir);
    return {
      busy: isBusy(),
      hasProfile: hasProfile(deps.userDataDir),
      savedSessionAt: session?.savedAt ?? null,
      job,
    };
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/') {
        if (url.searchParams.get('t') !== token) return sendJson(res, 403, { error: '잘못된 접근입니다' });
        const html = readFileSync(deps.htmlPath, 'utf8').replace('__GUI_TOKEN__', token);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(html);
      }

      if (req.method === 'GET' && url.pathname === '/favicon.png') {
        const icon = join(dirname(deps.htmlPath), 'favicon.png');
        if (!existsSync(icon)) return sendJson(res, 404, { error: '아이콘이 없습니다' });
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=3600' });
        return createReadStream(icon).pipe(res);
      }

      // 다른 웹페이지가 이 로컬 서버를 호출하지 못하도록 모든 API/파일 요청에 토큰을 요구한다
      if ((req.headers['x-gui-token'] ?? url.searchParams.get('t')) !== token) {
        return sendJson(res, 403, { error: '잘못된 접근입니다' });
      }

      if (req.method === 'GET' && url.pathname === '/api/state') return sendJson(res, 200, state());

      if (req.method === 'POST' && (url.pathname === '/api/login' || url.pathname === '/api/fetch')) {
        if (isBusy()) return sendJson(res, 409, { error: '다른 작업이 진행 중입니다' });
        if (url.pathname === '/api/login') {
          startJob('login', async (log) => {
            await deps.runLogin({ log });
            return null;
          });
          return sendJson(res, 202, state());
        }
        const body = await readBody(req);
        const input = typeof body.url === 'string' ? body.url : '';
        try {
          parseBandPostUrl(input);
        } catch (err) {
          return sendJson(res, 400, { error: (err as Error).message });
        }
        const headless = body.headless === true;
        startJob('fetch', async (log) => {
          const { extracted, outDir } = await deps.runFetch({ url: input, headless, outRoot: deps.outRoot, log });
          return {
            postId: extracted.source.postId,
            outDir,
            title: extracted.title,
            extractedVia: extracted.extractedVia,
            imageFiles: extracted.images.map((i) => i.file).filter((f): f is string => f !== null),
            imageCount: extracted.images.length,
            scheduleCount: extracted.schedules.length,
            scheduleLikeLines: extracted.scheduleLikeLines,
            warnings: extracted.warnings,
          };
        });
        return sendJson(res, 202, state());
      }

      if (url.pathname.startsWith('/api/ohgo/')) return await handleOhgo(req, res, url.pathname);

      if (req.method === 'POST' && url.pathname === '/api/quit') {
        sendJson(res, 200, { ok: true, busy: isBusy() });
        deps.onQuit?.();
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/open') {
        const body = await readBody(req);
        const postId = typeof body.postId === 'string' && /^\d+$/.test(body.postId) ? body.postId : null;
        const target = postId ? join(deps.outRoot, postId) : deps.outRoot;
        if (!existsSync(target)) return sendJson(res, 404, { error: '폴더가 없습니다' });
        deps.openPath(target);
        return sendJson(res, 200, { ok: true });
      }

      const file = /^\/out\/(\d+)\/([\w-]+\.[a-z]+)$/i.exec(url.pathname);
      const mime = file ? MIME[extname(file[2]).toLowerCase()] : undefined;
      if (req.method === 'GET' && file && mime) {
        const path = join(deps.outRoot, file[1], file[2]);
        if (!existsSync(path) || !statSync(path).isFile()) return sendJson(res, 404, { error: '파일이 없습니다' });
        res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store' });
        return createReadStream(path).pipe(res);
      }

      return sendJson(res, 404, { error: '없는 경로입니다' });
    } catch (err) {
      return sendJson(res, 500, { error: (err as Error).message });
    }
  });
  const handleOhgo = async (req: IncomingMessage, res: ServerResponse, path: string) => {
    const ohgo = deps.ohgo;
    if (!ohgo) return sendJson(res, 503, { error: '오고피씽 등록을 쓸 수 없습니다' });
    try {
      if (req.method === 'GET' && path === '/api/ohgo/state') return sendJson(res, 200, await ohgo.state());
      if (req.method !== 'POST') return sendJson(res, 404, { error: '없는 경로입니다' });
      const body = await readBody(req);
      if (path === '/api/ohgo/login') {
        const creds =
          typeof body.email === 'string'
            ? { email: body.email, password: str(body.password) }
            : { name: str(body.name), dob: str(body.dob) };
        return sendJson(res, 200, await ohgo.login(creds));
      }
      if (path === '/api/ohgo/logout') return sendJson(res, 200, await ohgo.logout());
      if (path === '/api/ohgo/prepare') return sendJson(res, 200, await ohgo.prepare(str(body.postId)));
      if (path === '/api/ohgo/push') {
        if (isBusy()) return sendJson(res, 409, { error: '다른 작업이 진행 중입니다' });
        const request = toPushRequest(body);
        ohgo.checkPush(request);
        startJob('push', (log) => ohgo.push(request, log));
        return sendJson(res, 202, state());
      }
      if (path === '/api/ohgo/boarders') return sendJson(res, 200, await ohgo.listBoarders(str(body.date)));
      if (path === '/api/ohgo/tags') {
        if (isBusy()) return sendJson(res, 409, { error: '다른 작업이 진행 중입니다' });
        const tag = parsePhotoTag({ trip: body.trip, userIds: body.userIds });
        return sendJson(res, 200, { tags: await ohgo.savePhotoTags(str(body.postId), str(body.file), tag) });
      }
      if (path === '/api/ohgo/edit' || path === '/api/ohgo/revert') {
        if (isBusy()) return sendJson(res, 409, { error: '다른 작업이 진행 중입니다' });
        const postId = str(body.postId);
        const file = str(body.file);
        if (path === '/api/ohgo/revert') return sendJson(res, 200, { edits: await ohgo.revertImage(postId, file) });
        let edit;
        try {
          edit = parseImageEdit(body.edit);
        } catch (err) {
          if (err instanceof ImageEditError) return sendJson(res, 400, { error: err.message });
          throw err;
        }
        return sendJson(res, 200, { edits: await ohgo.editImage(postId, file, edit) });
      }
      if (path === '/api/ohgo/open-link') {
        const link = str(body.url);
        if (!ohgo.isAppLink(link)) return sendJson(res, 400, { error: '오고피씽 주소만 열 수 있습니다' });
        deps.openPath(link);
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 404, { error: '없는 경로입니다' });
    } catch (err) {
      if (err instanceof PhotoTagError) return sendJson(res, 400, { error: err.message });
      if (err instanceof OhgoRequestRejected) return sendJson(res, err.status, { error: err.message, code: err.code });
      if (err instanceof OhgoAuthError) return sendJson(res, err.status, { error: err.message, code: err.code });
      return sendJson(res, 500, { error: (err as Error).message });
    }
  };

  return { server, token, isBusy };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/** 화면에서 온 값을 정해진 모양으로만 받는다 */
export function toPushRequest(body: Record<string, unknown>): PushRequest {
  const kind = body.kind === 'schedule' ? 'schedule' : body.kind === 'catch' ? 'catch' : null;
  if (!kind) throw new OhgoRequestRejected('등록 종류를 고르세요');
  const req: PushRequest = { postId: str(body.postId), kind, force: body.force === true };
  const photo = (body.photo ?? {}) as Record<string, unknown>;
  const trip = (body.trip ?? {}) as Record<string, unknown>;
  if (kind === 'catch') {
    const draft: PhotoDraft = {
      title: str(photo.title),
      description: str(photo.description),
      photoDate: str(photo.photoDate) || null,
      images: Array.isArray(photo.images) ? photo.images.map(str) : [],
      useFormatting: photo.useFormatting === true,
    };
    if (typeof photo.content === 'string') draft.content = photo.content.slice(0, 200_000);
    req.photo = draft;
  } else {
    const ref = str(trip.refDate) || new Date().toISOString().slice(0, 10);
    const rows = Array.isArray(trip.rows) ? (trip.rows as unknown[]).slice(0, MAX_TRIP_ROWS + 1) : [];
    const draft: TripDraft = {
      destination: str(trip.destination),
      capacity: intOrNull(trip.capacity),
      contact: str(trip.contact),
      rows: rows.map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        return {
          date: parseDateInput(str(r.date), ref),
          species: str(r.species),
          departureTime: str(r.departureTime),
          returnTime: str(r.returnTime),
          price: intOrNull(r.price),
          notes: str(r.notes),
        };
      }),
    };
    req.trip = draft;
  }
  return req;
}

function openWithSystem(target: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  spawn(cmd, [target], { detached: true, stdio: 'ignore' }).unref();
}

/** Playwright가 설치한 Chromium을 주소창 없는 앱 창으로 띄운다. 창이 닫히면 onClose 호출 */
async function openAppWindow(url: string, onClose: () => void): Promise<ChildProcess> {
  const { chromium } = await import('playwright');
  const profile = mkdtempSync(join(tmpdir(), 'band-import-gui-'));
  const child = spawn(
    chromium.executablePath(),
    [
      `--app=${url}`,
      `--user-data-dir=${profile}`,
      '--window-size=720,880',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate',
    ],
    { stdio: 'ignore' },
  );
  child.on('exit', onClose);
  child.on('error', (err) => {
    console.error(`앱 창을 열지 못했습니다: ${err.message}\n브라우저에서 직접 여세요: ${url}`);
  });
  return child;
}

async function main(): Promise<void> {
  const { DEFAULT_OUT_DIR, OHGO_DIR, TOOL_ROOT, USER_DATA_DIR, runFetch, runLogin } = await import('./commands.mts');
  const { createOhgoService } = await import('./ohgo-service.mts');
  let windowProcess: ChildProcess | null = null;
  let closing = false;
  // 진행 중인 login/fetch가 끝난 뒤 종료한다
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const wait = () => {
      if (isBusy()) return setTimeout(wait, 1000);
      windowProcess?.kill();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 2000).unref();
    };
    wait();
  };
  const { server, token, isBusy } = createGuiServer({
    runLogin,
    runFetch,
    openPath: openWithSystem,
    outRoot: DEFAULT_OUT_DIR,
    userDataDir: USER_DATA_DIR,
    htmlPath: join(TOOL_ROOT, 'gui', 'index.html'),
    ohgo: createOhgoService({ dir: OHGO_DIR, outRoot: DEFAULT_OUT_DIR, uploadGapMs: 300 }),
    onQuit: shutdown,
  });
  const port = Number(process.env.BAND_GUI_PORT) || 0;
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/?t=${token}`;
  console.log(`Band 가져오기 화면: ${url}`);

  // BAND_GUI_OPEN=browser 이면 기본 브라우저, none 이면 주소만 출력
  const mode = process.env.BAND_GUI_OPEN ?? 'app';
  if (mode === 'browser') openWithSystem(url);
  else if (mode !== 'none') windowProcess = await openAppWindow(url, shutdown);
  process.on('SIGINT', () => process.exit(0));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err: Error) => {
    console.error(`오류: ${err.message}`);
    process.exitCode = 1;
  });
}
