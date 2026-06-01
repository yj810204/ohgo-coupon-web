'use client';

import { useEffect, useMemo, useState } from 'react';
import { getTripsByMonth, TripGuide } from '@/utils/trip-guide-service';
import { IoTimeOutline, IoChevronForwardOutline, IoBoatOutline } from 'react-icons/io5';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_VISIBLE = 3;
/** 오늘 강조 — 토(파랑)·일(빨강)과 구분되는 주황 톤 */
const TODAY_ACCENT = '#E65100';
const TODAY_BG = '#FFF3E0';

function getWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((day + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { start: mon, end: sun };
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatWeekLabel(start: Date, end: Date) {
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function getDayColors(dayIdx: number) {
  if (dayIdx === 0) {
    return { dayLabelColor: '#FF3B30', dayNumberColor: '#FF3B30' };
  }
  if (dayIdx === 6) {
    return { dayLabelColor: '#1B6FF5', dayNumberColor: '#1B6FF5' };
  }
  return { dayLabelColor: '#6F767E', dayNumberColor: '#1A1D1F' };
}

/** 메인 노출: 오늘 포함 이후 일정 우선, 없으면 가장 가까운 일정부터 */
function pickVisibleTrips(trips: TripGuide[], limit: number): TripGuide[] {
  const sorted = [...trips].sort((a, b) => a.date.localeCompare(b.date));
  const today = toDateStr(new Date());
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
  const weekRange = useMemo(() => getWeekRange(), []);

  useEffect(() => {
    const load = async () => {
      try {
        const { start, end } = weekRange;
        const startYM = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
        const endYM = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;

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
  }, [weekRange]);

  if (loading) return null;

  const todayStr = toDateStr(new Date());
  const weekLabel = formatWeekLabel(weekRange.start, weekRange.end);

  const DUMMY_TRIPS: TripGuide[] = (() => {
    const { start } = weekRange;
    return [
      {
        id: 'dummy-1',
        date: toDateStr(new Date(start.getTime() + 2 * 86400000)),
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
      <div className="d-flex align-items-start justify-content-between mb-2">
        <div>
          <div className="d-flex align-items-center gap-2">
            <span style={{ fontSize: 17, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}>
              이번 주 출조
            </span>
            {!isDummy && trips.length > 0 && (
              <span
                className="badge rounded-pill"
                style={{ backgroundColor: '#EBF1FE', color: '#1B6FF5', fontSize: 11, fontFamily: FONT }}
              >
                {trips.length}건
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginTop: 2 }}>
            {weekLabel}
          </div>
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
        className="d-flex flex-column gap-1"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}
      >
        {visibleTrips.map((trip, index) => {
          const isToday = !isDummy && trip.date === todayStr;
          const dayIdx = new Date(`${trip.date}T00:00:00`).getDay();
          const { dayLabelColor, dayNumberColor } = getDayColors(dayIdx);
          const subtitle = [
            trip.departureTime && `${trip.departureTime} 출발`,
            trip.species,
            trip.price ? `${trip.price.toLocaleString()}원` : null,
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <button
              key={trip.id}
              type="button"
              onClick={isDummy ? undefined : onViewAll}
              className="btn w-100 text-start d-flex align-items-center gap-2 px-3 py-2"
              style={{
                backgroundColor: isToday ? TODAY_BG : '#FFFFFF',
                border: 'none',
                borderBottom: index < visibleTrips.length - 1 || hiddenCount > 0 ? '1px solid #F7F8FA' : 'none',
                borderRadius: 0,
                cursor: isDummy ? 'default' : 'pointer',
              }}
            >
              <div className="text-center flex-shrink-0" style={{ width: 32 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: dayLabelColor, fontFamily: FONT }}>
                  {DAY_LABELS[dayIdx]}
                </div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    color: dayNumberColor,
                    fontFamily: FONT,
                    lineHeight: 1.1,
                  }}
                >
                  {parseInt(trip.date.split('-')[2], 10)}
                </div>
              </div>

              <div className="flex-grow-1 overflow-hidden min-w-0">
                <div className="d-flex align-items-center gap-1">
                  {isToday && (
                    <span
                      className="badge rounded-pill flex-shrink-0"
                      style={{
                        backgroundColor: TODAY_ACCENT,
                        color: '#FFFFFF',
                        fontSize: 10,
                        fontFamily: FONT,
                        fontWeight: 700,
                        padding: '3px 8px',
                      }}
                    >
                      오늘
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#1A1D1F',
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
                    className="d-flex align-items-center gap-1 mt-0"
                    style={{
                      fontSize: 11,
                      color: '#6F767E',
                      fontFamily: FONT,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
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
          );
        })}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="btn w-100 py-2 d-flex align-items-center justify-content-center gap-1"
            style={{
              border: 'none',
              backgroundColor: '#F7F8FA',
              color: '#1B6FF5',
              fontSize: 13,
              fontFamily: FONT,
              fontWeight: 600,
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
