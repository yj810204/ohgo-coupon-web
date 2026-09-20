import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { doc, getDoc } from 'firebase/firestore';
import { createAdminClient } from '@/lib/supabase/admin';
import { isFirebaseDataSource } from '@/lib/data-source';
import { getFirebaseDb } from '@/lib/firebase/client';
import { personIdentityKey } from '@/lib/person-name';

const BUCKET = 'rosters';
const MAX_BYTES = 10 * 1024 * 1024;

async function resolveUserIdFromSession(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearer) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.getUser(bearer);
      if (!error && data.user?.id) return data.user.id;
    } catch {
      // fall through to cookie session
    }
  }

  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // upload only — no cookie refresh needed
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  return user?.id ?? null;
}

async function resolveUserIdFromIdentity(
  uuid: string,
  name: string,
  dob: string
): Promise<string | null> {
  if (!uuid || !name || !dob) return null;
  const key = personIdentityKey(name, dob);
  if (key.startsWith('|') || key.endsWith('|')) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, name, dob')
    .eq('id', uuid)
    .maybeSingle();
  if (profile && personIdentityKey(String(profile.name ?? ''), String(profile.dob ?? '')) === key) {
    return profile.id;
  }

  if (!isFirebaseDataSource()) return null;
  try {
    const snap = await getDoc(doc(getFirebaseDb(), 'users', uuid));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (personIdentityKey(String(data.name ?? ''), String(data.dob ?? '')) !== key) return null;
    return uuid;
  } catch {
    return null;
  }
}

async function isCaptainOrAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (profile?.role === 'captain' || profile?.role === 'admin') return true;

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

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    let userId = await resolveUserIdFromSession(request);
    if (!userId) {
      userId = await resolveUserIdFromIdentity(
        String(form.get('uuid') || ''),
        String(form.get('name') || ''),
        String(form.get('dob') || '')
      );
    }
    if (!userId) {
      return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!(await isCaptainOrAdmin(userId))) {
      return NextResponse.json(
        { success: false, message: '선장 또는 관리자만 명부를 확정할 수 있습니다.' },
        { status: 403 }
      );
    }

    const file = form.get('file');
    const date = String(form.get('date') || '');
    const tripNumber = Number(form.get('tripNumber'));

    if (!(file instanceof Blob)) {
      return NextResponse.json({ success: false, message: '파일이 필요합니다.' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, message: '날짜가 올바르지 않습니다.' }, { status: 400 });
    }
    if (![1, 2, 3].includes(tripNumber)) {
      return NextResponse.json({ success: false, message: '항차가 올바르지 않습니다.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, message: '명부 이미지가 너무 큽니다. 다시 생성해 주세요.' },
        { status: 400 }
      );
    }

    const imagePath = `${date}/trip${tripNumber}.jpg`;
    const bytes = await file.arrayBuffer();
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(imagePath, bytes, {
      upsert: true,
      contentType: 'image/jpeg',
    });
    if (uploadError) throw uploadError;

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(imagePath);
    return NextResponse.json({
      success: true,
      imagePath,
      imageUrl: urlData.publicUrl,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '명부 이미지 업로드 중 오류가 발생했습니다.';
    console.error('Roster upload error:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
