import { NextResponse } from 'next/server';
import {
  ADMIN_GATE_COOKIE,
  adminGateCookieOptions,
  adminGateCookieValue,
  isAdminGateConfigured,
  isAdminGateEnabled,
  isAdminGateUnlocked,
  verifyAdminGatePassword,
} from '@/lib/admin-gate';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
}

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

export async function GET() {
  const enabled = isAdminGateEnabled();
  return NextResponse.json({
    enabled,
    configured: isAdminGateConfigured(),
    unlocked: await isAdminGateUnlocked(),
  });
}

export async function POST(request: Request) {
  if (!isAdminGateEnabled()) {
    return NextResponse.json({ ok: true, enabled: false });
  }
  if (!isAdminGateConfigured()) {
    return NextResponse.json(
      { error: '관리자 비밀번호가 설정되지 않았습니다. .env 파일에 ADMIN_GATE_PASSWORD를 넣어 주세요.' },
      { status: 503 },
    );
  }

  const key = clientKey(request);
  if (tooManyAttempts(key)) {
    return NextResponse.json(
      { error: '시도 횟수가 너무 많습니다. 잠시 후 다시 입력해 주세요.' },
      { status: 429 },
    );
  }

  let password = '';
  try {
    const body = await request.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    password = '';
  }

  if (!password || password.length > 200) {
    return NextResponse.json({ error: '비밀번호를 입력해 주세요.' }, { status: 400 });
  }

  if (verifyAdminGatePassword(password) !== 'ok') {
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  attempts.delete(key);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_GATE_COOKIE, adminGateCookieValue(), adminGateCookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_GATE_COOKIE, '', { ...adminGateCookieOptions(), maxAge: 0 });
  return response;
}
