import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] };

/** Route Handler용 — setAll 호출마다 response를 재생성하지 않고 쿠키 누적 */
export function createSupabaseRouteHandlerClient(
  request: NextRequest,
  applyCookie: (name: string, value: string, options?: CookieToSet['options']) => void
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          applyCookie(name, value, options);
        });
      },
    },
  });
}

/** 누적 쿠키를 NextResponse에 적용 */
export function applyPendingCookies(
  response: NextResponse,
  pending: CookieToSet[]
): NextResponse {
  pending.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}
