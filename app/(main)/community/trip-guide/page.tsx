'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { getUser } from '@/lib/storage';
import {
  getReservationCount,
  getReservationSettings,
  hasBoardingInfo,
  hasUserReserved,
  type TripReservation,
} from '@/utils/reservation-service';
import { format } from 'date-fns';
import {
  getTripsByMonth,
  isPastTripDate,
  isPastTripSchedule,
  TripGuide,
  sortTripsByNearestDeparture,
  tripDateToStr,
  tripPricePerPersonLabel,
  tripScheduleSubtitle,
  tripSpeciesTitle,
} from '@/utils/trip-guide-service';
import { OHGO_CARD, OHGO_FONT, OHGO_LIST_DIVIDER } from '@/lib/page-styles';
import {
  IoChevronBackOutline,
  IoChevronForwardOutline,
  IoChevronDownOutline,
  IoChevronUpOutline,
  IoBoatOutline,
  IoTimeOutline,
  IoCallOutline,
  IoInformationCircleOutline,
} from 'react-icons/io5';
import { openPhoneDialer } from '@/lib/native-bridge';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, {
  OhgoModalActions,
  OhgoModalButton,
  OhgoModalInfoList,
  OhgoModalInfoRow,
} from '@/components/OhgoModal';
import EmptyState from '@/components/EmptyState';
import TripTidePanel from '@/components/trip/TripTidePanel';
import WindWeatherCard from '@/components/trip/WindWeatherCard';
import { getTideLabel, getTideTextColor } from '@/lib/dadaepo-tide';
import { ohgoConfirm } from '@/lib/ohgo-dialog';

const FONT = OHGO_FONT;
const CARD: React.CSSProperties = { ...OHGO_CARD };
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const TODAY_ACCENT = '#E65100';
const TODAY_BG = '#FFF3E0';

function toYM(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return tripDateToStr(d);
}

/** 일~토 주간 (달력 그리드와 동일) */
function weekDateStrs(dateStr: string): string[] {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return tripDateToStr(day);
  });
}

function formatSunSatWeekLabel(dateStr: string): string {
  const days = weekDateStrs(dateStr);
  const start = days[0];
  const end = days[6];
  const sm = Number(start.slice(5, 7));
  const sd = Number(start.slice(8, 10));
  const em = Number(end.slice(5, 7));
  const ed = Number(end.slice(8, 10));
  if (sm === em) return `${sm}월 ${sd}일 – ${ed}일`;
  return `${sm}월 ${sd}일 – ${em}월 ${ed}일`;
}

function formatTripModalDate(dateStr: string) {
  const m = parseInt(dateStr.split('-')[1], 10);
  const d = parseInt(dateStr.split('-')[2], 10);
  const weekday = DAY_LABELS[new Date(`${dateStr}T12:00:00`).getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

function TripScheduleRow({ trip, onClick }: { trip: TripGuide; onClick: () => void }) {
  const isPast = isPastTripSchedule(trip.date, trip.departureTime);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn w-100 text-start${isPast ? ' trip-schedule-card--past' : ''}`}
      style={{
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: 0,
        padding: '12px 16px',
        minHeight: 64,
      }}
    >
      <div className="d-flex align-items-center gap-3">
        <div
          className="trip-schedule-card__icon-wrap rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
          style={{
            width: 40,
            height: 40,
            backgroundColor: isPast ? '#E8EAED' : '#EBF1FE',
          }}
        >
          <IoBoatOutline size={20} color={isPast ? '#9A9FA5' : '#1B6FF5'} />
        </div>
        <div className="flex-grow-1 min-w-0">
          <div className="d-flex align-items-start justify-content-between gap-2">
            <div className="min-w-0 flex-grow-1">
              <div
                className="trip-schedule-card__title"
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: isPast ? '#6F767E' : '#1A1D1F',
                  fontFamily: FONT,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tripSpeciesTitle(trip)}
              </div>
              <div
                className="trip-schedule-card__meta"
                style={{
                  fontSize: 12,
                  color: isPast ? '#9A9FA5' : '#6F767E',
                  fontFamily: FONT,
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tripScheduleSubtitle(trip)}
              </div>
              {trip.price ? (
                <div
                  className="trip-schedule-card__price"
                  style={{
                    fontSize: 12,
                    color: isPast ? '#9A9FA5' : '#1B6FF5',
                    fontFamily: FONT,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {tripPricePerPersonLabel(trip.price)}
                </div>
              ) : null}
            </div>
            <IoInformationCircleOutline
              size={18}
              color={isPast ? '#C5C8CD' : '#ABABAB'}
              className="trip-schedule-card__info-icon flex-shrink-0"
              style={{ marginTop: 2 }}
            />
          </div>
        </div>
      </div>
    </button>
  );
}

export default function TripGuidePage() {
  const router = useRouter();
  const today = new Date();
  const todayStr = tripDateToStr(today);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [trips, setTrips] = useState<TripGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [modalTrip, setModalTrip] = useState<TripGuide | null>(null);
  const [reservationEnabled, setReservationEnabled] = useState(false);
  const [modalReservation, setModalReservation] = useState<TripReservation | null>(null);
  const [modalReserveCount, setModalReserveCount] = useState(0);
  const [hasBoarding, setHasBoarding] = useState(false);
  const [calendarExpanded, setCalendarExpanded] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) { router.replace('/login'); return; }
      const settings = await getReservationSettings();
      setReservationEnabled(settings.enabled);
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (!modalTrip) {
      setModalReservation(null);
      setModalReserveCount(0);
      return;
    }
    const loadReserveMeta = async () => {
      const user = await getUser();
      if (!user?.uuid) return;
      const [reserved, count, boarding] = await Promise.all([
        hasUserReserved(modalTrip.id, user.uuid),
        getReservationCount(modalTrip.id),
        hasBoardingInfo(user.uuid),
      ]);
      setModalReservation(reserved);
      setModalReserveCount(count);
      setHasBoarding(boarding);
    };
    void loadReserveMeta();
  }, [modalTrip]);

  const firstLoadRef = useRef(true);
  const dayGroupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingScrollDateRef = useRef<string | null>(null);
  const loadMonthsKey = useMemo(() => {
    if (calendarExpanded) return toYM(year, month);
    return [...new Set(weekDateStrs(selectedDate).map((d) => d.slice(0, 7)))].sort().join(',');
  }, [calendarExpanded, year, month, selectedDate]);

  const loadTrips = useCallback(async () => {
    if (firstLoadRef.current) setLoading(true);
    try {
      const months = loadMonthsKey.split(',');
      const lists = await Promise.all(months.map((ym) => getTripsByMonth(ym)));
      const byId = new Map<string, TripGuide>();
      lists.flat().forEach((trip) => byId.set(trip.id, trip));
      setTrips([...byId.values()]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      firstLoadRef.current = false;
    }
  }, [loadMonthsKey]);

  useEffect(() => {
    void loadTrips();
  }, [loadTrips]);

  useEffect(() => {
    setSelectedDate(prev => {
      if (!prev) return todayStr;
      const [y, m] = prev.split('-').map(Number);
      if (y === year && m === month + 1) return prev;
      if (year === today.getFullYear() && month === today.getMonth()) return todayStr;
      return `${year}-${String(month + 1).padStart(2, '0')}-01`;
    });
  }, [year, month, todayStr, today]);

  const prevMonth = () => {
    if (month === 0) {
      setYear(y => y - 1);
      setMonth(11);
    } else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) {
      setYear(y => y + 1);
      setMonth(0);
    } else setMonth(m => m + 1);
  };

  const scrollToDayGroup = (dateStr: string) => {
    pendingScrollDateRef.current = dateStr;
    const node = dayGroupRefs.current[dateStr];
    if (!node) return;
    pendingScrollDateRef.current = null;
    node.style.scrollMarginTop = 'calc(var(--ohgo-page-header-height, 56px) + 12px)';
    node.style.scrollMarginBottom = 'calc(var(--ohgo-content-bottom-inset, 60px) + 12px)';
    node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const goToDay = (deltaDays: number) => {
    const pick = addDays(selectedDate, deltaDays);
    const d = new Date(`${pick}T12:00:00`);
    setSelectedDate(pick);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    scrollToDayGroup(pick);
  };

  const goPrev = () => (calendarExpanded ? prevMonth() : goToDay(-1));
  const goNext = () => (calendarExpanded ? nextMonth() : goToDay(1));

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weekCount = cells.length / 7;
  const weekDates = weekDateStrs(selectedDate);

  const tripMap: Record<string, TripGuide[]> = {};
  trips.forEach(t => {
    if (!tripMap[t.date]) tripMap[t.date] = [];
    tripMap[t.date].push(t);
  });
  Object.keys(tripMap).forEach(date => {
    tripMap[date] = sortTripsByNearestDeparture(tripMap[date]);
  });

  const getDateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const weekTripGroups = weekDates
    .map((date) => ({ date, trips: tripMap[date] || [] }))
    .filter((group) => group.trips.length > 0);
  const weekTripCount = weekTripGroups.reduce((sum, group) => sum + group.trips.length, 0);
  const currentMonthDate = useMemo(() => new Date(year, month, 1), [year, month]);

  useEffect(() => {
    if (loading) return;
    const target = pendingScrollDateRef.current;
    if (!target) return;
    scrollToDayGroup(target);
  }, [selectedDate, loading, weekTripCount]);

  const canShowReserveButton =
    reservationEnabled &&
    modalTrip &&
    !isPastTripSchedule(modalTrip.date, modalTrip.departureTime);

  const isTripFull =
    modalTrip?.capacity != null &&
    modalTrip.capacity > 0 &&
    modalReserveCount >= modalTrip.capacity;

  const handleReserveClick = async () => {
    if (!modalTrip) return;
    const user = await getUser();
    if (!user?.uuid) {
      router.replace('/login');
      return;
    }
    if (!hasBoarding) {
      if (await ohgoConfirm('승선정보가 등록되어 있어야 예약할 수 있습니다. 승선정보 작성 페이지로 이동할까요?')) {
        router.push('/boarding-form');
      }
      return;
    }
    if (modalReservation) return;
    if (isTripFull) return;
    router.push(`/trip-reservation?tripId=${encodeURIComponent(modalTrip.id)}`);
  };

  const handleCallInquiry = () => {
    const raw = modalTrip?.contact?.trim();
    if (!raw) {
      alert('등록된 문의 전화번호가 없습니다.');
      return;
    }
    if (!openPhoneDialer(raw)) {
      alert('등록된 문의 전화번호가 없습니다.');
    }
  };

  const selectCalendarDate = (dateStr: string) => {
    if (loading) return;
    const d = new Date(`${dateStr}T12:00:00`);
    setSelectedDate(dateStr);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    scrollToDayGroup(dateStr);
  };

  const renderDayCell = (dateStr: string, col: number, outsideMonth: boolean) => {
    const day = Number(dateStr.slice(8, 10));
    const dayTrips = tripMap[dateStr] || [];
    const tripCount = dayTrips.length;
    const isToday = dateStr === todayStr;
    const isPast =
      isPastTripDate(dateStr, todayStr) ||
      (dateStr === todayStr &&
        dayTrips.length > 0 &&
        dayTrips.every((t) => isPastTripSchedule(t.date, t.departureTime)));
    const isClosed = tripCount === 0;
    const isSelected = dateStr === selectedDate;
    const isSun = col === 0;
    const isSat = col === 6;

    let dayNumberColor = '#1A1D1F';
    if (outsideMonth) dayNumberColor = '#C5C8CD';
    else if (isSun) dayNumberColor = '#FF3B30';
    else if (isSat) dayNumberColor = '#1B6FF5';
    else if (isPast || isClosed) dayNumberColor = '#ABABAB';

    const tripBadgeColor = tripCount >= 2 ? '#FF9500' : '#34C759';

    let cellBg = '#FFFFFF';
    if (isSelected) cellBg = isToday ? TODAY_BG : '#EBF1FE';
    else if (isToday) cellBg = TODAY_BG;
    else if (isPast) cellBg = '#FAFAFA';

    return (
      <button
        key={dateStr}
        type="button"
        onClick={() => selectCalendarDate(dateStr)}
        disabled={loading}
        className="btn"
        style={{
          flex: '1 1 0',
          minWidth: 0,
          minHeight: 40,
          border: 'none',
          backgroundColor: cellBg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 1,
          padding: '3px 1px 2px',
          borderRadius: 0,
          opacity: outsideMonth ? 0.7 : 1,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            flexShrink: 0,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isSelected
              ? isToday
                ? TODAY_ACCENT
                : '#1B6FF5'
              : 'transparent',
            fontSize: 12,
            fontWeight: isSelected || isToday ? 700 : 600,
            fontFamily: FONT,
            color: isSelected ? '#FFFFFF' : dayNumberColor,
          }}
        >
          {day}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 13,
            minHeight: 13,
            width: '100%',
          }}
        >
          {tripCount > 0 ? (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                fontFamily: FONT,
                color: '#fff',
                backgroundColor: tripBadgeColor,
                borderRadius: 8,
                padding: '0 5px',
                lineHeight: 1.3,
              }}
              title={`출조 ${tripCount}건`}
            >
              {tripCount}
            </span>
          ) : isToday ? (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                fontFamily: FONT,
                color: TODAY_ACCENT,
              }}
            >
              오늘
            </span>
          ) : null}
        </div>
      </button>
    );
  };

  return (
    <SubPageFrame title="출조 안내" onRefresh={loadTrips} dense>
        <div className="position-relative mb-2" style={{ ...CARD, overflow: 'hidden', width: '100%', minWidth: 0 }}>
          {loading && (
            <div
              className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
              style={{ zIndex: 10, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 16 }}
            >
              <div className="text-center">
                <div className="spinner-border text-primary mb-2" role="status" />
                <p className="small mb-0" style={{ color: '#6F767E', fontFamily: FONT }}>
                  출조 일정을 불러오는 중...
                </p>
              </div>
            </div>
          )}

          <div className="d-flex align-items-center px-1 pt-1 pb-1">
            <button
              type="button"
              onClick={goPrev}
              className="btn p-0 d-flex align-items-center justify-content-center flex-shrink-0"
              aria-label={calendarExpanded ? '이전 달' : '이전일'}
              style={{ width: 40, height: 40, border: 'none', background: 'none', color: '#1A1D1F' }}
            >
              <IoChevronBackOutline size={22} />
            </button>
            <span
              className="flex-grow-1 text-center"
              style={{ fontSize: 16, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}
            >
              {calendarExpanded
                ? format(currentMonthDate, 'yyyy년 M월')
                : formatSunSatWeekLabel(selectedDate)}
            </span>
            <button
              type="button"
              onClick={goNext}
              className="btn p-0 d-flex align-items-center justify-content-center flex-shrink-0"
              aria-label={calendarExpanded ? '다음 달' : '다음일'}
              style={{ width: 40, height: 40, border: 'none', background: 'none', color: '#1A1D1F' }}
            >
              <IoChevronForwardOutline size={22} />
            </button>
          </div>

          <div className="d-flex" style={{ borderTop: '1px solid #F7F8FA', borderBottom: '1px solid #F7F8FA' }}>
            {DAY_LABELS.map((d, i) => (
              <div
                key={d}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '6px 0',
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: FONT,
                  color: i === 0 ? '#FF3B30' : i === 6 ? '#1B6FF5' : '#6F767E',
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {calendarExpanded
            ? Array.from({ length: weekCount }, (_, row) => (
                <div
                  key={row}
                  className="d-flex"
                  style={{ borderBottom: row < weekCount - 1 ? '1px solid #F7F8FA' : 'none' }}
                >
                  {cells.slice(row * 7, row * 7 + 7).map((day, col) =>
                    day ? (
                      renderDayCell(getDateStr(day), col, false)
                    ) : (
                      <div key={col} style={{ flex: 1, minHeight: 40, padding: '2px 1px' }} aria-hidden />
                    )
                  )}
                </div>
              ))
            : (
                <div className="d-flex">
                  {weekDates.map((dateStr, col) =>
                    renderDayCell(dateStr, col, dateStr.slice(0, 7) !== toYM(year, month))
                  )}
                </div>
              )}
          <div
            className="d-flex"
            style={{ borderTop: '1px solid #F7F8FA', backgroundColor: '#FAFBFC' }}
          >
            <button
              type="button"
              onClick={() => setCalendarExpanded((open) => !open)}
              className="btn flex-fill d-flex align-items-center justify-content-center gap-1 py-1"
              style={{
                border: 'none',
                backgroundColor: 'transparent',
                fontFamily: FONT,
                fontSize: 12,
                fontWeight: 600,
                color: '#6F767E',
                borderRadius: 0,
              }}
            >
              {calendarExpanded ? (
                <>
                  <IoChevronUpOutline size={14} />
                  달력 접기
                </>
              ) : (
                <>
                  <IoChevronDownOutline size={14} />
                  달력 펼치기
                </>
              )}
            </button>
          </div>
        </div>

        {/* 이번 주 출조 리스트 */}
        {!loading && (
          <>
            <div className="d-flex align-items-center gap-2 mb-2 px-1">
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#1A1D1F',
                  fontFamily: FONT,
                }}
              >
                {formatSunSatWeekLabel(selectedDate)} 출조 일정
              </span>
              {weekTripCount > 0 ? (
                <span
                  className="badge rounded-pill"
                  style={{
                    backgroundColor: '#EBF1FE',
                    color: '#1B6FF5',
                    fontSize: 11,
                    fontFamily: FONT,
                    fontWeight: 600,
                  }}
                >
                  {weekTripCount}건
                </span>
              ) : null}
            </div>

            {weekTripCount === 0 ? (
              <EmptyState
                icon={IoBoatOutline}
                message="이번 주 등록된 출조 일정이 없습니다."
                compact
                style={{ backgroundColor: '#F7F8FA', borderRadius: 14, border: '1px solid #EFEFEF', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
              />
            ) : (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 14,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  overflow: 'hidden',
                }}
              >
                {weekTripGroups.map((group, groupIndex) => {
                  const isSelectedDay = group.date === selectedDate;
                  const isTodayGroup = group.date === todayStr;
                  const tideLabel = getTideLabel(group.date);
                  return (
                  <div
                    key={group.date}
                    ref={(el) => {
                      dayGroupRefs.current[group.date] = el;
                    }}
                    id={`trip-day-${group.date}`}
                    style={{
                      backgroundColor: isSelectedDay
                        ? isTodayGroup
                          ? TODAY_BG
                          : '#EBF1FE'
                        : 'transparent',
                      boxShadow: isSelectedDay
                        ? `inset 3px 0 0 ${isTodayGroup ? TODAY_ACCENT : '#1B6FF5'}`
                        : undefined,
                      scrollMarginTop: 'calc(var(--ohgo-page-header-height, 56px) + 12px)',
                      scrollMarginBottom: 'calc(var(--ohgo-content-bottom-inset, 60px) + 12px)',
                      transition: 'background-color 0.2s ease',
                    }}
                  >
                    {groupIndex > 0 ? <div style={OHGO_LIST_DIVIDER} /> : null}
                    <div
                      style={{
                        padding: '10px 16px 4px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: isSelectedDay
                          ? isTodayGroup
                            ? TODAY_ACCENT
                            : '#1B6FF5'
                          : isTodayGroup
                            ? TODAY_ACCENT
                            : '#6F767E',
                        fontFamily: FONT,
                      }}
                    >
                      {formatTripModalDate(group.date)}
                      {isTodayGroup ? ' · 오늘' : ''}
                      {tideLabel ? (
                        <span style={{ color: getTideTextColor(tideLabel) }}>{` · ${tideLabel}`}</span>
                      ) : null}
                    </div>
                    {group.trips.map((trip, index) => (
                      <div key={trip.id}>
                        {index > 0 && <div style={OHGO_LIST_DIVIDER} />}
                        <TripScheduleRow trip={trip} onClick={() => setModalTrip(trip)} />
                      </div>
                    ))}
                  </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      <OhgoModal
        open={!!modalTrip}
        onClose={() => setModalTrip(null)}
        title={modalTrip ? tripSpeciesTitle(modalTrip) : '출조 정보'}
      >
        {modalTrip && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {isPastTripSchedule(modalTrip.date, modalTrip.departureTime) && (
              <div
                className="px-3 py-2 rounded-3"
                style={{ backgroundColor: '#F2F3F5', fontSize: 13, color: '#6F767E', fontFamily: FONT, fontWeight: 600 }}
              >
                지난 출조 일정입니다.
              </div>
            )}
            <OhgoModalInfoList>
              <OhgoModalInfoRow icon={IoBoatOutline} variant="date" value={formatTripModalDate(modalTrip.date)} />
              <OhgoModalInfoRow
                icon={IoTimeOutline}
                label="출항 시간"
                value={`${modalTrip.departureTime} 출항${modalTrip.returnTime ? ` ~ ${modalTrip.returnTime} 귀항` : ''}`}
              />
              {modalTrip.destination ? (
                <OhgoModalInfoRow icon={IoBoatOutline} label="목적지" value={modalTrip.destination} />
              ) : null}
              {modalTrip.contact ? (
                <OhgoModalInfoRow icon={IoCallOutline} label="예약 문의" value={modalTrip.contact} />
              ) : null}
            </OhgoModalInfoList>
            <TripTidePanel date={modalTrip.date} variant="embedded" />
            <WindWeatherCard date={modalTrip.date} spaced={false} bordered />
            {modalTrip.price ? (
              <div
                className="p-3 rounded-3 d-flex align-items-center justify-content-between"
                style={{ backgroundColor: '#EBF1FE' }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1B6FF5', fontFamily: FONT }}>1인 요금</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#1B6FF5', fontFamily: FONT }}>
                  {tripPricePerPersonLabel(modalTrip.price)}
                </span>
              </div>
            ) : null}
            {modalTrip.notes && (
              <div className="p-3 rounded-3" style={{ backgroundColor: '#F7F8FA' }}>
                <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginBottom: 6 }}>비고</div>
                <div
                  style={{
                    fontSize: 14,
                    color: '#1A1D1F',
                    fontFamily: FONT,
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                  }}
                >
                  {modalTrip.notes}
                </div>
              </div>
            )}
            {(modalTrip.contact || canShowReserveButton) && (
              <OhgoModalActions direction={canShowReserveButton && modalTrip.contact ? 'row' : 'stack'}>
                {modalTrip.contact ? (
                  <OhgoModalButton variant="secondary" onClick={handleCallInquiry}>
                    전화 문의
                  </OhgoModalButton>
                ) : null}
                {canShowReserveButton ? (
                  <OhgoModalButton
                    variant="primary"
                    disabled={!!modalReservation || isTripFull}
                    onClick={() => void handleReserveClick()}
                  >
                    {modalReservation ? '예약 완료' : isTripFull ? '정원 마감' : '예약'}
                  </OhgoModalButton>
                ) : null}
              </OhgoModalActions>
            )}
          </div>
        )}
      </OhgoModal>
    </SubPageFrame>
  );
}
