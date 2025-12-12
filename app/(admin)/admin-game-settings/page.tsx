'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import { getAllGames, toggleGameActive, Game } from '@/lib/game-service';
import PageHeader from '@/components/PageHeader';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function AdminGameSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<Game[]>([]);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // 통합 설정 상태
  const [globalSettings, setGlobalSettings] = useState({
    tournament_enabled: false,
    tournament_title: '',
    tournament_description: '',
    tournament_start_date: '',
    tournament_end_date: '',
    show_medals: true,
    ranking_medal_count: 3, // 1, 2, 3 중 선택 (기본값 3)
  });

  // 게임 티켓 수량 관리 상태
  const [ticketSettings, setTicketSettings] = useState({
    daily_limit: '',
    ticket_per_coupon: '5',
  });
  const [savingTicketLimit, setSavingTicketLimit] = useState(false);
  const [savingTicketPerCoupon, setSavingTicketPerCoupon] = useState(false);

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
      await Promise.all([loadGames(), loadGlobalSettings(), loadTicketSettings(), loadTournamentSettings()]);
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

  const loadGlobalSettings = async () => {
    try {
      const settingsRef = doc(db, 'gameSettings', 'global');
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        setGlobalSettings({
          tournament_enabled: data.tournament_enabled || false,
          tournament_title: data.tournament_title || '',
          tournament_description: data.tournament_description || '',
          tournament_start_date: data.tournament_start_date || '',
          tournament_end_date: data.tournament_end_date || '',
          show_medals: data.show_medals !== undefined ? data.show_medals : true,
          ranking_medal_count: data.ranking_medal_count ?? 3,
        });
      }
    } catch (error) {
      console.error('Error loading global settings:', error);
    }
  };

  const loadTournamentSettings = async () => {
    try {
      const tournamentRef = doc(db, 'gameSettings', 'tournament');
      const tournamentSnap = await getDoc(tournamentRef);
      if (tournamentSnap.exists()) {
        const data = tournamentSnap.data();
        setGlobalSettings(prev => ({
          ...prev,
          tournament_title: data.title || '',
          tournament_description: data.description || '',
          tournament_enabled: !!data.title && !!data.startDate && !!data.endDate,
        }));
        
        // 날짜 변환
        if (data.startDate) {
          const startDate = data.startDate.toDate ? data.startDate.toDate() : new Date(data.startDate);
          const startDateString = startDate.toISOString().slice(0, 16);
          setGlobalSettings(prev => ({ ...prev, tournament_start_date: startDateString }));
        }
        if (data.endDate) {
          const endDate = data.endDate.toDate ? data.endDate.toDate() : new Date(data.endDate);
          const endDateString = endDate.toISOString().slice(0, 16);
          setGlobalSettings(prev => ({ ...prev, tournament_end_date: endDateString }));
        }
      }
    } catch (error) {
      console.error('Error loading tournament settings:', error);
    }
  };

  const loadTicketSettings = async () => {
    try {
      const baitRef = doc(db, 'config', 'bait');
      const baitSnap = await getDoc(baitRef);
      if (baitSnap.exists()) {
        const data = baitSnap.data();
        setTicketSettings({
          daily_limit: data.dailyLimit?.toString() || '',
          ticket_per_coupon: data.baitPerCoupon?.toString() || '5',
        });
      }
    } catch (error) {
      console.error('Error loading ticket settings:', error);
    }
  };

  const handleSaveGlobalSettings = async () => {
    try {
      setSaving(true);
      
      // gameSettings/global 저장
      const settingsRef = doc(db, 'gameSettings', 'global');
      await setDoc(settingsRef, {
        tournament_enabled: globalSettings.tournament_enabled,
        show_medals: globalSettings.show_medals,
        ranking_medal_count: globalSettings.ranking_medal_count,
        updatedAt: new Date(),
      }, { merge: true });

      // gameSettings/tournament 저장
      if (globalSettings.tournament_enabled && globalSettings.tournament_title && globalSettings.tournament_start_date && globalSettings.tournament_end_date) {
        const tournamentRef = doc(db, 'gameSettings', 'tournament');
        await setDoc(tournamentRef, {
          title: globalSettings.tournament_title,
          description: globalSettings.tournament_description || '',
          startDate: new Date(globalSettings.tournament_start_date),
          endDate: new Date(globalSettings.tournament_end_date),
          updatedAt: new Date(),
        }, { merge: true });
      }
      
      alert('통합 설정이 저장되었습니다.');
    } catch (error) {
      console.error('Error saving global settings:', error);
      alert('통합 설정 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTicketLimit = async () => {
    if (!ticketSettings.daily_limit.trim()) {
      alert('일일 게임 티켓 수량을 입력해주세요.');
      return;
    }

    const ticketLimitNumber = parseInt(ticketSettings.daily_limit);
    if (isNaN(ticketLimitNumber) || ticketLimitNumber < 0) {
      alert('유효한 숫자를 입력해주세요.');
      return;
    }

    try {
      setSavingTicketLimit(true);
      const baitRef = doc(db, 'config', 'bait');
      await setDoc(baitRef, {
        dailyLimit: ticketLimitNumber,
        updatedAt: new Date(),
      }, { merge: true });
      alert('일일 게임 티켓 수량이 저장되었습니다.');
    } catch (error) {
      console.error('Error saving daily ticket limit:', error);
      alert('일일 게임 티켓 수량 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingTicketLimit(false);
    }
  };

  const handleSaveTicketPerCoupon = async () => {
    if (!ticketSettings.ticket_per_coupon.trim()) {
      alert('교환권 당 게임 티켓 수량을 입력해주세요.');
      return;
    }

    const ticketPerCouponNumber = parseInt(ticketSettings.ticket_per_coupon);
    if (isNaN(ticketPerCouponNumber) || ticketPerCouponNumber <= 0) {
      alert('교환권 당 게임 티켓 수량은 1 이상의 숫자여야 합니다.');
      return;
    }

    try {
      setSavingTicketPerCoupon(true);
      const baitRef = doc(db, 'config', 'bait');
      await setDoc(baitRef, {
        baitPerCoupon: ticketPerCouponNumber,
        updatedAt: new Date(),
      }, { merge: true });
      alert('교환권 당 게임 티켓 수량이 저장되었습니다.');
    } catch (error) {
      console.error('Error saving ticket per coupon:', error);
      alert('교환권 당 게임 티켓 수량 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingTicketPerCoupon(false);
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
      <div className="container pb-4" style={{ paddingTop: '80px' }}>
        {/* 통합 설정 */}
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-primary text-white">
            <h5 className="mb-0">통합 설정</h5>
          </div>
          <div className="card-body">
            {/* 대회 설정 */}
            <div className="mb-4">
              <label className="form-label fw-bold">대회 설정</label>
              <div className="mb-3">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="tournament_enabled"
                    checked={globalSettings.tournament_enabled}
                    onChange={(e) => setGlobalSettings({ ...globalSettings, tournament_enabled: e.target.checked })}
                  />
                  <label className="form-check-label" htmlFor="tournament_enabled">
                    대회 모드 활성화
                  </label>
                </div>
                <small className="text-muted">대회 모드를 활성화하면 지정된 기간 동안 대회 랭킹이 표시됩니다.</small>
              </div>
              {globalSettings.tournament_enabled && (
                <>
                  <div className="mb-3">
                    <label className="form-label small">대회 타이틀</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={globalSettings.tournament_title}
                      onChange={(e) => setGlobalSettings({ ...globalSettings, tournament_title: e.target.value })}
                      placeholder="대회 타이틀을 입력하세요"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small">대회 간단설명</label>
                    <textarea
                      className="form-control form-control-sm"
                      rows={3}
                      value={globalSettings.tournament_description}
                      onChange={(e) => setGlobalSettings({ ...globalSettings, tournament_description: e.target.value })}
                      placeholder="대회에 대한 간단한 설명을 입력하세요"
                    />
                  </div>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label small">대회 시작일</label>
                      <input
                        type="datetime-local"
                        className="form-control form-control-sm"
                        value={globalSettings.tournament_start_date}
                        onChange={(e) => setGlobalSettings({ ...globalSettings, tournament_start_date: e.target.value })}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small">대회 종료일</label>
                      <input
                        type="datetime-local"
                        className="form-control form-control-sm"
                        value={globalSettings.tournament_end_date}
                        onChange={(e) => setGlobalSettings({ ...globalSettings, tournament_end_date: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 일일 게임 티켓 수량 관리 */}
            <div className="mb-4">
              <label className="form-label fw-bold">일일 게임 티켓 수량 관리</label>
              <div className="mb-3">
                <label className="form-label small">일일 게임 티켓 수량 제한</label>
                <div className="d-flex gap-2 align-items-end">
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    min="0"
                    value={ticketSettings.daily_limit}
                    onChange={(e) => setTicketSettings({ ...ticketSettings, daily_limit: e.target.value })}
                    placeholder="일일 게임 티켓 수량을 입력하세요"
                    style={{ maxWidth: '200px' }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={handleSaveTicketLimit}
                    disabled={savingTicketLimit}
                  >
                    {savingTicketLimit ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                        저장 중...
                      </>
                    ) : (
                      '저장'
                    )}
                  </button>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label small">교환권 당 게임 티켓 수량</label>
                <div className="d-flex gap-2 align-items-end">
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    min="1"
                    value={ticketSettings.ticket_per_coupon}
                    onChange={(e) => setTicketSettings({ ...ticketSettings, ticket_per_coupon: e.target.value })}
                    placeholder="교환권 당 게임 티켓 수량을 입력하세요"
                    style={{ maxWidth: '200px' }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={handleSaveTicketPerCoupon}
                    disabled={savingTicketPerCoupon}
                  >
                    {savingTicketPerCoupon ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                        저장 중...
                      </>
                    ) : (
                      '저장'
                    )}
                  </button>
                </div>
                <small className="text-muted">게임 티켓 교환권 1개 사용 시 지급되는 게임 티켓 수량입니다.</small>
              </div>
            </div>

            {/* 랭킹 메달 표시 설정 */}
            <div className="mb-3">
              <label className="form-label fw-bold">랭킹 표시 설정</label>
              <div className="mb-3">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="show_medals"
                    checked={globalSettings.show_medals}
                    onChange={(e) => setGlobalSettings({ ...globalSettings, show_medals: e.target.checked })}
                  />
                  <label className="form-check-label" htmlFor="show_medals">
                    순위 메달 표시
                  </label>
                </div>
                <small className="text-muted">랭킹에서 메달 아이콘을 표시합니다.</small>
              </div>
              {globalSettings.show_medals && (
                <div>
                  <label className="form-label small">순위 메달 표시 개수</label>
                  <div className="d-flex gap-2 mb-2">
                    <button
                      type="button"
                      className={`btn btn-sm ${globalSettings.ranking_medal_count === 1 ? 'btn-primary' : 'btn-outline-primary'}`}
                      onClick={() => setGlobalSettings({ ...globalSettings, ranking_medal_count: 1 })}
                    >
                      1위만
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${globalSettings.ranking_medal_count === 2 ? 'btn-primary' : 'btn-outline-primary'}`}
                      onClick={() => setGlobalSettings({ ...globalSettings, ranking_medal_count: 2 })}
                    >
                      2위까지
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${globalSettings.ranking_medal_count === 3 ? 'btn-primary' : 'btn-outline-primary'}`}
                      onClick={() => setGlobalSettings({ ...globalSettings, ranking_medal_count: 3 })}
                    >
                      3위까지
                    </button>
                  </div>
                  <small className="text-muted">랭킹 화면에서 표시할 메달의 개수를 설정합니다. (1-3위)</small>
                </div>
              )}
            </div>

            <div className="d-flex justify-content-end">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveGlobalSettings}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    저장 중...
                  </>
                ) : (
                  '통합 설정 저장'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 게임 스캔 */}
        <div className="card shadow-sm mb-3">
          <div className="card-body">
            <div className="d-flex align-items-center gap-3 mb-3">
              <button
                className="btn btn-primary"
                onClick={handleScanGames}
                disabled={scanning}
                style={{ whiteSpace: 'nowrap' }}
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
                      <th style={{ whiteSpace: 'nowrap' }}>게임 ID</th>
                      <th style={{ whiteSpace: 'nowrap' }}>게임명</th>
                      <th style={{ whiteSpace: 'nowrap' }}>타입</th>
                      <th style={{ whiteSpace: 'nowrap' }}>상태</th>
                      <th style={{ whiteSpace: 'nowrap' }}>포인트 비율</th>
                      <th style={{ whiteSpace: 'nowrap' }}>등록일</th>
                      <th style={{ whiteSpace: 'nowrap' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((game) => (
                      <tr key={game.game_id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{game.game_id}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{game.game_name}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{game.game_type || '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {game.is_active ? (
                            <span className="badge bg-success">활성</span>
                          ) : (
                            <span className="badge bg-secondary">비활성</span>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{game.point_rate ?? 100}%</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {game.regdate
                            ? new Date(game.regdate.seconds * 1000).toLocaleDateString('ko-KR')
                            : '-'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="d-flex gap-2" style={{ whiteSpace: 'nowrap' }}>
                            <button
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleToggleGame(game.game_id, game.is_active)}
                              style={{ whiteSpace: 'nowrap' }}
                            >
                              {game.is_active ? '비활성화' : '활성화'}
                            </button>
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => handleEditGame(game)}
                              style={{ whiteSpace: 'nowrap' }}
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
