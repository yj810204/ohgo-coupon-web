'use client';

import { useEffect, useState } from 'react';
import { getTripsByMonth, TripGuide } from '@/utils/trip-guide-service';
import { IoBoatOutline, IoTimeOutline, IoFishOutline, IoChevronForwardOutline } from 'react-icons/io5';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function getWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((day + 6) % 7)); // 이번 주 월요일
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6); // 이번 주 일요일
  sun.setHours(23, 59, 59, 999);
  return { start: mon, end: sun };
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  onViewAll: () => void;
}

export default function WeeklyTripSummary({ onViewAll }: Props) {
  const [trips, setTrips] = useState<TripGuide[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { start, end } = getWeekRange();
        const startYM = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
        const endYM = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;

        // 주가 월 경계를 넘는 경우 두 달 모두 조회
        let all: TripGuide[] = [];
        if (startYM === endYM) {
          all = await getTripsByMonth(startYM);
        } else {
          const [a, b] = await Promise.all([
            getTripsByMonth(startYM),
            getTripsByMonth(endYM),
          ]);
          all = [...a, ...b];
        }

        const startStr = toDateStr(start);
        const endStr = toDateStr(end);
        const weekly = all.filter(t => t.date >= startStr && t.date <= endStr);
        weekly.sort((a, b) => a.date.localeCompare(b.date));
        setTrips(weekly);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return null; // 로딩 중엔 조용히

  const todayStr = toDateStr(new Date());

  return (
    <section className="mb-4">
      {/* 섹션 헤더 */}
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div className="d-flex align-items-center gap-2">
          <span style={{ fontSize: 17, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}>
            이번 주 출조
          </span>
          {trips.length > 0 && (
            <span className="badge rounded-pill" style={{ backgroundColor: '#1B6FF5', fontSize: 11, fontFamily: FONT }}>
              {trips.length}건
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="btn p-0 d-flex align-items-center gap-1"
          style={{ border: 'none', background: 'none', color: '#1B6FF5', fontSize: 13, fontFamily: FONT, fontWeight: 600 }}
        >
          전체 보기 <IoChevronForwardOutline size={14} />
        </button>
      </div>

      {trips.length === 0 ? (
        <div
          className="d-flex align-items-center gap-3 p-3"
          style={{ backgroundColor: '#FFFFFF', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        >
          <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
            style={{ width: 40, height: 40, backgroundColor: '#F7F8FA' }}>
            <IoBoatOutline size={20} color="#ABABAB" />
          </div>
          <span style={{ fontSize: 14, color: '#6F767E', fontFamily: FONT }}>이번 주 출조 일정이 없습니다.</span>
        </div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {trips.map(trip => {
            const isToday = trip.date === todayStr;
            const dayIdx = new Date(trip.date + 'T00:00:00').getDay();
            const isSun = dayIdx === 0;
            const isSat = dayIdx === 6;
            const dayColor = isToday ? '#1B6FF5' : isSun ? '#FF3B30' : isSat ? '#1B6FF5' : '#6F767E';

            return (
              <button
                key={trip.id}
                type="button"
                onClick={onViewAll}
                className="btn w-100 text-start d-flex align-items-center gap-3 p-3"
                style={{
                  backgroundColor: isToday ? '#EBF1FE' : '#FFFFFF',
                  borderRadius: 14,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  border: isToday ? '1.5px solid #1B6FF5' : 'none',
                }}
              >
                {/* 날짜 뱃지 */}
                <div className="text-center flex-shrink-0" style={{ width: 36 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: dayColor, fontFamily: FONT }}>
                    {DAY_LABELS[dayIdx]}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: isToday ? '#1B6FF5' : '#1A1D1F', fontFamily: FONT, lineHeight: 1.2 }}>
                    {parseInt(trip.date.split('-')[2])}
                  </div>
                  {isToday && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#1B6FF5', fontFamily: FONT }}>오늘</div>
                  )}
                </div>

                <div style={{ width: 1, height: 36, backgroundColor: isToday ? '#C7D9FD' : '#EFEFEF', flexShrink: 0 }} />

                {/* 정보 */}
                <div className="flex-grow-1 overflow-hidden">
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {trip.destination}
                  </div>
                  <div className="d-flex align-items-center gap-3 mt-1 flex-wrap">
                    <span className="d-flex align-items-center gap-1" style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>
                      <IoTimeOutline size={13} />
                      {trip.departureTime}
                      {trip.returnTime && ` ~ ${trip.returnTime}`}
                    </span>
                    {trip.species && (
                      <span className="d-flex align-items-center gap-1" style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>
                        <IoFishOutline size={13} />
                        {trip.species}
                      </span>
                    )}
                  </div>
                </div>

                {/* 요금 */}
                {trip.price && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1B6FF5', fontFamily: FONT, flexShrink: 0 }}>
                    {trip.price.toLocaleString()}원
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
