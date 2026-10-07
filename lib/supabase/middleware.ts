import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const BASE64_PREFIX = 'base64-';
const FRESH_FOR_SEC = 120;

function decodeBase64Url(value: string): string {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64').toString('utf8');
}

function readSessionRaw(request: NextRequest, base: string): string {
  const direct = request.cookies.get(base)?.value;
  if (direct) return direct;
  const parts: string[] = [];
  for (let i = 0; ; i += 1) {
    const chunk = request.cookies.get(`${base}.${i}`)?.value;
    if (!chunk) break;
    parts.push(chunk);
  }
  return parts.join('');
}

/** 쿠키에 담긴 액세스 토큰 만료(unix 초). 해석 불가면 null. */
export function readAccessTokenExpiry(request: NextRequest): number | null {
  const bases = new Set<string>();
  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.includes('-auth-token')) continue;
    bases.add(cookie.name.replace(/\.\d+$/, ''));
  }
  for (const base of bases) {
    const raw = readSessionRaw(request, base);
    if (!raw) continue;
    let jsonText = raw;
    if (raw.startsWith(BASE64_PREFIX)) {
      try {
        jsonText = decodeBase64Url(raw.slice(BASE64_PREFIX.length));
      } catch {
        continue;
      }
    }
    try {
      const session = JSON.parse(jsonText) as { access_token?: string; expires_at?: number };
      if (typeof session.expires_at === 'number') return session.expires_at;
      const part = session.access_token?.split('.')[1];
      if (!part) continue;
      const payload = JSON.parse(decodeBase64Url(part)) as { exp?: number };
      if (typeof payload.exp === 'number') return payload.exp;
    } catch {
      continue;
    }
  }
  return null;
}

export function needsNetworkUserCheck(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin-') ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/boarding-ledger') ||
    pathname.startsWith('/boarding-records')
  );
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.next({ request });
  }

  // 세션 쿠키가 없으면 Auth 서버 왕복 생략 (로그인 전·정적 페이지 체감 개선)
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.includes('-auth-token') || c.name.includes('sb-'));
  if (!hasAuthCookie) {
    return NextResponse.next({ request });
  }

  const expiry = readAccessTokenExpiry(request);
  const nowSec = Math.floor(Date.now() / 1000);
  const tokenFresh = expiry != null && expiry > nowSec + FRESH_FOR_SEC;
  if (tokenFresh && !needsNetworkUserCheck(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}
