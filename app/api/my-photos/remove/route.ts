import { NextRequest, NextResponse } from 'next/server';
import { applyPendingCookies, getRequestSession } from '@/lib/api-session';
import { createAdminClient } from '@/lib/supabase/admin';

const PHOTO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 로그인한 회원의 태그만 지운다. 선장 원본 사진은 그대로 둔다. */
export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { photoId?: string } | null;
  const photoId = body?.photoId?.trim() ?? '';
  if (!PHOTO_ID.test(photoId)) {
    return NextResponse.json({ ok: false, message: '사진을 확인할 수 없습니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('captain_photo_tags')
    .delete()
    .eq('photo_id', photoId)
    .eq('user_id', session.user.id)
    .select('id');

  if (error) {
    return applyPendingCookies(
      NextResponse.json({ ok: false, message: '삭제하지 못했습니다.' }, { status: 500 }),
      session.pendingCookies
    );
  }
  if (!data?.length) {
    return applyPendingCookies(
      NextResponse.json({ ok: false, message: '이미 삭제된 사진입니다.' }, { status: 404 }),
      session.pendingCookies
    );
  }

  return applyPendingCookies(NextResponse.json({ ok: true }), session.pendingCookies);
}
