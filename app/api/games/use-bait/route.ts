import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc, increment, setDoc, updateDoc } from 'firebase/firestore';
import { isFirebaseDataSource } from '@/lib/data-source';
import { getFirebaseDb } from '@/lib/firebase/client';
import { resolveFirestoreUserId } from '@/lib/firebase/resolve-user-id';
import { invalidateCache } from '@/lib/query-cache';
import { createAdminClient } from '@/lib/supabase/admin';

function todayDate(): string {
  return new Date().toISOString().split('T')[0];
}

async function useBaitFirebase(userId: string): Promise<number> {
  const fbUserId = await resolveFirestoreUserId(userId);
  if (!fbUserId) throw new Error('USER_NOT_FOUND');

  const db = getFirebaseDb();
  const userRef = doc(db, 'users', fbUserId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('USER_NOT_FOUND');

  const baitCoupons = Number(snap.data().baitCoupons) || 0;
  if (baitCoupons < 1) throw new Error('NO_BAIT');

  const remaining = baitCoupons - 1;
  await updateDoc(userRef, { baitCoupons: remaining });

  // 구앱 일일 사용량과 연동 (같은 users/{uuidv5}/baitUsage)
  const usageRef = doc(db, 'users', fbUserId, 'baitUsage', todayDate());
  await setDoc(usageRef, { used: increment(1), date: todayDate() }, { merge: true });

  return remaining;
}

async function useBaitSupabase(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('bait_coupons')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!profile) throw new Error('USER_NOT_FOUND');

  const baitCoupons = Number(profile.bait_coupons) || 0;
  if (baitCoupons < 1) throw new Error('NO_BAIT');

  const remaining = baitCoupons - 1;
  const { error: updateError } = await admin
    .from('profiles')
    .update({ bait_coupons: remaining })
    .eq('id', userId);

  if (updateError) throw updateError;
  return remaining;
}

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

    const remaining = isFirebaseDataSource()
      ? await useBaitFirebase(userId)
      : await useBaitSupabase(userId);

    invalidateCache('bait:');
    return NextResponse.json({ ok: true, remaining });
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
