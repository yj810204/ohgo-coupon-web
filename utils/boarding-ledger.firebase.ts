import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { resolveCanonicalUserId } from '@/lib/firebase/canonical-user';
import {
  LEDGER_COLLECTION,
  LEDGER_TRIPS_COLLECTION,
  countMemberBoardings,
  isCounted,
  isValidDate,
  isValidTrip,
  ledgerDocId,
  mergeEntry,
  planMergeMoves,
  tripDocId,
  type BoardingRange,
  type LedgerEntry,
  type LedgerTripSummary,
} from '@/lib/boarding-ledger.shared';

/**
 * sync: users.tripCount 를 원장 개수로 다시 센다. 과거 데이터를 채우고 일괄 동기화한 뒤에 켠다.
 * 그 전(legacy)에는 지금처럼 +1/-1 로만 움직인다.
 */
export function isLedgerTripCountSync(): boolean {
  return process.env.NEXT_PUBLIC_LEDGER_TRIPCOUNT === 'sync';
}

export type LedgerActor = { userId: string; name: string };

function actorLabel(actor: LedgerActor): string {
  return actor.name || actor.userId || '알 수 없음';
}

function entryFromDoc(id: string, data: Record<string, unknown>): LedgerEntry {
  return {
    id,
    date: String(data.date ?? ''),
    tripNumber: Number(data.tripNumber) || 1,
    personKey: String(data.personKey ?? ''),
    userId: data.userId ? String(data.userId) : null,
    name: String(data.name ?? ''),
    birth: String(data.birth ?? ''),
    role: data.role === 'crew' ? 'crew' : 'passenger',
    status: data.status === 'void' ? 'void' : data.status === 'unmatched' ? 'unmatched' : 'matched',
    sources: Array.isArray(data.sources) ? (data.sources as LedgerEntry['sources']) : [],
    matchMethod: (data.matchMethod as LedgerEntry['matchMethod']) ?? 'none',
    needsReview: Boolean(data.needsReview),
    evidence: (data.evidence as LedgerEntry['evidence']) ?? {},
    voidReason: data.voidReason ? String(data.voidReason) : undefined,
    createdBy: String(data.createdBy ?? ''),
    updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
  };
}

function tripFromDoc(id: string, data: Record<string, unknown>): LedgerTripSummary {
  return {
    id,
    date: String(data.date ?? ''),
    tripNumber: Number(data.tripNumber) || 1,
    rosterImageUrl: String(data.rosterImageUrl ?? ''),
    ocrStatus: (data.ocrStatus as LedgerTripSummary['ocrStatus']) ?? 'none',
    matched: Number(data.matched) || 0,
    unmatched: Number(data.unmatched) || 0,
    crew: Number(data.crew) || 0,
    onlyInConfirmed: Array.isArray(data.onlyInConfirmed) ? data.onlyInConfirmed.map(String) : [],
    onlyInLedger: Array.isArray(data.onlyInLedger) ? data.onlyInLedger.map(String) : [],
    needsReview: Number(data.needsReview) || 0,
    reviewed: Boolean(data.reviewed),
    reviewedBy: data.reviewedBy ? String(data.reviewedBy) : undefined,
  };
}

function entryToDoc(entry: LedgerEntry): Record<string, unknown> {
  const { voidReason, updatedBy, ...rest } = entry;
  delete (rest as Partial<LedgerEntry>).id;
  return {
    ...rest,
    ...(voidReason ? { voidReason } : {}),
    ...(updatedBy ? { updatedBy } : {}),
  };
}

function sortDesc(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.tripNumber - a.tripNumber
  );
}

export async function listMemberBoardings(userId: string): Promise<LedgerEntry[]> {
  const db = getFirebaseDb();
  const canonical = await resolveCanonicalUserId(userId);
  const id = canonical.missing ? userId : canonical.id;
  const snap = await getDocs(query(collection(db, LEDGER_COLLECTION), where('userId', '==', id)));
  return sortDesc(snap.docs.map((d) => entryFromDoc(d.id, d.data())));
}

export async function listBoardingsInRange(range: BoardingRange): Promise<LedgerEntry[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(
      collection(db, LEDGER_COLLECTION),
      where('date', '>=', range.startDate),
      where('date', '<=', range.endDate)
    )
  );
  return sortDesc(snap.docs.map((d) => entryFromDoc(d.id, d.data())));
}

export async function listTripEntries(date: string, tripNumber: number): Promise<LedgerEntry[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(query(collection(db, LEDGER_COLLECTION), where('date', '==', date)));
  return snap.docs
    .map((d) => entryFromDoc(d.id, d.data()))
    .filter((e) => e.tripNumber === tripNumber)
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'ko') : a.role === 'crew' ? -1 : 1));
}

export async function listLedgerTrips(range: BoardingRange): Promise<LedgerTripSummary[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(
      collection(db, LEDGER_TRIPS_COLLECTION),
      where('date', '>=', range.startDate),
      where('date', '<=', range.endDate)
    )
  );
  return snap.docs
    .map((d) => tripFromDoc(d.id, d.data()))
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.tripNumber - a.tripNumber));
}

export async function getLedgerTrip(date: string, tripNumber: number): Promise<LedgerTripSummary | null> {
  const snap = await getDoc(doc(getFirebaseDb(), LEDGER_TRIPS_COLLECTION, tripDocId(date, tripNumber)));
  return snap.exists() ? tripFromDoc(snap.id, snap.data()) : null;
}

async function writeMemberLog(userId: string | null, action: string, detail: string): Promise<void> {
  if (!userId) return;
  try {
    await addDoc(collection(getFirebaseDb(), 'users', userId, 'logs'), {
      action,
      detail,
      timestamp: Timestamp.now(),
    });
  } catch (e) {
    console.warn('boarding-ledger log:', e);
  }
}

/** 원장 개수로 users.tripCount 를 맞춘다. legacy 모드에서는 아무것도 하지 않는다. */
export async function syncTripCount(userId: string): Promise<number | null> {
  if (!isLedgerTripCountSync()) return null;
  const entries = await listMemberBoardings(userId);
  const count = countMemberBoardings(entries, userId);
  await updateDoc(doc(getFirebaseDb(), 'users', userId), { tripCount: count, tripCountSyncedAt: serverTimestamp() });
  return count;
}

async function applyTripCountEffect(userId: string | null, delta: number): Promise<void> {
  if (!userId) return;
  if (isLedgerTripCountSync()) {
    await syncTripCount(userId);
    return;
  }
  if (delta === 0) return;
  const ref = doc(getFirebaseDb(), 'users', userId);
  const snap = await getDoc(ref);
  const current = Number(snap.data()?.tripCount) || 0;
  await updateDoc(ref, { tripCount: delta < 0 ? Math.max(0, current + delta) : increment(delta) });
}

async function upsertEntries(entries: LedgerEntry[]): Promise<LedgerEntry[]> {
  const db = getFirebaseDb();
  const existing = await Promise.all(entries.map((e) => getDoc(doc(db, LEDGER_COLLECTION, e.id))));
  const merged = entries.map((e, i) => {
    const snap = existing[i]!;
    return mergeEntry(snap.exists() ? entryFromDoc(snap.id, snap.data()) : null, e);
  });
  const batch = writeBatch(db);
  merged.forEach((e, i) => {
    batch.set(
      doc(db, LEDGER_COLLECTION, e.id),
      { ...entryToDoc(e), updatedAt: serverTimestamp(), ...(existing[i]!.exists() ? {} : { createdAt: serverTimestamp() }) },
      { merge: true }
    );
  });
  await batch.commit();
  return merged;
}

/**
 * 출항 확정 순간의 명부로 원장을 쓴다. 명부 이미지를 만든 그 명단이라 OCR 없이 정확하다.
 * 실패해도 출항 확정은 막지 않도록 호출하는 쪽에서 감싼다.
 */
export async function recordConfirmedTrip(input: {
  date: string;
  tripNumber: number;
  memberIds: string[];
  rosterImageUrl: string;
  actor: LedgerActor;
}): Promise<void> {
  if (!isValidDate(input.date) || !isValidTrip(input.tripNumber)) return;
  const db = getFirebaseDb();
  const seen = new Set<string>();
  const entries: LedgerEntry[] = [];
  for (const rawId of input.memberIds) {
    const id = String(rawId ?? '').trim();
    if (!id) continue;
    const canonical = await resolveCanonicalUserId(id);
    if (canonical.missing || !canonical.id || seen.has(canonical.id)) continue;
    seen.add(canonical.id);
    const data = (canonical.data ?? {}) as Record<string, unknown>;
    entries.push({
      id: ledgerDocId(input.date, input.tripNumber, canonical.id),
      date: input.date,
      tripNumber: input.tripNumber,
      personKey: canonical.id,
      userId: canonical.id,
      name: String(data.name ?? '').trim(),
      birth: String(data.dob ?? ''),
      role: data.role === 'captain' || data.role === 'sailor' ? 'crew' : 'passenger',
      status: 'matched',
      sources: ['CONFIRM'],
      matchMethod: 'confirm',
      needsReview: false,
      evidence: input.rosterImageUrl ? { rosterImageUrl: input.rosterImageUrl } : {},
      createdBy: actorLabel(input.actor),
    });
  }
  if (!entries.length) return;
  await upsertEntries(entries);

  const passengers = entries.filter((e) => e.role === 'passenger').length;
  await setDoc(
    doc(db, LEDGER_TRIPS_COLLECTION, tripDocId(input.date, input.tripNumber)),
    {
      date: input.date,
      tripNumber: input.tripNumber,
      rosterImageUrl: input.rosterImageUrl,
      ocrStatus: 'confirm',
      matched: passengers,
      unmatched: 0,
      crew: entries.length - passengers,
      onlyInConfirmed: [],
      onlyInLedger: [],
      needsReview: 0,
      reviewed: true,
      reviewedBy: actorLabel(input.actor),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (isLedgerTripCountSync()) {
    for (const e of entries) await syncTripCount(e.userId!);
  }
}

export async function addManualBoarding(input: {
  userId: string;
  date: string;
  tripNumber: number;
  reason: string;
  actor: LedgerActor;
}): Promise<LedgerEntry> {
  if (!isValidDate(input.date) || !isValidTrip(input.tripNumber)) throw new Error('날짜와 항차를 확인해 주세요.');
  const canonical = await resolveCanonicalUserId(input.userId);
  if (canonical.missing || !canonical.id) throw new Error('회원 정보를 찾을 수 없습니다.');
  const userId = canonical.id;
  const data = (canonical.data ?? {}) as Record<string, unknown>;
  const id = ledgerDocId(input.date, input.tripNumber, userId);
  const before = await getDoc(doc(getFirebaseDb(), LEDGER_COLLECTION, id));
  const wasCounted = before.exists() && isCounted(entryFromDoc(before.id, before.data()));
  if (wasCounted) throw new Error('이미 그 날짜·항차 승선기록이 있습니다.');

  const entry: LedgerEntry = {
    id,
    date: input.date,
    tripNumber: input.tripNumber,
    personKey: userId,
    userId,
    name: String(data.name ?? '').trim(),
    birth: String(data.dob ?? ''),
    role: data.role === 'captain' || data.role === 'sailor' ? 'crew' : 'passenger',
    status: 'matched',
    sources: ['ADMIN'],
    matchMethod: 'manual',
    needsReview: false,
    evidence: {},
    createdBy: actorLabel(input.actor),
    updatedBy: actorLabel(input.actor),
  };
  const final: LedgerEntry = before.exists()
    ? {
        ...mergeEntry(entryFromDoc(before.id, before.data()), entry),
        status: 'matched',
        matchMethod: 'manual',
        needsReview: false,
        voidReason: undefined,
      }
    : entry;
  await setDoc(
    doc(getFirebaseDb(), LEDGER_COLLECTION, id),
    {
      ...entryToDoc(final),
      voidReason: null,
      reason: input.reason,
      updatedAt: serverTimestamp(),
      ...(before.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true }
  );
  await writeMemberLog(
    userId,
    '승선기록 · 추가',
    `${input.date} ${input.tripNumber}항차 (${input.reason || '사유 없음'}, ${actorLabel(input.actor)})`
  );
  await applyTripCountEffect(userId, 1);
  await refreshTripSummary(input.date, input.tripNumber);
  return entry;
}

async function loadEntry(id: string): Promise<LedgerEntry> {
  const snap = await getDoc(doc(getFirebaseDb(), LEDGER_COLLECTION, id));
  if (!snap.exists()) throw new Error('승선기록을 찾을 수 없습니다.');
  return entryFromDoc(snap.id, snap.data());
}

export async function voidBoarding(input: { id: string; reason: string; actor: LedgerActor }): Promise<void> {
  const entry = await loadEntry(input.id);
  const wasCounted = isCounted(entry);
  await updateDoc(doc(getFirebaseDb(), LEDGER_COLLECTION, input.id), {
    status: 'void',
    voidReason: input.reason || '제외',
    needsReview: false,
    updatedBy: actorLabel(input.actor),
    updatedAt: serverTimestamp(),
  });
  await writeMemberLog(
    entry.userId,
    '승선기록 · 제외',
    `${entry.date} ${entry.tripNumber}항차 (${input.reason || '사유 없음'}, ${actorLabel(input.actor)})`
  );
  if (wasCounted) await applyTripCountEffect(entry.userId, -1);
  await refreshTripSummary(entry.date, entry.tripNumber);
}

export async function restoreBoarding(input: { id: string; actor: LedgerActor }): Promise<void> {
  const entry = await loadEntry(input.id);
  if (entry.status !== 'void') return;
  const restored: LedgerEntry = { ...entry, status: entry.userId ? 'matched' : 'unmatched', needsReview: false };
  await updateDoc(doc(getFirebaseDb(), LEDGER_COLLECTION, input.id), {
    status: restored.status,
    voidReason: null,
    needsReview: false,
    matchMethod: 'manual',
    updatedBy: actorLabel(input.actor),
    updatedAt: serverTimestamp(),
  });
  await writeMemberLog(
    entry.userId,
    '승선기록 · 추가',
    `${entry.date} ${entry.tripNumber}항차 제외 취소 (${actorLabel(input.actor)})`
  );
  if (isCounted(restored)) await applyTripCountEffect(entry.userId, 1);
  await refreshTripSummary(entry.date, entry.tripNumber);
}

/** 검토 후 맞다고 확인. 스탬프 추정 행은 이때부터 집계에 들어간다. */
export async function confirmBoarding(input: { id: string; actor: LedgerActor }): Promise<void> {
  const entry = await loadEntry(input.id);
  const wasCounted = isCounted(entry);
  await updateDoc(doc(getFirebaseDb(), LEDGER_COLLECTION, input.id), {
    needsReview: false,
    matchMethod: 'manual',
    updatedBy: actorLabel(input.actor),
    updatedAt: serverTimestamp(),
  });
  const nowCounted = isCounted({ ...entry, needsReview: false });
  if (!wasCounted && nowCounted) {
    await writeMemberLog(entry.userId, '승선기록 · 추가', `${entry.date} ${entry.tripNumber}항차 검토 확인 (${actorLabel(input.actor)})`);
    await applyTripCountEffect(entry.userId, 1);
  }
  await refreshTripSummary(entry.date, entry.tripNumber);
}

/** 미매칭·잘못 맞춘 행을 다른 회원으로 연결한다. */
export async function linkBoardingToMember(input: { id: string; userId: string; actor: LedgerActor }): Promise<void> {
  const entry = await loadEntry(input.id);
  const canonical = await resolveCanonicalUserId(input.userId);
  if (canonical.missing || !canonical.id) throw new Error('회원 정보를 찾을 수 없습니다.');
  const userId = canonical.id;
  if (entry.userId === userId) {
    await confirmBoarding({ id: input.id, actor: input.actor });
    return;
  }
  const data = (canonical.data ?? {}) as Record<string, unknown>;
  const db = getFirebaseDb();
  const targetId = ledgerDocId(entry.date, entry.tripNumber, userId);
  const targetSnap = await getDoc(doc(db, LEDGER_COLLECTION, targetId));
  const moved: LedgerEntry = {
    ...entry,
    id: targetId,
    personKey: userId,
    userId,
    name: String(data.name ?? entry.name).trim(),
    birth: String(data.dob ?? entry.birth),
    role: data.role === 'captain' || data.role === 'sailor' ? 'crew' : 'passenger',
    status: 'matched',
    matchMethod: 'manual',
    needsReview: false,
    updatedBy: actorLabel(input.actor),
  };
  const target = targetSnap.exists() ? entryFromDoc(targetSnap.id, targetSnap.data()) : null;
  const final = target ? { ...mergeEntry(target, moved), status: 'matched' as const, matchMethod: 'manual' as const, needsReview: false } : moved;
  await setDoc(
    doc(db, LEDGER_COLLECTION, targetId),
    { ...entryToDoc(final), voidReason: null, updatedAt: serverTimestamp(), ...(target ? {} : { createdAt: serverTimestamp() }) },
    { merge: true }
  );
  await deleteDoc(doc(db, LEDGER_COLLECTION, entry.id));

  const detail = `${entry.date} ${entry.tripNumber}항차 명부 연결 (${actorLabel(input.actor)})`;
  const targetWasCounted = target ? isCounted(target) : false;
  if (!targetWasCounted) {
    await writeMemberLog(userId, '승선기록 · 추가', detail);
    await applyTripCountEffect(userId, 1);
  }
  if (entry.userId && isCounted(entry)) {
    await writeMemberLog(entry.userId, '승선기록 · 제외', `${entry.date} ${entry.tripNumber}항차 다른 회원으로 연결 (${actorLabel(input.actor)})`);
    await applyTripCountEffect(entry.userId, -1);
  }
  await refreshTripSummary(entry.date, entry.tripNumber);
}

function tripCounts(entries: LedgerEntry[]) {
  const counted = entries.filter(isCounted);
  return {
    matched: counted.filter((e) => e.role === 'passenger' && e.status === 'matched').length,
    unmatched: counted.filter((e) => e.status === 'unmatched').length,
    crew: counted.filter((e) => e.role === 'crew').length,
    needsReview: counted.filter((e) => e.needsReview && e.status !== 'unmatched').length,
  };
}

/** 행을 고친 뒤 항차 요약의 개수를 다시 맞춘다. */
async function refreshTripSummary(date: string, tripNumber: number): Promise<void> {
  const ref = doc(getFirebaseDb(), LEDGER_TRIPS_COLLECTION, tripDocId(date, tripNumber));
  const [entries, snap] = await Promise.all([listTripEntries(date, tripNumber), getDoc(ref)]);
  await setDoc(
    ref,
    {
      date,
      tripNumber,
      ...tripCounts(entries),
      ...(snap.exists() ? {} : { rosterImageUrl: '', ocrStatus: 'none', onlyInConfirmed: [], onlyInLedger: [], reviewed: false }),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function setTripReviewed(input: {
  date: string;
  tripNumber: number;
  reviewed: boolean;
  actor: LedgerActor;
}): Promise<void> {
  const entries = await listTripEntries(input.date, input.tripNumber);
  await setDoc(
    doc(getFirebaseDb(), LEDGER_TRIPS_COLLECTION, tripDocId(input.date, input.tripNumber)),
    {
      date: input.date,
      tripNumber: input.tripNumber,
      reviewed: input.reviewed,
      reviewedBy: input.reviewed ? actorLabel(input.actor) : null,
      ...tripCounts(entries),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** 계정 병합 때 없어지는 계정의 원장 행을 남는 계정으로 옮긴다. */
export async function moveLedgerOnMerge(fromUserId: string, toUserId: string): Promise<void> {
  const db = getFirebaseDb();
  const [fromSnap, toSnap] = await Promise.all([
    getDocs(query(collection(db, LEDGER_COLLECTION), where('userId', '==', fromUserId))),
    getDocs(query(collection(db, LEDGER_COLLECTION), where('userId', '==', toUserId))),
  ]);
  if (fromSnap.empty) return;
  const target = new Map(toSnap.docs.map((d) => [d.id, entryFromDoc(d.id, d.data())]));
  const plan = planMergeMoves(
    fromSnap.docs.map((d) => entryFromDoc(d.id, d.data())),
    toUserId,
    target
  );
  const batch = writeBatch(db);
  for (const e of plan.upsert) {
    batch.set(doc(db, LEDGER_COLLECTION, e.id), { ...entryToDoc(e), updatedAt: serverTimestamp() }, { merge: true });
  }
  for (const id of plan.remove) batch.delete(doc(db, LEDGER_COLLECTION, id));
  await batch.commit();
}
