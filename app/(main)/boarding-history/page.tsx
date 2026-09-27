'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { listMemberBoardingDates } from '@/utils/roster-service';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { IoBoatOutline } from 'react-icons/io5';
import { OHGO_CARD, OHGO_FONT, OhgoPageLoading } from '@/lib/page-styles';

function BoardingHistoryPageContent() {
  const searchParams = useSearchParams();
  const uuid = searchParams.get('uuid') || '';
  const [dates, setDates] = useState<{ date: string; tripNumber: number }[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadDates = async () => {
    if (!uuid) return;
    setDates(await listMemberBoardingDates(uuid));
    setLoaded(true);
  };

  useEffect(() => {
    if (uuid) {
      loadDates();
    }
  }, [uuid]);

  useNativePullToRefresh(loadDates);

  return (
    <SubPageFrame title="승선 기록" onRefresh={loadDates}>
      {loaded && dates.length > 0 && (
        <p style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT, margin: '0 0 12px' }}>
          {dates.length}회
        </p>
      )}

      <div className="d-flex flex-column gap-3">
        {dates.map((item) => (
          <div key={`${item.date}-${item.tripNumber}`} className="p-3" style={OHGO_CARD}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: OHGO_FONT }}>
              {item.date}
            </div>
            <div style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT, marginTop: 4 }}>
              {item.tripNumber}항차
            </div>
          </div>
        ))}
      </div>

      {loaded && dates.length === 0 && (
        <EmptyState icon={IoBoatOutline} message="기록된 승선일이 없습니다." style={OHGO_CARD} />
      )}
    </SubPageFrame>
  );
}

export default function BoardingHistoryPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <BoardingHistoryPageContent />
    </Suspense>
  );
}
