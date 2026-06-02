'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  formatWeekRangeLabel,
  getTripsInDateRange,
  getWeekRange,
  isPastTripDate,
  TripGuide,
  tripDateToStr,
  tripWeekdayLabelColor,
  tripWeekdayNumberColor,
} from '@/utils/trip-guide-service';
import { IoTimeOutline, IoChevronForwardOutline, IoBoatOutline } from 'react-icons/io5';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_VISIBLE = 3;
/** 오늘 강조 — 토(파랑)·일(빨강)과 구분되는 주황 톤 */
const TODAY_ACCENT = '#E65100';
const TODAY_BG = '#FFF3E0';


/** 메인 노출: 오늘 포함 이후 일정 우선, 없으면 가장 가까운 일정부터 */
function pickVisibleTrips(trips: TripGuide[], limit: number): TripGuide[] {
  const sorted = [...trips].sort((a, b) => a.date.localeCompare(b.date));
  const today = tripDateToStr();
  const fromToday = sorted.filter(t => t.date >= today);
  const pool = fromToday.length > 0 ? fromToday : sorted;
  return pool.slice(0, limit);
}

interface Props {
  onViewAll: () => void;
}

export default function WeeklyTripSummary({ onViewAll }: Props) {
  const [trips, setTrips] = useState<TripGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const weekRange = useMemo(() => getWeekRange(new Date()), []);

  useEffect(() => {
    const load = async () => {
      try {
        const startStr = tripDateToStr(weekRange.start);
        const endStr = tripDateToStr(weekRange.end);
        const weekly = await getTripsInDateRange(startStr, endStr);
        setTrips(weekly);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [weekRange]);

  if (loading) return null;

  const todayStr = tripDateToStr();
  const weekLabel = formatWeekRangeLabel(weekRange.start, weekRange.end);

  const DUMMY_TRIPS: TripGuide[] = (() => {
    const { start } = weekRange;
    return [
      {
        id: 'dummy-1',
        date: tripDateToStr(new Date(start.getTime() + 2 * 86400000)),
        destination: '출조 일정 등록 예정',
        departureTime: '06:00',
        returnTime: '14:00',
        species: '참돔',
      },
    ];
  })();

  const isDummy = trips.length === 0;
  const allTrips = isDummy ? DUMMY_TRIPS : trips;
  const visibleTrips = pickVisibleTrips(allTrips, MAX_VISIBLE);
  const hiddenCount = Math.max(0, allTrips.length - visibleTrips.length);

  return (
    <section className="mb-3">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div className="d-flex align-items-baseline gap-2 flex-wrap" style={{ gap: '6px 8px' }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}>
            이번 주 출조
          </span>
          <span style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, fontWeight: 500 }}>
            ({weekLabel})
          </span>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="btn p-0 d-flex align-items-center gap-1 flex-shrink-0"
          style={{ border: 'none', background: 'none', color: '#1B6FF5', fontSize: 13, fontFamily: FONT, fontWeight: 600 }}
        >
          전체 <IoChevronForwardOutline size={14} />
        </button>
      </div>

      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}
      >
        {visibleTrips.map((trip, index) => {
          const isToday = !isDummy && trip.date === todayStr;
          const isPast = !isDummy && !isToday && isPastTripDate(trip.date, todayStr);
          const dayIdx = new Date(`${trip.date}T00:00:00`).getDay();
          const dayLabelColor = tripWeekdayLabelColor(dayIdx, isPast);
          const dayNumberColor = tripWeekdayNumberColor(dayIdx, isPast);
          const subtitle = [
            trip.departureTime && `${trip.departureTime} 출발`,
            trip.species,
            trip.price ? `${trip.price.toLocaleString()}원` : null,
          ]
            .filter(Boolean)
            .join(' · ');

          const isSun = dayIdx === 0;
          const isSat = dayIdx === 6;
          const isWeekend = isSun || isSat;

          // 숫자만 동그라미 배경
          let numBg = 'transparent';
          let numColor = dayNumberColor;
          if (isToday) { numBg = TODAY_ACCENT; numColor = '#FFFFFF'; }
          else if (isSun) { numBg = '#FFF0F0'; }
          else if (isSat) { numBg = '#EDF5FF'; }

          return (
            <div key={trip.id}>
              {index > 0 && (
                <div style={{ height: 1, backgroundColor: '#E8EAED' }} />
              )}
            <button
              type="button"
              onClick={isDummy ? undefined : onViewAll}
              className="btn w-100 text-start d-flex align-items-center gap-3 px-3"
              style={{
                backgroundColor: isToday ? TODAY_BG : isPast ? '#F7F8FA' : '#FFFFFF',
                border: 'none',
                borderRadius: 0,
                cursor: isDummy ? 'default' : 'pointer',
                opacity: isPast ? 0.92 : 1,
                paddingTop: 14,
                paddingBottom: 14,
              }}
            >
              {/* 날짜 열 — 요일 텍스트 + 숫자 동그라미 */}
              <div className="flex-shrink-0 d-flex flex-column align-items-center" style={{ width: 36, gap: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: dayLabelColor, fontFamily: FONT, lineHeight: 1 }}>
                  {DAY_LABELS[dayIdx]}
                </span>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    backgroundColor: numBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: numColor,
                      fontFamily: FONT,
                      lineHeight: 1,
                    }}
                  >
                    {parseInt(trip.date.split('-')[2], 10)}
                  </span>
                </div>
              </div>

              <div className="flex-grow-1 overflow-hidden min-w-0">
                <div className="d-flex align-items-center gap-1">
                  {isPast && (
                    <span
                      className="badge rounded-pill flex-shrink-0"
                      style={{
                        backgroundColor: '#E8EAED',
                        color: '#6F767E',
                        fontSize: 10,
                        fontFamily: FONT,
                        fontWeight: 600,
                        padding: '2px 6px',
                      }}
                    >
                      지난
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: isPast ? '#6F767E' : '#1A1D1F',
                      fontFamily: FONT,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {trip.destination}
                  </span>
                </div>
                {subtitle && (
                  <div
                    className="d-flex align-items-center gap-1"
                    style={{
                      fontSize: 12,
                      color: isPast ? '#9A9FA5' : '#6F767E',
                      fontFamily: FONT,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginTop: 2,
                    }}
                  >
                    <IoTimeOutline size={12} className="flex-shrink-0" />
                    {subtitle}
                  </div>
                )}
              </div>

              {!isDummy && (
                <IoChevronForwardOutline size={16} color="#C5C8CD" className="flex-shrink-0" />
              )}
            </button>
            </div>
          );
        })}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="btn w-100 d-flex align-items-center justify-content-center gap-1"
            style={{
              border: 'none',
              borderTop: '1px solid #E8EAED',
              backgroundColor: '#FAFAFA',
              color: '#237FFF',
              fontSize: 13,
              fontFamily: FONT,
              fontWeight: 600,
              paddingTop: 14,
              paddingBottom: 14,
            }}
          >
            외 {hiddenCount}건 더보기
            <IoChevronForwardOutline size={14} />
          </button>
        )}

        {isDummy && (
          <div
            className="px-3 py-2 d-flex align-items-center gap-2"
            style={{ backgroundColor: '#F7F8FA', borderTop: '1px solid #EFEFEF' }}
          >
            <IoBoatOutline size={14} color="#6F767E" />
            <span style={{ fontSize: 11, color: '#6F767E', fontFamily: FONT }}>
              등록된 일정이 없습니다. 전체 보기에서 달력을 확인하세요.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
