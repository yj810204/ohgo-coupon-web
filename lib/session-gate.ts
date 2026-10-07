/** 액세스 토큰이 이 시간보다 길게 남아 있으면 미들웨어에서 Auth 서버를 부르지 않는다. */
export const TOKEN_FRESH_FOR_SEC = 120;

/** getUser 가 이 시간 안에 끝나지 않으면 이동을 그대로 진행한다. */
export const SESSION_NETWORK_MS = 4000;

export function needsNetworkUserCheck(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin-') ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/boarding-ledger') ||
    pathname.startsWith('/boarding-records')
  );
}

/**
 * skip: 토큰이 충분히 남았고 보호 경로가 아님
 * verify: 만료됐거나 곧 만료거나 보호 경로. 리다이렉트는 하지 않는다.
 */
export function sessionGate(input: {
  pathname: string;
  expiry: number | null;
  nowSec: number;
}): 'skip' | 'verify' {
  const fresh = input.expiry != null && input.expiry > input.nowSec + TOKEN_FRESH_FOR_SEC;
  if (fresh && !needsNetworkUserCheck(input.pathname)) return 'skip';
  return 'verify';
}
