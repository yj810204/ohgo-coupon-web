import { getUser } from '@/lib/storage';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';

async function resolveAccessToken(): Promise<string | null> {
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
    // fall through to name·dob session restore
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

export async function uploadRosterImage(
  blob: Blob,
  date: string,
  tripNumber: number
): Promise<{ imagePath: string; imageUrl: string }> {
  const form = new FormData();
  form.append('file', blob, `${date}_trip${tripNumber}.jpg`);
  form.append('date', date);
  form.append('tripNumber', String(tripNumber));

  const local = await getUser();
  if (local?.uuid) {
    form.append('uuid', local.uuid);
    form.append('name', local.name || '');
    form.append('dob', local.dob || '');
  }

  const headers: HeadersInit = {};
  const token = await resolveAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch('/api/rosters/upload', {
    method: 'POST',
    body: form,
    headers,
    credentials: 'include',
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    imagePath?: string;
    imageUrl?: string;
  };
  if (!res.ok || !json.success || !json.imagePath || !json.imageUrl) {
    throw new Error(json.message || '명부 이미지 업로드에 실패했습니다.');
  }
  return { imagePath: json.imagePath, imageUrl: json.imageUrl };
}
