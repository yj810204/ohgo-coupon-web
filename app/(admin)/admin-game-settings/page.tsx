'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import { getAllGames, toggleGameActive, Game } from '@/lib/game-service';
import PageHeader from '@/components/PageHeader';

export default function AdminGameSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<Game[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }

      const remoteUser = await getUserByUUID(user.uuid);
      if (!remoteUser?.isAdmin) {
        router.replace('/main');
        return;
      }

      setLoading(false);
      loadGames();
    };
    checkAuth();
  }, [router]);

  const loadGames = async () => {
    try {
      const allGames = await getAllGames();
      setGames(allGames);
    } catch (error) {
      console.error('Error loading games:', error);
      alert('게임 목록을 불러오는 중 오류가 발생했습니다.');
    }
  };

  const handleScanGames = async () => {
    if (!confirm('games 폴더를 스캔하여 게임을 등록하시겠습니까?')) {
      return;
    }

    setScanning(true);
    try {
      const response = await fetch('/api/games/scan', {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success) {
        const message = `게임 스캔 완료: ${result.registered}개 등록, ${result.updated}개 업데이트`;
        if (result.errors && result.errors.length > 0) {
          console.warn('스캔 중 오류:', result.errors);
          alert(`${message}\n\n오류:\n${result.errors.join('\n')}`);
        } else {
          alert(message);
        }
        await loadGames();
      } else {
        alert(`게임 스캔 실패: ${result.message}\n\n오류:\n${(result.errors || []).join('\n')}`);
      }
    } catch (error) {
      console.error('Scan error:', error);
      alert('게임 스캔 중 오류가 발생했습니다.');
    } finally {
      setScanning(false);
    }
  };

  const handleToggleGame = async (gameId: string, currentStatus: boolean) => {
    if (!confirm(`게임을 ${currentStatus ? '비활성화' : '활성화'}하시겠습니까?`)) {
      return;
    }

    try {
      await toggleGameActive(gameId, !currentStatus);
      await loadGames();
    } catch (error) {
      console.error('Toggle error:', error);
      alert('게임 상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleEditGame = (game: Game) => {
    router.push(`/admin-game-settings/${game.game_id}`);
  };

  if (loading) {
    return (
      <div className="d-flex min-vh-100 align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light">
      <PageHeader title="게임 설정" />
      <div className="container py-4">
        <div className="card shadow-sm mb-3">
          <div className="card-body">
            <div className="d-flex align-items-center gap-3 mb-3">
              <button
                className="btn btn-primary"
                onClick={handleScanGames}
                disabled={scanning}
              >
                {scanning ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    스캔 중...
                  </>
                ) : (
                  '게임 스캔'
                )}
              </button>
              <small className="text-muted">public/games/ 폴더의 게임을 자동으로 스캔하여 등록합니다.</small>
            </div>
          </div>
        </div>

        <div className="card shadow-sm">
          <div className="card-body">
            {games.length === 0 ? (
              <div className="text-center py-5">
                <p className="text-muted">등록된 게임이 없습니다.</p>
                <p className="text-muted small">게임은 public/games/ 폴더에 추가하면 자동으로 인식됩니다.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>게임 ID</th>
                      <th>게임명</th>
                      <th>타입</th>
                      <th>상태</th>
                      <th>포인트 비율</th>
                      <th>등록일</th>
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((game) => (
                      <tr key={game.game_id}>
                        <td>{game.game_id}</td>
                        <td>{game.game_name}</td>
                        <td>{game.game_type || '-'}</td>
                        <td>
                          {game.is_active ? (
                            <span className="badge bg-success">활성</span>
                          ) : (
                            <span className="badge bg-secondary">비활성</span>
                          )}
                        </td>
                        <td>{game.point_rate ?? 100}%</td>
                        <td>
                          {game.regdate
                            ? new Date(game.regdate.seconds * 1000).toLocaleDateString('ko-KR')
                            : '-'}
                        </td>
                        <td>
                          <div className="d-flex gap-2">
                            <button
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleToggleGame(game.game_id, game.is_active)}
                            >
                              {game.is_active ? '비활성화' : '활성화'}
                            </button>
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => handleEditGame(game)}
                            >
                              수정
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
