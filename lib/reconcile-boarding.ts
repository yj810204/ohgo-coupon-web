import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { resolveCanonicalUserId } from '@/lib/firebase/canonical-user';
import { isTruthyFlag, reconcileLockId, tripCreditedField } from '@/lib/firebase/merged-to';
import { isQrTripAlreadyCredited } from '@/lib/stamps/credit-trip-bait';
import { stampBusinessDate } from '@/lib/kst-instant';
import { getTodayDate } from '@/lib/kst-date';
import { findCaptains } from '@/utils/find-captains';
import { notifyAllAdmins } from '@/utils/send-push';
import {
  classifyBoardingMember,
  collectRosterIds,
  type ReconcileClass,
} from '@/lib/reconcile-boarding.shared';

export { classifyBoardingMember, collectRosterIds };
export type { ReconcileClass };

export type ReconcileMemberResult = {
  rosterId: string;
  realId: string;
  name: string;
  classification: ReconcileClass;
  stampIds: string[];
  orphanUserId: string | null;
  credited: boolean;
  trip: number;
};

export type ReconcileReport = {
  date: string;
  trip: number | null;
  mode: 'report' | 'apply';
  counts: Record<ReconcileClass, number>;
  members: ReconcileMemberResult[];
  applied: { realId: string; action: string }[];
};

type StampHit = { id: string; userId: string; date: string };

async function listStampHitsForDate(userId: string, date: string): Promise<StampHit[]> {
  const db = getFirebaseDb();
  const hits = new Map<string, StampHit>();

  const stampSnap = await getDocs(collection(db, 'users', userId, 'stamps'));
  for (const d of stampSnap.docs) {
    const data = d.data();
    if (stampBusinessDate(data) === date) {
      hits.set(d.id, { id: d.id, userId, date });
    }
  }

  const historySnap = await getDocs(collection(db, 'users', userId, 'stampHistory'));
  for (const d of historySnap.docs) {
    const data = d.data();
    if (String(data.action ?? '') !== 'add') continue;
    const historyDate = stampBusinessDate(data);
    if (historyDate !== date) continue;
    const stampId = String(data.stampId ?? d.id);
    if (!hits.has(stampId)) hits.set(stampId, { id: stampId, userId, date });
  }

  return [...hits.values()];
}

function isCreditedOnUser(
  userData: Record<string, unknown> | null | undefined,
  stampIds: string[],
  date: string,
  trip: number
): boolean {
  if (!userData) return false;
  if (isTruthyFlag(userData[tripCreditedField(date, trip)])) return true;
  return stampIds.some((stampId) => isQrTripAlreadyCredited(userData, stampId));
}

export async function buildReconcileReport(input: {
  date?: string;
  tripNumber?: number | null;
  apply?: boolean;
  writeReportLog?: boolean;
}): Promise<ReconcileReport> {
  const date = input.date || getTodayDate();
  const apply = input.apply === true;
  const tripFilter = input.tripNumber ?? null;
  const db = getFirebaseDb();

  const attendanceSnap = await getDoc(doc(db, 'attendance', date));
  const attendance = attendanceSnap.exists() ? attendanceSnap.data() : {};
  const rosterIds = collectRosterIds({
    members: attendance.members,
    confirmedMembers: attendance.confirmedMembers,
    tripNumber: tripFilter,
  });

  const defaultTrip =
    tripFilter ??
    (typeof attendance.tripNumber === 'number' ? attendance.tripNumber : 1);

  const crew = await findCaptains();
  const crewIds = new Set<string>();
  for (const member of crew) {
    crewIds.add(member.uuid);
    const canonical = await resolveCanonicalUserId(member.uuid);
    if (!canonical.missing) crewIds.add(canonical.id);
  }

  const members: ReconcileMemberResult[] = [];
  const seenReal = new Set<string>();

  for (const rosterId of rosterIds) {
    const canonical = await resolveCanonicalUserId(rosterId);
    const realId = canonical.missing ? rosterId : canonical.id;
    if (crewIds.has(rosterId) || crewIds.has(realId)) continue;
    if (seenReal.has(realId)) continue;
    seenReal.add(realId);

    const hops = canonical.hops.length ? canonical.hops : [rosterId];
    const orphanIds = hops.filter((id) => id !== realId);
    const realHits = await listStampHitsForDate(realId, date);
    let orphanHits: StampHit[] = [];
    let orphanUserId: string | null = null;
    for (const orphanId of orphanIds) {
      const hits = await listStampHitsForDate(orphanId, date);
      if (hits.length) {
        orphanHits = orphanHits.concat(hits);
        orphanUserId = orphanId;
      }
    }

    const realUser = canonical.missing ? null : canonical.data;
    const credited = isCreditedOnUser(
      realUser,
      realHits.map((h) => h.id),
      date,
      defaultTrip
    );
    const classification = classifyBoardingMember({
      hasStampOnReal: realHits.length > 0,
      hasStampOnOrphan: orphanHits.length > 0,
      credited,
    });

    members.push({
      rosterId,
      realId,
      name: String(realUser?.name ?? ''),
      classification,
      stampIds: [...realHits, ...orphanHits].map((h) => h.id),
      orphanUserId,
      credited,
      trip: defaultTrip,
    });
  }

  const counts: Record<ReconcileClass, number> = {
    ORPHAN: 0,
    NO_TRIPCOUNT: 0,
    NO_STAMP: 0,
    OK: 0,
  };
  for (const row of members) counts[row.classification] += 1;

  const applied: { realId: string; action: string }[] = [];
  if (apply) {
    for (const row of members) {
      if (row.classification === 'OK' || row.classification === 'NO_STAMP') continue;
      const action = await applyReconcileMember({ date, trip: row.trip, row });
      if (action) applied.push({ realId: row.realId, action });
    }
  }

  const report: ReconcileReport = {
    date,
    trip: tripFilter,
    mode: apply ? 'apply' : 'report',
    counts,
    members,
    applied,
  };

  if (input.writeReportLog !== false) {
    try {
      await addDoc(collection(db, 'reconcileLogs'), {
        date,
        trip: tripFilter,
        mode: report.mode,
        counts,
        memberCount: members.length,
        applied,
        createdAt: Timestamp.now(),
      });
    } catch (e) {
      console.warn('reconcileLogs write skipped:', e);
    }
  }

  const issueCount = counts.ORPHAN + counts.NO_TRIPCOUNT + counts.NO_STAMP;
  if (issueCount > 0) {
    try {
      await notifyAllAdmins(
        `${date} 대사: 정상 ${counts.OK} · 스탬프없음 ${counts.NO_STAMP} · 승선미반영 ${counts.NO_TRIPCOUNT} · 병합계정 ${counts.ORPHAN}`,
        apply ? '승선 대사 적용' : '승선 대사 보고',
        'admin-main'
      );
    } catch (e) {
      console.warn('reconcile admin push:', e);
    }
  }

  return report;
}

async function applyReconcileMember(input: {
  date: string;
  trip: number;
  row: ReconcileMemberResult;
}): Promise<string | null> {
  const { date, trip, row } = input;
  const db = getFirebaseDb();
  const lockRef = doc(db, 'reconcile', reconcileLockId(date, trip, row.realId));
  let alreadyLocked = false;

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(lockRef);
    if (existing.exists()) {
      alreadyLocked = true;
      return;
    }
    tx.set(lockRef, {
      date,
      trip,
      realId: row.realId,
      rosterId: row.rosterId,
      classification: row.classification,
      createdAt: Timestamp.now(),
    });
  });

  if (row.classification === 'ORPHAN' && row.orphanUserId) {
    await moveOrphanStamps({
      date,
      fromId: row.orphanUserId,
      toId: row.realId,
    });
  }

  return alreadyLocked ? 'already-applied' : row.classification;
}

async function moveOrphanStamps(input: { date: string; fromId: string; toId: string }): Promise<void> {
  const db = getFirebaseDb();
  const fromStamps = await getDocs(collection(db, 'users', input.fromId, 'stamps'));
  for (const stampDoc of fromStamps.docs) {
    const data = stampDoc.data();
    if (stampBusinessDate(data) !== input.date) continue;
    const dest = doc(db, 'users', input.toId, 'stamps', stampDoc.id);
    const already = await getDoc(dest);
    if (!already.exists()) {
      await setDoc(dest, data);
    }
    await deleteDoc(stampDoc.ref);
  }

  const fromHistory = await getDocs(collection(db, 'users', input.fromId, 'stampHistory'));
  for (const historyDoc of fromHistory.docs) {
    const data = historyDoc.data();
    if (String(data.action ?? '') !== 'add') continue;
    if (stampBusinessDate(data) !== input.date) continue;
    await addDoc(collection(db, 'users', input.toId, 'stampHistory'), data);
    await deleteDoc(historyDoc.ref);
  }

  const fromUser = await getDoc(doc(db, 'users', input.fromId));
  const toUser = await getDoc(doc(db, 'users', input.toId));
  if (fromUser.exists() && toUser.exists()) {
    const fromData = fromUser.data();
    const toPatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fromData)) {
      if (!key.startsWith('couponAwardedFor_')) continue;
      if (toUser.data()[key]) continue;
      toPatch[key] = value;
    }
    if (Object.keys(toPatch).length) {
      const { updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'users', input.toId), toPatch);
    }
  }
}

export function summarizeReconcile(report: ReconcileReport): string {
  return [
    `${report.date} ${report.mode}`,
    `OK ${report.counts.OK}`,
    `NO_STAMP ${report.counts.NO_STAMP}`,
    `NO_TRIPCOUNT ${report.counts.NO_TRIPCOUNT}`,
    `ORPHAN ${report.counts.ORPHAN}`,
  ].join(' · ');
}
