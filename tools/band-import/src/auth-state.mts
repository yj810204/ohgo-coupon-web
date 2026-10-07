export type LoginState = 'user' | 'none' | 'unknown';

export type AuthKeyInfo = { state: LoginState; raw: string | null };

/**
 * Band 웹은 페이지 부팅 시 auth.band.us/s/login/getKey (JSONP)를 불러오며,
 * 응답 스크립트의 authenticateState(NONE / GUEST / LIMITED / USER)가 로그인 판정 기준이다.
 * Band 웹 자체도 authenticateState === "USER" 일 때만 로그인으로 본다.
 */
export function isAuthKeyUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'auth.band.us' && u.pathname.startsWith('/s/login/getKey');
  } catch {
    return false;
  }
}

export function parseAuthKeyScript(script: string): AuthKeyInfo {
  const state = /authenticateState\s*:\s*["']([A-Z_]+)["']/.exec(script);
  if (state) return { state: state[1] === 'USER' ? 'user' : 'none', raw: state[1] };
  const signed = /signedUser\s*:\s*(true|false)/.exec(script);
  if (signed) return { state: signed[1] === 'true' ? 'user' : 'none', raw: `signedUser=${signed[1]}` };
  return { state: 'unknown', raw: null };
}

/**
 * 게시글 데이터가 올 수 있는 Band 호스트. 단건 API(api.band.us, api-us.band.us 등)와
 * 게시글 상세가 쓰는 배치 API(bapi.band.us/v2.0.0/batch)를 모두 포함한다.
 */
export function isBandApiHost(hostname: string): boolean {
  return /^([a-z0-9-]+\.)*band\.us$/.test(hostname) && hostname !== 'auth.band.us';
}
