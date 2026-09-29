import { NextRequest } from 'next/server';
import {
  bandCredentials,
  bandHtmlResponse,
  clearStateCookie,
  exchangeBandAuthorizationCode,
  oauthStateMatches,
  saveBandToken,
  BAND_OAUTH_STATE_COOKIE,
} from '@/lib/band/oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PLACEHOLDER =
  '오고피씽 밴드 연동 콜백 페이지입니다. 밴드 운영자 로그인 후 자동으로 연동됩니다.';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim() ?? '';
  const state = request.nextUrl.searchParams.get('state');
  const { configured } = bandCredentials();

  if (!code || !configured) {
    return bandHtmlResponse(200, '밴드 연동', PLACEHOLDER);
  }

  const expected = request.cookies.get(BAND_OAUTH_STATE_COOKIE)?.value;
  if (!oauthStateMatches(expected, state)) {
    return clearStateCookie(
      bandHtmlResponse(
        400,
        '밴드 연동 실패',
        '인증 요청을 확인하지 못했습니다. 관리자 화면에서 연동을 다시 시작해 주세요.'
      )
    );
  }

  const exchanged = await exchangeBandAuthorizationCode(code);
  if (!exchanged.ok) {
    return clearStateCookie(bandHtmlResponse(502, '밴드 연동 실패', exchanged.reason));
  }

  const saved = await saveBandToken(exchanged.token);
  if (!saved.ok) {
    return clearStateCookie(bandHtmlResponse(500, '밴드 연동 실패', saved.reason));
  }

  return clearStateCookie(bandHtmlResponse(200, '밴드 연동 완료', '밴드 연동이 완료되었습니다.'));
}
