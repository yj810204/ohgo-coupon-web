import { Timestamp, addDoc, collection, doc, getDoc, runTransaction } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { reconcileLockId } from '@/lib/firebase/merged-to';
import { getTodayDate } from '@/lib/kst-date';
import { notifyAllAdmins } from '@/utils/send-push';
import {
  classifyBoardingMember,
  collectRosterIds,
  listConfirmedTripNumbers,
  type ReconcileClass,
} from '@/lib/reconcile-boarding.shared';
import { buildBoardCheckReport, moveOrphanStamps, toReconcileClass } from '@/lib/board-check';

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
  const confirmedTrips = listConfirmedTripNumbers(attendance.confirmedMembers);
  const tripsToScan =
    tripFilter != null ? [tripFilter] : confirmedTrips.length ? confirmedTrips : [];

  const members: ReconcileMemberResult[] = [];
  const seen = new Set<string>();

  for (const trip of tripsToScan) {
    const check = await buildBoardCheckReport({
      date,
      tripNumber: trip,
      includeExtras: false,
    });
    for (const row of check.members) {
      if (row.isCrew) continue;
      const key = `${row.realId}:${row.trip}`;
      if (seen.has(key)) continue;
      seen.add(key);
      members.push({
        rosterId: row.rosterId,
        realId: row.realId,
        name: row.name,
        classification: toReconcileClass(row),
        stampIds: row.stampIds,
        orphanUserId: row.orphanUserId,
        credited: row.tripCredited,
        trip: row.trip,
      });
    }
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

export function summarizeReconcile(report: ReconcileReport): string {
  return [
    `${report.date} ${report.mode}`,
    `OK ${report.counts.OK}`,
    `NO_STAMP ${report.counts.NO_STAMP}`,
    `NO_TRIPCOUNT ${report.counts.NO_TRIPCOUNT}`,
    `ORPHAN ${report.counts.ORPHAN}`,
  ].join(' · ');
}
