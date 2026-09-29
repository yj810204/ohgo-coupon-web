import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession, withPendingCookies } from '@/lib/band/admin-session';
import {
  BAND_OAUTH_STATE_COOKIE,
  bandCredentials,
  bandHtmlResponse,
  bandRedirectUri,
  createOAuthState,
  stateCookieOptions,
} from '@/lib/band/oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const { configured, clientId } = bandCredentials();
  if (!configured) {
    return withPendingCookies(
      bandHtmlResponse(503, '밴드 연동', '밴드 Client ID와 Client Secret이 설정되지 않았습니다.'),
      auth.pendingCookies
    );
  }

  const redirectUri = bandRedirectUri(request.nextUrl.origin);
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return withPendingCookies(
      bandHtmlResponse(500, '밴드 연동', '리다이렉트 주소 형식이 올바르지 않습니다.'),
      auth.pendingCookies
    );
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return withPendingCookies(
      bandHtmlResponse(500, '밴드 연동', '리다이렉트 주소 형식이 올바르지 않습니다.'),
      auth.pendingCookies
    );
  }

  const state = createOAuthState();
  const authorize = new URL('https://auth.band.us/oauth2/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('state', state);

  const response = NextResponse.redirect(authorize);
  response.cookies.set(BAND_OAUTH_STATE_COOKIE, state, stateCookieOptions());
  return withPendingCookies(response, auth.pendingCookies);
}
