import { join } from 'node:path';
import { readJsonFile, removeFile, writeJsonPrivate } from './local-store.mts';
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
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
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

export async function refreshOhgoSession(cfg: OhgoConfig, session: OhgoSession, fetchImpl: Fetch = fetch): Promise<OhgoSession> {
  const res = await fetchImpl(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new OhgoAuthError(`오고피씽 로그인이 만료되었습니다. 다시 로그인하세요. (${errorText(body, `HTTP ${res.status}`)})`);
  }
  return { ...session, ...tokensFrom(body), savedAt: new Date().toISOString() };
}

/** 저장된 세션을 읽고, 곧 만료되면 갱신해서 다시 저장한다 */
export async function ensureFreshSession(
  cfg: OhgoConfig,
  dir: string,
  fetchImpl: Fetch = fetch,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<OhgoSession> {
  const session = readOhgoSession(dir);
  if (!session) throw new OhgoAuthError('오고피씽 관리자 로그인이 필요합니다.');
  if (session.supabaseUrl !== cfg.supabaseUrl) {
    throw new OhgoAuthError('저장된 로그인이 다른 Supabase 프로젝트용입니다. 다시 로그인하세요.');
  }
  if (session.expiresAt - 120 > nowSec) return session;
  const fresh = await refreshOhgoSession(cfg, session, fetchImpl);
  saveOhgoSession(dir, fresh);
  return fresh;
}
