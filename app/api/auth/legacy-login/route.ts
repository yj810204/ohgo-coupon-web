import { NextResponse } from 'next/server';
import { LegacyLoginError, legacyLoginWithNameDob } from '@/lib/legacy-login';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name : '';
    const dob = typeof body?.dob === 'string' ? body.dob : '';
    const register = body?.register === true;

    if (!name.trim() || !dob.trim()) {
      return NextResponse.json({ error: '이름과 생년월일을 입력해 주세요.' }, { status: 400 });
    }

    const result = await legacyLoginWithNameDob(name, dob, { register });
    return NextResponse.json(result);
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'NOT_REGISTERED' || error instanceof LegacyLoginError) {
      if (err.code === 'NOT_REGISTERED') {
        return NextResponse.json(
          { ok: false, code: 'NOT_REGISTERED', error: err.message || '등록된 회원 정보가 없습니다.' },
          { status: 404 }
        );
      }
    }

    const message = error instanceof Error ? error.message : '로그인에 실패했습니다.';
    const status =
      message.includes('찾을 수 없습니다') ||
      message.includes('형식이 잘못') ||
      message.includes('입력해 주세요')
        ? 400
        : 500;
    console.error('legacy-login error:', message);
    return NextResponse.json({ error: message }, { status });
  }
}
