import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * role이 'captain' 또는 'sailor'인 사용자 목록 조회
 */
export const findCaptains = async (): Promise<
  { uuid: string; name: string; expoPushToken?: string; role?: string }[]
> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', 'in', ['captain', 'sailor']));

    const snapshot = await getDocs(q);
    if (snapshot.empty) return [];

    return snapshot.docs.map(doc => ({
      uuid: doc.id,
      name: doc.data().name,
      expoPushToken: doc.data().expoPushToken,
      role: doc.data().role,
    }));
  } catch (e) {
    console.error('캡틴/세일러 조회 실패:', e);
    return [];
  }
};

