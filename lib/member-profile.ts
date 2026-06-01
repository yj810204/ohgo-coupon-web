/** Firestore users 문서에서 프로필 이미지 URL 추출 (필드명 호환) */
export function getMemberProfileImageUrl(
  data: Record<string, unknown> | null | undefined
): string | undefined {
  if (!data) return undefined;

  const keys = [
    'profileImage',
    'profileImageUrl',
    'profilePhotoUrl',
    'photoURL',
    'avatarUrl',
    'imageUrl',
    'profileUrl',
  ];

  for (const key of keys) {
    const value = data[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
      return trimmed;
    }
  }

  return undefined;
}
