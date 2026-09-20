/**
 * 개발 중 로그인 없이 화면을 탐색하기 위한 우회.
 * NEXT_PUBLIC_DEV_AUTH_BYPASS=true 이고 development일 때만 동작한다.
 */

export const DEV_MOCK_USER = {
  uuid: '00000000-0000-4000-8000-000000000001',
  name: '개발용 사용자',
  dob: '1990-01-01',
  isAdmin: false,
  isCaptain: false,
} as const;

export function isDevAuthBypass(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true'
  );
}
