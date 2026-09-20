import { deleteField, doc, getDoc, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { requireFirestoreUserId, resolveFirestoreUserId } from '@/lib/firebase/resolve-user-id';
import type { MemberProfile } from './member-profile-service.shared';
import {
  getAvatarPublicUrl as getAvatarPublicUrlSupa,
  uploadAvatar as uploadAvatarSupa,
} from './member-profile-service.supabase';

/** 아바타는 Supabase Storage 유지 */
export const getAvatarPublicUrl = getAvatarPublicUrlSupa;
export const uploadAvatar = uploadAvatarSupa;

export async function getMemberProfile(userId: string): Promise<MemberProfile | null> {
  const fbUserId = await resolveFirestoreUserId(userId);
  if (!fbUserId) return null;

  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'users', fbUserId));
  if (!snap.exists()) return null;

  const data = snap.data();
  const profileImageUrl = (await getAvatarPublicUrl(userId)) ?? undefined;
  const createdAtRaw = data.createdAt;
  let createdAt: Date | null = null;
  if (typeof createdAtRaw === 'string') createdAt = new Date(createdAtRaw);
  else if (createdAtRaw?.toDate) createdAt = createdAtRaw.toDate();

  return {
    isAdmin: data.isAdmin === true,
    totalPoint: Number(data.totalPoint) || 0,
    baitCoupons: Number(data.baitCoupons) || 0,
    createdAt,
    profileImageUrl,
    legacyUuid: fbUserId,
  };
}

export async function resetTotalPoint(userId: string): Promise<void> {
  const fbUserId = await requireFirestoreUserId(userId);
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'users', fbUserId), { totalPoint: 0 });
}

export async function updateBaitCoupons(userId: string, count: number): Promise<void> {
  const fbUserId = await requireFirestoreUserId(userId);
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'users', fbUserId), { baitCoupons: count });
}

export async function saveExpoPushToken(userId: string, token: string | null): Promise<void> {
  const fbUserId = await requireFirestoreUserId(userId);
  const db = getFirebaseDb();
  const userRef = doc(db, 'users', fbUserId);
  if (token) {
    await updateDoc(userRef, { expoPushToken: token });
  } else {
    await updateDoc(userRef, { expoPushToken: deleteField() });
  }
}

export async function getMemberTripCount(userId: string): Promise<number> {
  const fbUserId = await resolveFirestoreUserId(userId);
  if (!fbUserId) return 0;
  const snap = await getDoc(doc(getFirebaseDb(), 'users', fbUserId));
  return Number(snap.data()?.tripCount) || 0;
}

export async function updateTripCount(userId: string, count: number): Promise<void> {
  const fbUserId = await requireFirestoreUserId(userId);
  await updateDoc(doc(getFirebaseDb(), 'users', fbUserId), {
    tripCount: Math.max(0, Math.floor(count)),
  });
}
