import { NextRequest, NextResponse } from 'next/server';
import { saveGameScore } from '@/lib/game-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, gameId, score, level, moves, time, extraData } = body;

    // 필수 파라미터 검증
    if (!userId || !gameId || score === undefined || score < 0) {
      return NextResponse.json(
        {
          success: false,
          message: '필수 정보가 누락되었습니다. (userId, gameId, score 필요)',
        },
        { status: 400 }
      );
    }

    // 점수 저장 및 포인트 적립
    const result = await saveGameScore(userId, gameId, score, level, moves, time, extraData);

    return NextResponse.json({
      success: true,
      message: `${result.points}포인트를 획득했습니다!`,
      points: result.points,
      totalPoints: result.totalPoints,
    });
  } catch (error: any) {
    console.error('Save score error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || '점수 저장 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

