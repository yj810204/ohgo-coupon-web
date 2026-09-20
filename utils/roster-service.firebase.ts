import {
  collection,
  deleteField,
  doc,
  documentId,
  endAt,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAt,
  updateDoc,
  where,
} from 'firebase/firestore';
import { cachedFetch, invalidateCache, peekCache } from '@/lib/query-cache';
import { getFirebaseDb } from '@/lib/firebase/client';
import { personIdentityKey } from '@/lib/person-name';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { findCaptains } from './find-captains.firebase';
import {
  buildAddress,
  formatBirthDate,
  type AttendanceRecord,
  type ConfirmedTrip,
  type MonthRosterSummary,
  type RosterConfig,
  type RosterItem,
} from './roster-service.shared';

function eachDate(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function tripKey(tripNumber: number) {
  return `trip${tripNumber}`;
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** 날짜별 getDoc 폴백 (범위 쿼리 list가 보안 규칙에 막힐 때) */
async function getMonthRosterSummaryByDay(
  startDate: string,
  endDate: string
): Promise<MonthRosterSummary> {
  const db = getFirebaseDb();
  const dates = eachDate(startDate, endDate);
  const datesWithRoster: string[] = [];
  const confirmedTrips: Record<string, number[]> = {};

  await Promise.all(
    dates.map(async (date) => {
      const [attSnap, tripSnap] = await Promise.all([
        getDoc(doc(db, 'attendance', date)),
        getDoc(doc(db, 'trips', date)),
      ]);

      if (attSnap.exists()) {
        const members = attSnap.data().members;
        if (Array.isArray(members) && members.length > 0) {
          datesWithRoster.push(date);
        }
      }

      if (tripSnap.exists()) {
        const data = tripSnap.data();
        const nums: number[] = [];
        for (let n = 1; n <= 3; n++) {
          const t = data[tripKey(n)];
          if (t?.confirmed) nums.push(n);
        }
        if (nums.length) confirmedTrips[date] = nums;
      }
    })
  );

  return { datesWithRoster, confirmedTrips };
}

/** documentId 범위 쿼리 — 존재하는 문서만 2회 왕복으로 조회 */
async function getMonthRosterSummaryByRange(
  startDate: string,
  endDate: string
): Promise<MonthRosterSummary> {
  const db = getFirebaseDb();
  const range = (name: string) =>
    getDocs(
      query(collection(db, name), orderBy(documentId()), startAt(startDate), endAt(endDate))
    );

  const [attSnap, tripSnap] = await Promise.all([range('attendance'), range('trips')]);
  const datesWithRoster: string[] = [];
  const confirmedTrips: Record<string, number[]> = {};

  attSnap.docs.forEach((d) => {
    const members = d.data().members;
    if (Array.isArray(members) && members.length > 0) {
      datesWithRoster.push(d.id);
    }
  });

  tripSnap.docs.forEach((d) => {
    const data = d.data();
    const nums: number[] = [];
    for (let n = 1; n <= 3; n++) {
      const t = data[tripKey(n)];
      if (t?.confirmed) nums.push(n);
    }
    if (nums.length) confirmedTrips[d.id] = nums;
  });

  return { datesWithRoster, confirmedTrips };
}

export async function getMonthRosterSummary(
  startDate: string,
  endDate: string
): Promise<MonthRosterSummary> {
  try {
    return await getMonthRosterSummaryByRange(startDate, endDate);
  } catch (e) {
    console.warn('[roster] range query failed, falling back to per-day getDoc:', e);
    return getMonthRosterSummaryByDay(startDate, endDate);
  }
}

const YEAR_SUMMARY_TTL_MS = 300_000; // 5분 — 미리보기 왕복 시 재로딩 방지

export async function getYearRosterSummary(year: number): Promise<MonthRosterSummary> {
  const key = `roster:year:${year}`;
  return cachedFetch(key, YEAR_SUMMARY_TTL_MS, () =>
    getMonthRosterSummary(`${year}-01-01`, `${year}-12-31`)
  );
}

/** 동기 캐시 조회 — 달력 remount 시 로딩 스피너 없이 즉시 표시 */
export function peekYearRosterSummary(year: number): MonthRosterSummary | undefined {
  return peekCache<MonthRosterSummary>(`roster:year:${year}`);
}

export async function getYearConfirmedTripCount(year: number): Promise<number> {
  const summary = await getYearRosterSummary(year);
  return Object.values(summary.confirmedTrips).reduce((sum, nums) => sum + nums.length, 0);
}

export function invalidateRosterSummaryCache(year?: number): void {
  if (year != null) invalidateCache(`roster:year:${year}`);
  else invalidateCache('roster:year:');
}

export async function getConfirmedTrip(
  date: string,
  tripNumber: number
): Promise<ConfirmedTrip | null> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'trips', date));
  if (!snap.exists()) return null;
  const t = snap.data()[tripKey(tripNumber)];
  if (!t) return null;
  return {
    confirmed: Boolean(t.confirmed),
    confirmedAt: t.confirmedAt ?? undefined,
    rosterImagePath: t.rosterImagePath ?? undefined,
    rosterImageUrl: t.rosterImageUrl ?? undefined,
  };
}

export async function isTripConfirmed(date: string, tripNumber: number): Promise<boolean> {
  const trip = await getConfirmedTrip(date, tripNumber);
  return Boolean(trip?.confirmed);
}

export async function getAttendance(date: string): Promise<AttendanceRecord> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'attendance', date));
  if (!snap.exists()) return { memberIds: [] };
  const data = snap.data();
  const locations = data.location ?? data.locations;
  return {
    memberIds: Array.isArray(data.members) ? data.members.map(String) : [],
    tripNumber: data.tripNumber ?? undefined,
    locations: Array.isArray(locations) ? locations.map(String) : undefined,
    arrivalTime: data.arrivalTime ?? undefined,
  };
}

export async function saveAttendanceMembers(
  date: string,
  memberIds: string[],
  tripNumber?: number
): Promise<void> {
  const db = getFirebaseDb();
  const ref = doc(db, 'attendance', date);
  const row: Record<string, unknown> = {
    members: memberIds,
    updatedAt: new Date(),
  };
  if (tripNumber !== undefined) row.tripNumber = tripNumber;
  await setDoc(ref, row, { merge: true });
}

export async function clearAttendanceMembers(date: string): Promise<void> {
  const db = getFirebaseDb();
  const ref = doc(db, 'attendance', date);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, { members: deleteField() });
}

export async function updateAttendanceLocationTime(
  date: string,
  locations: string[],
  arrivalTime: string,
  tripNumber: number
): Promise<void> {
  const attendance = await getAttendance(date);
  const db = getFirebaseDb();
  await setDoc(
    doc(db, 'attendance', date),
    {
      members: attendance.memberIds,
      location: locations,
      arrivalTime,
      tripNumber,
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

export async function confirmTripDeparture(
  date: string,
  tripNumber: number,
  imageBlob: Blob
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const imagePath = `${date}/trip${tripNumber}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('rosters')
    .upload(imagePath, imageBlob, { upsert: true, contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('rosters').getPublicUrl(imagePath);
  const downloadURL = urlData.publicUrl;

  const db = getFirebaseDb();
  const tripsRef = doc(db, 'trips', date);
  const key = tripKey(tripNumber);
  const tripData = {
    confirmed: true,
    confirmedAt: new Date().toISOString(),
    rosterImagePath: imagePath,
    rosterImageUrl: downloadURL,
  };

  const existing = await getDoc(tripsRef);
  if (existing.exists()) {
    await updateDoc(tripsRef, { [key]: tripData });
  } else {
    await setDoc(tripsRef, { [key]: tripData });
  }

  await clearAttendanceMembers(date);
  invalidateRosterSummaryCache();
  return downloadURL;
}

/** 이미 서버에 올라간 명부 이미지로 trips 확정만 기록한다. */
export async function finalizeConfirmedTrip(
  date: string,
  tripNumber: number,
  imagePath: string,
  imageUrl: string
): Promise<string> {
  const db = getFirebaseDb();
  const tripsRef = doc(db, 'trips', date);
  const key = tripKey(tripNumber);
  const tripData = {
    confirmed: true,
    confirmedAt: new Date().toISOString(),
    rosterImagePath: imagePath,
    rosterImageUrl: imageUrl,
  };

  const existing = await getDoc(tripsRef);
  if (existing.exists()) {
    await updateDoc(tripsRef, { [key]: tripData });
  } else {
    await setDoc(tripsRef, { [key]: tripData });
  }

  await clearAttendanceMembers(date);
  invalidateRosterSummaryCache();
  return imageUrl;
}

async function fetchRosterConfig(): Promise<RosterConfig> {
  const fallbackAreas = ['내만'];
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'config', 'roster'));
  if (!snap.exists()) {
    return {
      areas: fallbackAreas,
      shipName: '',
      ton: '',
      desc01: '',
      desc02: '',
      onBoard: false,
    };
  }
  const value = snap.data();
  const areas =
    Array.isArray(value.areas) && value.areas.length ? (value.areas as string[]) : fallbackAreas;
  return {
    areas,
    shipName: String(value.ship_name ?? ''),
    ton: String(value.ton ?? ''),
    desc01: String(value.desc01 ?? ''),
    desc02: String(value.desc02 ?? ''),
    onBoard: Boolean(value.on_board),
  };
}

export async function getRosterConfig(): Promise<RosterConfig> {
  return cachedFetch('roster:config', 600_000, fetchRosterConfig);
}

type UserSeed = {
  name?: string;
  dob?: string;
  phone?: string;
  role?: string;
};

function applyBoardingToItem(
  item: RosterItem,
  boarding: Record<string, unknown> | null
): RosterItem {
  if (!boarding) return item;
  return {
    ...item,
    name: String(boarding.name || item.name),
    birth: formatBirthDate(String(boarding.birth || '')) || item.birth,
    gender: String(boarding.gender || ''),
    phone: String(boarding.phone || item.phone),
    emergency: String(boarding.emergency || ''),
    address: buildAddress(
      String(boarding.address || ''),
      boarding.addressDetail ? String(boarding.addressDetail) : undefined
    ),
    hasRoster: true,
  };
}

async function buildRosterItemFromUser(
  userId: string,
  seed?: UserSeed
): Promise<RosterItem | null> {
  const db = getFirebaseDb();

  if (seed) {
    const boardingSnap = await getDoc(doc(db, 'users', userId, 'boarding', 'info'));
    const boarding = boardingSnap.exists() ? boardingSnap.data() : null;
    const userRole = seed.role;
    const item: RosterItem = {
      id: userId,
      name: seed.name || '',
      birth: formatBirthDate(seed.dob || ''),
      gender: '',
      phone: seed.phone || '',
      emergency: '',
      address: '',
      hasRoster: Boolean(boarding),
      isCaptain: userRole === 'captain',
      isSailor: userRole === 'sailor',
      role: userRole,
    };
    return applyBoardingToItem(item, boarding);
  }

  const [userSnap, boardingSnap] = await Promise.all([
    getDoc(doc(db, 'users', userId)),
    getDoc(doc(db, 'users', userId, 'boarding', 'info')),
  ]);

  if (!userSnap.exists()) return null;
  const user = userSnap.data();
  const boarding = boardingSnap.exists() ? boardingSnap.data() : null;
  const userRole = user.role;

  const item: RosterItem = {
    id: userId,
    name: user.name || '',
    birth: formatBirthDate(user.dob || ''),
    gender: '',
    phone: user.phone || '',
    emergency: '',
    address: '',
    hasRoster: Boolean(boarding),
    isCaptain: userRole === 'captain',
    isSailor: userRole === 'sailor',
    role: userRole,
  };

  return applyBoardingToItem(item, boarding);
}

export async function loadDailyRoster(date: string, tripNumber: number): Promise<RosterItem[]> {
  const [crewMembers, attendance] = await Promise.all([findCaptains(), getAttendance(date)]);
  const crewIds = crewMembers.map((m) => m.uuid);
  const captainIds = crewMembers.filter((m) => m.role === 'captain').map((m) => m.uuid);

  let memberIds = [...attendance.memberIds];
  if (captainIds.length > 0) {
    const merged = Array.from(new Set([...memberIds, ...captainIds]));
    // 선장 편입 동작은 유지하되, 집합이 같을 때는 중복 write 생략 (데이터 안전)
    if (!sameIdSet(memberIds, merged)) {
      memberIds = merged;
      await saveAttendanceMembers(date, memberIds, tripNumber);
    } else {
      memberIds = merged;
    }
  }

  const crewSeeds = new Map(
    crewMembers.map((m) => [
      m.uuid,
      {
        name: m.name,
        dob: m.dob,
        phone: m.phone,
        role: m.role,
      } satisfies UserSeed,
    ])
  );

  const passengerIds = memberIds.filter((id) => !crewIds.includes(id));

  const built = await Promise.all([
    ...crewMembers.map((crew) => buildRosterItemFromUser(crew.uuid, crewSeeds.get(crew.uuid))),
    ...passengerIds.map((id) => buildRosterItemFromUser(id)),
  ]);

  const rosterData = built.filter((item): item is RosterItem => item != null);

  rosterData.sort((a, b) => {
    if (a.isCaptain && !b.isCaptain) return -1;
    if (!a.isCaptain && b.isCaptain) return 1;
    if (a.isSailor && !b.isSailor) return -1;
    if (!a.isSailor && b.isSailor) return 1;
    return a.name.localeCompare(b.name);
  });

  return rosterData;
}

export async function removeMemberFromDailyRoster(date: string, memberId: string): Promise<void> {
  const attendance = await getAttendance(date);
  const updated = attendance.memberIds.filter((id) => id !== memberId);
  await saveAttendanceMembers(date, updated, attendance.tripNumber);
  invalidateRosterSummaryCache();
}

type MemberSearchResult = {
  id: string;
  uuid: string;
  name: unknown;
  dob: unknown;
  phone: unknown;
  gender?: string;
  hasBoarding: boolean;
  isGuest: boolean;
};

async function mapSearchDocs(
  docs: { id: string; data: () => Record<string, unknown> }[],
  max = 30
): Promise<MemberSearchResult[]> {
  const db = getFirebaseDb();
  const sliced = docs.slice(0, max);
  return Promise.all(
    sliced.map(async (d) => {
      const data = d.data();
      const boardingSnap = await getDoc(doc(db, 'users', d.id, 'boarding', 'info'));
      const boarding = boardingSnap.exists() ? boardingSnap.data() : null;
      const profileDob = data.dob != null && String(data.dob).trim() ? String(data.dob) : '';
      const boardingBirth = boarding?.birth ? String(boarding.birth).trim() : '';
      const gender = boarding?.gender ? String(boarding.gender).trim() : '';
      return {
        id: d.id,
        uuid: d.id,
        name: (boarding?.name ? String(boarding.name) : data.name) ?? undefined,
        dob: profileDob || boardingBirth || undefined,
        phone: data.phone ?? undefined,
        gender: gender || undefined,
        hasBoarding: Boolean(boarding),
        isGuest: false,
      };
    })
  );
}

async function loadAllUsersCached() {
  return cachedFetch('roster:users-all', 300_000, async () => {
    const db = getFirebaseDb();
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map((d) => ({ id: d.id, data: () => d.data() as Record<string, unknown> }));
  });
}

export async function searchMembersByName(queryText: string) {
  if (!queryText.trim()) return [];
  const db = getFirebaseDb();
  const raw = queryText.trim();
  const qLower = raw.toLowerCase();

  // 1차: 이름 prefix 쿼리 (대소문자 구분 — 한글은 영향 적음)
  try {
    const prefixSnap = await getDocs(
      query(
        collection(db, 'users'),
        where('name', '>=', raw),
        where('name', '<=', raw + '\uf8ff'),
        limit(30)
      )
    );
    if (!prefixSnap.empty) {
      return mapSearchDocs(prefixSnap.docs);
    }
  } catch (e) {
    console.warn('[roster] name prefix search failed, falling back to full scan:', e);
  }

  // 2차: 전체 스캔 + 클라이언트 includes (캐시 5분)
  const all = await loadAllUsersCached();
  const matched = all.filter((d) => String(d.data().name ?? '').toLowerCase().includes(qLower));
  return mapSearchDocs(matched, 30);
}

export async function createGuestMember(input: {
  uuid: string;
  name: string;
  dob: string;
  phone: string;
  gender: string;
  emergency: string;
  address: string;
}): Promise<void> {
  const db = getFirebaseDb();
  const userRef = doc(db, 'users', input.uuid);
  const existing = await getDoc(userRef);
  if (!existing.exists()) {
    await setDoc(userRef, {
      uuid: input.uuid,
      name: input.name,
      dob: input.dob,
      phone: input.phone || null,
      createdAt: new Date().toISOString(),
      isAdmin: false,
    });
  }

  await setDoc(
    doc(db, 'users', input.uuid, 'boarding', 'info'),
    {
      name: input.name,
      birth: input.dob,
      gender: input.gender,
      phone: input.phone,
      emergency: input.emergency,
      address: input.address,
      agreed: true,
      agreedThirdParty: true,
    },
    { merge: true }
  );
}

export async function guestMemberExists(uuid: string): Promise<boolean> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'users', uuid));
  return snap.exists();
}

export async function addMemberToDailyRoster(
  date: string,
  memberId: string,
  tripNumber: number
): Promise<boolean> {
  const attendance = await getAttendance(date);
  if (attendance.memberIds.includes(memberId)) return false;
  await saveAttendanceMembers(date, [...attendance.memberIds, memberId], tripNumber);
  invalidateRosterSummaryCache();
  return true;
}

/** 출항 확정 전에 호출 — clearAttendanceMembers 이후에도 승선자를 남긴다. */
export async function saveConfirmedTripMembers(
  date: string,
  tripNumber: number,
  memberIds: string[]
): Promise<void> {
  const db = getFirebaseDb();
  const ref = doc(db, 'attendance', date);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      confirmedMembers: { [String(tripNumber)]: memberIds },
      updatedAt: new Date(),
    });
    return;
  }
  await updateDoc(ref, {
    [`confirmedMembers.${tripNumber}`]: memberIds,
    updatedAt: new Date(),
  });
}

/** 정규화 이름+생년월일로 기존 users 문서 조회 (mergedTo 제외) */
export async function findUserByNameDob(name: string, dob: string): Promise<string | null> {
  const key = personIdentityKey(name, dob);
  if (key.startsWith('|') || key.endsWith('|')) return null;
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, 'users'));
  for (const d of snap.docs) {
    const data = d.data();
    if (data.mergedTo) continue;
    if (personIdentityKey(String(data.name ?? ''), String(data.dob ?? '')) === key) {
      return d.id;
    }
  }
  return null;
}

/** 현재 명부 + 확정 항차 스냅샷을 합친 오늘 승선자 */
export async function getBoardedMemberIds(date: string): Promise<string[]> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'attendance', date));
  if (!snap.exists()) return [];
  const data = snap.data();
  const ids = new Set<string>();
  if (Array.isArray(data.members)) {
    for (const id of data.members) ids.add(String(id));
  }
  const confirmed = data.confirmedMembers;
  if (confirmed && typeof confirmed === 'object') {
    for (const value of Object.values(confirmed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      for (const id of value) ids.add(String(id));
    }
  }
  return [...ids];
}
