import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { mergeLegacyAccount } from '@/lib/merge-legacy';

export async function POST(request: NextRequest) {
  try {
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
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, message: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const name = body?.name as string | undefined;
    const dob = body?.dob as string | undefined;

    if (!name?.trim() || !dob?.trim()) {
      return NextResponse.json(
        { ok: false, message: '이름과 생년월일이 필요합니다.' },
        { status: 400 }
      );
    }

    const result = await mergeLegacyAccount(user.id, name.trim(), dob.trim());

    const admin = (await import('@/lib/supabase/admin')).createAdminClient();
    const { data: updatedProfile } = await admin
      .from('profiles')
      .select('dob, role')
      .eq('id', user.id)
      .maybeSingle();

    const response = NextResponse.json({
      ok: true,
      authUserId: user.id,
      dob: updatedProfile?.dob ?? null,
      isAdmin: updatedProfile?.role === 'admin',
      ...result,
    });
    pendingCookies.forEach(({ name: n, value, options }) => {
      response.cookies.set(n, value, options);
    });
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '병합 중 오류가 발생했습니다.';
    console.error('merge-legacy error:', error);
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
