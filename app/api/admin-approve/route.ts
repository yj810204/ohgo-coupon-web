import { NextRequest, NextResponse } from 'next/server';
import { applyPendingCookies, getRequestSession } from '@/lib/api-session';
import { verifyAdminGatePassword } from '@/lib/admin-gate';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function tooManyAttempts(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

/** 스탬프·쿠폰·승선 등 조정 승인. 관리자 화면 잠금 사용 여부와 관계없이 관리자 비밀번호를 확인한다. */
export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const json = (body: unknown, status = 200) =>
    applyPendingCookies(NextResponse.json(body, { status }), session.pendingCookies);

  if (session.role !== 'admin' && session.role !== 'captain') {
    return json({ error: '관리자·선장만 조정할 수 있습니다.' }, 403);
  }
  if (tooManyAttempts(session.user.id)) {
    return json({ error: '시도 횟수가 너무 많습니다. 잠시 후 다시 입력해 주세요.' }, 429);
  }

  let password = '';
  try {
    const body = await request.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    password = '';
  }
  if (!password || password.length > 200) {
    return json({ error: '비밀번호를 입력해 주세요.' }, 400);
  }

  const result = await verifyAdminGatePassword(password);
  if (result === 'unset') {
    return json({ error: '관리자 비밀번호가 설정되지 않았습니다. 사이트 설정에서 비밀번호를 저장해 주세요.' }, 503);
  }
  if (result !== 'ok') {
    return json({ error: '비밀번호가 올바르지 않습니다.' }, 401);
  }
  attempts.delete(session.user.id);
  return json({ ok: true });
}
