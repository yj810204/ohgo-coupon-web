import { Timestamp, addDoc, collection, doc, increment, runTransaction } from 'firebase/firestore';
import { couponAwardedField, isTruthyFlag } from '@/lib/firebase/merged-to';
import { getFirebaseDb } from '@/lib/firebase/client';

export { couponAwardedField };

/**
 * QR은 미끼만 준다. 승선 횟수는 출항 확정 때 올린다.
 * `couponAwardedFor_` 는 구앱·이전 신앱이 승선 횟수까지 같이 올린 마커라 새로 쓰지 않는다.
 */
export const QR_BAIT_CREDIT = 1;

export function baitAwardedField(stampId: string): string {
  return `baitAwardedFor_${stampId}`;
}

/** 구 경로가 이 스탬프로 승선 횟수까지 이미 올렸는지. */
export function isQrTripAlreadyCredited(
  userData: Record<string, unknown> | null | undefined,
  stampId: string
): boolean {
  if (!userData || !stampId) return false;
  return isTruthyFlag(userData[couponAwardedField(stampId)]);
}

export function isQrBaitAlreadyCredited(
  userData: Record<string, unknown> | null | undefined,
  stampId: string
): boolean {
  if (!userData || !stampId) return false;
  return (
    isTruthyFlag(userData[baitAwardedField(stampId)]) ||
    isTruthyFlag(userData[couponAwardedField(stampId)])
  );
}

export function buildQrTripCreditPatch(stampId: string): Record<string, unknown> {
  return {
    baitCoupons: increment(QR_BAIT_CREDIT),
    [baitAwardedField(stampId)]: true,
  };
}

export type QrActivityLog = {
  userId: string;
  stampId: string;
  date: string;
  method: 'QR';
  source: 'server';
  tripCountDelta: number;
  baitCouponsDelta: number;
};

export function buildQrScanActivityLog(input: {
  userId: string;
  stampId: string;
  date: string;
}): QrActivityLog {
  return {
    userId: input.userId,
    stampId: input.stampId,
    date: input.date,
    method: 'QR',
    source: 'server',
    tripCountDelta: 0,
    baitCouponsDelta: QR_BAIT_CREDIT,
  };
}

/**
 * 이미 미끼를 준 스탬프면 빈 패치. 승선 횟수는 여기서 올리지 않는다.
 * increment()는 테스트에서 비교하기 어려워 숫자 델타도 같이 돌려준다.
 */
export function planQrTripCredit(
  userData: Record<string, unknown> | null | undefined,
  stampId: string
): { alreadyCredited: boolean; tripDelta: number; baitDelta: number; marker: string } {
  const marker = baitAwardedField(stampId);
  if (isQrBaitAlreadyCredited(userData, stampId)) {
    return { alreadyCredited: true, tripDelta: 0, baitDelta: 0, marker };
  }
  return {
    alreadyCredited: false,
    tripDelta: 0,
    baitDelta: QR_BAIT_CREDIT,
    marker,
  };
}

/** 기존 스탬프에 대해 미끼를 한 번만 올린다. 승선 횟수는 출항 확정에서 처리한다. */
export async function applyQrTripCreditOnce(input: {
  userId: string;
  stampId: string;
  date: string;
  extraUserFields?: Record<string, unknown>;
}): Promise<{ credited: boolean }> {
  const db = getFirebaseDb();
  const userRef = doc(db, 'users', input.userId);
  let credited = false;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists()) throw new Error('회원 정보를 찾을 수 없습니다.');
    const plan = planQrTripCredit(snap.data() as Record<string, unknown>, input.stampId);
    if (plan.alreadyCredited) return;
    tx.update(userRef, {
      ...buildQrTripCreditPatch(input.stampId),
      ...(input.extraUserFields ?? {}),
    });
    credited = true;
  });

  if (credited) {
    await writeQrScanActivityLog({
      userId: input.userId,
      stampId: input.stampId,
      date: input.date,
    });
  }
  return { credited };
}

export async function writeQrScanActivityLog(input: {
  userId: string;
  stampId: string;
  date: string;
}): Promise<void> {
  try {
    const db = getFirebaseDb();
    await addDoc(collection(db, 'qrScanActivityLogs'), {
      ...buildQrScanActivityLog(input),
      timestamp: Timestamp.now(),
    });
  } catch (e) {
    console.warn('qrScanActivityLogs write skipped:', e);
  }
}
