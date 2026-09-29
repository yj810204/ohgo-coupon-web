import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { resolveCanonicalUserId } from '@/lib/firebase/canonical-user';
import { isTruthyFlag, tripCreditedField } from '@/lib/firebase/merged-to';
import { planConfirmedTripCredit } from '@/lib/boarding/confirm-trip-count.shared';
import {
  classifyBoardCheck,
  classifyBoardingMember,
  collectConfirmedRosterIds,
  collectRosterIds,
  correctionStampMarker,
  hasConfirmedTrip,
  listConfirmedTripNumbers,
  planMemberCorrection,
  type BoardCheckFlags,
  type BoardCheckKind,
  type CorrectionChoice,
  type PlannedCorrection,
} from '@/lib/reconcile-boarding.shared';
import {
  applyQrTripCreditOnce,
  isQrBaitAlreadyCredited,
  isQrTripAlreadyCredited,
} from '@/lib/stamps/credit-trip-bait';
import { stampBusinessDate } from '@/lib/kst-instant';
import { findCaptains } from '@/utils/find-captains';

export type BoardCheckMember = {
  rosterId: string;
  realId: string;
  name: string;
  isCrew: boolean;
  onRoster: boolean;
  hasStamp: boolean;
  hasOrphanStamp: boolean;
  tripCredited: boolean;
  baitAwarded: boolean;
  stampIds: string[];
  orphanUserId: string | null;
  trip: number;
  kind: BoardCheckKind;
};

export type BoardCheckReport = {
  date: string;
  trip: number;
  confirmed: boolean;
  confirmedTrips: number[];
  members: BoardCheckMember[];
  extras: BoardCheckMember[];
  counts: Record<BoardCheckKind, number>;
  missingStampCount: number;
};

type StampHit = { id: string; userId: string };

export async function listStampHitsForDate(userId: string, date: string): Promise<StampHit[]> {
  const db = getFirebaseDb();
  const hits = new Map<string, StampHit>();

  const stampSnap = await getDocs(collection(db, 'users', userId, 'stamps'));
  for (const d of stampSnap.docs) {
    if (stampBusinessDate(d.data()) === date) hits.set(d.id, { id: d.id, userId });
  }

  const historySnap = await getDocs(collection(db, 'users', userId, 'stampHistory'));
  for (const d of historySnap.docs) {
    const data = d.data();
    if (String(data.action ?? '') !== 'add') continue;
    if (stampBusinessDate(data) !== date) continue;
    const stampId = String(data.stampId ?? d.id);
    if (!hits.has(stampId)) hits.set(stampId, { id: stampId, userId });
  }

  return [...hits.values()];
}

export function flagsFromHits(input: {
  onRoster: boolean;
  isCrew: boolean;
  realHits: StampHit[];
  orphanHits: StampHit[];
  userData: Record<string, unknown> | null;
  date: string;
  trip: number;
}): BoardCheckFlags & { tripCredited: boolean; baitAwarded: boolean } {
  const stampIds = [...input.realHits, ...input.orphanHits].map((h) => h.id);
  const tripCredited =
    isTruthyFlag(input.userData?.[tripCreditedField(input.date, input.trip)]) ||
    stampIds.some((id) => isQrTripAlreadyCredited(input.userData, id));
  const baitAwarded = stampIds.some((id) => isQrBaitAlreadyCredited(input.userData, id));
  return {
    onRoster: input.onRoster,
    isCrew: input.isCrew,
    hasStamp: input.realHits.length > 0,
    hasOrphanStamp: input.orphanHits.length > 0,
    tripCredited,
    baitAwarded,
  };
}

async function crewIdSet(): Promise<Set<string>> {
  const crew = await findCaptains();
  const ids = new Set<string>();
  for (const member of crew) {
    ids.add(member.uuid);
    const canonical = await resolveCanonicalUserId(member.uuid);
    if (!canonical.missing) ids.add(canonical.id);
  }
  return ids;
}

async function inspectUser(input: {
  rosterId: string;
  date: string;
  trip: number;
  onRoster: boolean;
  crewIds: Set<string>;
}): Promise<BoardCheckMember> {
  const canonical = await resolveCanonicalUserId(input.rosterId);
  const realId = canonical.missing ? input.rosterId : canonical.id;
  const isCrew = input.crewIds.has(input.rosterId) || input.crewIds.has(realId);
  const hops = canonical.hops.length ? canonical.hops : [input.rosterId];
  const orphanIds = hops.filter((id) => id !== realId);
  const realHits = await listStampHitsForDate(realId, input.date);
  let orphanHits: StampHit[] = [];
  let orphanUserId: string | null = null;
  for (const orphanId of orphanIds) {
    const hits = await listStampHitsForDate(orphanId, input.date);
    if (hits.length) {
      orphanHits = orphanHits.concat(hits);
      orphanUserId = orphanId;
    }
  }
  const userData = canonical.missing ? null : (canonical.data as Record<string, unknown>);
  const flags = flagsFromHits({
    onRoster: input.onRoster,
    isCrew,
    realHits,
    orphanHits,
    userData,
    date: input.date,
    trip: input.trip,
  });
  return {
    rosterId: input.rosterId,
    realId,
    name: String(userData?.name ?? ''),
    isCrew,
    onRoster: input.onRoster,
    hasStamp: flags.hasStamp,
    hasOrphanStamp: flags.hasOrphanStamp,
    tripCredited: flags.tripCredited,
    baitAwarded: flags.baitAwarded,
    stampIds: [...realHits, ...orphanHits].map((h) => h.id),
    orphanUserId,
    trip: input.trip,
    kind: classifyBoardCheck(flags),
  };
}

export async function buildBoardCheckReport(input: {
  date: string;
  tripNumber: number;
  includeExtras?: boolean;
}): Promise<BoardCheckReport> {
  const date = input.date;
  const trip = input.tripNumber;
  const db = getFirebaseDb();
  const attendanceSnap = await getDoc(doc(db, 'attendance', date));
  const attendance = attendanceSnap.exists() ? attendanceSnap.data() : {};
  const rosterIds = collectConfirmedRosterIds(attendance.confirmedMembers, trip);
  const crewIds = await crewIdSet();
  const members: BoardCheckMember[] = [];
  const seen = new Set<string>();

  for (const rosterId of rosterIds) {
    const row = await inspectUser({ rosterId, date, trip, onRoster: true, crewIds });
    if (seen.has(row.realId)) continue;
    seen.add(row.realId);
    members.push(row);
  }

  const extras: BoardCheckMember[] = [];
  if (input.includeExtras !== false) {
    const usersSnap = await getDocs(collection(db, 'users'));
    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      if (data.mergedTo) continue;
      if (seen.has(userDoc.id) || crewIds.has(userDoc.id)) continue;
      const lastDate = stampBusinessDate({ timestamp: data.lastStampTime });
      if (lastDate !== date) continue;
      const row = await inspectUser({
        rosterId: userDoc.id,
        date,
        trip,
        onRoster: false,
        crewIds,
      });
      if (!row.hasStamp && !row.hasOrphanStamp) continue;
      if (seen.has(row.realId)) continue;
      seen.add(row.realId);
      extras.push(row);
    }
  }

  const counts: Record<BoardCheckKind, number> = {
    ORPHAN: 0,
    NO_STAMP: 0,
    NO_BAIT: 0,
    NO_TRIP: 0,
    EXTRA: 0,
    OK: 0,
  };
  for (const row of [...members, ...extras]) counts[row.kind] += 1;

  return {
    date,
    trip,
    confirmed: hasConfirmedTrip(attendance.confirmedMembers, trip),
    confirmedTrips: listConfirmedTripNumbers(attendance.confirmedMembers),
    members,
    extras,
    counts,
    missingStampCount: members.filter((m) => !m.isCrew && !m.hasStamp && !m.hasOrphanStamp).length,
  };
}

export async function applyBoardCorrections(input: {
  date: string;
  tripNumber: number;
  actorId: string;
  actorName: string;
  items: { realId: string; choice: CorrectionChoice }[];
}): Promise<{ applied: { realId: string; did: PlannedCorrection }[]; skipped: string[] }> {
  const report = await buildBoardCheckReport({
    date: input.date,
    tripNumber: input.tripNumber,
    includeExtras: true,
  });
  const byId = new Map<string, BoardCheckMember>();
  for (const row of [...report.members, ...report.extras]) byId.set(row.realId, row);

  const applied: { realId: string; did: PlannedCorrection }[] = [];
  const skipped: string[] = [];

  for (const item of input.items) {
    const row = byId.get(item.realId);
    if (!row) {
      skipped.push(item.realId);
      continue;
    }
    const flags: BoardCheckFlags = {
      onRoster: row.onRoster,
      isCrew: row.isCrew,
      hasStamp: row.hasStamp,
      hasOrphanStamp: row.hasOrphanStamp,
      tripCredited: row.tripCredited,
      baitAwarded: row.baitAwarded,
    };
    const did = planMemberCorrection(flags, item.choice);
    if (!did.addStamp && !did.grantBait && !did.creditTrip && !did.moveOrphan) {
      skipped.push(item.realId);
      continue;
    }

    if (did.moveOrphan && row.orphanUserId) {
      await moveOrphanStamps({ date: input.date, fromId: row.orphanUserId, toId: row.realId });
    }

    let stampId = row.stampIds[0] ?? null;
    if (did.addStamp) {
      stampId = await addAdminStampOnce({
        userId: row.realId,
        date: input.date,
        trip: input.tripNumber,
        actorName: input.actorName,
      });
    } else if (!stampId) {
      const hits = await listStampHitsForDate(row.realId, input.date);
      stampId = hits[0]?.id ?? null;
    }

    if (did.grantBait && stampId) {
      await applyQrTripCreditOnce({
        userId: row.realId,
        stampId,
        date: input.date,
      });
    }

    if (did.creditTrip) {
      await creditTripOnce({
        userId: row.realId,
        date: input.date,
        trip: input.tripNumber,
      });
    }

    await writeUserAudit(row.realId, input, did);
    applied.push({ realId: row.realId, did });
  }

  try {
    const db = getFirebaseDb();
    await addDoc(collection(db, 'reconcileLogs'), {
      date: input.date,
      trip: input.tripNumber,
      mode: 'correct',
      actorId: input.actorId,
      actorName: input.actorName,
      applied,
      createdAt: Timestamp.now(),
    });
  } catch (e) {
    console.warn('reconcileLogs write skipped:', e);
  }

  return { applied, skipped };
}

async function addAdminStampOnce(input: {
  userId: string;
  date: string;
  trip: number;
  actorName: string;
}): Promise<string | null> {
  const existing = await listStampHitsForDate(input.userId, input.date);
  if (existing.length) return existing[0]!.id;

  const db = getFirebaseDb();
  const userRef = doc(db, 'users', input.userId);
  const marker = correctionStampMarker(input.date, input.trip);
  const stampAt = new Date(`${input.date}T12:00:00+09:00`);
  const stampRef = doc(collection(db, 'users', input.userId, 'stamps'));
  let created = false;

  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) throw new Error('회원 정보를 찾을 수 없습니다.');
    if (isTruthyFlag(userSnap.data()[marker])) return;
    tx.set(stampRef, {
      date: input.date,
      method: 'ADMIN',
      timestamp: stampAt,
    });
    tx.update(userRef, {
      [marker]: true,
      lastStampTime: stampAt,
    });
    created = true;
  });

  const afterHits = await listStampHitsForDate(input.userId, input.date);
  const stampId = afterHits[0]?.id ?? (created ? stampRef.id : null);
  if (!created) return stampId;

  await addDoc(collection(db, 'users', input.userId, 'stampHistory'), {
    action: 'add',
    stampId,
    date: input.date,
    method: 'ADMIN',
    timestamp: Timestamp.now(),
    message: `ADMIN 방식으로 스탬프 적립 (출항 확정 보정 ${input.date} ${input.trip}항차)`,
  });
  await addDoc(collection(db, 'users', input.userId, 'logs'), {
    action: '스탬프 적립',
    detail: `출항 확정 보정 ${input.date} ${input.trip}항차 (${input.actorName})`,
    timestamp: Timestamp.now(),
  });

  const stampSnap = await getDocs(collection(db, 'users', input.userId, 'stamps'));
  if (stampSnap.size >= 10) {
    const { issueCoupon, clearStamps } = await import('@/utils/stamp-service.firebase');
    await issueCoupon(input.userId);
    await clearStamps(input.userId);
  }

  return stampId;
}

async function creditTripOnce(input: { userId: string; date: string; trip: number }): Promise<void> {
  const db = getFirebaseDb();
  const userRef = doc(db, 'users', input.userId);
  const hits = await listStampHitsForDate(input.userId, input.date);
  let action: 'skip' | 'mark-only' | 'increment' = 'skip';

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists()) return;
    const plan = planConfirmedTripCredit({
      userData: snap.data() as Record<string, unknown>,
      date: input.date,
      tripNumber: input.trip,
      todayStampIds: hits.map((h) => h.id),
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

  if (action === 'increment') {
    await addDoc(collection(db, 'users', input.userId, 'logs'), {
      action: '승선 횟수 가산',
      detail: `출항 확정 보정 ${input.date} ${input.trip}항차`,
      timestamp: Timestamp.now(),
    });
  }
}

async function writeUserAudit(
  userId: string,
  input: { date: string; tripNumber: number; actorId: string; actorName: string },
  did: PlannedCorrection
): Promise<void> {
  const parts = [
    did.moveOrphan ? '병합스탬프이동' : '',
    did.addStamp ? '스탬프' : '',
    did.grantBait ? '미끼' : '',
    did.creditTrip ? '승선일수' : '',
  ].filter(Boolean);
  try {
    const db = getFirebaseDb();
    await addDoc(collection(db, 'users', userId, 'logs'), {
      action: '출항 확정 보정',
      detail: `${input.date} ${input.tripNumber}항차 ${parts.join(', ')} (${input.actorName})`,
      actorId: input.actorId,
      timestamp: Timestamp.now(),
    });
  } catch (e) {
    console.warn('board-check audit:', e);
  }
}

export async function moveOrphanStamps(input: {
  date: string;
  fromId: string;
  toId: string;
}): Promise<void> {
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
      if (!key.startsWith('couponAwardedFor_') && !key.startsWith('baitAwardedFor_')) continue;
      if (toUser.data()[key]) continue;
      toPatch[key] = value;
    }
    if (Object.keys(toPatch).length) {
      const { updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'users', input.toId), toPatch);
    }
  }
}

export function toReconcileClass(row: BoardCheckMember) {
  return classifyBoardingMember({
    hasStampOnReal: row.hasStamp,
    hasStampOnOrphan: row.hasOrphanStamp,
    credited: row.tripCredited,
  });
}

export { collectRosterIds, collectConfirmedRosterIds, planMemberCorrection };
