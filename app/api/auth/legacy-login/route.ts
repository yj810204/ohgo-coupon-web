import { NextResponse } from 'next/server';
import { legacyLoginWithNameDob } from '@/lib/legacy-login';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name : '';
    const dob = typeof body?.dob === 'string' ? body.dob : '';

    if (!name.trim() || !dob.trim()) {
      return NextResponse.json({ error: '이름과 생년월일을 입력해 주세요.' }, { status: 400 });
    }

    const result = await legacyLoginWithNameDob(name, dob);
    return NextResponse.json(result);
  } catch (error) {
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
