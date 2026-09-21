import { isFirebaseDataSource } from '@/lib/data-source';
import { purgeFirebaseMemberData } from '@/lib/member-purge.firebase';
import type { MemberPurgeMode, MemberPurgeResult } from '@/lib/member-purge.shared';

export async function requestMemberPurge(input: {
  userId: string;
  mode: MemberPurgeMode;
  confirmName?: string;
}): Promise<MemberPurgeResult> {
  const res = await fetch('/api/members/purge', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  let data: (MemberPurgeResult & { message?: string }) | null = null;
  try {
    data = (await res.json()) as MemberPurgeResult & { message?: string };
  } catch {
    data = null;
  }
  if (!res.ok || !data?.ok) {
    throw new Error(data?.message || '회원 삭제에 실패했습니다.');
  }

  if (!data.firebasePurged && isFirebaseDataSource()) {
    try {
      data.firebasePurged = await purgeFirebaseMemberData([input.userId]);
    } catch (error) {
      console.warn('[member-purge] client firebase fallback failed', error);
    }
  }

  try {
    const { invalidateAdminMemberStatsCache } = await import('@/utils/admin-member-service');
    invalidateAdminMemberStatsCache();
    const { invalidateRosterSummaryCache } = await import('@/utils/roster-service');
    invalidateRosterSummaryCache();
  } catch {
    // ignore
  }

  return data;
}
