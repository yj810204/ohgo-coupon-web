import { getUser } from '@/lib/storage';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  syncLocalUserFromSupabaseSession,
  getProfileByUserId,
  type AppProfile,
} from '@/lib/supabase-auth';
import { DEV_MOCK_USER, isDevAuthBypass } from '@/lib/dev-auth';

export type AppUser = {
  uuid: string;
  name: string;
  dob: string;
  isAdmin: boolean;
  isCaptain?: boolean;
};

function profileToAppUser(profile: AppProfile): AppUser {
  return {
    uuid: profile.id,
    name: profile.name,
    dob: profile.dob ?? '',
    isAdmin: profile.role === 'admin',
    isCaptain: profile.role === 'captain',
  };
}

const APP_USER_TTL_MS = 45_000;
let appUserCache: { user: AppUser | null; expiresAt: number } | null = null;
let appUserInflight: Promise<AppUser | null> | null = null;

export function invalidateAppUserCache() {
  appUserCache = null;
  appUserInflight = null;
}

export function primeAppUserCache(user: AppUser) {
  appUserInflight = null;
  appUserCache = { user, expiresAt: Date.now() + APP_USER_TTL_MS };
}

async function resolveAppUserUncached(): Promise<AppUser | null> {
  if (isDevAuthBypass()) {
    return { ...DEV_MOCK_USER };
  }

  const localUser = await getUser();

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

/** localStorage + Supabase 세션 검증. 로그인된 사용자만 45초 캐시. null은 캐시하지 않음. */
export async function resolveAppUser(options?: { force?: boolean }): Promise<AppUser | null> {
  if (
    !options?.force &&
    appUserCache?.user &&
    appUserCache.expiresAt > Date.now()
  ) {
    return appUserCache.user;
  }
  if (!options?.force && appUserInflight) return appUserInflight;

  const request = resolveAppUserUncached()
    .then((user) => {
      if (appUserInflight === request) appUserInflight = null;
      if (user) {
        appUserCache = { user, expiresAt: Date.now() + APP_USER_TTL_MS };
      } else if (!appUserCache?.user) {
        appUserCache = null;
      }
      return user;
    })
    .catch((error) => {
      if (appUserInflight === request) appUserInflight = null;
      throw error;
    });

  appUserInflight = request;
  return request;
}

export function getHomePathForUser(user: AppUser): string {
  if (user.isAdmin || user.isCaptain) return '/admin-main';
  return '/main';
}

/** localStorage + Supabase 세션 + 부가 데이터 정리 */
export async function signOutApp(options?: { uuid?: string }) {
  invalidateAppUserCache();
  const uuid = options?.uuid;

  if (uuid) {
    try {
      const { isFirebaseDataSource } = await import('@/lib/data-source');
      if (isFirebaseDataSource()) {
        const { saveExpoPushToken } = await import('@/utils/member-profile-service');
        await saveExpoPushToken(uuid, null);
      } else if (isSupabaseConfigured()) {
        const { getSupabaseBrowserClient } = await import('@/lib/supabase/client');
        const supabase = getSupabaseBrowserClient();
        await supabase
          .from('profiles')
          .update({ expo_push_token: null })
          .eq('id', uuid);
      }
    } catch {
      // ignore
    }
  }

  if (typeof window !== 'undefined') {
    localStorage.removeItem('expoPushToken');
    localStorage.removeItem('notificationHistory');
    void fetch('/api/admin-gate', { method: 'DELETE', credentials: 'include' });
  }

  if (isSupabaseConfigured()) {
    const { signOutSupabase } = await import('@/lib/supabase-auth');
    await signOutSupabase();
  } else {
    const { clearUser } = await import('@/lib/storage');
    await clearUser();
  }
}
