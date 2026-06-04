import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'photos';

export async function POST(request: NextRequest) {
  try {
    type CookieEntry = {
      name: string;
      value: string;
      options?: Parameters<NextResponse['cookies']['set']>[2];
    };
    const pendingCookies: CookieEntry[] = [];

    const supabaseAuth = createServerClient(
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
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
    }

    const form = await request.formData();
    const file = (form as unknown as { get(name: string): File | null }).get('file');

    if (!file) {
      return NextResponse.json({ success: false, message: '파일이 필요합니다.' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, message: '이미지 파일만 업로드할 수 있습니다.' },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, message: '이미지 크기는 5MB 이하여야 합니다.' },
        { status: 400 }
      );
    }

    const fileExtension = file.name.split('.').pop() || 'jpg';
    const photoId = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const imagePath = `community/photos/${photoId}.${fileExtension}`;

    const bytes = await file.arrayBuffer();
    const admin = createAdminClient();

    const { error: uploadError } = await admin.storage.from(BUCKET).upload(imagePath, bytes, {
      upsert: true,
      contentType: file.type,
    });

    if (uploadError) throw uploadError;

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(imagePath);

    const response = NextResponse.json({
      success: true,
      message: '사진이 업로드되었습니다.',
      imageUrl: urlData.publicUrl,
      photoId,
      imagePath,
    });
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '사진 업로드 중 오류가 발생했습니다.';
    console.error('Photo upload error:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
