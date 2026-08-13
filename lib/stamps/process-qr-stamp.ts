import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { isFirebaseDataSource } from '@/lib/data-source';
import { getFirebaseDb } from '@/lib/firebase/client';
import { requireFirestoreUserId } from '@/lib/firebase/resolve-user-id';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/utils/send-push';

const BOAT_QR_CODE = 'OHGO-STAMP-BOAT19033326262005';

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getTodayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { start, end };
}

export async function validateQrCode(qrData: string): Promise<boolean> {
  if (!qrData || typeof qrData !== 'string') return false;
  if (qrData === BOAT_QR_CODE) return true;

  // firebase 모드: 구앱과 동일하게 고정 보트 QR만 허용
  if (isFirebaseDataSource()) return false;

  const admin = createAdminClient();
  const { data } = await admin
    .from('qr_codes')
    .select('code')
    .eq('code', qrData)
    .eq('active', true)
    .maybeSingle();
  return Boolean(data);
}

async function addStampFirebase(userId: string): Promise<void> {
  // Auth/세션 UUID ≠ Firestore users/{uuidv5} 인 레거시 연결 계정 대응
  const firestoreUserId = await requireFirestoreUserId(userId);
  const db = getFirebaseDb();
  const userRef = doc(db, 'users', firestoreUserId);
  const stampRef = collection(db, `users/${firestoreUserId}/stamps`);
  const now = Date.now();
  const { start, end } = getTodayRange();

  const couponSnap = await getDocs(
    query(collection(db, `users/${firestoreUserId}/coupons`), where('used', '==', true))
  );
  const hasUsedToday = couponSnap.docs.some((d) => {
    const issuedAt = d.data().issuedAt;
    let issuedDate: Date | null = null;
    if (issuedAt instanceof Timestamp) issuedDate = issuedAt.toDate();
    if (typeof issuedAt === 'string') issuedDate = new Date(`${issuedAt}T00:00:00`);
    return issuedDate !== null && issuedDate >= start && issuedDate <= end;
  });
  if (hasUsedToday) {
    throw new Error(
      '오늘은 쿠폰 사용으로 QR 스탬프 적립이 제한됩니다.\n추가 적립은 선장님께 문의해주세요.'
    );
  }

  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error('회원 정보를 찾을 수 없습니다.');
  const lastStampTime = userSnap.data()?.lastStampTime?.toMillis?.() ?? 0;
  const LIMIT_MS = 8 * 60 * 60 * 1000;
  if (lastStampTime && now - lastStampTime < LIMIT_MS) {
    const nextAvailable = new Date(lastStampTime + LIMIT_MS);
    const hours = nextAvailable.getHours().toString().padStart(2, '0');
    const minutes = nextAvailable.getMinutes().toString().padStart(2, '0');
    throw new Error(
      `다음 적립은 ${hours}:${minutes} 이후에 가능합니다.\n추가 적립은 선장님께 문의해주세요.`
    );
  }

  const stampData = { date: getTodayDate(), method: 'QR' as const, timestamp: new Date() };
  const stampDocRef = await addDoc(stampRef, stampData);
  await addDoc(collection(db, `users/${firestoreUserId}/stampHistory`), {
    action: 'add',
    stampId: stampDocRef.id,
    date: getTodayDate(),
    method: 'QR',
    timestamp: Timestamp.now(),
    message: 'QR 방식으로 스탬프 적립',
  });
  await updateDoc(userRef, { lastStampTime: stampData.timestamp });
  await addDoc(collection(db, `users/${firestoreUserId}/logs`), {
    action: '스탬프 적립',
    detail: 'QR 방식으로 1개 적립',
    timestamp: Timestamp.now(),
  });

  const after = await getDocs(stampRef);
  if (after.size >= 10) {
    await addDoc(collection(db, `users/${firestoreUserId}/coupons`), {
      issuedAt: getTodayDate(),
      reason: '10회 적립 100% 할인',
      used: false,
      isHalf: 'N',
    });
    await addDoc(collection(db, `users/${firestoreUserId}/logs`), {
      action: '쿠폰 발급',
      detail: '10회 적립 100% 할인 쿠폰 발급',
      timestamp: Timestamp.now(),
    });

    for (const d of after.docs) {
      await addDoc(collection(db, `users/${firestoreUserId}/stampHistory`), {
        action: 'remove',
        stampId: d.id,
        date: d.data().date,
        method: d.data().method,
        timestamp: Timestamp.now(),
        message: '쿠폰 발급으로 스탬프 삭제',
      });
      await deleteDoc(d.ref);
    }
    await addDoc(collection(db, `users/${firestoreUserId}/logs`), {
      action: '스탬프 초기화',
      detail: '10개 스탬프 삭제',
      timestamp: Timestamp.now(),
    });

    await sendPushToUser({
      // 푸시 토큰·딥링크는 세션 Auth UUID 기준
      uuid: userId,
      title: '쿠폰이 발급되었습니다~! 🎁',
      body: '스탬프 10개 도달! 쿠폰이 발급되었어요~!',
      data: { screen: 'coupons', uuid: userId },
    });
  }
}

async function logAction(supabase: SupabaseClient, userId: string, action: string, detail: string) {
  await supabase.from('user_action_logs').insert({ user_id: userId, action, detail });
}

async function insertStampHistory(
  supabase: SupabaseClient,
  userId: string,
  row: {
    stamp_id?: string | null;
    action: string;
    date?: string;
    method?: string;
    message?: string;
  }
) {
  await supabase.from('stamp_history').insert({
    user_id: userId,
    stamp_id: row.stamp_id ?? null,
    action: row.action,
    date: row.date,
    method: row.method,
    message: row.message,
  });
}

async function issueCoupon(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase.from('coupons').insert({
    user_id: userId,
    issued_at: getTodayDate(),
    reason: '10회 적립 100% 할인',
    used: false,
    is_half: false,
  });
  await logAction(supabase, userId, '쿠폰 발급', '10회 적립 100% 할인 쿠폰 발급');
}

async function clearStamps(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: stamps, error } = await supabase
    .from('stamps')
    .select('id, date, method')
    .eq('user_id', userId);

  if (error) throw error;

  for (const s of stamps ?? []) {
    await insertStampHistory(supabase, userId, {
      stamp_id: s.id,
      action: 'remove',
      date: s.date ?? undefined,
      method: s.method ?? undefined,
      message: '쿠폰 발급으로 스탬프 삭제',
    });
  }

  await supabase.from('stamps').delete().eq('user_id', userId);
  await logAction(supabase, userId, '스탬프 초기화', '10개 스탬프 삭제');
}

async function addStampSupabase(userId: string): Promise<void> {
  const supabase = createAdminClient();
  const now = Date.now();
  const { start, end } = getTodayRange();

  const { data: usedCoupons } = await supabase
    .from('coupons')
    .select('issued_at, used_at')
    .eq('user_id', userId)
    .eq('used', true);

  const hasUsedToday = (usedCoupons ?? []).some((c) => {
    if (c.used_at) {
      const usedDate = new Date(c.used_at);
      return usedDate >= start && usedDate <= end;
    }
    if (c.issued_at) {
      const issuedDate = new Date(`${c.issued_at}T00:00:00`);
      return issuedDate >= start && issuedDate <= end;
    }
    return false;
  });

  if (hasUsedToday) {
    throw new Error(
      '오늘은 쿠폰 사용으로 QR 스탬프 적립이 제한됩니다.\n추가 적립은 선장님께 문의해주세요.'
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('last_stamp_time')
    .eq('id', userId)
    .maybeSingle();

  const lastStampTime = profile?.last_stamp_time
    ? new Date(profile.last_stamp_time).getTime()
    : 0;

  const LIMIT_MS = 8 * 60 * 60 * 1000;

  if (lastStampTime && now - lastStampTime < LIMIT_MS) {
    const nextAvailable = new Date(lastStampTime + LIMIT_MS);
    const hours = nextAvailable.getHours().toString().padStart(2, '0');
    const minutes = nextAvailable.getMinutes().toString().padStart(2, '0');
    throw new Error(
      `다음 적립은 ${hours}:${minutes} 이후에 가능합니다.\n추가 적립은 선장님께 문의해주세요.`
    );
  }

  const stampCreatedAt = new Date().toISOString();
  const { data: stampRow, error: stampError } = await supabase
    .from('stamps')
    .insert({
      user_id: userId,
      date: getTodayDate(),
      method: 'QR',
      created_at: stampCreatedAt,
    })
    .select('id')
    .single();

  if (stampError || !stampRow) throw stampError ?? new Error('스탬프 적립 실패');

  await insertStampHistory(supabase, userId, {
    stamp_id: stampRow.id,
    action: 'add',
    date: getTodayDate(),
    method: 'QR',
    message: 'QR 방식으로 스탬프 적립',
  });

  await supabase.from('profiles').update({ last_stamp_time: stampCreatedAt }).eq('id', userId);
  await logAction(supabase, userId, '스탬프 적립', 'QR 방식으로 1개 적립');

  const { count } = await supabase
    .from('stamps')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count ?? 0) >= 10) {
    await issueCoupon(supabase, userId);
    await clearStamps(supabase, userId);
    await sendPushToUser({
      uuid: userId,
      title: '쿠폰이 발급되었습니다~! 🎁',
      body: '스탬프 10개 도달! 쿠폰이 발급되었어요~!',
      data: { screen: 'coupons', uuid: userId },
    });
  }
}

export async function processQrStamp(userId: string, qrData: string): Promise<void> {
  const valid = await validateQrCode(qrData);
  if (!valid) {
    const err = new Error('유효하지 않은 QR 코드입니다.');
    (err as Error & { code: string }).code = 'INVALID_QR';
    throw err;
  }

  if (isFirebaseDataSource()) {
    await addStampFirebase(userId);
    return;
  }

  await addStampSupabase(userId);
}
