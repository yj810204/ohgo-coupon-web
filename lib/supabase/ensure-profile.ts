import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AppProfile } from '@/lib/supabase-auth';

function displayNameFromUser(user: User): string {
  return (
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split('@')[0] ??
    '회원'
  );
}

/** OAuth 직후 profiles 행 보장 (service role, RLS 우회). 기존 role은 유지. */
export async function ensureProfileForUser(user: User): Promise<AppProfile> {
  const name = displayNameFromUser(user);
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await admin
      .from('profiles')
      .update({ name })
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data as AppProfile;
  }

  const { data, error } = await admin
    .from('profiles')
    .insert({ id: user.id, name, role: 'member' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as AppProfile;
}
