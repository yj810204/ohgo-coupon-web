/** 액세스 토큰이 이 시간보다 길게 남아 있으면 미들웨어에서 Auth 서버를 부르지 않는다. */
export const TOKEN_FRESH_FOR_SEC = 120;

/** getUser 가 이 시간 안에 끝나지 않으면 더 기다리지 않는다. */
export const SESSION_NETWORK_MS = 1500;

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

/** 쿠키 JWT 의 exp 가 아직 남았으면 네트워크 없이 통과시킨다. */
export function protectedJwtAllows(expiry: number | null, nowSec: number): boolean {
  return expiry != null && expiry > nowSec;
}

/**
 * skip: 일반 경로이고 토큰이 2분 넘게 남음. 네트워크 없음
 * allow-jwt: 관리자·명부인데 토큰이 아직 유효. 화면을 바로 연다
 * network: 갱신이 필요. 시간 안에 안 끝나면 보호 경로는 JWT 로 판단한다
 */
export function middlewareAuthPlan(input: {
  pathname: string;
  expiry: number | null;
  nowSec: number;
}): 'skip' | 'allow-jwt' | 'network' {
  if (needsNetworkUserCheck(input.pathname)) {
    return protectedJwtAllows(input.expiry, input.nowSec) ? 'allow-jwt' : 'network';
  }
  if (sessionGate(input) === 'skip') return 'skip';
  return 'network';
}
