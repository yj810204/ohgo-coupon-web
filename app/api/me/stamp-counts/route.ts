import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { applyPendingCookies, getRequestUser } from '@/lib/api-session';
import { resolveCanonicalUserId } from '@/lib/firebase/canonical-user';
import { readFirestoreStampCounts } from '@/lib/firebase/read-stamp-counts';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import type { ProfileLookup } from '@/lib/member-id-resolution';
import { selectExistingMemberId } from '@/lib/member-id-resolution';
import { withTimeout } from '@/lib/with-timeout';

export const dynamic = 'force-dynamic';

const SESSION_MS = 2_500;
const PROFILE_MS = 2_500;
const READ_MS = 8_000;

/** 로그인 세션의 스탬프·쿠폰 개수. 브라우저는 Firestore SDK 없이 이 응답만 받는다. */
export async function GET(request: NextRequest) {
  let session: Awaited<ReturnType<typeof getRequestUser>>;
  try {
    session = await withTimeout(getRequestUser(request), SESSION_MS);
  } catch {
    return NextResponse.json({ error: '집계를 불러오지 못했습니다.' }, { status: 503 });
  }
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!isFirebaseConfigured()) {
    return applyPendingCookies(
      NextResponse.json({ error: '집계를 불러오지 못했습니다.' }, { status: 503 }),
      session.pendingCookies,
    );
  }

  const userId = session.user.id;
  let profile: ProfileLookup;
  try {
    profile = await withTimeout(readOwnProfile(request, userId), PROFILE_MS);
  } catch {
    return applyPendingCookies(
      NextResponse.json({ error: '집계를 불러오지 못했습니다.' }, { status: 503 }),
      session.pendingCookies,
    );
  }
  if (profile.status === 'unknown') {
    return applyPendingCookies(
      NextResponse.json({ error: '회원 정보를 확인하지 못했습니다.' }, { status: 503 }),
      session.pendingCookies,
    );
  }

  let memberId: string | null = null;
  try {
    memberId = await withTimeout(
      selectExistingMemberId(userId, profile, async (id) => {
        const resolved = await resolveCanonicalUserId(id);
        return { id: resolved.id, missing: resolved.missing };
      }),
      READ_MS,
    );
  } catch {
    memberId = null;
  }
  if (!memberId) {
    return applyPendingCookies(
      NextResponse.json({ error: '회원 정보를 확인하지 못했습니다.' }, { status: 503 }),
      session.pendingCookies,
    );
  }

  try {
    const counts = await withTimeout(readFirestoreStampCounts(memberId), READ_MS);
    return applyPendingCookies(
      NextResponse.json({
        userId,
        memberId,
        stamps: counts.stamps,
        coupons: counts.coupons,
      }),
      session.pendingCookies,
    );
  } catch {
    return applyPendingCookies(
      NextResponse.json({ error: '집계를 불러오지 못했습니다.' }, { status: 502 }),
      session.pendingCookies,
    );
  }
}

async function readOwnProfile(request: NextRequest, userId: string): Promise<ProfileLookup> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { status: 'unknown' };
  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          /* 세션 갱신 쿠키는 getRequestUser가 이미 모았다 */
        },
      },
    });
    const { data, error } = await supabase
      .from('profiles')
      .select('legacy_uuid, name, dob')
      .eq('id', userId)
      .maybeSingle();
    if (error) return { status: 'unknown' };
    if (!data) return { status: 'absent' };
    return {
      status: 'found',
      legacyUuid: data.legacy_uuid,
      name: data.name,
      dob: data.dob,
    };
  } catch {
    return { status: 'unknown' };
  }
}
