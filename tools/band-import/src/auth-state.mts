export type LoginState = 'user' | 'none' | 'unknown';

/**
 * Band 웹은 페이지 부팅 시 auth.band.us/s/login/getKey (JSONP)를 불러오며,
 * 응답 스크립트에 signedUser / authenticateState 값이 들어 있다.
 */
export function isAuthKeyUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'auth.band.us' && u.pathname.startsWith('/s/login/getKey');
  } catch {
    return false;
  }
}

export function parseAuthKeyScript(script: string): LoginState {
  const signed = /signedUser\s*:\s*(true|false)/.exec(script);
  if (signed) return signed[1] === 'true' ? 'user' : 'none';
  const state = /authenticateState\s*:\s*["']([A-Z_]+)["']/.exec(script);
  if (state) return state[1] === 'USER' ? 'user' : 'none';
  return 'unknown';
}

export function isBandApiHost(hostname: string): boolean {
  return /^api(-[a-z0-9]+)?\.band\.us$/.test(hostname);
}
