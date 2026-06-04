import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { AdminMember, AdminMemberStats } from './admin-member-service.shared';

export async function listAdminMembers(): Promise<AdminMember[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, dob, created_at, last_stamp_time')
    .order('name', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    uuid: row.id,
    name: row.name ?? '',
    dob: row.dob ?? '',
    createdAt: row.created_at ?? '',
    lastStampTimeMs: row.last_stamp_time ? new Date(row.last_stamp_time).getTime() : undefined,
    profileImageUrl: undefined,
    gender: undefined,
    tripCount: undefined,
    couponCount: undefined,
    halfCouponCount: undefined,
    fullCouponCount: undefined,
    stampCount: undefined,
    hasMemo: undefined,
    hasBoarding: undefined,
  }));
}

export async function listAdminGuests(): Promise<AdminMember[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('guest_profiles')
    .select('id, name, dob, phone, created_at')
    .is('merged_to', null)
    .order('name', { ascending: true });

  if (error) throw error;

  const guests = data ?? [];
  const boardingResults = await Promise.all(
    guests.map(async (row) => {
      const { data: boarding } = await supabase
        .from('guest_boarding_info')
        .select('guest_id, phone, gender')
        .eq('guest_id', row.id)
        .maybeSingle();
      return { id: row.id, boarding };
    })
  );
  const boardingById = new Map(boardingResults.map((r) => [r.id, r.boarding]));

  return guests.map((row) => {
    const boarding = boardingById.get(row.id);
    return {
      id: row.id,
      uuid: row.id,
      name: row.name ?? '',
      dob: row.dob ?? '',
      createdAt: row.created_at ?? '',
      phone: row.phone ?? boarding?.phone ?? null,
      gender: boarding?.gender ?? null,
      hasBoarding: Boolean(boarding),
      isGuest: true,
    };
  });
}

export async function loadAdminMemberStats(uuid: string): Promise<AdminMemberStats> {
  const supabase = getSupabaseBrowserClient();

  const [couponsRes, stampsRes, memosRes, boardingRes, profileRes] = await Promise.all([
    supabase.from('coupons').select('used, is_half').eq('user_id', uuid),
    supabase.from('stamps').select('id', { count: 'exact', head: true }).eq('user_id', uuid),
    supabase.from('user_memos').select('deleted').eq('user_id', uuid),
    supabase.from('boarding_info').select('gender').eq('user_id', uuid).maybeSingle(),
    supabase.from('profiles').select('trip_count').eq('id', uuid).maybeSingle(),
  ]);

  if (couponsRes.error) throw couponsRes.error;
  if (stampsRes.error) throw stampsRes.error;
  if (memosRes.error) throw memosRes.error;
  if (boardingRes.error) throw boardingRes.error;
  if (profileRes.error) throw profileRes.error;

  const activeCoupons = (couponsRes.data ?? []).filter((c) => !c.used);
  const halfCouponCount = activeCoupons.filter((c) => c.is_half).length;
  const fullCouponCount = activeCoupons.length - halfCouponCount;

  return {
    couponCount: activeCoupons.length,
    halfCouponCount,
    fullCouponCount,
    stampCount: stampsRes.count ?? 0,
    hasMemo: (memosRes.data ?? []).some((m) => !m.deleted),
    hasBoarding: Boolean(boardingRes.data),
    gender: boardingRes.data?.gender ?? null,
    tripCount: Number(profileRes.data?.trip_count) || 0,
  };
}
