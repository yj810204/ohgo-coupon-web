import { getUser } from '@/lib/storage';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';

export async function resolveStaffAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseBrowserClient();

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const expiresAt = sessionData.session?.expires_at;
    if (sessionData.session?.access_token) {
      if (expiresAt && expiresAt * 1000 < Date.now() + 60_000) {
        const { data } = await supabase.auth.refreshSession();
        if (data.session?.access_token) return data.session.access_token;
      }
      return sessionData.session.access_token;
    }

    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session?.access_token) return refreshed.session.access_token;
  } catch {
    /* name·dob restore */
  }

  const local = await getUser();
  if (!local?.name || !local?.dob) return null;

  try {
    const res = await fetch('/api/auth/legacy-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: local.name, dob: local.dob }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; refresh_token?: string };
    if (!data.access_token || !data.refresh_token) return null;
    await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    return data.access_token;
  } catch {
    return null;
  }
}

export async function staffFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = await resolveStaffAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, credentials: 'include' });
}
