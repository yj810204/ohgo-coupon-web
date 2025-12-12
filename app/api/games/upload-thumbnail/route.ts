import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const gameId = formData.get('gameId') as string;

    if (!file || !gameId) {
      return NextResponse.json(
        { success: false, message: '파일과 게임 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 이미지 파일인지 확인
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, message: '이미지 파일만 업로드할 수 있습니다.' },
        { status: 400 }
      );
    }

    // 파일 크기 확인 (5MB 제한)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, message: '이미지 크기는 5MB 이하여야 합니다.' },
        { status: 400 }
      );
    }

    // public/games/{gameId}/ 폴더 경로
    const gamesDir = path.join(process.cwd(), 'public', 'games', gameId);
    
    // 폴더가 없으면 생성
    if (!existsSync(gamesDir)) {
      mkdirSync(gamesDir, { recursive: true });
    }

    // 썸네일 파일 경로
    const thumbnailPath = path.join(gamesDir, 'thumbnail.png');
    
    // 파일을 Buffer로 변환
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 파일 저장
    await writeFile(thumbnailPath, buffer);

    // 상대 경로 반환 (public 폴더 기준)
    const relativePath = `games/${gameId}/thumbnail.png`;

    return NextResponse.json({
      success: true,
      message: '썸네일이 업로드되었습니다.',
      thumbnail_path: relativePath,
    });
  } catch (error: any) {
    console.error('Thumbnail upload error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || '썸네일 업로드 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

