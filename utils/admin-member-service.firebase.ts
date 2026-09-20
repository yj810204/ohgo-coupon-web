import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { normalizePersonName, personIdentityKey } from '@/lib/person-name';
import { invalidateRosterSummaryCache } from './roster-service.firebase';
import type {
  AdminGuestDetail,
  AdminMember,
  AdminMemberStats,
  DuplicateMemberCandidate,
} from './admin-member-service.shared';

export async function listAdminMembers(): Promise<AdminMember[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, 'users'));
  const members: AdminMember[] = snap.docs.map((d) => {
    const data = d.data();
    const last = data.lastStampTime?.toMillis?.() ?? undefined;
    return {
      id: d.id,
      uuid: d.id,
      name: String(data.name ?? ''),
      dob: String(data.dob ?? ''),
      createdAt: String(data.createdAt ?? ''),
      lastStampTimeMs: last,
      phone: data.phone ?? null,
      isGuest: false,
      isLegacyLinked: true,
      tripCount: Number(data.tripCount) || undefined,
    };
  });

  members.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return members;
}

/** firebase 모드에는 guest staging 없음 — 빈 목록 */
export async function listAdminGuests(): Promise<AdminMember[]> {
  return [];
}

export async function loadAdminMemberStats(uuid: string): Promise<AdminMemberStats> {
  const db = getFirebaseDb();
  const [couponsSnap, stampsSnap, memosSnap, boardingSnap, userSnap] = await Promise.all([
    getDocs(collection(db, `users/${uuid}/coupons`)),
    getDocs(collection(db, `users/${uuid}/stamps`)),
    getDocs(collection(db, `users/${uuid}/memo`)),
    getDoc(doc(db, 'users', uuid, 'boarding', 'info')),
    getDoc(doc(db, 'users', uuid)),
  ]);

  const activeCoupons = couponsSnap.docs.filter((d) => {
    const data = d.data();
    return data.used !== true && data.deleted !== true;
  });
  const halfCouponCount = activeCoupons.filter((d) => d.data().isHalf === 'Y').length;
  const fullCouponCount = activeCoupons.length - halfCouponCount;
  const hasMemo = memosSnap.docs.some((d) => d.data().deleted !== true);

  return {
    couponCount: activeCoupons.length,
    halfCouponCount,
    fullCouponCount,
    stampCount: stampsSnap.size,
    hasMemo,
    hasBoarding: boardingSnap.exists(),
    gender: boardingSnap.exists() ? (boardingSnap.data()?.gender ?? null) : null,
    tripCount: Number(userSnap.data()?.tripCount) || 0,
  };
}

export async function loadAdminGuestStats(_legacyUuid: string): Promise<AdminMemberStats> {
  return {
    couponCount: 0,
    halfCouponCount: 0,
    fullCouponCount: 0,
    stampCount: 0,
    hasMemo: false,
    hasBoarding: false,
    gender: null,
    tripCount: 0,
  };
}

export async function getAdminGuestDetail(_legacyUuid: string): Promise<AdminGuestDetail | null> {
  return null;
}

/** firebase 모드에서는 일반 스탬프 경로를 쓰므로 호환 스텁 */
export async function adjustGuestLegacyStamps(
  _legacyUuid: string,
  _delta: number
): Promise<number> {
  throw new Error('firebase 모드에서는 회원 상세의 일반 스탬프 조정을 사용해 주세요.');
}

export async function adjustGuestLegacyCoupons(
  _legacyUuid: string,
  _delta: number,
  _options?: { isHalf?: boolean }
): Promise<number> {
  throw new Error('firebase 모드에서는 회원 상세의 일반 쿠폰 조정을 사용해 주세요.');
}

function mapAdminMember(
  id: string,
  data: Record<string, unknown>
): AdminMember {
  const last = (data.lastStampTime as { toMillis?: () => number } | undefined)?.toMillis?.();
  return {
    id,
    uuid: id,
    name: String(data.name ?? ''),
    dob: String(data.dob ?? ''),
    createdAt: String(data.createdAt ?? ''),
    lastStampTimeMs: last,
    phone: (data.phone as string | null) ?? null,
    isGuest: false,
    isLegacyLinked: true,
    tripCount: Number(data.tripCount) || undefined,
    mergedTo: data.mergedTo ? String(data.mergedTo) : null,
    role: data.role ? String(data.role) : null,
  };
}

export async function listAdminMembersActive(): Promise<AdminMember[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, 'users'));
  const members = snap.docs
    .filter((d) => !d.data().mergedTo)
    .map((d) => mapAdminMember(d.id, d.data() as Record<string, unknown>));
  members.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return members;
}

export async function findDuplicateUsers(
  uuid: string,
  name: string,
  dob: string
): Promise<DuplicateMemberCandidate[]> {
  const key = personIdentityKey(name, dob);
  if (key.startsWith('|') || key.endsWith('|')) return [];
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, 'users'));
  const matches = snap.docs.filter((d) => {
    if (d.id === uuid) return false;
    const data = d.data();
    if (data.mergedTo) return false;
    return personIdentityKey(String(data.name ?? ''), String(data.dob ?? '')) === key;
  });

  return Promise.all(
    matches.map(async (d) => {
      const data = d.data();
      const stampsSnap = await getDocs(collection(db, `users/${d.id}/stamps`));
      const last = data.lastStampTime?.toMillis?.() ?? undefined;
      return {
        uuid: d.id,
        name: String(data.name ?? ''),
        dob: String(data.dob ?? ''),
        lastStampTimeMs: last,
        stampCount: stampsSnap.size,
        tripCount: Number(data.tripCount) || 0,
      };
    })
  );
}

async function copySubcollection(fromId: string, toId: string, col: string) {
  const db = getFirebaseDb();
  const [fromSnap, toSnap] = await Promise.all([
    getDocs(collection(db, 'users', fromId, col)),
    getDocs(collection(db, 'users', toId, col)),
  ]);
  const existing = new Set(toSnap.docs.map((d) => d.id));
  for (const d of fromSnap.docs) {
    if (existing.has(d.id)) continue;
    await setDoc(doc(db, 'users', toId, col, d.id), d.data());
  }
}

async function rewriteAttendanceMemberId(dropUuid: string, keepUuid: string) {
  const db = getFirebaseDb();
  const attSnap = await getDocs(collection(db, 'attendance'));
  for (const d of attSnap.docs) {
    const data = d.data();
    let changed = false;
    const patch: Record<string, unknown> = {};

    if (Array.isArray(data.members)) {
      const members = data.members.map(String);
      if (members.includes(dropUuid)) {
        patch.members = [...new Set(members.map((id) => (id === dropUuid ? keepUuid : id)))];
        changed = true;
      }
    }

    const confirmed = data.confirmedMembers;
    if (confirmed && typeof confirmed === 'object') {
      const next: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(confirmed as Record<string, unknown>)) {
        if (!Array.isArray(v)) continue;
        const ids = v.map(String);
        if (ids.includes(dropUuid)) {
          next[k] = [...new Set(ids.map((id) => (id === dropUuid ? keepUuid : id)))];
          changed = true;
        } else {
          next[k] = ids;
        }
      }
      if (changed) patch.confirmedMembers = next;
    }

    if (changed) await updateDoc(d.ref, patch);
  }
}

export async function mergeDuplicateUsers(keepUuid: string, dropUuid: string): Promise<void> {
  if (!keepUuid || !dropUuid || keepUuid === dropUuid) {
    throw new Error('통합할 계정이 올바르지 않습니다.');
  }
  const db = getFirebaseDb();
  const [keepSnap, dropSnap] = await Promise.all([
    getDoc(doc(db, 'users', keepUuid)),
    getDoc(doc(db, 'users', dropUuid)),
  ]);
  if (!keepSnap.exists() || !dropSnap.exists()) {
    throw new Error('회원 문서를 찾을 수 없습니다.');
  }
  if (dropSnap.data().mergedTo) {
    throw new Error('이미 통합된 계정입니다.');
  }

  const cols = ['stamps', 'coupons', 'stampHistory', 'memo', 'points', 'logs'] as const;
  for (const col of cols) {
    await copySubcollection(dropUuid, keepUuid, col);
  }

  const keepBoarding = await getDoc(doc(db, 'users', keepUuid, 'boarding', 'info'));
  if (!keepBoarding.exists()) {
    const dropBoarding = await getDoc(doc(db, 'users', dropUuid, 'boarding', 'info'));
    if (dropBoarding.exists()) {
      await setDoc(doc(db, 'users', keepUuid, 'boarding', 'info'), dropBoarding.data());
    }
  }

  const keepData = keepSnap.data();
  const dropData = dropSnap.data();
  const keepLast = keepData.lastStampTime?.toMillis?.() ?? 0;
  const dropLast = dropData.lastStampTime?.toMillis?.() ?? 0;
  const latestStamp = dropLast > keepLast ? dropData.lastStampTime : keepData.lastStampTime;
  const keepPatch: Record<string, unknown> = {
    name: normalizePersonName(String(keepData.name || dropData.name || '')),
    tripCount: (Number(keepData.tripCount) || 0) + (Number(dropData.tripCount) || 0),
    phone: keepData.phone || dropData.phone || null,
  };
  if (latestStamp) keepPatch.lastStampTime = latestStamp;
  await updateDoc(doc(db, 'users', keepUuid), keepPatch);

  await rewriteAttendanceMemberId(dropUuid, keepUuid);
  await updateDoc(doc(db, 'users', dropUuid), { mergedTo: keepUuid });
  invalidateRosterSummaryCache();
}
