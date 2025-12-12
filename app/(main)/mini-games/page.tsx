'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useCallback, useState } from 'react';
import { getUser } from '@/lib/storage';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PageHeader from '@/components/PageHeader';
import { getActiveGames, Game } from '@/lib/game-service';
import { IoGameControllerOutline } from 'react-icons/io5';

export default function MiniGamesPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  const handleRefresh = useCallback(async () => {
    const user = await getUser();
    if (!user?.uuid) {
      router.replace('/login');
      return;
    }
    await loadGames();
  }, [router]);

  const loadGames = async () => {
    try {
      setLoading(true);
      const activeGames = await getActiveGames();
      console.log('Loaded games:', activeGames);
      setGames(activeGames);
    } catch (error) {
      console.error('Error loading games:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  const { containerRef, isRefreshing: isPulling, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: true,
  });

  return (
    <div 
      ref={containerRef}
      className="min-h-screen bg-gray-50"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}
    >
      <PageHeader title="미니 게임" />
      {isPulling && (
        <div 
          className="position-fixed top-0 start-50 translate-middle-x d-flex align-items-center justify-content-center bg-primary text-white rounded-bottom p-2"
          style={{
            zIndex: 1001,
            transform: 'translateX(-50%)',
            minWidth: '120px',
            height: `${Math.min(pullProgress * 50, 50)}px`,
            opacity: pullProgress,
            marginTop: '60px'
          }}
        >
          {pullProgress >= 1 ? (
            <div className="spinner-border spinner-border-sm" role="status">
              <span className="visually-hidden">새로고침 중...</span>
            </div>
          ) : (
            <span className="small">아래로 당겨서 새로고침</span>
          )}
        </div>
      )}
      <div className="container py-4">
        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="text-muted">게임 목록을 불러오는 중...</p>
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-5">
            <IoGameControllerOutline size={64} className="text-muted mb-3" />
            <p className="text-muted mb-2">등록된 게임이 없습니다.</p>
            <p className="text-muted small">관리자 페이지에서 게임 스캔을 실행해주세요.</p>
          </div>
        ) : (
          <div className="row g-4">
            {games.map((game) => (
              <div key={game.game_id} className="col-6 col-md-4 col-lg-3">
                <button
                  onClick={() => router.push(`/mini-games/${game.game_id}`)}
                  className="btn btn-light w-100 h-100 p-3 d-flex flex-column align-items-center shadow-sm"
                  style={{ minHeight: '280px' }}
                >
                  {game.thumbnail_path ? (
                    <img
                      src={`/${game.thumbnail_path}`}
                      alt={game.game_name}
                      className="mb-3"
                      style={{
                        width: '100%',
                        height: '180px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                      }}
                      onError={(e) => {
                        // 썸네일 로드 실패 시 아이콘 표시
                        (e.target as HTMLImageElement).style.display = 'none';
                        const parent = (e.target as HTMLImageElement).parentElement;
                        if (parent) {
                          const icon = document.createElement('div');
                          icon.className = 'mb-3 d-flex align-items-center justify-content-center';
                          icon.style.width = '100%';
                          icon.style.height = '180px';
                          icon.style.backgroundColor = '#f0f0f0';
                          icon.style.borderRadius = '8px';
                          icon.innerHTML = '<span style="font-size: 3rem;">🎮</span>';
                          parent.insertBefore(icon, parent.firstChild);
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="mb-3 d-flex align-items-center justify-content-center"
                      style={{
                        width: '100%',
                        height: '180px',
                        backgroundColor: '#f0f0f0',
                        borderRadius: '8px',
                      }}
                    >
                      <IoGameControllerOutline size={60} className="text-muted" />
                    </div>
                  )}
                  <span className="fw-medium text-dark text-center mb-2">{game.game_name}</span>
                  {game.game_description && (
                    <small className="text-muted text-center" style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>
                      {game.game_description}
                    </small>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
