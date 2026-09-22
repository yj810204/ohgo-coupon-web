import { createHmac, timingSafeEqual } from 'crypto';
import { doc, getDoc } from 'firebase/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isFirebaseDataSource } from '@/lib/data-source';
import { getFirebaseDb, isFirebaseConfigured } from '@/lib/firebase/client';
import { createAdminClient } from '@/lib/supabase/admin';

function readBearer(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  const alt = request.headers.get('x-tide-publish-token')?.trim();
  return alt || null;
}

function safeEqualString(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    const dummy = createHmac('sha256', 'tide-briefing').update(left).digest();
    timingSafeEqual(dummy, dummy);
    return false;
  }
  return timingSafeEqual(a, b);
}

function publishToken(): string {
  return process.env.TIDE_BRIEFING_PUBLISH_TOKEN?.trim() ?? '';
}

export function isPublishTokenAuthorized(request: NextRequest): boolean {
  const expected = publishToken();
  const bearer = readBearer(request);
  return Boolean(expected && bearer && safeEqualString(expected, bearer));
}

async function isSupabaseAdmin(userId: string): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const admin = createAdminClient();
  const { data } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'admin';
}

async function isFirebaseAdmin(userId: string): Promise<boolean> {
  if (!isFirebaseDataSource() || !isFirebaseConfigured()) return false;
  try {
    const snap = await getDoc(doc(getFirebaseDb(), 'users', userId));
    if (!snap.exists()) return false;
    const data = snap.data();
    return data.isAdmin === true || data.role === 'admin';
  } catch {
    return false;
  }
}

async function resolveSessionUserId(request: NextRequest, bearer: string | null): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;

  if (bearer && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.getUser(bearer);
      if (!error && data.user?.id) return data.user.id;
    } catch {
      // fall through to cookie session
    }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // publish API — no cookie refresh
        },
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function authorizeTideBriefingPublish(
  request: NextRequest,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (isPublishTokenAuthorized(request)) return { ok: true };

  const bearer = readBearer(request);
  const userId = await resolveSessionUserId(request, bearer);
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: '게시 권한이 없습니다. TIDE_BRIEFING_PUBLISH_TOKEN 또는 관리자 세션이 필요합니다.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    };
  }

  if ((await isSupabaseAdmin(userId)) || (await isFirebaseAdmin(userId))) {
    return { ok: true };
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: '관리자만 AI 출조 브리핑을 게시할 수 있습니다.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    ),
  };
}
