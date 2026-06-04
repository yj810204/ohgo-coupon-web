import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { MemberProfile } from './member-profile-service.shared';

export async function getMemberProfile(userId: string): Promise<MemberProfile | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('role, total_point, bait_coupons, created_at, legacy_uuid')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    isAdmin: data.role === 'admin',
    totalPoint: Number(data.total_point) || 0,
    baitCoupons: Number(data.bait_coupons) || 0,
    createdAt: data.created_at ? new Date(data.created_at) : null,
    profileImageUrl: undefined,
    legacyUuid: data.legacy_uuid ?? null,
  };
}

export async function resetTotalPoint(userId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('profiles').update({ total_point: 0 }).eq('id', userId);
  if (error) throw error;
}

export async function updateBaitCoupons(userId: string, count: number): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('profiles')
    .update({ bait_coupons: count })
    .eq('id', userId);
  if (error) throw error;
}

export async function saveExpoPushToken(userId: string, token: string | null): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', userId);
  if (error) throw error;
}
