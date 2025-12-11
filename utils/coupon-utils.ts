import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function getTodayCouponsStatus(uuid: string, today: string): Promise<{
  usedToday: boolean;
  onlyTodayIssued: boolean;
}> {
  const couponsRef = collection(db, 'users', uuid, 'coupons');
  const snapshot = await getDocs(couponsRef);
  const allCoupons = snapshot.docs.map(doc => doc.data());

  const usedToday = allCoupons.some(coupon =>
    coupon.used === true && coupon.issuedAt === today
  );

  const usableCoupons = allCoupons.filter(coupon => coupon.used !== true);
  const onlyTodayIssued = usableCoupons.length > 0 &&
    usableCoupons.every(coupon => coupon.issuedAt === today);

  return {
    usedToday,
    onlyTodayIssued,
  };
}

