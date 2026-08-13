import { collection, getDocs } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';

export async function getTodayCouponsStatus(
  uuid: string,
  today: string
): Promise<{
  usedToday: boolean;
  onlyTodayIssued: boolean;
}> {
  const db = getFirebaseDb();
  const snapshot = await getDocs(collection(db, 'users', uuid, 'coupons'));
  const allCoupons = snapshot.docs.map((d) => d.data());

  const usedToday = allCoupons.some(
    (coupon) => coupon.used === true && coupon.issuedAt === today
  );

  const usableCoupons = allCoupons.filter(
    (coupon) => coupon.used !== true && coupon.deleted !== true
  );
  const onlyTodayIssued =
    usableCoupons.length > 0 && usableCoupons.every((coupon) => coupon.issuedAt === today);

  return { usedToday, onlyTodayIssued };
}
