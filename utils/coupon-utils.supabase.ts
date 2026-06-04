import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export async function getTodayCouponsStatus(uuid: string, today: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from('coupons').select('used, issued_at').eq('user_id', uuid);
  if (error) throw error;

  const allCoupons = data ?? [];
  const usedToday = allCoupons.some(
    (coupon: { used: boolean; issued_at: string | null }) =>
      coupon.used === true && coupon.issued_at === today,
  );

  const usableCoupons = allCoupons.filter((coupon: { used: boolean }) => coupon.used !== true);
  const onlyTodayIssued =
    usableCoupons.length > 0 &&
    usableCoupons.every(
      (coupon: { issued_at: string | null }) => coupon.issued_at === today,
    );

  return { usedToday, onlyTodayIssued };
}
