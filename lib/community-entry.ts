/** 하단 탭은 회원 화면만 연다. 커뮤니티 관리는 관리자 화면에서만 들어간다. */
export function bottomTabHref(item: { id: string; path: string }): string {
  if (item.id === 'home') return '/main';
  if (item.id === 'community') return '/community';
  return item.path;
}

/**
 * 커뮤니티는 로그인 화면으로 보내지 않는다.
 * 로그인 화면은 관리자를 관리자 홈으로 다시 보내므로,
 * 기기에 남은 회원이 있으면 회원 커뮤니티에 둔다.
 */
export function shouldLeaveCommunityForLogin(input: {
  authReady: boolean;
  authUserId?: string | null;
  storedUserId?: string | null;
}): boolean {
  if (input.storedUserId) return false;
  if (!input.authReady) return false;
  return !input.authUserId;
}

/** 강제 갱신이 비면 이미 아는 회원을 로그아웃으로 바꾸지 않는다. */
export function userAfterAuthRefresh<T>(refreshed: T | null | undefined, cached: T | null | undefined): T | null {
  return refreshed ?? cached ?? null;
}
