import {
  Timestamp,
  collection,
  doc,
  documentId,
  endAt,
  getDoc,
  getDocs,
  orderBy,
  query,
  startAt,
  where,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { followMergedToChain } from '@/lib/firebase/merged-to';
import { stampBusinessDate } from '@/lib/kst-instant';
import {
  countTripCreditedInRange,
  eachDateInRange,
  isDateInRange,
  kstRangeInstants,
  parseAttendanceTrips,
  sortTripsDesc,
  summarizeMembers,
  type BoardingDateRange,
  type BoardingTrip,
  type MemberRangeSummary,
} from '@/lib/boarding-range';

export type BoardingRangeResult = {
  range: BoardingDateRange;
  trips: BoardingTrip[];
  members: MemberRangeSummary[];
  totals: {
    trips: number;
    tripsWithoutList: number;
    boardings: number;
    members: number;
    stamps: number;
  };
  names: Record<string, string>;
  canonical: Record<string, string>;
};

type UserDoc = { mergedTo?: string | null; data: Record<string, unknown> } | null;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

async function loadDateDocs(
  name: 'attendance' | 'trips',
  range: BoardingDateRange
): Promise<Map<string, Record<string, unknown>>> {
  const db = getFirebaseDb();
  const out = new Map<string, Record<string, unknown>>();
  try {
    const snap = await getDocs(
      query(collection(db, name), orderBy(documentId()), startAt(range.startDate), endAt(range.endDate))
    );
    for (const d of snap.docs) {
      if (isDateInRange(d.id, range)) out.set(d.id, d.data());
    }
    return out;
  } catch (e) {
    console.warn(`[boarding-range] ${name} range query failed, per-day fallback:`, e);
  }

  await mapLimit(eachDateInRange(range), 12, async (date) => {
    const snap = await getDoc(doc(db, name, date));
    if (snap.exists()) out.set(date, snap.data());
  });
  return out;
}

async function loadUserDocs(ids: string[]): Promise<Record<string, UserDoc>> {
  const db = getFirebaseDb();
  const docs: Record<string, UserDoc> = {};
  let pending = [...new Set(ids)];
  for (let hop = 0; hop < 8 && pending.length; hop += 1) {
    await mapLimit(pending, 12, async (id) => {
      const snap = await getDoc(doc(db, 'users', id));
      if (!snap.exists()) {
        docs[id] = null;
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      docs[id] = { mergedTo: data.mergedTo ? String(data.mergedTo) : null, data };
    });
    pending = [
      ...new Set(
        Object.values(docs)
          .map((d) => (d?.mergedTo ? String(d.mergedTo) : ''))
          .filter((id) => id && !(id in docs))
      ),
    ];
  }
  return docs;
}

/**
 * 기간 내 적립 스탬프 수. stampHistory 의 add 와 아직 쿠폰으로 안 바뀐 stamps 를 stampId 로 합치고,
 * 회수(recall)된 것은 뺀다. 쿠폰 발급으로 지워진 것(remove)은 적립으로 그대로 센다.
 */
export async function countStampsInRange(userIds: string[], range: BoardingDateRange): Promise<number> {
  const db = getFirebaseDb();
  const { start, end } = kstRangeInstants(range);
  const added = new Set<string>();
  const recalled = new Set<string>();

  for (const userId of [...new Set(userIds)]) {
    try {
      const historySnap = await getDocs(
        query(
          collection(db, 'users', userId, 'stampHistory'),
          where('timestamp', '>=', Timestamp.fromDate(start)),
          where('timestamp', '<=', Timestamp.fromDate(end))
        )
      );
      historySnap.docs.forEach((d) => {
        const data = d.data();
        if (!isDateInRange(stampBusinessDate(data), range)) return;
        const stampId = String(data.stampId ?? d.id);
        if (data.action === 'add') added.add(stampId);
        else if (data.action === 'recall') recalled.add(stampId);
      });
    } catch (e) {
      console.warn('[boarding-range] stampHistory query failed:', userId, e);
    }

    try {
      const stampSnap = await getDocs(collection(db, 'users', userId, 'stamps'));
      stampSnap.docs.forEach((d) => {
        if (isDateInRange(stampBusinessDate(d.data()), range)) added.add(d.id);
      });
    } catch (e) {
      console.warn('[boarding-range] stamps read failed:', userId, e);
    }
  }

  let n = 0;
  added.forEach((id) => {
    if (!recalled.has(id)) n += 1;
  });
  return n;
}

export async function loadBoardingRange(range: BoardingDateRange): Promise<BoardingRangeResult> {
  const [attendance, tripsDocs] = await Promise.all([
    loadDateDocs('attendance', range),
    loadDateDocs('trips', range),
  ]);

  const dates = new Set<string>([...attendance.keys(), ...tripsDocs.keys()]);
  const trips: BoardingTrip[] = [];
  dates.forEach((date) => {
    trips.push(...parseAttendanceTrips(date, attendance.get(date), tripsDocs.get(date)));
  });
  const sorted = sortTripsDesc(trips);

  const rosterIds = [...new Set(sorted.flatMap((t) => t.memberIds))];
  const userDocs = await loadUserDocs(rosterIds);

  const canonical: Record<string, string> = {};
  const hopsOf = new Map<string, Set<string>>();
  for (const id of rosterIds) {
    const chain = followMergedToChain(id, userDocs);
    const real = chain.id || id;
    canonical[id] = real;
    const hops = hopsOf.get(real) ?? new Set<string>([real]);
    chain.hops.forEach((h) => hops.add(h));
    hopsOf.set(real, hops);
  }

  const names: Record<string, string> = {};
  for (const [id, d] of Object.entries(userDocs)) {
    names[id] = String(d?.data.name ?? '').trim();
  }

  const stampCounts = new Map<string, number>();
  await mapLimit([...hopsOf.entries()], 6, async ([real, hops]) => {
    stampCounts.set(real, await countStampsInRange([...hops], range));
  });

  const members = summarizeMembers({
    trips: sorted,
    canonicalOf: (id) => canonical[id] ?? id,
    nameOf: (id) => names[id] || '이름 없음',
    stampsOf: (id) => stampCounts.get(id) ?? 0,
    tripCreditedOf: (id) => countTripCreditedInRange(userDocs[id]?.data, range),
  });

  return {
    range,
    trips: sorted,
    members,
    totals: {
      trips: sorted.length,
      tripsWithoutList: sorted.filter((t) => !t.hasMemberList).length,
      boardings: members.reduce((sum, m) => sum + m.boardings, 0),
      members: members.length,
      stamps: members.reduce((sum, m) => sum + m.stamps, 0),
    },
    names,
    canonical,
  };
}

export type MemberBoardingRange = {
  trips: { date: string; tripNumber: number }[];
  stamps: number;
  tripCredited: number;
};

/** 한 회원의 기간 내 승선 기록. 병합된 옛 id 로 명단에 올라간 날도 포함한다. */
export async function loadMemberBoardingRange(
  memberId: string,
  range: BoardingDateRange
): Promise<MemberBoardingRange> {
  const userDocs = await loadUserDocs([memberId]);
  const chain = followMergedToChain(memberId, userDocs);
  const real = chain.id || memberId;
  const ids = new Set<string>([memberId, real, ...chain.hops]);

  const db = getFirebaseDb();
  try {
    const merged = await getDocs(query(collection(db, 'users'), where('mergedTo', '==', real)));
    merged.docs.forEach((d) => ids.add(d.id));
  } catch (e) {
    console.warn('[boarding-range] mergedTo lookup failed:', e);
  }

  const attendance = await loadDateDocs('attendance', range);
  const trips: { date: string; tripNumber: number }[] = [];
  attendance.forEach((data, date) => {
    for (const t of parseAttendanceTrips(date, data, null)) {
      if (t.memberIds.some((id) => ids.has(id))) trips.push({ date, tripNumber: t.tripNumber });
    }
  });
  trips.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.tripNumber - a.tripNumber));

  const realDoc = userDocs[real] ?? (await loadUserDocs([real]))[real];
  return {
    trips,
    stamps: await countStampsInRange([...ids], range),
    tripCredited: countTripCreditedInRange(realDoc?.data, range),
  };
}
