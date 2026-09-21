import { NextRequest, NextResponse } from 'next/server';
import { applyPendingCookies, getRequestSession } from '@/lib/api-session';
import { MemberPurgeError, purgeMemberAccount } from '@/lib/member-purge';
import type { MemberPurgeMode } from '@/lib/member-purge.shared';

type Body = {
  userId?: string;
  mode?: MemberPurgeMode;
  confirmName?: string;
};

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const mode: MemberPurgeMode = body?.mode === 'self' ? 'self' : 'admin';
  const targetUserId = String(body?.userId ?? '').trim();

  try {
    const result = await purgeMemberAccount({
      targetUserId,
      actorUserId: session.user.id,
      actorRole: session.role,
      mode,
      confirmName: body?.confirmName,
    });
    const response = NextResponse.json(result);
    return applyPendingCookies(response, session.pendingCookies);
  } catch (error) {
    if (error instanceof MemberPurgeError) {
      const response = NextResponse.json({ ok: false, message: error.message }, { status: error.status });
      return applyPendingCookies(response, session.pendingCookies);
    }
    const message = error instanceof Error ? error.message : '회원 삭제에 실패했습니다.';
    const response = NextResponse.json({ ok: false, message }, { status: 500 });
    return applyPendingCookies(response, session.pendingCookies);
  }
}
