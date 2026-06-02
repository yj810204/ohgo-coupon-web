'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  formatWeekRangeLabel,
  getTripsInDateRange,
  getWeekRange,
  isPastTripDate,
  isPastTripSchedule,
  sortTripsByNearestDeparture,
  TripGuide,
  tripDateToStr,
  tripWeekdayLabelColor,
  tripWeekdayNumberColor,
} from '@/utils/trip-guide-service';
import { IoTimeOutline, IoChevronForwardOutline, IoBoatOutline } from 'react-icons/io5';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_VISIBLE = 3;
const TODAY_ACCENT = '#1B6FF5';

type TripDayGroup = { date: string; trips: TripGuide[] };

/** 메인 노출: 오늘 포함 이후 일정 우선, 없으면 가장 가까운 일정부터 */
function pickVisibleTrips(trips: TripGuide[], limit: number): TripGuide[] {
  const today = tripDateToStr();
  const sorted = sortTripsByNearestDeparture(trips);
  const fromToday = sorted.filter(t => t.date >= today);
  const pool = fromToday.length > 0 ? fromToday : sorted;
  return pool.slice(0, limit);
}

function groupTripsByDate(trips: TripGuide[]): TripDayGroup[] {
  const groups: TripDayGroup[] = [];
  for (const trip of trips) {
    const last = groups[groups.length - 1];
    if (last?.date === trip.date) {
      last.trips.push(trip);
    } else {
      groups.push({ date: trip.date, trips: [trip] });
    }
  }
  return groups.map(g => ({
    date: g.date,
    trips: sortTripsByNearestDeparture(g.trips),
  }));
}

function tripSubtitle(trip: TripGuide) {
  return [
    trip.departureTime && `${trip.departureTime} 출발`,
    trip.species,
    trip.price ? `${trip.price.toLocaleString()}원` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function dayDividerColor(dayIdx: number, isPast: boolean, isToday: boolean): string {
  if (isPast) return '#EFEFEF';
  if (isToday) return '#C7D9FD';
  if (dayIdx === 0) return '#FFD6D4';
  if (dayIdx === 6) return '#C7D9FD';
  return '#EFEFEF';
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
  const visibleGroups = groupTripsByDate(visibleTrips);
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
        {visibleGroups.map((group, groupIndex) => {
          const isToday = !isDummy && group.date === todayStr;
          const isPast = !isDummy && !isToday && isPastTripDate(group.date, todayStr);
          const dayIdx = new Date(`${group.date}T00:00:00`).getDay();
          const dayLabelColor = tripWeekdayLabelColor(dayIdx, isPast);
          const dayNumberColor = tripWeekdayNumberColor(dayIdx, isPast);
          const isSun = dayIdx === 0;
          const isSat = dayIdx === 6;

          let numBg = 'transparent';
          let numColor = dayNumberColor;
          if (isToday) {
            numBg = TODAY_ACCENT;
            numColor = '#FFFFFF';
          } else if (isSun) {
            numBg = '#FFF0F0';
          } else if (isSat) {
            numBg = '#EDF5FF';
          }

          const groupBg = isPast ? '#F7F8FA' : '#FFFFFF';

          return (
            <div key={group.date}>
              {groupIndex > 0 && <div style={{ height: 1, backgroundColor: '#E8EAED' }} />}
              <div
                className="d-flex align-items-stretch gap-2"
                style={{ backgroundColor: groupBg, opacity: isPast ? 0.92 : 1 }}
              >
                <div
                  className="flex-shrink-0 d-flex flex-column align-items-center justify-content-center"
                  style={{ width: 44, paddingTop: 14, paddingBottom: 14, paddingLeft: 8 }}
                >
                  <span
                    style={{ fontSize: 10, fontWeight: 700, color: dayLabelColor, fontFamily: FONT, lineHeight: 1 }}
                  >
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
                      marginTop: 4,
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
                      {parseInt(group.date.split('-')[2], 10)}
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    width: 1,
                    alignSelf: 'stretch',
                    flexShrink: 0,
                    paddingTop: 10,
                    paddingBottom: 10,
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      backgroundColor: dayDividerColor(dayIdx, isPast, isToday),
                      borderRadius: 2,
                    }}
                  />
                </div>
                <div className="flex-grow-1 min-w-0 d-flex flex-column">
                  {group.trips.map((trip, tripIndex) => {
                    const subtitle = tripSubtitle(trip);
                    const tripPast =
                      !isDummy &&
                      (isPast || (isToday && isPastTripSchedule(trip.date, trip.departureTime)));
                    return (
                      <div key={trip.id} className="min-w-0">
                        {tripIndex > 0 && (
                          <div style={{ height: 1, backgroundColor: 'rgba(232, 234, 237, 0.9)' }} />
                        )}
                        <button
                          type="button"
                          onClick={isDummy ? undefined : onViewAll}
                          className="btn w-100 text-start d-flex align-items-center gap-2 pe-3"
                          style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            borderRadius: 0,
                            cursor: isDummy ? 'default' : 'pointer',
                            paddingTop: 12,
                            paddingBottom: 12,
                            paddingLeft: 0,
                            opacity: tripPast ? 0.7 : 1,
                          }}
                        >
                          <div className="flex-grow-1 overflow-hidden min-w-0">
                            <div className="d-flex align-items-center gap-1">
                              {tripPast && (
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
                                  color: tripPast ? '#6F767E' : '#1A1D1F',
                                  fontFamily: FONT,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {trip.destination}
                              </span>
                            </div>
                            {subtitle ? (
                              <div
                                className="d-flex align-items-center gap-1"
                                style={{
                                  fontSize: 12,
                                  color: tripPast ? '#9A9FA5' : '#6F767E',
                                  fontFamily: FONT,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  marginTop: 2,
                                }}
                              >
                                <IoTimeOutline
                                  size={12}
                                  className="flex-shrink-0"
                                  color={tripPast ? '#9A9FA5' : '#6F767E'}
                                />
                                {subtitle}
                              </div>
                            ) : null}
                          </div>
                          {!isDummy && (
                            <IoChevronForwardOutline
                              size={16}
                              color={tripPast ? '#C5C8CD' : '#ABABAB'}
                              className="flex-shrink-0"
                            />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
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
