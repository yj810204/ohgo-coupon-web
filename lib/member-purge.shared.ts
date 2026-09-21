import { WITHDRAWN_MEMBER_LABEL } from '@/lib/withdrawn-member';

export { WITHDRAWN_MEMBER_LABEL };

export const MEMBER_PURGE_CONFIRM_TITLE = '회원 삭제';
export const MEMBER_WITHDRAW_CONFIRM_TITLE = '회원탈퇴';

export function adminDeleteConfirmMessage(memberName: string): string {
  const name = memberName.trim() || '이 회원';
  return [
    `${name} 님을 영구 삭제할까요?`,
    '',
    '삭제되는 정보',
    '• 회원정보, 승선명부, 스탬프, 쿠폰, 예약, 포인트 등 개인·운영 데이터',
    '• 계정 로그인 정보',
    '',
    '남는 정보',
    `• 커뮤니티·중고장터·조황 등 게시글은 삭제되지 않습니다`,
    `• 작성자는 「${WITHDRAWN_MEMBER_LABEL}」으로 표시됩니다`,
    '',
    '이 작업은 되돌릴 수 없습니다.',
  ].join('\n');
}

export function adminDeleteSecondConfirmMessage(memberName: string): string {
  const name = memberName.trim() || '이 회원';
  return `정말 ${name} 님을 삭제할까요?\n확인을 누르면 즉시 삭제되며 복구할 수 없습니다.`;
}

export function selfWithdrawConfirmMessage(): string {
  return [
    '탈퇴하면 회원정보·명부·승선·스탬프 등 개인 데이터가 삭제됩니다.',
    '',
    `커뮤니티·중고장터 게시글은 삭제되지 않으며, 작성자는 「${WITHDRAWN_MEMBER_LABEL}」으로 남습니다.`,
    '',
    '같은 계정으로는 다시 로그인할 수 없습니다.',
    '이 작업은 되돌릴 수 없습니다.',
    '',
    '탈퇴하시겠습니까?',
  ].join('\n');
}

export function selfWithdrawSecondConfirmMessage(): string {
  return '정말 탈퇴할까요?\n확인을 누르면 즉시 탈퇴 처리됩니다.';
}

export function namesMatchForConfirm(actual: string | null | undefined, typed: string | null | undefined): boolean {
  const a = String(actual ?? '').replace(/\s+/g, '').trim();
  const b = String(typed ?? '').replace(/\s+/g, '').trim();
  if (!a || !b) return false;
  return a === b;
}

export function removeIdsFromList(ids: unknown, dropIds: Iterable<string>): { next: string[]; changed: boolean } {
  const drop = new Set([...dropIds].filter(Boolean).map(String));
  if (!Array.isArray(ids)) return { next: [], changed: false };
  const original = ids.map(String);
  const next = original.filter((id) => !drop.has(id));
  return { next, changed: next.length !== original.length };
}

export function removeIdsFromConfirmedMembers(
  confirmed: unknown,
  dropIds: Iterable<string>
): { next: Record<string, string[]> | null; changed: boolean } {
  if (!confirmed || typeof confirmed !== 'object' || Array.isArray(confirmed)) {
    return { next: null, changed: false };
  }
  const drop = new Set([...dropIds].filter(Boolean).map(String));
  const next: Record<string, string[]> = {};
  let changed = false;
  for (const [key, value] of Object.entries(confirmed as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const original = value.map(String);
    const filtered = original.filter((id) => !drop.has(id));
    next[key] = filtered;
    if (filtered.length !== original.length) changed = true;
  }
  return { next, changed };
}

export type MemberPurgeMode = 'admin' | 'self';

export type MemberPurgeResult = {
  ok: true;
  alreadyGone: boolean;
  anonymized: {
    communityPosts: number;
    comments: number;
    marketListings: number;
  };
  firebasePurged: boolean;
};

export const COMMUNITY_ANONYMIZE_FIELDS = {
  uploaded_by_name: WITHDRAWN_MEMBER_LABEL,
  uploaded_by: null,
} as const;

export const COMMENT_ANONYMIZE_FIELDS = {
  user_name: WITHDRAWN_MEMBER_LABEL,
  user_id: null,
} as const;

export const MARKET_ANONYMIZE_FIELDS = {
  seller_name: WITHDRAWN_MEMBER_LABEL,
  contact_phone: null,
} as const;
