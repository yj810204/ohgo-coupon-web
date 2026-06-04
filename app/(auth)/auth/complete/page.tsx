import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ensureProfileForUser } from '@/lib/supabase/ensure-profile';
import { requiresProfileSetup } from '@/lib/profile-complete';
import AuthCompleteClient from './AuthCompleteClient';

function displayNameFromUser(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
}): string {
  return (
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split('@')[0] ??
    '회원'
  );
}

/** OAuth 콜백 redirect 직후 — 서버 세션으로 프로필 확인 → localStorage 동기화 */
export default async function AuthCompletePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?error=auth_sync_failed');
  }

  let profile: { id: string; name: string; dob: string | null; role: string };

  try {
    profile = await ensureProfileForUser(user);
  } catch {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, dob, role')
      .eq('id', user.id)
      .maybeSingle();

    profile = data ?? {
      id: user.id,
      name: displayNameFromUser(user),
      dob: null,
      role: 'member',
    };
  }

  if (requiresProfileSetup(profile)) {
    redirect('/profile-setup');
  }

  return (
    <AuthCompleteClient
      profile={{
        id: profile.id,
        name: profile.name,
        dob: profile.dob ?? '',
        isAdmin: profile.role === 'admin',
      }}
    />
  );
}
