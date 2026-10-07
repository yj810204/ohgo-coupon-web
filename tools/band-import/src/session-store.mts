import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Cookie } from 'playwright';

/**
 * Band 로그인 쿠키 중 일부는 만료일 없는 세션 쿠키라서 Chromium을 다시 열면 프로필에서 사라진다.
 * 그래서 login 직후의 Band 쿠키 전체를 user-data 안에 따로 저장해 두고, 다음 실행 때 빠진 것만 되살린다.
 */
export const SESSION_FILE_NAME = 'band-session.json';

export type SessionSnapshot = {
  savedAt: string;
  cookies: Cookie[];
};

export function sessionFilePath(userDataDir: string): string {
  return join(userDataDir, SESSION_FILE_NAME);
}

export function isBandCookie(cookie: Pick<Cookie, 'domain'>): boolean {
  const domain = cookie.domain.replace(/^\./, '');
  return domain === 'band.us' || domain.endsWith('.band.us');
}

const cookieKey = (c: Pick<Cookie, 'name' | 'domain' | 'path'>) => `${c.name}\u0000${c.domain}\u0000${c.path}`;

/** 저장본에서 아직 만료되지 않았고 현재 쿠키 저장소에 없는 Band 쿠키만 고른다 */
export function cookiesToRestore(saved: Cookie[], current: Cookie[], nowSec: number): Cookie[] {
  const present = new Set(current.map(cookieKey));
  return saved.filter(
    (c) => isBandCookie(c) && !present.has(cookieKey(c)) && (c.expires === -1 || c.expires > nowSec),
  );
}

export function readSession(userDataDir: string): SessionSnapshot | null {
  const file = sessionFilePath(userDataDir);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as SessionSnapshot;
    return Array.isArray(parsed.cookies) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveSession(context: BrowserContext, userDataDir: string): Promise<SessionSnapshot> {
  const snapshot: SessionSnapshot = {
    savedAt: new Date().toISOString(),
    cookies: (await context.cookies()).filter(isBandCookie),
  };
  const file = sessionFilePath(userDataDir);
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return snapshot;
}

export async function restoreSession(
  context: BrowserContext,
  userDataDir: string,
): Promise<{ restored: number; saved: number }> {
  const snapshot = readSession(userDataDir);
  if (!snapshot) return { restored: 0, saved: 0 };
  const missing = cookiesToRestore(snapshot.cookies, await context.cookies(), Date.now() / 1000);
  if (missing.length) await context.addCookies(missing);
  return { restored: missing.length, saved: snapshot.cookies.length };
}

export function countSessionOnly(cookies: Cookie[]): number {
  return cookies.filter((c) => c.expires === -1).length;
}
