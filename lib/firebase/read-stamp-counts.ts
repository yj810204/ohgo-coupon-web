import { collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '@/lib/firebase/client';

/** 공개 Firebase 설정으로 스탬프 개수와 미사용 쿠폰 개수를 읽는다. 쓰기 없음. */
export async function readFirestoreStampCounts(memberId: string): Promise<{ stamps: number; coupons: number }> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase 환경 변수가 없습니다.');
  }
  const db = getFirebaseDb();
  const [stamps, coupons] = await Promise.all([
    getCountFromServer(collection(db, 'users', memberId, 'stamps')),
    getDocs(query(collection(db, 'users', memberId, 'coupons'), where('used', '==', false))),
  ]);
  return {
    stamps: stamps.data().count,
    coupons: coupons.docs.filter((docSnap) => docSnap.data().deleted !== true).length,
  };
}
