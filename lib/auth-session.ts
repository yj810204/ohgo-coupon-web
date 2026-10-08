import { clearAllLastKnownStampCounts } from '@/lib/stamp-count-state';
import { getUser, saveUser } from '@/lib/storage';
import { storedUserFromProfile } from '@/lib/stored-user';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { withTimeoutFallback } from '@/lib/with-timeout';
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
export const AUTH_WAIT_MS = 1_500;

function localToAppUser(local: { uuid: string; name?: string; dob?: string; isAdmin?: boolean }): AppUser {
  return {
    uuid: local.uuid,
    name: local.name || '',
    dob: local.dob || '',
    isAdmin: Boolean(local.isAdmin),
  };
}
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

/** 만료됐어도 마지막 사용자를 즉시 돌려준다. 네트워크 확인은 resolveAppUser가 뒤에서 한다. */
export function peekAppUser(): AppUser | null {
  return appUserCache?.user ?? null;
}

/** 메모리 캐시 또는 localStorage. 화면을 네트워크보다 먼저 연다. */
export function peekStoredAppUser(): AppUser | null {
  const cached = peekAppUser();
  if (cached) return cached;
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('userInfo');
    if (!raw) return null;
    const local = JSON.parse(raw) as { uuid?: string; name?: string; dob?: string; isAdmin?: boolean };
    if (!local?.uuid) return null;
    return localToAppUser({ uuid: local.uuid, name: local.name, dob: local.dob, isAdmin: local.isAdmin });
  } catch {
    return null;
  }
}

async function resolveAppUserUncached(): Promise<AppUser | null> {
  if (isDevAuthBypass()) {
    return { ...DEV_MOCK_USER };
  }

  const localUser = await getUser();

  if (!localUser?.uuid && isSupabaseConfigured()) {
    const profile = await withTimeoutFallback(syncLocalUserFromSupabaseSession(), AUTH_WAIT_MS, null);
    if (profile) return profileToAppUser(profile);
    return null;
  }

  if (!localUser?.uuid) return null;

  if (!isSupabaseConfigured()) return null;

  const profile = await withTimeoutFallback(
    (async () => {
      const found = await getProfileByUserId(localUser.uuid);
      if (found) return found;
      return syncLocalUserFromSupabaseSession();
    })(),
    AUTH_WAIT_MS,
    null,
  );
  if (!profile) return localToAppUser(localUser);
  await saveUser(storedUserFromProfile(profile, localUser));
  return profileToAppUser(profile);
}

function trackRefresh(): Promise<AppUser | null> {
  if (appUserInflight) return appUserInflight;
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

/** localStorage + Supabase 세션 검증. 캐시가 있으면 바로 돌려주고 프로필은 뒤에서 갱신한다. */
export async function resolveAppUser(options?: { force?: boolean }): Promise<AppUser | null> {
  const cached = appUserCache?.user ? appUserCache : null;
  const fresh = Boolean(cached && cached.expiresAt > Date.now());
  if (!options?.force && fresh && cached) {
    return cached.user;
  }

  const immediate = options?.force ? null : peekStoredAppUser();
  if (immediate) {
    void trackRefresh().catch(() => undefined);
    return immediate;
  }

  if (appUserInflight && !options?.force) {
    return withTimeoutFallback(appUserInflight, AUTH_WAIT_MS, null);
  }

  return withTimeoutFallback(trackRefresh(), AUTH_WAIT_MS, peekStoredAppUser());
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
    clearAllLastKnownStampCounts(localStorage);
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
