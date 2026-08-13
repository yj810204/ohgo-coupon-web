'use client';

import { useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { SAMPLE_GAMES, SAMPLE_GAME_PLAY } from '@/lib/samples/mock-data';

/**
 * 포트폴리오 캡처용 정적 플레이 스샷.
 * Phaser 라이브 구동은 쓰지 않는다 (캡처 안정·에셋 의존 없음).
 */
export default function SampleGameShotPage() {
  const router = useRouter();
  const params = useParams<{ gameId: string }>();
  const gameId = typeof params?.gameId === 'string' ? params.gameId : '';

  const game = useMemo(() => SAMPLE_GAMES.find((g) => g.game_id === gameId) ?? null, [gameId]);
  const shot = useMemo(() => (gameId ? SAMPLE_GAME_PLAY[gameId] : undefined), [gameId]);

  useEffect(() => {
    if (!shot) return;
    document.body.setAttribute('data-game-playing', 'true');
    document.body.setAttribute('data-sample-game-ready', 'true');
    return () => {
      document.body.removeAttribute('data-game-playing');
      document.body.removeAttribute('data-sample-game-ready');
    };
  }, [shot]);

  if (!game || !shot) {
    return (
      <div
        className="min-vh-100 d-flex flex-column align-items-center justify-content-center gap-3"
        style={{ backgroundColor: '#F7F8FA', padding: 24 }}
      >
        <p className="text-danger mb-0">알 수 없는 게임입니다.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => router.push('/samples/mini-games')}
        >
          목록으로
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className="ohgo-game-play-surface"
        style={{ backgroundColor: shot.background }}
        data-sample-game={gameId}
      >
        <img
          src={shot.src}
          alt={`${game.game_name} 플레이`}
          width={430}
          height={932}
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center top',
            display: 'block',
            userSelect: 'none',
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => router.push('/samples/mini-games')}
        className="ohgo-game-close-btn"
        aria-label="게임 종료"
      >
        ✕
      </button>
    </>
  );
}
