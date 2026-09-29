'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { listMemberBoardingDates } from '@/utils/roster-service';
import { loadMemberBoardingRange } from '@/utils/boarding-range.firebase';
import { RANGE_PRESETS, normalizeRange, rangePreset, type BoardingDateRange } from '@/lib/boarding-range';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { IoBoatOutline } from 'react-icons/io5';
import { OHGO_CARD, OHGO_FONT, OHGO_INPUT, OHGO_SECONDARY_BTN, OhgoPageLoading } from '@/lib/page-styles';

const LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  marginBottom: 4,
};

function BoardingHistoryPageContent() {
  const searchParams = useSearchParams();
  const uuid = searchParams.get('uuid') || '';
  const [startDate, setStartDate] = useState(searchParams.get('start') || '');
  const [endDate, setEndDate] = useState(searchParams.get('end') || '');
  const [dates, setDates] = useState<{ date: string; tripNumber: number }[]>([]);
  const [rangeStats, setRangeStats] = useState<{ stamps: number; tripCredited: number } | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const loadDates = async (range: Partial<BoardingDateRange> = { startDate, endDate }) => {
    if (!uuid) return;
    setError('');
    const start = range.startDate ?? '';
    const end = range.endDate ?? '';
    if (!start && !end) {
      setRangeStats(null);
      setDates(await listMemberBoardingDates(uuid));
      setLoaded(true);
      return;
    }
    const checked = normalizeRange(start, end);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    const result = await loadMemberBoardingRange(uuid, checked.range);
    setDates(result.trips);
    setRangeStats({ stamps: result.stamps, tripCredited: result.tripCredited });
    setLoaded(true);
  };

  useEffect(() => {
    if (uuid) {
      void loadDates();
    }
    // uuid 가 바뀔 때만 자동 조회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid]);

  useNativePullToRefresh(() => loadDates());

  const setRange = (range: BoardingDateRange | null) => {
    setStartDate(range?.startDate ?? '');
    setEndDate(range?.endDate ?? '');
    void loadDates(range ?? { startDate: '', endDate: '' });
  };

  return (
    <SubPageFrame title="승선 기록" onRefresh={() => loadDates()}>
      <div className="p-3 mb-3" style={OHGO_CARD}>
        <div className="d-flex gap-2">
          <div className="flex-grow-1" style={{ minWidth: 0 }}>
            <div style={LABEL}>시작일</div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ ...OHGO_INPUT, width: '100%' }}
            />
          </div>
          <div className="flex-grow-1" style={{ minWidth: 0 }}>
            <div style={LABEL}>종료일</div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ ...OHGO_INPUT, width: '100%' }}
            />
          </div>
        </div>
        <div className="d-flex gap-2 mt-2">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn btn-sm flex-grow-1"
              onClick={() => setRange(rangePreset(p.id))}
              style={{
                borderRadius: 999,
                border: '1px solid #EFEFEF',
                fontFamily: OHGO_FONT,
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="d-flex gap-2 mt-2">
          <button
            type="button"
            className="btn btn-primary btn-sm flex-grow-1 fw-semibold"
            onClick={() => void loadDates()}
          >
            조회
          </button>
          <button
            type="button"
            className="btn btn-sm flex-grow-1 fw-semibold"
            style={{ ...OHGO_SECONDARY_BTN, padding: '6px 12px', fontSize: 14 }}
            onClick={() => setRange(null)}
          >
            전체 기간
          </button>
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 13, color: '#C62828', fontFamily: OHGO_FONT, margin: '0 0 12px' }}>{error}</p>
      )}

      {loaded && (dates.length > 0 || rangeStats) && (
        <p style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT, margin: '0 0 12px' }}>
          {rangeStats
            ? `${startDate} ~ ${endDate} · 승선 ${dates.length}회 · 스탬프 ${rangeStats.stamps}개 · 승선일수 반영 ${rangeStats.tripCredited}회`
            : `전체 ${dates.length}회`}
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
