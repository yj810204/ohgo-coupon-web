'use client';

import React, { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { IoChevronForwardOutline, IoTrophyOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import { useNavigation } from '@/hooks/useNavigation';
import { getUser } from '@/lib/storage';
import {
  fetchMedalCount,
  fetchRankingUsers,
  fetchTournament,
  maskName,
  RANKING_FONT,
  type RankingUser,
  type TournamentInfo,
} from '@/lib/ranking';
import { OhgoPageLoading } from '@/lib/page-styles';

const CARD: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: 'none',
  overflow: 'hidden',
};

const MEDAL_COLORS: Record<number, { bg: string; color: string }> = {
  1: { bg: '#FFD700', color: '#7A5800' },
  2: { bg: '#C0C0C0', color: '#4A4A4A' },
  3: { bg: '#CD7F32', color: '#5A2D00' },
};

function MedalBadge({ rank, medalCount }: { rank: number; medalCount: number }) {
  const medal = rank <= 3 && medalCount >= rank ? MEDAL_COLORS[rank] : null;
  return (
    <div
      className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
      style={{
        width: 32,
        height: 32,
        backgroundColor: medal ? medal.bg : '#F7F8FA',
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: medal ? medal.color : '#6F767E',
          fontFamily: RANKING_FONT,
          lineHeight: 1,
        }}
      >
        {rank}
      </span>
    </div>
  );
}

function RankingPageContent() {
  const router = useRouter();
  const { navigate } = useNavigation();
  const [users, setUsers] = useState<RankingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [tournament, setTournament] = useState<TournamentInfo>(null);
  const [medalCount, setMedalCount] = useState(3);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userUuid, setUserUuid] = useState<string | null>(null);

  const loadAll = useCallback(async (options?: { silent?: boolean }) => {
    if (!userUuid) return;
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const [t, medal, ranking] = await Promise.all([
        fetchTournament(),
        fetchMedalCount(),
        fetchRankingUsers(userUuid),
      ]);
      setTournament(t);
      setMedalCount(medal);
      setUsers(ranking.users);
      setMyRank(ranking.myRank);
    } catch (e) {
      console.error('랭킹 로드 실패:', e);
      if (!silent) {
        setLoadError('랭킹 정보를 불러오지 못했습니다. 아래로 당겨 다시 시도해 주세요.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [userUuid]);

  useEffect(() => {
    const init = async () => {
      const u = await getUser();
      if (!u?.uuid) {
        router.replace('/login');
        return;
      }
      setUserUuid(u.uuid);
      setIsAdmin(u.isAdmin || false);
    };
    void init();
  }, [router]);

  useEffect(() => {
    if (userUuid) void loadAll();
  }, [userUuid, loadAll]);

  const handleRefresh = async () => {
    await loadAll({ silent: true });
  };

  if (!userUuid) {
    return <OhgoPageLoading />;
  }

  return (
    <SubPageFrame title="랭킹" onRefresh={handleRefresh}>
      {loading ? (
        <div className="py-5 text-center">
          <div className="spinner-border text-primary" role="status" />
          <p className="mt-3 mb-0" style={{ fontSize: 14, color: '#6F767E', fontFamily: RANKING_FONT }}>
            랭킹 정보를 불러오는 중...
          </p>
        </div>
      ) : loadError ? (
        <EmptyState icon={IoTrophyOutline} message={loadError} style={CARD} />
      ) : (
        <>
          {tournament ? (
            <button
              type="button"
              onClick={() => navigate('/mini-games/ranking/tournament')}
              className="btn w-100 d-flex align-items-center gap-3 mb-4 p-3 text-start"
              style={{ backgroundColor: '#EBF1FE', borderRadius: 14, border: 'none' }}
            >
              <IoTrophyOutline size={20} color="#1B6FF5" className="flex-shrink-0" />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#1B6FF5',
                  fontFamily: RANKING_FONT,
                  flexGrow: 1,
                }}
              >
                {tournament.title}
              </span>
              <IoChevronForwardOutline size={18} color="#1B6FF5" className="flex-shrink-0" aria-hidden />
            </button>
          ) : (
            <div
              className="mb-4 p-3 text-center"
              style={{ backgroundColor: '#F7F8FA', borderRadius: 14 }}
            >
              <span style={{ fontSize: 13, color: '#6F767E', fontFamily: RANKING_FONT }}>
                현재 진행 중인 대회가 없습니다
              </span>
            </div>
          )}

          {users.length === 0 ? (
            <EmptyState icon={IoTrophyOutline} message="랭킹 데이터가 없습니다." style={CARD} />
          ) : (
            <div style={CARD}>
              <div className="d-flex px-3 py-2" style={{ backgroundColor: '#F7F8FA' }}>
                <div style={{ width: 48, fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: RANKING_FONT }}>
                  순위
                </div>
                <div style={{ flexGrow: 1, fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: RANKING_FONT }}>
                  이름
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#6F767E',
                    fontFamily: RANKING_FONT,
                    textAlign: 'right',
                  }}
                >
                  포인트
                </div>
              </div>

              {users.map((item, idx) => {
                const isMe = item.id === userUuid;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/mini-games/ranking/${item.id}`)}
                    className="btn w-100 d-flex align-items-center px-3 py-3 text-start"
                    style={{
                      border: 'none',
                      borderTop: '1px solid #F7F8FA',
                      borderRadius: 0,
                      background: isMe ? '#EBF1FE' : '#FFFFFF',
                      boxShadow: 'none',
                    }}
                  >
                    <div style={{ width: 48, flexShrink: 0 }}>
                      <MedalBadge rank={idx + 1} medalCount={medalCount} />
                    </div>
                    <div
                      style={{
                        flexGrow: 1,
                        fontSize: 14,
                        fontWeight: isMe ? 700 : 500,
                        color: isMe ? '#1B6FF5' : '#1A1D1F',
                        fontFamily: RANKING_FONT,
                      }}
                    >
                      {isMe || isAdmin ? item.name : maskName(item.name)}
                      {isMe && (
                        <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.7 }}>
                          (나)
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#1B6FF5',
                        fontFamily: RANKING_FONT,
                      }}
                    >
                      {item.totalPoint.toLocaleString()}P
                    </div>
                  </button>
                );
              })}

              {myRank && (
                <div
                  className="px-3 py-3 text-center"
                  style={{ borderTop: '1px solid #F7F8FA', backgroundColor: '#F7F8FA' }}
                >
                  <span style={{ fontSize: 13, color: '#6F767E', fontFamily: RANKING_FONT }}>
                    내 순위: <strong style={{ color: '#1B6FF5' }}>{myRank}위</strong> / {users.length}명 중
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </SubPageFrame>
  );
}

export default function RankingPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <RankingPageContent />
    </Suspense>
  );
}
