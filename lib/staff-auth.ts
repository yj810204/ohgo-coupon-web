import { NextRequest } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { createAdminClient } from '@/lib/supabase/admin';
import { isFirebaseDataSource } from '@/lib/data-source';
import { getFirebaseDb } from '@/lib/firebase/client';
import { applyPendingCookies, getRequestSession, type RequestSession } from '@/lib/api-session';

export { applyPendingCookies };

export async function resolveSessionUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (bearer) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.getUser(bearer);
      if (!error && data.user?.id) return data.user.id;
    } catch {
      /* cookie session */
    }
  }

  const session = await getRequestSession(request);
  return session?.user.id ?? null;
}

export async function isCaptainOrAdmin(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (profile?.role === 'captain' || profile?.role === 'admin') return true;
  } catch {
    /* firebase fallback */
  }

  if (!isFirebaseDataSource()) return false;
  try {
    const snap = await getDoc(doc(getFirebaseDb(), 'users', userId));
    if (!snap.exists()) return false;
    const data = snap.data();
    return data.isAdmin === true || data.role === 'captain' || data.role === 'admin';
  } catch {
    return false;
  }
}

export async function requireCaptainOrAdmin(
  request: NextRequest
): Promise<{ ok: true; userId: string; session: RequestSession | null } | { ok: false; status: number; message: string }> {
  const session = await getRequestSession(request).catch(() => null);
  let userId = session?.user.id ?? null;
  if (!userId) userId = await resolveSessionUserId(request);
  if (!userId) return { ok: false, status: 401, message: '로그인이 필요합니다.' };
  if (!(await isCaptainOrAdmin(userId))) {
    return { ok: false, status: 403, message: '선장 또는 관리자만 사용할 수 있습니다.' };
  }
  return { ok: true, userId, session };
}

export async function resolveStaffActor(userId: string): Promise<{ userId: string; name: string }> {
  try {
    const snap = await getDoc(doc(getFirebaseDb(), 'users', userId));
    if (snap.exists()) {
      const name = String(snap.data().name ?? '').trim();
      if (name) return { userId, name };
    }
  } catch {
    /* profiles fallback */
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin.from('profiles').select('name').eq('id', userId).maybeSingle();
    const name = String(data?.name ?? '').trim();
    if (name) return { userId, name };
  } catch {
    /* default */
  }

  return { userId, name: '선장' };
}
