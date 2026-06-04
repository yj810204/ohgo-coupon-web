import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ensureProfileForUser } from '@/lib/supabase/ensure-profile';

function displayNameFromUser(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
}): string {
  return (
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split('@')[0] ??
    '회원'
  );
}

/** 세션·프로필 동기화 (보조 API) */
export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  type CookieEntry = {
    name: string;
    value: string;
    options?: Parameters<NextResponse['cookies']['set']>[2];
  };
  const pendingCookies: CookieEntry[] = [];

  const supabase = createServerClient(url, anonKey, {
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
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const applyCookies = (response: NextResponse) => {
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  };

  if (userError || !user) {
    return applyCookies(NextResponse.json({ error: 'no_session' }, { status: 401 }));
  }

  let profile: { id: string; name: string; dob: string | null; role: string };

  try {
    profile = await ensureProfileForUser(user);
  } catch {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, dob, role')
      .eq('id', user.id)
      .maybeSingle();

    profile = data ?? {
      id: user.id,
      name: displayNameFromUser(user),
      dob: null,
      role: 'member',
    };
  }

  return applyCookies(
    NextResponse.json({
      profile: {
        id: profile.id,
        name: profile.name,
        dob: profile.dob ?? '',
        isAdmin: profile.role === 'admin',
      },
    })
  );
}
