import { TimeoutError, withTimeout } from '@/lib/with-timeout';

/** 액세스 토큰이 이 초 안에 끝나면 재개 시 갱신한다. */
export const REFRESH_SKEW_SEC = 60;

export const RESUME_TIMEOUT_MS = 1000;

export type ResumeResult = 'fresh' | 'refreshed' | 'signed-out' | 'timeout' | 'offline';

export type ResumeAuth = {
  startAutoRefresh?: () => void;
  stopAutoRefresh?: () => void;
  getSession: () => Promise<{
    data: { session: { expires_at?: number | null } | null };
    error: { message?: string } | null;
  }>;
  refreshSession: () => Promise<{ error: { message?: string } | null }>;
};

export function visibilityIntent(state: 'visible' | 'hidden'): 'pause' | 'resume' {
  return state === 'hidden' ? 'pause' : 'resume';
}

export function shouldRefreshAccessToken(expiresAt: number | null | undefined, nowSec: number): boolean {
  if (expiresAt == null) return true;
  return expiresAt <= nowSec + REFRESH_SKEW_SEC;
}

export function isDefinitiveSignOut(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('refresh token') ||
    text.includes('invalid refresh') ||
    text.includes('session_not_found') ||
    text.includes('user not found') ||
    text.includes('invalid claim')
  );
}

function asMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return '';
}

/**
 * 화면이 다시 보일 때 세션을 갱신한다.
 * 네트워크가 멈추면 로그아웃으로 보지 않고 timeout 또는 offline 을 돌려준다.
 */
export async function resumeAuthSession(
  auth: ResumeAuth,
  nowSec: number,
  timeoutMs: number = RESUME_TIMEOUT_MS,
): Promise<ResumeResult> {
  auth.startAutoRefresh?.();
  let session: { expires_at?: number | null } | null = null;
  try {
    const got = await withTimeout(auth.getSession(), timeoutMs);
    if (got.error && isDefinitiveSignOut(got.error.message || '')) return 'signed-out';
    session = got.data.session;
  } catch (error) {
    if (error instanceof TimeoutError) return 'timeout';
    if (isDefinitiveSignOut(asMessage(error))) return 'signed-out';
    return 'offline';
  }

  if (!session) return 'signed-out';
  if (!shouldRefreshAccessToken(session.expires_at, nowSec)) return 'fresh';

  try {
    const refreshed = await withTimeout(auth.refreshSession(), timeoutMs);
    if (refreshed.error) {
      if (isDefinitiveSignOut(refreshed.error.message || '')) return 'signed-out';
      return 'offline';
    }
    return 'refreshed';
  } catch (error) {
    if (error instanceof TimeoutError) return 'timeout';
    if (isDefinitiveSignOut(asMessage(error))) return 'signed-out';
    return 'offline';
  }
}
