import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { adminMergeGuestToUser } from '@/lib/merge-legacy';

async function requireAdmin(request: NextRequest) {
  type CookieEntry = {
    name: string;
    value: string;
    options?: Parameters<NextResponse['cookies']['set']>[2];
  };
  const pendingCookies: CookieEntry[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            pendingCookies.push({ name, value, options });
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 }) };

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 }) };
  }

  return { user, pendingCookies };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth && auth.error) return auth.error;

  try {
    const body = await request.json();
    const guestLegacyId = body?.guestLegacyId as string | undefined;
    const targetUserId = body?.targetUserId as string | undefined;

    if (!guestLegacyId || !targetUserId) {
      return NextResponse.json(
        { ok: false, message: 'guestLegacyId와 targetUserId가 필요합니다.' },
        { status: 400 }
      );
    }

    const result = await adminMergeGuestToUser(guestLegacyId, targetUserId);
    const response = NextResponse.json({ ok: true, ...result });
    auth.pendingCookies?.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '병합 실패';
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth && auth.error) return auth.error;

  const phone = request.nextUrl.searchParams.get('phone');
  const name = request.nextUrl.searchParams.get('name');

  const admin = createAdminClient();
  let query = admin
    .from('guest_profiles')
    .select('id, name, dob, phone, merged_to, created_at')
    .is('merged_to', null)
    .limit(20);

  if (phone) {
    query = query.ilike('phone', `%${phone}%`);
  } else if (name) {
    query = query.ilike('name', `%${name}%`);
  } else {
    return NextResponse.json({ ok: true, guests: [] });
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, guests: data ?? [] });
}
