'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useCallback, useState } from 'react';
import { getUser } from '@/lib/storage';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PageHeader from '@/components/PageHeader';
import { getActiveGames, Game, getGlobalGameSettings } from '@/lib/game-service';
import { IoGameControllerOutline, IoNotificationsOutline, IoTrophyOutline } from 'react-icons/io5';

export default function MiniGamesPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [noticeModalVisible, setNoticeModalVisible] = useState(false);
  const [gameNotice, setGameNotice] = useState<string>('');

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
      
      // 게임 공지사항 로드
      try {
        const settings = await getGlobalGameSettings();
        if (settings?.game_notice) {
          setGameNotice(settings.game_notice);
        }
      } catch (error) {
        console.error('Error loading game notice:', error);
      }
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
        {/* 게임 공지사항 버튼 */}
        {gameNotice && (
          <button
            onClick={() => setNoticeModalVisible(true)}
            className="w-100 btn btn-primary d-flex align-items-center justify-content-center rounded-0 mb-3"
          >
            <svg 
              stroke="currentColor" 
              fill="currentColor" 
              strokeWidth="0" 
              viewBox="0 0 512 512" 
              className="me-2" 
              height="20" 
              width="20" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                fill="none" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth="32" 
                d="M176 464h160m-80 0V336m128-112c0-50.64-.08-134.63-.12-160a16 16 0 0 0-16-16l-223.79.26a16 16 0 0 0-16 15.95c0 30.58-.13 129.17-.13 159.79 0 64.28 83 112 128 112S384 288.28 384 224z"
              ></path>
              <path 
                fill="none" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth="32" 
                d="M128 96H48v16c0 55.22 33.55 112 80 112M384 96h80v16c0 55.22-33.55 112-80 112"
              ></path>
            </svg>
            <span className="fw-semibold">{gameNotice.split('\n')[0]}</span>
          </button>
        )}

        {/* 랭킹 메뉴 */}
        <div className="row g-2 mb-4">
          <div className="col-12">
            <button
              onClick={() => router.push('/mini-games/ranking')}
              className="btn btn-light w-100 d-flex align-items-center justify-content-center gap-2 shadow-sm"
              style={{
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              }}
            >
              <IoTrophyOutline size={20} className="text-warning" />
              <span className="fw-semibold">랭킹</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="text-muted">게임 목록을 불러오는 중...</p>
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-5 d-flex flex-column align-items-center">
            <IoGameControllerOutline size={64} className="text-muted mb-3" />
            <p className="text-muted mb-2">등록된 게임이 없습니다.</p>
            <p className="text-muted small">관리자 페이지에서 게임 스캔을 실행해주세요.</p>
          </div>
        ) : (
          <div className="row g-4">
            {games.map((game) => (
              <div key={game.game_id} className="col-12 col-md-4 col-lg-3">
                <button
                  onClick={() => router.push(`/mini-games/${game.game_id}`)}
                  className="btn btn-light w-100 h-100 p-3 d-flex flex-column align-items-center justify-content-center shadow-sm"
                  style={{ minHeight: '280px' }}
                >
                  {(game.thumbnail_url || game.thumbnail_path) ? (
                    <div className="mb-3 w-100 d-flex justify-content-center">
                      <img
                        src={
                          game.thumbnail_url || 
                          (game.thumbnail_path?.startsWith('http') 
                            ? game.thumbnail_path 
                            : `/${game.thumbnail_path}`)
                        }
                        alt={game.game_name}
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
                            icon.className = 'd-flex align-items-center justify-content-center';
                            icon.style.width = '100%';
                            icon.style.height = '180px';
                            icon.style.backgroundColor = '#f0f0f0';
                            icon.style.borderRadius = '8px';
                            icon.innerHTML = '<span style="font-size: 3rem;">🎮</span>';
                            parent.appendChild(icon);
                          }
                        }}
                      />
                    </div>
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

        {/* 게임 공지사항 모달 */}
        {noticeModalVisible && (
          <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
                <div className="modal-header border-0" style={{ 
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  padding: '20px'
                }}>
                  <h5 className="modal-title text-white fw-bold mb-0">게임 공지사항</h5>
                  <button 
                    type="button" 
                    className="btn-close btn-close-white" 
                    onClick={() => setNoticeModalVisible(false)}
                    style={{ opacity: 0.8 }}
                  ></button>
                </div>
                <div className="modal-body p-4">
                  {gameNotice ? (
                    <div className="text-break" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                      {gameNotice}
                    </div>
                  ) : (
                    <p className="text-muted text-center mb-0">등록된 공지사항이 없습니다.</p>
                  )}
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button 
                    type="button" 
                    className="btn btn-primary w-100" 
                    onClick={() => setNoticeModalVisible(false)}
                    style={{ borderRadius: '12px', padding: '12px' }}
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
