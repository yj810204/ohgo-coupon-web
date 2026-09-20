'use client';

import { useMemo, useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import {
  IoBoatOutline,
  IoChevronBackOutline,
  IoChevronForwardOutline,
  IoTimeOutline,
} from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import { SAMPLE_TRIPS } from '@/lib/samples/mock-data';
import { OHGO_LIST_DIVIDER } from '@/lib/page-styles';
import {
  tripPricePerPersonLabel,
  tripScheduleSubtitle,
  tripSpeciesTitle,
} from '@/utils/trip-guide-service';

const FONT = "var(--font-ohgo), sans-serif";
const CARD: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: 'none',
};
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}월 ${d}일`;
}

export default function SampleTripsPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(SAMPLE_TRIPS[0]?.date ?? '');

  const monthAnchor = useMemo(() => {
    const base = selectedDate || SAMPLE_TRIPS[0]?.date;
    if (!base) return new Date();
    const [y, m] = base.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }, [selectedDate]);

  const tripMap = useMemo(() => {
    const map: Record<string, typeof SAMPLE_TRIPS> = {};
    for (const t of SAMPLE_TRIPS) {
      (map[t.date] ??= []).push(t);
    }
    return map;
  }, []);

  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedTrips = tripMap[selectedDate] ?? [];

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, '0');
    const candidate = Object.keys(tripMap)
      .filter((d) => d.startsWith(`${y}-${m}`))
      .sort()[0];
    if (candidate) setSelectedDate(candidate);
  };

  return (
    <SubPageFrame
      title="출조 안내"
      showMyPage={false}
      onBack={() => router.push('/samples/main')}
    >
      <div className="mb-4" style={{ ...CARD, overflow: 'hidden' }}>
        <div className="d-flex align-items-center justify-content-between px-3 pt-3 pb-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="btn p-2 rounded-circle"
            style={{ border: 'none', backgroundColor: '#F7F8FA' }}
          >
            <IoChevronBackOutline size={20} color="#1A1D1F" />
          </button>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}>
            {year}년 {month + 1}월
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="btn p-2 rounded-circle"
            style={{ border: 'none', backgroundColor: '#F7F8FA' }}
          >
            <IoChevronForwardOutline size={20} color="#1A1D1F" />
          </button>
        </div>

        <div
          className="d-flex"
          style={{ borderTop: '1px solid #F7F8FA', borderBottom: '1px solid #F7F8FA' }}
        >
          {DAY_LABELS.map((d, i) => (
            <div
              key={d}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '10px 0',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: FONT,
                color: i === 0 ? '#FF3B30' : i === 6 ? '#1B6FF5' : '#6F767E',
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <div key={row} className="d-flex">
            {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
              if (!day) {
                return <div key={col} style={{ flex: 1, minHeight: 56 }} aria-hidden />;
              }
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const count = tripMap[dateStr]?.length ?? 0;
              const isSelected = dateStr === selectedDate;
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => setSelectedDate(dateStr)}
                  className="btn p-0"
                  style={{
                    flex: 1,
                    minHeight: 56,
                    border: 'none',
                    borderRadius: 0,
                    backgroundColor: isSelected ? '#EBF1FE' : '#FFFFFF',
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: isSelected || count ? 700 : 500,
                      color: col === 0 ? '#FF3B30' : col === 6 ? '#1B6FF5' : '#1A1D1F',
                      fontFamily: FONT,
                    }}
                  >
                    {day}
                  </div>
                  {count > 0 ? (
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: 2,
                        minWidth: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: '#34C759',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: '16px',
                        padding: '0 4px',
                      }}
                    >
                      {count}
                    </span>
                  ) : (
                    <span style={{ display: 'block', height: 16 }} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="d-flex align-items-center gap-2 mb-2 px-1">
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
          {selectedDate ? `${formatDateLabel(selectedDate)} 출조 일정` : '출조 일정'}
        </span>
        {selectedTrips.length > 0 && (
          <span
            className="badge rounded-pill"
            style={{ backgroundColor: '#EBF1FE', color: '#1B6FF5', fontSize: 11, fontWeight: 600 }}
          >
            {selectedTrips.length}건
          </span>
        )}
      </div>

      {selectedTrips.length === 0 ? (
        <div
          className="d-flex flex-column align-items-center justify-content-center py-5"
          style={CARD}
        >
          <IoBoatOutline size={36} color="#B0B8C4" />
          <p className="mb-0 mt-2" style={{ fontSize: 14, color: '#6F767E', fontFamily: FONT }}>
            이 날은 출조 일정이 없습니다.
          </p>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 14,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}
        >
          {selectedTrips.map((trip, index) => (
            <div key={trip.id}>
              {index > 0 && <div style={OHGO_LIST_DIVIDER} />}
              <div className="d-flex align-items-center gap-3" style={{ padding: '12px 16px', minHeight: 64 }}>
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{ width: 40, height: 40, backgroundColor: '#EBF1FE' }}
                >
                  <IoBoatOutline size={20} color="#1B6FF5" />
                </div>
                <div className="flex-grow-1 min-w-0">
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                    {tripSpeciesTitle(trip)}
                  </div>
                  <div
                    className="d-flex align-items-center gap-1 mt-1"
                    style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}
                  >
                    <IoTimeOutline size={14} className="flex-shrink-0" />
                    <span className="text-truncate">{tripScheduleSubtitle(trip)}</span>
                  </div>
                  {trip.price ? (
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#1B6FF5',
                        fontFamily: FONT,
                        marginTop: 2,
                      }}
                    >
                      {tripPricePerPersonLabel(trip.price)}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 포트폴리오용: 전체 일정 미리보기 */}
      <div className="mt-4">
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }} className="mb-2 px-1">
          다가오는 출조
        </div>
        <div className="d-flex flex-column gap-2">
          {SAMPLE_TRIPS.map((trip) => (
            <button
              key={`all-${trip.id}`}
              type="button"
              onClick={() => setSelectedDate(trip.date)}
              className="btn w-100 text-start p-3"
              style={{
                ...CARD,
                borderRadius: 14,
                border: trip.date === selectedDate ? '1.5px solid #1B6FF5' : 'none',
              }}
            >
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div style={{ fontSize: 12, color: '#1B6FF5', fontWeight: 700, fontFamily: FONT }}>
                    {formatDateLabel(trip.date)}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                    {tripSpeciesTitle(trip)}
                  </div>
                  <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>
                    {tripScheduleSubtitle(trip)}
                  </div>
                </div>
                {trip.price ? (
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1B6FF5', fontFamily: FONT }}>
                    {tripPricePerPersonLabel(trip.price)}
                  </div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </SubPageFrame>
  );
}
