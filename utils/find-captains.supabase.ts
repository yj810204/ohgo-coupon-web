import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { CrewMember } from './find-captains.shared';

export type { CrewMember };

export async function findCaptains(): Promise<CrewMember[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, expo_push_token, role')
      .in('role', ['captain', 'sailor']);

    if (error) throw error;

    return (data ?? []).map((row) => ({
      uuid: row.id,
      name: row.name,
      expoPushToken: row.expo_push_token ?? undefined,
      role: row.role,
    }));
  } catch (e) {
    console.error('캡틴/세일러 조회 실패:', e);
    return [];
  }
}
