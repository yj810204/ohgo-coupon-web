/** 미니게임 실제 플레이 화면 (/mini-games/:gameId) — 랭킹·목록 제외 */
export function isMiniGamePlayRoute(pathname: string): boolean {
  return (
    /^\/mini-games\/[^/]+$/.test(pathname) &&
    !pathname.startsWith('/mini-games/ranking')
  );
}
