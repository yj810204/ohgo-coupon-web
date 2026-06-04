import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * api/auth/callback 은 PKCE code 교환 중 — middleware 세션 갱신 제외
     * (쿠키 청크 손상·401 방지)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|games/|api/auth/callback).*)',
  ],
};
