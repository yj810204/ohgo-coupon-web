/** 관리자·선장 — 프로필 설정 생략 대상 */
export function requiresProfileSetup(profile: {
  dob?: string | null;
  role?: string | null;
}): boolean {
  if (profile.role === 'admin' || profile.role === 'captain') return false;
  return !profile.dob?.trim();
}
