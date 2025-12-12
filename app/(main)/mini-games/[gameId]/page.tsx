'use client';

import { useEffect, useState, useRef, Suspense, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getGame, Game } from '@/lib/game-service';
import { GameLoader } from '@/lib/game-loader';
import PageHeader from '@/components/PageHeader';

function GamePlayContent() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.gameId as string;
  
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameLoader, setGameLoader] = useState<GameLoader | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const scoreListenerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const gameStartAttemptedRef = useRef(false); // 게임 시작 시도 플래그

  // saveScore 함수를 useCallback으로 메모이제이션
  const saveScore = useCallback(async (score: number, level?: number, moves?: number, time?: number) => {
    if (savingScore) return;

    const user = await getUser();
    if (!user?.uuid) {
      alert('로그인이 필요합니다.');
      return;
    }

    setSavingScore(true);
    try {
      const response = await fetch('/api/games/save-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uuid,
          gameId,
          score,
          level,
          moves,
          time,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(`${result.points}포인트를 획득했습니다! (총 ${result.totalPoints.toLocaleString()}포인트)`);
      } else {
        alert(`점수 저장 실패: ${result.message}`);
      }
    } catch (error: any) {
      console.error('Save score error:', error);
      alert('점수 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingScore(false);
    }
  }, [gameId, savingScore]);

  useEffect(() => {
    let loaderInstance: GameLoader | null = null;

    const init = async () => {
      try {
        // 사용자 확인
        const user = await getUser();
        if (!user?.uuid) {
          router.replace('/login');
          return;
        }

        // 게임 정보 로드
        const gameData = await getGame(gameId);
        if (!gameData) {
          setError('게임을 찾을 수 없습니다.');
          setLoading(false);
          return;
        }

        if (!gameData.is_active) {
          setError('비활성화된 게임입니다.');
          setLoading(false);
          return;
        }

        setGame(gameData);

        // Phaser.js 로드
        await loadPhaser();

        // 게임 로더 초기화
        loaderInstance = new GameLoader();
        
        // 점수 저장 콜백 설정
        loaderInstance.onScore = (score: number, level?: number, moves?: number, time?: number) => {
          saveScore(score, level, moves, time);
        };
        
        // 게임 스크립트에서 사용할 수 있도록 전역 변수로 설정
        window.gameLoader = loaderInstance;
        
        setGameLoader(loaderInstance);

        // 게임 로드
        await loaderInstance.loadGame(gameId, gameData.game_path);
        
        // 게임 인스턴스도 전역 변수로 설정 (게임 스크립트에서 접근 가능하도록)
        if (loaderInstance.getCurrentGame()) {
          (window.gameLoader as any).gameInstance = (loaderInstance as any).gameInstance;
        }
        
        // 게임 로드 완료 후 자동으로 게임 시작
        // 컨테이너가 렌더링될 때까지 잠시 대기
        setLoading(false);
        
        // 게임이 이미 시작되었거나 시작 시도 중이면 건너뛰기
        if (gameStartAttemptedRef.current) {
          return;
        }
        gameStartAttemptedRef.current = true;
        
        // 게임 컨테이너가 DOM에 마운트될 때까지 대기
        const startGameWhenReady = (retryCount = 0) => {
          const maxRetries = 30; // 최대 3초 대기
          
          if (gameContainerRef.current) {
            const containerId = gameContainerRef.current.id || 'game-container';
            
            // 컨테이너가 보이도록 설정 (Phaser가 제대로 초기화되려면 보이는 상태여야 함)
            // 먼저 컨테이너를 보이게 한 다음, 잠시 후 게임 시작
            gameContainerRef.current.style.display = 'block';
            gameContainerRef.current.style.visibility = 'visible';
            gameContainerRef.current.style.width = '100vw';
            gameContainerRef.current.style.height = '100vh';
            
            // 컨테이너가 렌더링될 시간을 주기 위해 약간의 지연
            setTimeout(() => {
              // 게임이 이미 시작되었으면 건너뛰기
              if (gameStarted) {
                return;
              }
              
              // 게임 시작
              try {
                console.log('Starting game with container:', containerId);
                console.log('Container dimensions:', {
                  width: gameContainerRef.current?.offsetWidth,
                  height: gameContainerRef.current?.offsetHeight,
                });
                
                if (loaderInstance) {
                  loaderInstance.startGame(containerId);
                  setGameStarted(true);
                } else {
                  throw new Error('게임 로더가 초기화되지 않았습니다.');
                }
              } catch (err: any) {
                console.error('Auto start game error:', err);
                setError(`게임 시작 중 오류가 발생했습니다: ${err.message}`);
                gameStartAttemptedRef.current = false; // 실패 시 재시도 가능하도록
              }
            }, 100);
          } else if (retryCount < maxRetries) {
            // 컨테이너가 아직 준비되지 않았으면 재시도
            console.log(`Container not ready, retrying... (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => startGameWhenReady(retryCount + 1), 100);
          } else {
            console.error('Container not found after max retries');
            setError('게임 컨테이너를 찾을 수 없습니다.');
            gameStartAttemptedRef.current = false; // 실패 시 재시도 가능하도록
          }
        };
        
        // 초기 대기 후 게임 시작 시도 (컨테이너가 DOM에 마운트될 시간 확보)
        setTimeout(() => startGameWhenReady(), 500);
      } catch (err: any) {
        console.error('Game initialization error:', err);
        setError(err.message || '게임을 로드할 수 없습니다.');
        setLoading(false);
      }
    };

    init();

    // 점수 저장 리스너 설정
    const handleScoreMessage = async (event: MessageEvent) => {
      // 게임에서 전달된 점수 처리
      if (event.data && typeof event.data === 'object') {
        if (event.data.type === 'GAME_SCORE' && event.data.gameId === gameId) {
          await saveScore(event.data.score, event.data.level, event.data.moves, event.data.time);
        } else if (event.data.gameId === gameId && typeof event.data.score === 'number') {
          // 간단한 형식도 지원
          await saveScore(event.data.score, event.data.level, event.data.moves, event.data.time);
        }
      }
    };

    window.addEventListener('message', handleScoreMessage);
    scoreListenerRef.current = handleScoreMessage;

    // 게임 로더에 점수 저장 콜백 등록
    if (gameLoader) {
      (gameLoader as any).onScore = (score: number, level?: number, moves?: number, time?: number) => {
        saveScore(score, level, moves, time);
      };
    }

    return () => {
      // 상태를 먼저 초기화하여 로딩 화면이 사라지도록 함
      setLoading(false);
      setGameStarted(false);
      setError(null);
      gameStartAttemptedRef.current = false;
      
      // 게임 로더 cleanup (모든 게임 리소스 정리)
      if (loaderInstance) {
        try {
          loaderInstance.cleanup();
        } catch (e) {
          console.error('Cleanup error:', e);
        }
      }
      
      // 전역 변수 정리
      if (window.gameLoader) {
        try {
          (window.gameLoader as any).cleanup();
          delete (window as any).gameLoader;
        } catch (e) {
          console.error('Global cleanup error:', e);
        }
      }
      
      // 이벤트 리스너 제거
      if (scoreListenerRef.current) {
        try {
          window.removeEventListener('message', scoreListenerRef.current);
        } catch (e) {
          console.error('Remove listener error:', e);
        }
      }
    };
  }, [gameId, router, saveScore]);

  const loadPhaser = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if ((window as any).Phaser) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/phaser@3.70.0/dist/phaser.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Phaser.js 로드 실패'));
      document.head.appendChild(script);
    });
  };


  if (loading) {
    return (
      <div className="min-vh-100 bg-light d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">게임을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-vh-100 bg-light">
        <PageHeader title={game?.game_name || '게임'} />
        <div className="container pb-4" style={{ paddingTop: '80px' }}>
          <div className="card shadow-sm">
            <div className="card-body text-center py-5">
              <p className="text-danger">{error}</p>
              <button className="btn btn-primary" onClick={() => router.back()}>
                돌아가기
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!game) {
    return null;
  }

  // 게임이 시작되면 전체화면으로 표시
  if (gameStarted) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, overflow: 'hidden' }}>
        <div
          id="game-container"
          ref={gameContainerRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />
        {savingScore && (
          <div style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '8px',
          }}>
            <div className="spinner-border spinner-border-sm me-2" role="status"></div>
            <span>점수 저장 중...</span>
          </div>
        )}
      </div>
    );
  }

  // 게임 컨테이너는 항상 렌더링 (ref 연결을 위해)
  // 초기에는 숨김 상태로 두고, 게임 시작 시 보이게 함
  // 게임이 시작되지 않았고 로딩 중이 아니고 에러도 없으면 아무것도 렌더링하지 않음
  // 단, ref를 위해 컨테이너는 항상 렌더링되어야 하므로 조건부 렌더링은 하지 않음
  // 대신 로딩 화면만 조건부로 표시
  if (!gameStarted && !loading && !error && !game) {
    return null;
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, overflow: 'hidden' }}>
      <div
        id="game-container"
        ref={gameContainerRef}
        style={{
          width: '100vw',
          height: '100vh',
          display: gameStarted ? 'block' : 'none',
          position: 'absolute',
          top: 0,
          left: 0,
          visibility: gameStarted ? 'visible' : 'hidden',
        }}
      />
      {loading && !gameStarted && !error && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10000,
          color: 'white',
          textAlign: 'center',
        }}>
          <div className="spinner-border text-white mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p>게임을 불러오는 중...</p>
        </div>
      )}
    </div>
  );
}

export default function GamePlayPage() {
  return (
    <Suspense fallback={
      <div className="min-vh-100 bg-light d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">로딩 중...</p>
        </div>
      </div>
    }>
      <GamePlayContent />
    </Suspense>
  );
}

