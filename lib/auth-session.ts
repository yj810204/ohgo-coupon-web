import { getUser } from '@/lib/storage';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  syncLocalUserFromSupabaseSession,
  getProfileByUserId,
  type AppProfile,
} from '@/lib/supabase-auth';
import { requiresProfileSetup } from '@/lib/profile-complete';

export type AppUser = {
  uuid: string;
  name: string;
  dob: string;
  isAdmin: boolean;
  isCaptain?: boolean;
  needsProfileSetup?: boolean;
};

function profileToAppUser(profile: AppProfile): AppUser {
  return {
    uuid: profile.id,
    name: profile.name,
    dob: profile.dob ?? '',
    isAdmin: profile.role === 'admin',
    isCaptain: profile.role === 'captain',
    needsProfileSetup: requiresProfileSetup(profile),
  };
}

/** localStorage + Supabase 세션 검증 */
export async function resolveAppUser(): Promise<AppUser | null> {
  let localUser = await getUser();

  if (!localUser?.uuid && isSupabaseConfigured()) {
    const profile = await syncLocalUserFromSupabaseSession();
    if (profile) {
      return profileToAppUser(profile);
    }
    return null;
  }

  if (!localUser?.uuid) return null;

  if (!isSupabaseConfigured()) return null;

  let profile = await getProfileByUserId(localUser.uuid);
  if (!profile) {
    profile = await syncLocalUserFromSupabaseSession();
  }
  if (!profile) return null;
  return profileToAppUser(profile);
}

export function getHomePathForUser(user: AppUser): string {
  if (user.isAdmin || user.isCaptain) return '/admin-main';
  if (user.needsProfileSetup) return '/profile-setup';
  return '/main';
}

/** localStorage + Supabase 세션 + 부가 데이터 정리 */
export async function signOutApp(options?: { uuid?: string }) {
  const uuid = options?.uuid;

  if (uuid && isSupabaseConfigured()) {
    try {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase/client');
      const supabase = getSupabaseBrowserClient();
      await supabase
        .from('profiles')
        .update({ expo_push_token: null })
        .eq('id', uuid);
    } catch {
      // ignore
    }
  }

  if (typeof window !== 'undefined') {
    localStorage.removeItem('expoPushToken');
    localStorage.removeItem('notificationHistory');
  }

  if (isSupabaseConfigured()) {
    const { signOutSupabase } = await import('@/lib/supabase-auth');
    await signOutSupabase();
  } else {
    const { clearUser } = await import('@/lib/storage');
    await clearUser();
  }
}
