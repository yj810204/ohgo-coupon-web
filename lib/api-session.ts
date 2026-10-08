import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type CookieEntry = {
  name: string;
  value: string;
  options?: Parameters<NextResponse['cookies']['set']>[2];
};

export type RequestSession = {
  user: { id: string };
  role: string | null;
  pendingCookies: CookieEntry[];
};

function createRequestSupabase(request: NextRequest, pendingCookies: CookieEntry[]) {
  return createServerClient(
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
}

export async function getRequestUser(
  request: NextRequest,
): Promise<{ user: { id: string }; pendingCookies: CookieEntry[] } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const pendingCookies: CookieEntry[] = [];
  const supabase = createRequestSupabase(request, pendingCookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { user: { id: user.id }, pendingCookies };
}

export async function getRequestSession(request: NextRequest): Promise<RequestSession | null> {
  const base = await getRequestUser(request);
  if (!base) return null;
  const { user, pendingCookies } = base;

  let role: string | null = null;
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    role = profile?.role ?? null;
  } catch {
    role = null;
  }

  return { user, role, pendingCookies };
}

export function applyPendingCookies(response: NextResponse, pendingCookies: CookieEntry[]) {
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}
