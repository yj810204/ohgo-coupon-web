import { NextRequest, NextResponse } from 'next/server';
import { scanGamesFolder } from '@/lib/game-scanner';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    // public/games/ 폴더 경로
    const gamesPath = path.join(process.cwd(), 'public', 'games');
    
    // 게임 스캔 실행
    const result = await scanGamesFolder(gamesPath);
    
    return NextResponse.json({
      success: true,
      ...result,
      message: `게임 스캔 완료: ${result.registered}개 등록, ${result.updated}개 업데이트`,
    });
  } catch (error: any) {
    console.error('Game scan error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || '게임 스캔 중 오류가 발생했습니다.',
        errors: [error.message || '알 수 없는 오류'],
      },
      { status: 500 }
    );
  }
}

