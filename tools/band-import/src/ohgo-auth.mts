import { closeSync, openSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ensurePrivateDir, readJsonFile, removeFile, writeJsonPrivate } from './local-store.mts';
import type { Fetch, OhgoConfig } from './ohgo-config.mts';
import { decodeJwtPayload } from './ohgo-config.mts';

export const OHGO_SESSION_FILE = 'session.json';

/** 이름, 생년월일, 비밀번호는 저장하지 않는다. Supabase 토큰만 둔다 */
export type OhgoSession = {
  version: 1;
  supabaseUrl: string;
  baseUrl: string;
  userId: string;
  name: string;
  accessToken: string;
  refreshToken: string;
  /** epoch 초 */
  expiresAt: number;
  savedAt: string;
};

export type OhgoCredentials = { name: string; dob: string } | { email: string; password: string };

export class OhgoAuthError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status = 401, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const LOGIN_REQUIRED = 'LOGIN_REQUIRED';
/** 갱신 중에 앱이 죽으면 남는 잠금. 이 시간이 지나면 죽은 잠금으로 보고 치운다 */
const LOCK_STALE_MS = 60_000;

/** 같은 프로세스에서 갱신이 겹치지 않게 한 줄로 세운다 */
let refreshQueue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = refreshQueue.then(fn, fn);
  refreshQueue = run.then(
    () => {},
    () => {},
  );
  return run;
}

export function readOhgoSession(dir: string): OhgoSession | null {
  try {
    const s = readJsonFile<OhgoSession>(join(dir, OHGO_SESSION_FILE));
    return s && s.version === 1 && s.refreshToken ? s : null;
  } catch {
    return null;
  }
}

export function saveOhgoSession(dir: string, session: OhgoSession): void {
  writeJsonPrivate(dir, OHGO_SESSION_FILE, session);
}

export function clearOhgoSession(dir: string): void {
  removeFile(dir, OHGO_SESSION_FILE);
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    const v = JSON.parse(text);
    return typeof v === 'object' && v !== null ? v : {};
  } catch {
    return { message: text.slice(0, 200) };
  }
}

function errorText(body: Record<string, unknown>, fallback: string): string {
  for (const key of ['error', 'msg', 'message', 'error_description']) {
    if (typeof body[key] === 'string' && body[key]) return body[key] as string;
  }
  return fallback;
}

type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

function tokensFrom(body: Record<string, unknown>): Tokens {
  const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
  const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : '';
  if (!accessToken || !refreshToken) throw new OhgoAuthError('로그인 응답에 토큰이 없습니다.', 502);
  const exp = decodeJwtPayload(accessToken)?.exp;
  const expiresAt =
    typeof body.expires_at === 'number' ? body.expires_at : typeof exp === 'number' ? exp : Math.floor(Date.now() / 1000) + 3000;
  return { accessToken, refreshToken, expiresAt };
}

async function fetchProfile(cfg: OhgoConfig, accessToken: string, userId: string, fetchImpl: Fetch) {
  const res = await fetchImpl(`${cfg.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,name,role`, {
    headers: { apikey: cfg.anonKey, authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  const rows = res.ok ? ((await res.json()) as { id: string; name: string | null; role: string | null }[]) : [];
  return rows[0] ?? null;
}

/**
 * 오고피씽 관리자 로그인. 앱과 같은 이름+생년월일 로그인(/api/auth/legacy-login, 가입은 하지 않음)
 * 또는 Supabase 이메일 계정을 쓴다. profiles.role이 admin이 아니면 세션을 저장하지 않는다
 */
export async function loginOhgo(cfg: OhgoConfig, creds: OhgoCredentials, fetchImpl: Fetch = fetch): Promise<OhgoSession> {
  let tokens: Tokens;
  if ('email' in creds) {
    if (!creds.email.trim() || !creds.password) throw new OhgoAuthError('이메일과 비밀번호를 입력하세요.', 400);
    const res = await fetchImpl(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: cfg.anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email: creds.email.trim(), password: creds.password }),
    });
    const body = await readJson(res);
    if (!res.ok) throw new OhgoAuthError(`로그인 실패: ${errorText(body, `HTTP ${res.status}`)}`);
    tokens = tokensFrom(body);
  } else {
    if (!creds.name.trim() || !creds.dob.trim()) throw new OhgoAuthError('이름과 생년월일을 입력하세요.', 400);
    const res = await fetchImpl(`${cfg.baseUrl}/api/auth/legacy-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: creds.name.trim(), dob: creds.dob.trim(), register: false }),
    });
    const body = await readJson(res);
    if (body.code === 'NOT_REGISTERED') throw new OhgoAuthError('오고피씽에 등록된 회원 정보가 없습니다. 이름과 생년월일을 확인하세요.');
    if (!res.ok) throw new OhgoAuthError(`로그인 실패: ${errorText(body, `HTTP ${res.status}`)}`);
    tokens = tokensFrom(body);
  }

  const userId = decodeJwtPayload(tokens.accessToken)?.sub;
  if (typeof userId !== 'string') throw new OhgoAuthError('로그인 토큰에서 사용자 정보를 읽지 못했습니다.', 502);
  const profile = await fetchProfile(cfg, tokens.accessToken, userId, fetchImpl);
  if (profile?.role !== 'admin') {
    throw new OhgoAuthError('관리자 계정이 아닙니다. 오고피씽 관리자 계정으로 로그인하세요.', 403);
  }
  return {
    version: 1,
    supabaseUrl: cfg.supabaseUrl,
    baseUrl: cfg.baseUrl,
    userId,
    name: profile.name || ('name' in creds ? creds.name.trim() : '관리자'),
    ...tokens,
    savedAt: new Date().toISOString(),
  };
}

/**
 * Supabase는 갱신할 때마다 쓰던 refresh 토큰을 지우고 새 것을 준다.
 * 새 토큰을 저장하기 전에 같은 토큰으로 한 번 더 갱신하면(앱을 두 개 띄움, 저장 전에 종료)
 * 서버가 그 토큰 묶음 전체를 폐기해서 "Refresh Token Not Found"가 된다.
 * 그래서 갱신은 잠금 안에서 한 번만 하고, 받은 토큰은 잠금을 풀기 전에 원자적으로 저장한다.
 */
function refreshTokenDead(detail: string): boolean {
  return /refresh token|invalid_grant|already used|not found|revoked/i.test(detail);
}

export async function refreshOhgoSession(cfg: OhgoConfig, session: OhgoSession, fetchImpl: Fetch = fetch): Promise<OhgoSession> {
  const res = await fetchImpl(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    const detail = errorText(body, `HTTP ${res.status}`);
    if (refreshTokenDead(detail)) {
      throw new OhgoAuthError(
        `오고피씽 로그인이 만료되었습니다. 아래 다시 로그인을 누르세요. 로그인하면 방금 등록을 그대로 다시 시도합니다. (${detail})`,
        401,
        LOGIN_REQUIRED,
      );
    }
    throw new OhgoAuthError(`오고피씽 로그인을 갱신하지 못했습니다. (${detail})`);
  }
  return { ...session, ...tokensFrom(body), savedAt: new Date().toISOString() };
}

function stillValid(session: OhgoSession | null, cfg: OhgoConfig, nowSec: number): session is OhgoSession {
  return !!session && session.supabaseUrl === cfg.supabaseUrl && session.expiresAt - 120 > nowSec;
}

const LOCK_FILE = 'session.lock';

function acquireLock(dir: string): boolean {
  try {
    closeSync(openSync(join(dir, LOCK_FILE), 'wx'));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
}

function releaseLock(dir: string): void {
  try {
    unlinkSync(join(dir, LOCK_FILE));
  } catch {
    // 이미 풀려 있으면 그대로 둔다
  }
}

/** 저장된 세션을 읽고, 곧 만료되면 갱신해서 다시 저장한다. 사진 올리기 전에 부른다 */
export async function ensureFreshSession(
  cfg: OhgoConfig,
  dir: string,
  fetchImpl: Fetch = fetch,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<OhgoSession> {
  return oneAtATime(() => ensureFreshLocked(cfg, dir, fetchImpl, nowSec));
}

async function ensureFreshLocked(cfg: OhgoConfig, dir: string, fetchImpl: Fetch, nowSec: number): Promise<OhgoSession> {
  ensurePrivateDir(dir);
  const deadline = Date.now() + LOCK_STALE_MS;
  for (;;) {
    const current = readOhgoSession(dir);
    if (stillValid(current, cfg, nowSec)) return current;
    if (acquireLock(dir)) break;
    let age = 0;
    try {
      age = Date.now() - statSync(join(dir, LOCK_FILE)).mtimeMs;
    } catch {
      age = LOCK_STALE_MS;
    }
    if (age >= LOCK_STALE_MS) releaseLock(dir);
    if (Date.now() > deadline) {
      throw new OhgoAuthError('로그인 갱신이 다른 작업과 겹쳐 끝내지 못했습니다. 잠시 뒤 다시 시도하세요.');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  try {
    const session = readOhgoSession(dir);
    if (!session) throw new OhgoAuthError('오고피씽 관리자 로그인이 필요합니다.', 401, LOGIN_REQUIRED);
    if (session.supabaseUrl !== cfg.supabaseUrl) {
      throw new OhgoAuthError('저장된 로그인이 다른 Supabase 프로젝트용입니다. 다시 로그인하세요.', 401, LOGIN_REQUIRED);
    }
    if (stillValid(session, cfg, nowSec)) return session;
    return await rotate(cfg, dir, session, fetchImpl, nowSec);
  } finally {
    releaseLock(dir);
  }
}

/** 갱신 결과를 잠금 안에서 바로 저장한다. 다른 쪽이 먼저 저장했으면 그 토큰을 쓴다 */
async function rotate(cfg: OhgoConfig, dir: string, session: OhgoSession, fetchImpl: Fetch, nowSec: number): Promise<OhgoSession> {
  try {
    const fresh = await refreshOhgoSession(cfg, session, fetchImpl);
    saveOhgoSession(dir, fresh);
    return fresh;
  } catch (err) {
    if (!(err instanceof OhgoAuthError) || err.code !== LOGIN_REQUIRED) throw err;
    const newer = readOhgoSession(dir);
    if (newer && newer.refreshToken !== session.refreshToken) {
      if (stillValid(newer, cfg, nowSec)) return newer;
      const fresh = await refreshOhgoSession(cfg, newer, fetchImpl);
      saveOhgoSession(dir, fresh);
      return fresh;
    }
    throw err;
  }
}
