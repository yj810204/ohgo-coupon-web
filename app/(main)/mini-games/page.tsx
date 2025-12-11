'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useCallback } from 'react';
import { getUser } from '@/lib/storage';
import { IoGameControllerOutline, IoFishOutline, IoCubeOutline } from 'react-icons/io5';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

export default function MiniGamesPage() {
  const router = useRouter();

  const handleRefresh = useCallback(async () => {
    const user = await getUser();
    if (!user?.uuid) {
      router.replace('/login');
    }
  }, [router]);

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  const { containerRef, isRefreshing: isPulling, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: true,
  });

  const games = [
    { icon: IoFishOutline, label: '낚시 게임', path: '/mini-games/fishing', color: '#007AFF' },
    { icon: IoCubeOutline, label: '블록 게임', path: '/mini-games/block', color: '#FF3B30' },
    { icon: IoGameControllerOutline, label: '랭킹', path: '/mini-games/ranking', color: '#FFD700' },
  ];

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
      {isPulling && (
        <div 
          className="position-fixed top-0 start-50 translate-middle-x d-flex align-items-center justify-content-center bg-primary text-white rounded-bottom p-2"
          style={{
            zIndex: 1000,
            transform: 'translateX(-50%)',
            minWidth: '120px',
            height: `${Math.min(pullProgress * 50, 50)}px`,
            opacity: pullProgress,
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
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center mb-8">미니 게임</h1>
        
        <div className="grid grid-cols-1 gap-6 max-w-md mx-auto">
          {games.map((game, index) => {
            const Icon = game.icon;
            return (
              <button
                key={index}
                onClick={() => router.push(game.path)}
                className="flex items-center p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow"
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mr-4"
                  style={{ backgroundColor: `${game.color}20` }}
                >
                  <Icon size={32} style={{ color: game.color }} />
                </div>
                <span className="text-xl font-semibold text-gray-800">{game.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

