import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bandHtmlResponse } from '@/lib/band/oauth';

type PendingCookie = {
  name: string;
  value: string;
  options?: Parameters<NextResponse['cookies']['set']>[2];
};

function applyPendingCookies(response: NextResponse, pending: PendingCookie[]): NextResponse {
  pending.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}

export async function requireAdminSession(
  request: NextRequest
): Promise<{ ok: true; pendingCookies: PendingCookie[] } | { ok: false; response: NextResponse }> {
  const pendingCookies: PendingCookie[] = [];

  try {
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

    if (!user) {
      return {
        ok: false,
        response: applyPendingCookies(
          bandHtmlResponse(401, '밴드 연동', '관리자 로그인이 필요합니다.'),
          pendingCookies
        ),
      };
    }

    const admin = createAdminClient();
    const { data: profile, error } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[band] admin profile lookup failed', error.code ?? 'unknown');
      return {
        ok: false,
        response: applyPendingCookies(
          bandHtmlResponse(503, '밴드 연동', '관리자 권한을 확인하지 못했습니다.'),
          pendingCookies
        ),
      };
    }

    if (profile?.role !== 'admin') {
      return {
        ok: false,
        response: applyPendingCookies(
          bandHtmlResponse(403, '밴드 연동', '관리자만 밴드 연동을 시작할 수 있습니다.'),
          pendingCookies
        ),
      };
    }

    return { ok: true, pendingCookies };
  } catch {
    console.error('[band] admin session failed');
    return {
      ok: false,
      response: bandHtmlResponse(503, '밴드 연동', '관리자 인증을 확인할 수 없습니다.'),
    };
  }
}

export function withPendingCookies(response: NextResponse, pending: PendingCookie[]): NextResponse {
  return applyPendingCookies(response, pending);
}
