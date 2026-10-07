import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Fetch } from './ohgo-config.mts';

export const PUSH_LOG_FILE = 'push-log.json';
/** push-log.json에 남기는 최근 등록 시도 수 */
const KEEP_RUNS = 5;
const REPLY_CHARS = 400;

export type RequestRecord = {
  at: string;
  method: string;
  url: string;
  status: number | null;
  ms: number;
  sentBytes: number | null;
  reply: string;
};

export type ImageRecord = {
  n: number;
  original: string;
  file: string;
  fileBytes: number | null;
  uploadBytes: number | null;
  contentType: string | null;
  resized: boolean;
  objectPath: string | null;
  ok: boolean;
  error: string | null;
};

export type PushRun = {
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  postId: string;
  kind: string;
  user: string | null;
  supabase: string | null;
  images: ImageRecord[];
  rowIds: string[];
  error: string | null;
  messages: string[];
  requests: RequestRecord[];
};

export type PushRecorder = {
  run: PushRun;
  path: string;
  note(msg: string): void;
  save(): void;
  finish(result: { ok: true; rowIds: string[] } | { ok: false; error: string }): void;
  /** 요청과 응답 상태를 기록하는 fetch. 헤더(토큰)는 적지 않고, 로그인 응답 본문도 적지 않는다 */
  fetch(inner: Fetch): Fetch;
};

function sizeOf(body: unknown): number | null {
  if (typeof body === 'string') return Buffer.byteLength(body);
  if (body instanceof Uint8Array) return body.length;
  if (body instanceof ArrayBuffer) return body.byteLength;
  return null;
}

function isAuthUrl(url: URL): boolean {
  return url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/auth/');
}

export function readPushRuns(outDir: string): PushRun[] {
  const path = join(outDir, PUSH_LOG_FILE);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(parsed?.runs) ? (parsed.runs as PushRun[]) : [];
  } catch {
    return [];
  }
}

export function createPushRecorder(outDir: string, meta: { postId: string; kind: string }): PushRecorder {
  const path = join(outDir, PUSH_LOG_FILE);
  const earlier = readPushRuns(outDir).slice(-(KEEP_RUNS - 1));
  const run: PushRun = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    ok: null,
    postId: meta.postId,
    kind: meta.kind,
    user: null,
    supabase: null,
    images: [],
    rowIds: [],
    error: null,
    messages: [],
    requests: [],
  };
  const save = () => {
    if (!existsSync(outDir)) return;
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ version: 1, runs: [...earlier, run] }, null, 2)}\n`);
    renameSync(tmp, path);
  };
  return {
    run,
    path,
    note(msg) {
      run.messages.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
    },
    save,
    finish(result) {
      run.finishedAt = new Date().toISOString();
      run.ok = result.ok;
      if (result.ok) run.rowIds = result.rowIds;
      else run.error = result.error;
      save();
    },
    fetch(inner) {
      return (async (input: string | URL | Request, init: RequestInit = {}) => {
        const url = new URL(String(input instanceof Request ? input.url : input));
        const rec: RequestRecord = {
          at: new Date().toISOString(),
          method: init.method ?? 'GET',
          url: `${url.origin}${url.pathname}${url.search}`,
          status: null,
          ms: 0,
          sentBytes: sizeOf(init.body),
          reply: '',
        };
        run.requests.push(rec);
        const started = Date.now();
        try {
          const res = await inner(input, init);
          rec.status = res.status;
          rec.ms = Date.now() - started;
          if (isAuthUrl(url)) rec.reply = '(로그인 응답은 적지 않습니다)';
          else if (rec.method !== 'HEAD') rec.reply = (await res.clone().text().catch(() => '')).slice(0, REPLY_CHARS);
          else rec.reply = `${res.headers.get('content-type') ?? ''} ${res.headers.get('content-length') ?? ''}`.trim();
          return res;
        } catch (err) {
          rec.ms = Date.now() - started;
          rec.reply = `연결 실패: ${(err as Error).message}`;
          throw err;
        } finally {
          save();
        }
      }) as Fetch;
    },
  };
}
