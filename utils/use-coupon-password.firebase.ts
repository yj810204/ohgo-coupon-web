import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';

export async function verifyUseCouponPassword(input: string): Promise<boolean> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'config', 'password'));
  if (!snap.exists()) return false;
  const data = snap.data();
  if (data.type !== 'useCoupon') return false;
  return input === data.value;
}
