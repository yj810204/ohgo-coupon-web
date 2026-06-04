import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { processQrStamp } from '@/lib/stamps/process-qr-stamp';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const qrData = body?.qrData as string | undefined;
    const userId = body?.userId as string | undefined;

    if (!qrData || typeof qrData !== 'string') {
      return NextResponse.json(
        { ok: false, code: 'INVALID_REQUEST', message: 'qrData가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { ok: false, code: 'INVALID_REQUEST', message: 'userId가 필요합니다.' },
        { status: 400 }
      );
    }

    if (isSupabaseConfigured()) {
      type CookieEntry = {
        name: string;
        value: string;
        options?: Parameters<NextResponse['cookies']['set']>[2];
      };
      const pendingCookies: CookieEntry[] = [];

      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) => {
                request.cookies.set(name, value);
                pendingCookies.push({ name, value, options });
              });
            },
          },
        }
      );

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          { ok: false, code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
          { status: 401 }
        );
      }

      if (user.id !== userId) {
        return NextResponse.json(
          { ok: false, code: 'FORBIDDEN', message: '본인 계정만 스탬프를 적립할 수 있습니다.' },
          { status: 403 }
        );
      }
    }

    await processQrStamp(userId, qrData);

    return NextResponse.json({ ok: true, message: '스탬프가 적립되었습니다!' });
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    if (err.code === 'INVALID_QR') {
      return NextResponse.json(
        { ok: false, code: 'INVALID_QR', message: err.message },
        { status: 400 }
      );
    }

    console.error('stamps/process error:', error);
    return NextResponse.json(
      { ok: false, code: 'STAMP_ERROR', message: err.message || '스탬프 적립 중 오류가 발생했습니다.' },
      { status: 400 }
    );
  }
}
