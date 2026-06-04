import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'games';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const form = formData as unknown as { get(name: string): File | string | null };
    const file = form.get('file') as File;
    const packId = form.get('packId') as string;
    const emojiId = form.get('emojiId') as string;

    if (!file) {
      return NextResponse.json(
        { success: false, message: '파일이 필요합니다.' },
        { status: 400 }
      );
    }

    if (!packId || !emojiId) {
      return NextResponse.json(
        { success: false, message: 'packId와 emojiId가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, message: '이미지 파일만 업로드할 수 있습니다.' },
        { status: 400 }
      );
    }

    if (file.size > 100 * 1024) {
      return NextResponse.json(
        { success: false, message: '이미지 크기는 100KB 이하여야 합니다.' },
        { status: 400 }
      );
    }

    const fileExtension = file.name.split('.').pop() || 'png';
    const imagePath = `emojis/${packId}/${emojiId}.${fileExtension}`;

    const bytes = await file.arrayBuffer();
    const admin = createAdminClient();

    const { error: uploadError } = await admin.storage.from(BUCKET).upload(imagePath, bytes, {
      upsert: true,
      contentType: file.type,
    });

    if (uploadError) throw uploadError;

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(imagePath);

    return NextResponse.json({
      success: true,
      message: '이모티콘이 업로드되었습니다.',
      imageUrl: urlData.publicUrl,
      imagePath,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '이모티콘 업로드 중 오류가 발생했습니다.';
    console.error('Emoji upload error:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
