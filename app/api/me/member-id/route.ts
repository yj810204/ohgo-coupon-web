import { NextResponse, type NextRequest } from 'next/server';
import { applyPendingCookies, getRequestSession } from '@/lib/api-session';
import { createAdminClient } from '@/lib/supabase/admin';

/** 브라우저 프로필 조회가 비었을 때, 로그인 세션의 본인 Firestore id만 돌려준다. */
export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let fbUid = session.user.id;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('profiles')
      .select('legacy_uuid')
      .eq('id', session.user.id)
      .maybeSingle();
    if (data?.legacy_uuid) fbUid = data.legacy_uuid;
  } catch {
    fbUid = session.user.id;
  }

  return applyPendingCookies(NextResponse.json({ fbUid }), session.pendingCookies);
}
