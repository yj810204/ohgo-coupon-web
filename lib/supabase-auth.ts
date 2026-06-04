import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient, resetSupabaseBrowserClient } from '@/lib/supabase/client';
import { saveUser, clearUser } from '@/lib/storage';
import { getBrowserOrigin } from '@/lib/auth-origin';

export type AppProfile = {
  id: string;
  name: string;
  dob: string | null;
  role: 'member' | 'captain' | 'admin';
  total_point: number;
  community_point: number;
  bait_coupons: number;
  expo_push_token: string | null;
};

function displayNameFromUser(user: User): string {
  return (
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email?.split('@')[0] ??
    '회원'
  );
}

/** OAuth 리다이렉트 직후 쿠키/세션 반영 대기 */
export async function waitForSupabaseUser(
  maxAttempts = 25,
  intervalMs = 200
): Promise<User | null> {
  const supabase = getSupabaseBrowserClient();

  for (let i = 0; i < maxAttempts; i++) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      return sessionData.session.user;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      return userData.user;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null;
}

export async function signInWithApple(redirectPath = '/auth/complete') {
  const supabase = getSupabaseBrowserClient();
  const origin = getBrowserOrigin();

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(redirectPath)}`,
    },
  });

  if (error) throw error;
}

export async function signInWithGoogle(redirectPath = '/auth/complete') {
  const supabase = getSupabaseBrowserClient();
  const origin = getBrowserOrigin();

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(redirectPath)}`,
    },
  });

  if (error) throw error;
}

function clearSupabaseAuthStorage() {
  if (typeof window === 'undefined') return;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('sb-') && key.includes('auth-token')) {
      localStorage.removeItem(key);
    }
  }
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith('sb-') && key.includes('auth-token')) {
      sessionStorage.removeItem(key);
    }
  }
}

export async function signOutSupabase() {
  try {
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' });
  } catch {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut({ scope: 'global' });
  }
  resetSupabaseBrowserClient();
  clearSupabaseAuthStorage();
  await clearUser();
}

export async function getSupabaseSessionUser() {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfileByUserId(userId: string): Promise<AppProfile | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('프로필 조회 실패:', error);
    return null;
  }
  return data as AppProfile | null;
}

function minimalProfileFromUser(user: User): AppProfile {
  return {
    id: user.id,
    name: displayNameFromUser(user),
    dob: null,
    role: 'member',
    total_point: 0,
    community_point: 0,
    bait_coupons: 0,
    expo_push_token: null,
  };
}

/** OAuth 로그인 후 localStorage 동기화 (기존 앱 호환) */
export async function syncLocalUserFromSupabaseSession(options?: {
  waitForSession?: boolean;
}) {
  const user = options?.waitForSession
    ? await waitForSupabaseUser()
    : await getSupabaseSessionUser();

  if (!user) return null;

  let profile = await getProfileByUserId(user.id);

  if (!profile) {
    const supabase = getSupabaseBrowserClient();
    const name = displayNameFromUser(user);

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, name, role: 'member' }, { onConflict: 'id', ignoreDuplicates: true });

    if (error) {
      console.error('프로필 insert 실패, 재조회 시도:', error);
    }
    profile = await getProfileByUserId(user.id);
  }

  if (!profile) {
    profile = minimalProfileFromUser(user);
  }

  await saveUser({
    uuid: profile.id,
    name: profile.name,
    dob: profile.dob ?? '',
    isAdmin: profile.role === 'admin',
  });

  return profile;
}

export function isAdminProfile(profile: AppProfile | null) {
  return profile?.role === 'admin';
}
