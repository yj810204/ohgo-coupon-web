/** 프로필·게스트·Firestore 어디에도 없으면 구앱처럼 신규 가입으로 본다. */
export function isUnregisteredLegacyIdentity(found: {
  existingProfile: unknown;
  guest: unknown;
  firebaseUser: unknown;
}): boolean {
  return !found.existingProfile && !found.guest && !found.firebaseUser;
}
