import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { resolveFirestoreUserId, requireFirestoreUserId } from '@/lib/firebase/resolve-user-id';
import type { BoardingFormData, BoardingFormRecord } from './boarding-service.shared';

function mapBoarding(userId: string, data: Record<string, unknown>): BoardingFormRecord {
  return {
    userId,
    name: String(data.name ?? ''),
    birth: String(data.birth ?? ''),
    gender: String(data.gender ?? ''),
    phone: String(data.phone ?? ''),
    emergency: String(data.emergency ?? ''),
    address: String(data.address ?? ''),
    addressDetail: data.addressDetail ? String(data.addressDetail) : undefined,
    agreed: data.agreed === true,
    agreedThirdParty: data.agreedThirdParty === true,
    tripRole: data.role ? String(data.role) : undefined,
  };
}

export async function getBoardingForm(userId: string): Promise<BoardingFormRecord | null> {
  // Auth UUID ≠ Firestore users/{uuidv5} 인 레거시 계정 대응
  const fbUserId = (await resolveFirestoreUserId(userId)) ?? userId;
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'users', fbUserId, 'boarding', 'info'));
  if (!snap.exists()) return null;
  return mapBoarding(fbUserId, snap.data() as Record<string, unknown>);
}

export async function saveBoardingForm(
  userId: string,
  data: BoardingFormData,
  options?: { updateProfileRole?: boolean; isAdmin?: boolean }
): Promise<void> {
  // 기존 Firebase 문서에만 기록 (잘못된 Auth UUID 경로에 신규 문서 만들지 않음)
  const fbUserId = await requireFirestoreUserId(userId);
  const db = getFirebaseDb();
  const boardingRef = doc(db, 'users', fbUserId, 'boarding', 'info');

  const row: Record<string, unknown> = {
    name: data.name,
    birth: data.birth,
    gender: data.gender,
    phone: data.phone,
    emergency: data.emergency,
    address: data.address,
    agreed: data.agreed,
    agreedThirdParty: data.agreedThirdParty,
  };

  if (data.addressDetail?.trim()) {
    row.addressDetail = data.addressDetail.trim();
  }

  if (options?.isAdmin && data.tripRole && data.tripRole !== 'none') {
    row.role = data.tripRole;
  } else if (options?.isAdmin && data.tripRole === 'none') {
    row.role = null;
  }

  await setDoc(boardingRef, row, { merge: true });

  if (options?.updateProfileRole && options.isAdmin) {
    const userRef = doc(db, 'users', fbUserId);
    if (data.tripRole === 'captain' || data.tripRole === 'sailor') {
      await updateDoc(userRef, { role: data.tripRole });
    } else if (data.tripRole === 'none') {
      await updateDoc(userRef, { role: null });
    }
  }
}
