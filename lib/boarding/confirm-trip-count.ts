import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
} from 'firebase/firestore';
import { resolveCanonicalUserId } from '@/lib/firebase/canonical-user';
import { couponAwardedField, isTruthyFlag } from '@/lib/firebase/merged-to';
import { getFirebaseDb } from '@/lib/firebase/client';
import { stampBusinessDate } from '@/lib/kst-instant';
import {
  planConfirmedTripCredit,
  type ConfirmTripAction,
} from '@/lib/boarding/confirm-trip-count.shared';

export { planConfirmedTripCredit };
export type { ConfirmTripAction };

async function listTodayStampIds(userId: string, date: string): Promise<string[]> {
  const db = getFirebaseDb();
  const ids = new Set<string>();

  const stamps = await getDocs(collection(db, 'users', userId, 'stamps'));
  for (const stampDoc of stamps.docs) {
    if (stampBusinessDate(stampDoc.data()) === date) ids.add(stampDoc.id);
  }

  const history = await getDocs(collection(db, 'users', userId, 'stampHistory'));
  for (const historyDoc of history.docs) {
    const data = historyDoc.data();
    if (String(data.action ?? '') !== 'add') continue;
    if (stampBusinessDate(data) !== date) continue;
    const stampId = String(data.stampId ?? '').trim();
    if (stampId) ids.add(stampId);
  }

  return [...ids];
}

async function creditOne(input: {
  date: string;
  tripNumber: number;
  realId: string;
  hops: string[];
}): Promise<void> {
  const db = getFirebaseDb();
  const userRef = doc(db, 'users', input.realId);
  const stampIds = new Set<string>();
  let legacyAlreadyCounted = false;

  for (const hopId of input.hops) {
    const ids = await listTodayStampIds(hopId, input.date);
    for (const stampId of ids) stampIds.add(stampId);
    const hopSnap = await getDoc(doc(db, 'users', hopId));
    if (!hopSnap.exists()) continue;
    const hopData = hopSnap.data() as Record<string, unknown>;
    if (ids.some((stampId) => isTruthyFlag(hopData[couponAwardedField(stampId)]))) {
      legacyAlreadyCounted = true;
    }
  }

  let action: ConfirmTripAction = 'skip';

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists()) return;
    const plan = planConfirmedTripCredit({
      userData: snap.data() as Record<string, unknown>,
      date: input.date,
      tripNumber: input.tripNumber,
      todayStampIds: [...stampIds],
      legacyAlreadyCounted,
    });
    action = plan.action;
    if (plan.action === 'skip') return;
    if (plan.action === 'mark-only') {
      tx.update(userRef, { [plan.marker]: true });
      return;
    }
    tx.update(userRef, {
      tripCount: increment(1),
      [plan.marker]: true,
    });
  });

  if (action !== 'increment') return;

  await addDoc(collection(db, 'users', input.realId, 'logs'), {
    action: '승선 횟수 가산',
    detail: `출항 확정 ${input.date} ${input.tripNumber}항차`,
    timestamp: Timestamp.now(),
  });
}

/** 확정 명부에 있는 회원마다 승선 횟수를 한 번만 올린다. */
export async function creditTripCountsOnConfirm(input: {
  date: string;
  tripNumber: number;
  memberIds: string[];
}): Promise<void> {
  const seen = new Set<string>();
  for (const rawId of input.memberIds) {
    const id = String(rawId ?? '').trim();
    if (!id) continue;
    try {
      const canonical = await resolveCanonicalUserId(id);
      if (canonical.missing || !canonical.id) continue;
      if (seen.has(canonical.id)) continue;
      seen.add(canonical.id);
      const hops = canonical.hops.length ? canonical.hops : [canonical.id];
      await creditOne({
        date: input.date,
        tripNumber: input.tripNumber,
        realId: canonical.id,
        hops,
      });
    } catch (e) {
      console.error('승선 횟수 반영 실패:', id, e);
    }
  }
}
