/** 탈퇴/삭제된 회원의 게시글·댓글·판매글에 남는 작성자 표시 */
export const WITHDRAWN_MEMBER_LABEL = '탈퇴한 회원';

const WITHDRAWN_LABEL_ALIASES = new Set([
  WITHDRAWN_MEMBER_LABEL,
  '탈퇴회원',
  '탈퇴한회원',
  '(탈퇴한 회원)',
  'withdrawn',
  'deleted user',
]);

export function normalizeAuthorName(name: string | undefined | null): string {
  return String(name ?? '').trim();
}

export function isWithdrawnMemberLabel(name: string | undefined | null): boolean {
  const t = normalizeAuthorName(name).replace(/\s+/g, '');
  if (!t) return false;
  if (WITHDRAWN_LABEL_ALIASES.has(normalizeAuthorName(name))) return true;
  return t === '탈퇴한회원' || t === '탈퇴회원';
}

/** 마스킹해도 「탈퇴한 회원」은 그대로 둔다 */
export function displayWithdrawnAwareName(
  name: string | undefined | null,
  canSeeFullNames: boolean,
  mask: (value: string) => string
): string {
  const t = normalizeAuthorName(name);
  if (isWithdrawnMemberLabel(t)) return WITHDRAWN_MEMBER_LABEL;
  if (canSeeFullNames) return t;
  return mask(t);
}
