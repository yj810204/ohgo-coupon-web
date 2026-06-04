import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { ensureProfileForUser } from '@/lib/supabase/ensure-profile';

/** 브라우저 OAuth 직후 profiles 행 보장 (service role) */
export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  try {
    const profile = await ensureProfileForUser(user);
    return NextResponse.json({ profile: { id: profile.id } });
  } catch (e) {
    console.error('프로필 ensure 실패:', e);
    return NextResponse.json({ error: 'ensure_failed' }, { status: 500 });
  }
}
