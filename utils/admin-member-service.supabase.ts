import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type {
  AdminGuestDetail,
  AdminMember,
  AdminMemberStats,
} from './admin-member-service.shared';

type ProfileListRow = {
  id: string;
  name: string | null;
  dob: string | null;
  created_at: string | null;
  last_stamp_time: string | null;
  legacy_uuid: string | null;
};

type GuestListRow = {
  id: string;
  name: string | null;
  dob: string | null;
  phone: string | null;
  created_at: string | null;
};

type GuestBoardingLite = {
  guest_id: string;
  phone: string | null;
  gender: string | null;
};

type CouponLite = {
  used: boolean | null;
  is_half: boolean | null;
  deleted?: boolean | null;
};

export async function listAdminMembers(): Promise<AdminMember[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, dob, created_at, last_stamp_time, legacy_uuid')
    .order('name', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as ProfileListRow[]).map((row) => ({
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
    isLegacyLinked: Boolean(row.legacy_uuid),
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

  const guests = (data ?? []) as GuestListRow[];
  const boardingResults = await Promise.all(
    guests.map(async (row) => {
      const { data: boarding } = await supabase
        .from('guest_boarding_info')
        .select('guest_id, phone, gender')
        .eq('guest_id', row.id)
        .maybeSingle();
      return { id: row.id, boarding: boarding as GuestBoardingLite | null };
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
      tripCount: undefined,
      couponCount: undefined,
      halfCouponCount: undefined,
      fullCouponCount: undefined,
      stampCount: undefined,
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

  const activeCoupons = ((couponsRes.data ?? []) as CouponLite[]).filter((c) => !c.used);
  const halfCouponCount = activeCoupons.filter((c) => c.is_half).length;
  const fullCouponCount = activeCoupons.length - halfCouponCount;
  const memos = (memosRes.data ?? []) as { deleted: boolean | null }[];

  return {
    couponCount: activeCoupons.length,
    halfCouponCount,
    fullCouponCount,
    stampCount: stampsRes.count ?? 0,
    hasMemo: memos.some((m) => !m.deleted),
    hasBoarding: Boolean(boardingRes.data),
    gender: (boardingRes.data as { gender: string | null } | null)?.gender ?? null,
    tripCount: Number((profileRes.data as { trip_count: number | null } | null)?.trip_count) || 0,
  };
}

/** 구 회원 staging 스탬프/쿠폰 집계 (guest_profiles / 원본 데이터는 수정하지 않음) */
export async function loadAdminGuestStats(legacyUuid: string): Promise<AdminMemberStats> {
  const supabase = getSupabaseBrowserClient();
  const [stampsRes, couponsRes, boardingRes] = await Promise.all([
    supabase
      .from('legacy_stamps')
      .select('id', { count: 'exact', head: true })
      .eq('legacy_uuid', legacyUuid),
    supabase
      .from('legacy_coupons')
      .select('used, is_half, deleted')
      .eq('legacy_uuid', legacyUuid),
    supabase
      .from('guest_boarding_info')
      .select('gender')
      .eq('guest_id', legacyUuid)
      .maybeSingle(),
  ]);

  if (stampsRes.error) throw stampsRes.error;
  if (couponsRes.error) throw couponsRes.error;
  if (boardingRes.error) throw boardingRes.error;

  const activeCoupons = ((couponsRes.data ?? []) as CouponLite[]).filter(
    (c) => !c.used && !c.deleted
  );
  const halfCouponCount = activeCoupons.filter((c) => c.is_half).length;
  const fullCouponCount = activeCoupons.length - halfCouponCount;

  return {
    couponCount: activeCoupons.length,
    halfCouponCount,
    fullCouponCount,
    stampCount: stampsRes.count ?? 0,
    hasMemo: false,
    hasBoarding: Boolean(boardingRes.data),
    gender: (boardingRes.data as { gender: string | null } | null)?.gender ?? null,
    tripCount: 0,
  };
}

export async function getAdminGuestDetail(legacyUuid: string): Promise<AdminGuestDetail | null> {
  const supabase = getSupabaseBrowserClient();
  const { data: guest, error } = await supabase
    .from('guest_profiles')
    .select('id, name, dob, phone, created_at, merged_to')
    .eq('id', legacyUuid)
    .maybeSingle();

  if (error) throw error;
  if (!guest) return null;

  const guestRow = guest as {
    id: string;
    name: string | null;
    dob: string | null;
    phone: string | null;
    created_at: string | null;
    merged_to: string | null;
  };

  const [{ data: boarding }, stats] = await Promise.all([
    supabase.from('guest_boarding_info').select('*').eq('guest_id', legacyUuid).maybeSingle(),
    loadAdminGuestStats(legacyUuid),
  ]);

  const boardingRow = boarding as {
    name: string | null;
    birth: string | null;
    gender: string | null;
    phone: string | null;
    emergency: string | null;
    address: string | null;
    address_detail: string | null;
  } | null;

  return {
    id: guestRow.id,
    name: guestRow.name ?? '',
    dob: guestRow.dob ?? '',
    phone: guestRow.phone ?? boardingRow?.phone ?? null,
    createdAt: guestRow.created_at ?? '',
    mergedTo: guestRow.merged_to ?? null,
    boarding: boardingRow
      ? {
          name: boardingRow.name ?? null,
          birth: boardingRow.birth ?? null,
          gender: boardingRow.gender ?? null,
          phone: boardingRow.phone ?? null,
          emergency: boardingRow.emergency ?? null,
          address: boardingRow.address ?? null,
          addressDetail: boardingRow.address_detail ?? null,
        }
      : null,
    stampCount: stats.stampCount,
    couponCount: stats.couponCount,
    halfCouponCount: stats.halfCouponCount,
    fullCouponCount: stats.fullCouponCount,
  };
}

/**
 * 구 회원 스탬프 조정 — legacy_stamps staging에만 기록.
 * guest_profiles / guest_boarding_info / profiles 원본은 절대 수정하지 않는다.
 */
export async function adjustGuestLegacyStamps(legacyUuid: string, delta: number): Promise<number> {
  if (delta === 0) return 0;
  const supabase = getSupabaseBrowserClient();
  const now = new Date().toISOString();
  const kstDate = new Date();
  kstDate.setHours(kstDate.getHours() + 9);
  const dateStr = kstDate.toISOString().split('T')[0];

  if (delta > 0) {
    const rows = Array.from({ length: delta }, (_, i) => ({
      legacy_uuid: legacyUuid,
      firestore_id: `admin-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      date: dateStr,
      method: 'ADMIN',
      created_at: now,
    }));
    const { error } = await supabase.from('legacy_stamps').insert(rows);
    if (error) throw error;
    return delta;
  }

  const need = Math.abs(delta);
  const { data: pending, error: listError } = await supabase
    .from('legacy_stamps')
    .select('id')
    .eq('legacy_uuid', legacyUuid)
    .is('applied_profile_id', null)
    .order('created_at', { ascending: false })
    .limit(need);

  if (listError) throw listError;
  const ids = ((pending ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length < need) {
    throw new Error(
      `회수 가능한 미반영 스탬프가 ${ids.length}개뿐입니다. (이미 OAuth 반영된 스탬프는 구회원 staging에서 회수할 수 없습니다)`
    );
  }
  const { error: delError } = await supabase.from('legacy_stamps').delete().in('id', ids);
  if (delError) throw delError;
  return -ids.length;
}

/**
 * 구 회원 쿠폰 조정 — legacy_coupons staging에만 기록.
 * 원본 회원/게스트 프로필은 수정하지 않는다.
 */
export async function adjustGuestLegacyCoupons(
  legacyUuid: string,
  delta: number,
  options?: { isHalf?: boolean }
): Promise<number> {
  if (delta === 0) return 0;
  const supabase = getSupabaseBrowserClient();
  const now = new Date().toISOString();
  const isHalf = Boolean(options?.isHalf);

  if (delta > 0) {
    const rows = Array.from({ length: delta }, (_, i) => ({
      legacy_uuid: legacyUuid,
      firestore_id: `admin-coupon-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      reason: 'ADMIN',
      is_half: isHalf,
      used: false,
      deleted: false,
      issued_at: now,
      created_at: now,
    }));
    const { error } = await supabase.from('legacy_coupons').insert(rows);
    if (error) throw error;
    return delta;
  }

  const need = Math.abs(delta);
  const { data: pending, error: listError } = await supabase
    .from('legacy_coupons')
    .select('id')
    .eq('legacy_uuid', legacyUuid)
    .eq('used', false)
    .eq('deleted', false)
    .is('applied_profile_id', null)
    .order('created_at', { ascending: false })
    .limit(need);

  if (listError) throw listError;
  const ids = ((pending ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length < need) {
    throw new Error(
      `회수 가능한 미반영 쿠폰이 ${ids.length}개뿐입니다. (이미 OAuth 반영된 쿠폰은 구회원 staging에서 회수할 수 없습니다)`
    );
  }
  const { error: updError } = await supabase
    .from('legacy_coupons')
    .update({ deleted: true })
    .in('id', ids);
  if (updError) throw updError;
  return -ids.length;
}
