'use client';

import { useEffect, useCallback, useState } from 'react';
import { getUser } from '@/lib/storage';
import { useNavigation } from '@/hooks/useNavigation';
import PageHeader from '@/components/PageHeader';
import { getActiveGames, Game, getGlobalGameSettings } from '@/lib/game-service';
import { IoGameControllerOutline, IoNotificationsOutline, IoTrophyOutline } from 'react-icons/io5';

export default function MiniGamesPage() {
  const { navigateReplace, navigate } = useNavigation();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [noticeModalVisible, setNoticeModalVisible] = useState(false);
  const [gameNotice, setGameNotice] = useState<string>('');

  const handleRefresh = useCallback(async () => {
    const user = await getUser();
    if (!user?.uuid) {
      navigateReplace('/login');
      return;
    }
    await loadGames();
  }, [navigateReplace]);

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
  }, [navigateReplace, handleRefresh]);

  const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
  const CARD: React.CSSProperties = { backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: 'none' };

  return (
    <div className="min-vh-100 pb-4" style={{ backgroundColor: '#F7F8FA', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <PageHeader title="미니 게임" />
      <div className="container py-3" style={{ maxWidth: 480 }}>

        {/* 게임 공지 배너 */}
        {gameNotice && (
          <button
            type="button"
            onClick={() => setNoticeModalVisible(true)}
            className="btn w-100 d-flex align-items-center gap-3 mb-4 p-3 text-start"
            style={{ backgroundColor: '#EBF1FE', borderRadius: 14, border: 'none' }}
          >
            <IoNotificationsOutline size={20} color="#1B6FF5" className="flex-shrink-0" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1B6FF5', fontFamily: FONT, flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {gameNotice.split('\n')[0]}
            </span>
            <span style={{ fontSize: 12, color: '#1B6FF5', flexShrink: 0 }}>자세히 →</span>
          </button>
        )}

        {/* 랭킹 버튼 */}
        <button
          type="button"
          onClick={() => navigate('/mini-games/ranking')}
          className="btn w-100 d-flex align-items-center justify-content-center gap-2 mb-4"
          style={{ backgroundColor: '#1B6FF5', color: '#fff', borderRadius: 14, padding: '14px', border: 'none', fontFamily: FONT, fontWeight: 700, fontSize: 15, boxShadow: '0 4px 12px rgba(27,111,245,0.3)' }}
        >
          <IoTrophyOutline size={22} />
          랭킹 보기
        </button>

        {/* 게임 목록 */}
        {loading ? (
          <div className="py-5 text-center"><div className="spinner-border text-primary" role="status" /></div>
        ) : games.length === 0 ? (
          <div className="py-5 text-center" style={CARD}>
            <IoGameControllerOutline size={52} color="#EFEFEF" />
            <p className="mt-3 mb-1" style={{ color: '#6F767E', fontFamily: FONT, fontWeight: 600 }}>등록된 게임이 없습니다.</p>
            <p style={{ color: '#ABABAB', fontFamily: FONT, fontSize: 13 }}>관리자 페이지에서 게임 스캔을 실행해주세요.</p>
          </div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {games.map(game => (
              <button
                key={game.game_id}
                type="button"
                onClick={() => navigate(`/mini-games/${game.game_id}`)}
                className="btn w-100 text-start p-0"
                style={{ ...CARD, overflow: 'hidden' }}
              >
                {(game.thumbnail_url || game.thumbnail_path) ? (
                  <img
                    src={game.thumbnail_url || (game.thumbnail_path?.startsWith('http') ? game.thumbnail_path : `/${game.thumbnail_path}`)}
                    alt={game.game_name}
                    style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="d-flex align-items-center justify-content-center" style={{ height: 120, backgroundColor: '#F7F8FA' }}>
                    <IoGameControllerOutline size={48} color="#ABABAB" />
                  </div>
                )}
                <div className="p-3">
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>{game.game_name}</div>
                  {game.game_description && (
                    <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginTop: 4, lineHeight: 1.4 }}>{game.game_description}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 공지사항 모달 */}
        {noticeModalVisible && (
          <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0" style={{ borderRadius: 20, overflow: 'hidden' }}>
                <div className="modal-header border-0 px-4 pt-4 pb-2">
                  <h5 className="modal-title fw-bold" style={{ color: '#1A1D1F', fontFamily: FONT }}>게임 공지사항</h5>
                  <button type="button" className="btn-close" onClick={() => setNoticeModalVisible(false)} />
                </div>
                <div className="modal-body px-4">
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#1A1D1F', fontFamily: FONT, fontSize: 14 }}>{gameNotice}</div>
                </div>
                <div className="modal-footer border-0 px-4 pb-4 pt-2">
                  <button type="button" onClick={() => setNoticeModalVisible(false)} className="btn w-100 fw-semibold" style={{ backgroundColor: '#1B6FF5', color: '#fff', borderRadius: 12, padding: 13, border: 'none', fontFamily: FONT }}>닫기</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
