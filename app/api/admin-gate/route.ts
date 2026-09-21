import { NextResponse } from 'next/server';
import {
  ADMIN_GATE_COOKIE,
  adminGateCookieOptions,
  adminGateCookieValue,
  isAdminGateConfigured,
  isAdminGateEnabled,
  isAdminGatePasswordConfigured,
  isAdminGateUnlocked,
  saveAdminGateSettings,
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
  const enabled = await isAdminGateEnabled();
  return NextResponse.json({
    enabled,
    configured: await isAdminGateConfigured(),
    passwordConfigured: await isAdminGatePasswordConfigured(),
    unlocked: await isAdminGateUnlocked(),
  });
}

export async function POST(request: Request) {
  if (!(await isAdminGateEnabled())) {
    return NextResponse.json({ ok: true, enabled: false });
  }
  if (!(await isAdminGateConfigured())) {
    return NextResponse.json(
      { error: '관리자 비밀번호가 설정되지 않았습니다. 사이트 설정에서 비밀번호를 저장해 주세요.' },
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

  if ((await verifyAdminGatePassword(password)) !== 'ok') {
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  attempts.delete(key);
  const token = await adminGateCookieValue();
  const response = NextResponse.json({ ok: true });
  if (token) {
    response.cookies.set(ADMIN_GATE_COOKIE, token, adminGateCookieOptions());
  }
  return response;
}

export async function PUT(request: Request) {
  const unlocked = await isAdminGateUnlocked();
  const passwordConfigured = await isAdminGatePasswordConfigured();
  if (!unlocked && passwordConfigured) {
    return NextResponse.json({ error: '관리자 확인이 필요합니다.' }, { status: 401 });
  }

  let enabled = false;
  let password = '';
  let passwordConfirm = '';
  try {
    const body = await request.json();
    enabled = body?.enabled === true;
    password = typeof body?.password === 'string' ? body.password : '';
    passwordConfirm = typeof body?.passwordConfirm === 'string' ? body.passwordConfirm : '';
  } catch {
    return NextResponse.json({ error: '요청을 확인하지 못했습니다.' }, { status: 400 });
  }

  if (password || passwordConfirm) {
    if (password !== passwordConfirm) {
      return NextResponse.json({ error: '비밀번호 확인이 일치하지 않습니다.' }, { status: 400 });
    }
  }

  const result = await saveAdminGateSettings({ enabled, password });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const response = NextResponse.json({
    ok: true,
    enabled,
    passwordConfigured: await isAdminGatePasswordConfigured(),
  });
  if (result.passwordUpdated) {
    const token = await adminGateCookieValue();
    if (token) {
      response.cookies.set(ADMIN_GATE_COOKIE, token, adminGateCookieOptions());
    }
  }
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_GATE_COOKIE, '', { ...adminGateCookieOptions(), maxAge: 0 });
  return response;
}
