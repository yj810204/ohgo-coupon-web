import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { BoardingFormData, BoardingFormRecord } from './boarding-service.shared';

function mapRow(userId: string, row: Record<string, unknown>): BoardingFormRecord {
  return {
    userId,
    name: String(row.name ?? ''),
    birth: String(row.birth ?? ''),
    gender: String(row.gender ?? ''),
    phone: String(row.phone ?? ''),
    emergency: String(row.emergency ?? ''),
    address: String(row.address ?? ''),
    addressDetail: row.address_detail ? String(row.address_detail) : undefined,
    agreed: row.agreed === true,
    agreedThirdParty: row.agreed_third_party === true,
    tripRole: row.trip_role ? String(row.trip_role) : undefined,
  };
}

export async function getBoardingForm(userId: string): Promise<BoardingFormRecord | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('boarding_info')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(userId, data) : null;
}

export async function saveBoardingForm(
  userId: string,
  data: BoardingFormData,
  options?: { updateProfileRole?: boolean; isAdmin?: boolean },
): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  const row: Record<string, unknown> = {
    user_id: userId,
    name: data.name,
    birth: data.birth,
    gender: data.gender,
    phone: data.phone,
    emergency: data.emergency,
    address: data.address,
    address_detail: data.addressDetail?.trim() || null,
    agreed: data.agreed,
    agreed_third_party: data.agreedThirdParty,
    photo_consent: data.agreed,
    updated_at: new Date().toISOString(),
  };

  if (options?.isAdmin && data.tripRole && data.tripRole !== 'none') {
    row.trip_role = data.tripRole;
  } else if (options?.isAdmin && data.tripRole === 'none') {
    row.trip_role = null;
  }

  const { error } = await supabase.from('boarding_info').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;

  if (options?.updateProfileRole && options.isAdmin) {
    if (data.tripRole === 'captain') {
      await supabase.from('profiles').update({ role: 'captain' }).eq('id', userId);
    } else if (data.tripRole === 'none' || data.tripRole === 'sailor') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      if (profile?.role === 'captain') {
        await supabase.from('profiles').update({ role: 'member' }).eq('id', userId);
      }
    }
  }
}
