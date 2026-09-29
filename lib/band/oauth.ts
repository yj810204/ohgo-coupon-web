import { randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const BAND_OAUTH_STATE_COOKIE = 'band_oauth_state';
const STATE_MAX_AGE_SEC = 10 * 60;
const TOKEN_ENDPOINT = 'https://auth.band.us/oauth2/token';
const OPERATOR_ROW_ID = 'operator';

const BAND_ERROR_REASONS: Record<string, string> = {
  invalid_client: '밴드 앱 정보를 확인하지 못했습니다.',
  invalid_token: '밴드 인증 정보가 만료되었습니다.',
  invalid_request: '밴드 인증 요청이 올바르지 않습니다.',
  invalid_grant: '인증 코드가 올바르지 않거나 만료되었습니다.',
  redirect_uri_mismatch: '리다이렉트 주소가 밴드에 등록된 주소와 다릅니다.',
  unsupported_grant_type: '지원하지 않는 인증 방식입니다.',
  unsupported_response_type: '지원하지 않는 응답 방식입니다.',
  access_denied: '밴드에서 연동 권한이 거부되었습니다.',
  insufficient_scope: '밴드 연동 권한이 부족합니다.',
};

export type BandCredentials = {
  clientId: string;
  clientSecret: string;
  configured: boolean;
};

type BandTokenPayload = {
  access_token: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  user_key?: string;
};

export function bandCredentials(): BandCredentials {
  const clientId = process.env.BAND_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.BAND_CLIENT_SECRET?.trim() ?? '';
  return {
    clientId,
    clientSecret,
    configured: clientId.length > 0 && clientSecret.length > 0,
  };
}

export function bandRedirectUri(origin: string): string {
  const configured = process.env.BAND_REDIRECT_URI?.trim();
  if (configured) return configured;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  if (site) return `${site}/api/band/callback`;
  return `${origin.replace(/\/$/, '')}/api/band/callback`;
}

export function createOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

export function oauthStateMatches(expected: string | undefined, actual: string | null): boolean {
  if (!expected || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function stateCookieOptions(maxAge = STATE_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api/band',
    maxAge,
  };
}

export function clearStateCookie(response: NextResponse): NextResponse {
  response.cookies.set(BAND_OAUTH_STATE_COOKIE, '', stateCookieOptions(0));
  return response;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function bandHtmlResponse(status: number, title: string, message: string): NextResponse {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${safeTitle}</title>
  <style>
    body { margin: 0; background: #f4f6f8; color: #1c2430; font-family: system-ui, sans-serif; }
    main { max-width: 32rem; margin: 4rem auto; padding: 1.5rem; }
    h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
    p { margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <main>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function bandErrorReason(code: string): string {
  return BAND_ERROR_REASONS[code] ?? '밴드 인증에 실패했습니다.';
}

export async function exchangeBandAuthorizationCode(
  code: string
): Promise<{ ok: true; token: BandTokenPayload } | { ok: false; reason: string }> {
  const { clientId, clientSecret, configured } = bandCredentials();
  if (!configured) {
    return { ok: false, reason: '밴드 앱 정보가 설정되지 않았습니다.' };
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  const url = new URL(TOKEN_ENDPOINT);
  url.searchParams.set('grant_type', 'authorization_code');
  url.searchParams.set('code', code);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
  } catch {
    console.error('[band] token endpoint unreachable');
    return { ok: false, reason: '밴드 인증 서버에 연결하지 못했습니다.' };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    console.error('[band] token response was not json', response.status);
    return { ok: false, reason: '밴드 토큰 응답을 해석하지 못했습니다.' };
  }

  const record = isRecord(body) ? body : null;
  const accessToken = record && typeof record.access_token === 'string' ? record.access_token : '';
  if (!response.ok || !record || !accessToken) {
    const errorCode =
      record && typeof record.error === 'string' && /^[a-z0-9_]{1,40}$/.test(record.error)
        ? record.error
        : 'token_exchange_failed';
    console.error('[band] token exchange failed', response.status, errorCode);
    return { ok: false, reason: bandErrorReason(errorCode) };
  }

  const expiresIn =
    typeof record.expires_in === 'number' && Number.isFinite(record.expires_in) ? record.expires_in : undefined;
  return {
    ok: true,
    token: {
      access_token: accessToken,
      token_type: typeof record.token_type === 'string' ? record.token_type : undefined,
      refresh_token: typeof record.refresh_token === 'string' ? record.refresh_token : undefined,
      expires_in: expiresIn,
      scope: typeof record.scope === 'string' ? record.scope : undefined,
      user_key: typeof record.user_key === 'string' ? record.user_key : undefined,
    },
  };
}

export async function saveBandToken(
  token: BandTokenPayload
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const expiresIn =
    typeof token.expires_in === 'number' && Number.isFinite(token.expires_in) ? Math.trunc(token.expires_in) : null;
  const expiresAt =
    expiresIn != null && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  try {
    const admin = createAdminClient();
    const { error } = await admin.from('band_oauth_tokens').upsert(
      {
        id: OPERATOR_ROW_ID,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        token_type: token.token_type ?? null,
        scope: token.scope ?? null,
        user_key: token.user_key ?? null,
        expires_in: expiresIn,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) {
      console.error('[band] token save failed', error.code ?? 'unknown');
      return { ok: false, reason: '발급된 토큰을 저장하지 못했습니다.' };
    }
    return { ok: true };
  } catch {
    console.error('[band] token save failed');
    return { ok: false, reason: '발급된 토큰을 저장하지 못했습니다.' };
  }
}
