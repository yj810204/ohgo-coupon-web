/**
 * 목록 확인이 로그인 만료로 멈춰야 하는지 판정한다.
 * 게시글을 이미 읽었으면 로그인으로 보지 않는다(화면에 로그인 문구가 남아 있어도).
 */
export type LoginSignals = {
  /** 이동이 끝난 주소 */
  url: string;
  /** auth.band.us getKey의 authenticateState 원문. 응답이 없으면 null */
  authenticateState: string | null;
  /** 화면 글자 (앞부분이면 충분) */
  bodyText: string;
};

export function isLoginUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return /login|signin/i.test(url);
  }
  const host = parsed.hostname;
  if (host === 'auth.band.us') return true;
  if (host === 'nid.naver.com' || host.endsWith('.nid.naver.com')) return true;
  return /\/login|signin|nidlogin/i.test(parsed.pathname);
}

/** 로그인이 필요하면 사용자에게 보여줄 문장, 아니면 null */
export function loginRequiredReason(signals: LoginSignals, postCount: number): string | null {
  if (postCount > 0) return null;
  if (isLoginUrl(signals.url)) {
    return 'Band 로그인 페이지로 이동했습니다. npm run band:login 을 다시 실행하세요.';
  }
  const state = signals.authenticateState?.toUpperCase() ?? null;
  if (state && state !== 'USER') {
    return `Band 로그인이 만료되었습니다 (상태: ${state}). npm run band:login 을 다시 실행하세요.`;
  }
  const text = signals.bodyText.replace(/\s+/g, ' ');
  if (/멤버만 볼 수 있습니다|가입한 멤버만|이 밴드는 멤버/.test(text)) {
    return '밴드 멤버만 글을 볼 수 있습니다. npm run band:login 으로 로그인 상태를 확인하세요.';
  }
  if (/로그인이 필요|로그인 후 이용|로그인이 만료/.test(text)) {
    return 'Band 로그인이 필요합니다. npm run band:login 을 다시 실행하세요.';
  }
  return null;
}
