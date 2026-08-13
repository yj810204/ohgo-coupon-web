import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import type {
  AdminGuestDetail,
  AdminMember,
  AdminMemberStats,
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
