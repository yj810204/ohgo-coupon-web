import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadThumbnailBuffer } from '@/lib/game-thumbnail';

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const form = formData as unknown as { get(name: string): File | string | null };
    const file = form.get('file') as File;
    const gameId = form.get('gameId') as string;

    if (!file || !gameId) {
      return NextResponse.json(
        { success: false, message: '파일과 게임 ID가 필요합니다.' },
        { status: 400 },
      );
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, message: '이미지 파일만 업로드할 수 있습니다.' },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, message: '이미지 크기는 5MB 이하여야 합니다.' },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const relativePath = `games/${gameId}/thumbnail.png`;

    // public 폴더에도 저장 (로컬 정적 제공 fallback)
    const gamesDir = path.join(process.cwd(), 'public', 'games', gameId);
    if (!existsSync(gamesDir)) {
      await mkdir(gamesDir, { recursive: true });
    }
    await writeFile(path.join(gamesDir, 'thumbnail.png'), buffer);

    let thumbnailUrl: string | undefined;

    if (isSupabaseConfigured()) {
      const admin = createAdminClient();

      const { data: gameRow, error: gameError } = await admin
        .from('games')
        .select('id')
        .eq('id', gameId)
        .maybeSingle();
      if (gameError) throw gameError;
      if (!gameRow) {
        return NextResponse.json(
          { success: false, message: '게임을 찾을 수 없습니다.' },
          { status: 404 },
        );
      }

      const { publicUrl } = await uploadThumbnailBuffer(admin, gameId, buffer, file.type);
      thumbnailUrl = publicUrl;

      const { error: updateError } = await admin
        .from('games')
        .update({
          thumbnail_url: publicUrl,
          thumbnail_path: relativePath,
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId);
      if (updateError) throw updateError;
    }

    return NextResponse.json({
      success: true,
      message: '썸네일이 업로드되었습니다.',
      thumbnail_path: relativePath,
      thumbnail_url: thumbnailUrl,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '썸네일 업로드 중 오류가 발생했습니다.';
    console.error('Thumbnail upload error:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
