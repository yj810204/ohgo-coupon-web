'use client';

import { useEffect, useState } from 'react';
import { IoTrophyOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import {
  fetchTournament,
  formatTournamentPeriod,
  RANKING_FONT,
  type TournamentInfo,
} from '@/lib/ranking';

const CARD: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: 'none',
};

export default function RankingTournamentPage() {
  const [tournament, setTournament] = useState<TournamentInfo>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setTournament(await fetchTournament());
      setLoading(false);
    };
    load();
  }, []);

  return (
    <SubPageFrame
      title={tournament?.title ?? '대회 안내'}
      onRefresh={async () => {
        setTournament(await fetchTournament());
      }}
    >
      {loading ? (
        <div className="py-5 text-center">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : !tournament ? (
        <EmptyState icon={IoTrophyOutline} message="현재 진행 중인 대회가 없습니다." style={CARD} />
      ) : (
        <div className="p-4" style={CARD}>
          <div className="d-flex align-items-center gap-2 mb-3">
            <IoTrophyOutline size={22} color="#1B6FF5" />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F', fontFamily: RANKING_FONT }}>
              {tournament.title}
            </span>
          </div>
          <p
            className="mb-3"
            style={{ fontSize: 13, color: '#6F767E', fontFamily: RANKING_FONT }}
          >
            {formatTournamentPeriod(tournament)}
          </p>
          {tournament.description ? (
            <p
              style={{
                fontSize: 14,
                color: '#1A1D1F',
                fontFamily: RANKING_FONT,
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
                marginBottom: 0,
              }}
            >
              {tournament.description}
            </p>
          ) : (
            <p className="mb-0" style={{ fontSize: 14, color: '#6F767E', fontFamily: RANKING_FONT }}>
              등록된 상세 안내가 없습니다.
            </p>
          )}
        </div>
      )}
    </SubPageFrame>
  );
}
