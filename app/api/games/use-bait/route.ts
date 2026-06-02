import { NextRequest, NextResponse } from 'next/server';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body?.userId as string | undefined;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { ok: false, code: 'INVALID_REQUEST', message: 'userId가 필요합니다.' },
        { status: 400 }
      );
    }

    const userRef = doc(db, 'users', userId);

    const txResult = await runTransaction(db, async transaction => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error('USER_NOT_FOUND');
      }

      const baitCoupons = Number(userSnap.data()?.baitCoupons) || 0;
      if (baitCoupons < 1) {
        throw new Error('NO_BAIT');
      }

      const remaining = baitCoupons - 1;
      transaction.update(userRef, { baitCoupons: remaining });
      return remaining;
    });

    return NextResponse.json({
      ok: true,
      remaining: txResult,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'USER_NOT_FOUND') {
      return NextResponse.json(
        { ok: false, code: 'USER_NOT_FOUND', message: '회원 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
    if (msg === 'NO_BAIT') {
      return NextResponse.json(
        { ok: false, code: 'NO_BAIT', message: '보유 미끼가 없습니다.' },
        { status: 400 }
      );
    }
    console.error('use-bait error:', error);
    return NextResponse.json(
      { ok: false, code: 'UNKNOWN', message: '미끼 사용 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
