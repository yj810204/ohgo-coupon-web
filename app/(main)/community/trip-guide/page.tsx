'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
  getTripScheduleDateBadge,
  isPastTripDate,
  isPastTripSchedule,
  isTripDateViewable,
  TripGuide,
  sortTripsByNearestDeparture,
  tripDateToStr,
} from '@/utils/trip-guide-service';
import { OHGO_CARD, OHGO_FONT } from '@/lib/page-styles';
import {
  IoChevronBackOutline,
  IoChevronForwardOutline,
  IoBoatOutline,
  IoTimeOutline,
  IoFishOutline,
  IoCallOutline,
  IoInformationCircleOutline,
} from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, {
  OhgoModalButton,
  OhgoModalInfoList,
  OhgoModalInfoRow,
} from '@/components/OhgoModal';
import EmptyState from '@/components/EmptyState';

const FONT = OHGO_FONT;
const CARD: React.CSSProperties = { ...OHGO_CARD };
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const TODAY_ACCENT = '#E65100';
const TODAY_BG = '#FFF3E0';

function toYM(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function formatPrice(p?: number) {
  if (!p) return '';
  return p.toLocaleString('ko-KR') + '원';
}

function formatTripModalDate(dateStr: string) {
  const m = parseInt(dateStr.split('-')[1], 10);
  const d = parseInt(dateStr.split('-')[2], 10);
  const weekday = DAY_LABELS[new Date(`${dateStr}T12:00:00`).getDay()];
  return `${m}월 ${d}일 (${weekday})`;
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

  const loadTrips = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTripsByMonth(toYM(year, month));
      setTrips(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

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

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

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

  const selectedTrips = tripMap[selectedDate] || [];
  const selectedIsPast =
    isPastTripDate(selectedDate, todayStr) ||
    (selectedDate === todayStr &&
      selectedTrips.length > 0 &&
      selectedTrips.every(t => isPastTripSchedule(t.date, t.departureTime)));
  const selectedIsViewable = isTripDateViewable(selectedDate, todayStr);
  const selectedIsClosed = !selectedIsViewable;
  const selectedDateBadge = selectedIsPast
    ? { label: '지난 일정', variant: 'past' as const }
    : getTripScheduleDateBadge(selectedDate, todayStr);
  const currentMonthDate = useMemo(() => new Date(year, month, 1), [year, month]);

  const canShowReserveButton =
    reservationEnabled &&
    modalTrip &&
    isTripDateViewable(modalTrip.date, todayStr) &&
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
      if (confirm('승선정보가 등록되어 있어야 예약할 수 있습니다. 승선정보 작성 페이지로 이동할까요?')) {
        router.push('/boarding-form');
      }
      return;
    }
    if (modalReservation) return;
    if (isTripFull) return;
    router.push(`/trip-reservation?tripId=${encodeURIComponent(modalTrip.id)}`);
  };

  const dateBadgeStyle = selectedDateBadge
    ? selectedDateBadge.variant === 'past'
      ? { backgroundColor: '#E8EAED', color: '#6F767E' }
      : selectedDateBadge.variant === 'today'
        ? { backgroundColor: TODAY_BG, color: TODAY_ACCENT }
        : { backgroundColor: '#EBF1FE', color: '#1B6FF5' }
    : null;

  return (
    <SubPageFrame title="출조 안내" onRefresh={loadTrips}>
        <div className="position-relative mb-4" style={{ ...CARD, overflow: 'hidden', width: '100%', minWidth: 0 }}>
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

          <div className="d-flex align-items-center justify-content-between px-3 pt-3 pb-2">
            <button
              type="button"
              onClick={prevMonth}
              disabled={loading}
              className="btn p-2 rounded-circle"
              style={{ border: 'none', backgroundColor: '#F7F8FA' }}
            >
              <IoChevronBackOutline size={20} color="#1A1D1F" />
            </button>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}>
              {format(currentMonthDate, 'yyyy년 M월')}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              disabled={loading}
              className="btn p-2 rounded-circle"
              style={{ border: 'none', backgroundColor: '#F7F8FA' }}
            >
              <IoChevronForwardOutline size={20} color="#1A1D1F" />
            </button>
          </div>

          <div className="d-flex" style={{ borderTop: '1px solid #F7F8FA', borderBottom: '1px solid #F7F8FA' }}>
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
            <div
              key={row}
              className="d-flex"
              style={{ borderBottom: row < cells.length / 7 - 1 ? '1px solid #F7F8FA' : 'none' }}
            >
              {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (!day) {
                  return (
                    <div key={col} style={{ flex: 1, minHeight: 56, padding: '6px 2px' }} aria-hidden />
                  );
                }

                const dateStr = getDateStr(day);
                const dayTrips = tripMap[dateStr] || [];
                const tripCount = dayTrips.length;
                const isToday = dateStr === todayStr;
                const isPast =
                  isPastTripDate(dateStr, todayStr) ||
                  (dateStr === todayStr &&
                    dayTrips.length > 0 &&
                    dayTrips.every(t => isPastTripSchedule(t.date, t.departureTime)));
                const isClosed = !isTripDateViewable(dateStr, todayStr);
                const isSelected = dateStr === selectedDate;
                const isSun = col === 0;
                const isSat = col === 6;

                let dayNumberColor = '#1A1D1F';
                if (isSun) dayNumberColor = '#FF3B30';
                else if (isSat) dayNumberColor = '#1B6FF5';
                else if (isPast || isClosed) dayNumberColor = '#ABABAB';

                const tripBadgeColor = tripCount >= 2 ? '#FF9500' : '#34C759';

                let cellBg = '#FFFFFF';
                if (isToday) cellBg = TODAY_BG;
                else if (isPast) cellBg = '#FAFAFA';
                else if (isSelected) cellBg = '#EBF1FE';

                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => !loading && setSelectedDate(dateStr)}
                    disabled={loading}
                    className="btn"
                    style={{
                      flex: '1 1 0',
                      minWidth: 0,
                      minHeight: 56,
                      border: 'none',
                      backgroundColor: cellBg,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      gap: 4,
                      padding: '6px 1px',
                      borderRadius: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        flexShrink: 0,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isToday ? TODAY_ACCENT : 'transparent',
                        fontSize: 13,
                        fontWeight: isToday ? 700 : 600,
                        fontFamily: FONT,
                        color: isToday ? '#FFFFFF' : dayNumberColor,
                      }}
                    >
                      {day}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: 16,
                        minHeight: 16,
                        width: '100%',
                      }}
                    >
                      {tripCount > 0 ? (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: FONT,
                            color: '#fff',
                            backgroundColor: tripBadgeColor,
                            borderRadius: 8,
                            padding: '1px 6px',
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
              })}
            </div>
          ))}
        </div>

        <p
          className="mb-3 px-1"
          style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, lineHeight: 1.5, textAlign: 'center' }}
        >
          날짜를 선택하면 해당 날짜의 출조 일정을 확인할 수 있습니다.
        </p>

        {/* 선택한 날짜 출조 리스트 */}
        {!loading && (
          <>
            <div className="d-flex align-items-center gap-2 mb-2 px-1">
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: selectedIsPast || selectedIsClosed ? '#6F767E' : '#1A1D1F',
                  fontFamily: FONT,
                }}
              >
                {parseInt(selectedDate.split('-')[1])}월 {parseInt(selectedDate.split('-')[2])}일 출조 일정
              </span>
              {selectedDateBadge && dateBadgeStyle && (
                <span
                  className="badge rounded-pill"
                  style={{
                    ...dateBadgeStyle,
                    fontSize: 11,
                    fontFamily: FONT,
                    fontWeight: 600,
                  }}
                >
                  {selectedDateBadge.label}
                </span>
              )}
            </div>

            {selectedIsClosed ? (
              <EmptyState
                icon={IoBoatOutline}
                message="아직 공개되지 않은 날짜입니다."
                compact
                style={{ backgroundColor: '#F7F8FA', borderRadius: 14, border: '1px solid #EFEFEF', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
              />
            ) : selectedTrips.length === 0 ? (
              <EmptyState
                icon={IoBoatOutline}
                message="이 날은 출조 일정이 없습니다."
                compact
                style={{ backgroundColor: '#FFFFFF', borderRadius: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
              />
            ) : (
              <div className="d-flex flex-column gap-3">
                {selectedTrips.map(trip => {
                  const isPast = isPastTripSchedule(trip.date, trip.departureTime);
                  return (
                  <button
                    key={trip.id}
                    type="button"
                    onClick={() => setModalTrip(trip)}
                    className={`btn w-100 text-start p-3${isPast ? ' trip-schedule-card--past' : ''}`}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 14,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      border: 'none',
                    }}
                  >
                    <div className="d-flex align-items-center gap-3">
                      {/* 좌측 아이콘 */}
                      <div
                        className="trip-schedule-card__icon-wrap rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                        style={{
                          width: 44,
                          height: 44,
                          backgroundColor: isPast ? '#E8EAED' : '#EBF1FE',
                        }}
                      >
                        <IoBoatOutline size={22} color={isPast ? '#9A9FA5' : '#1B6FF5'} />
                      </div>

                      {/* 우측 콘텐츠 전체 */}
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        {/* 줄 1: 목적지+시간 (왼쪽) | ⓘ (오른쪽) */}
                        <div className="d-flex align-items-center justify-content-between gap-2">
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
                              minWidth: 0,
                            }}
                          >
                            {trip.destination}
                            {(trip.departureTime || trip.returnTime) && (
                              <span
                                style={{
                                  fontWeight: 500,
                                  color: isPast ? '#ABABAB' : '#6F767E',
                                  marginLeft: 6,
                                }}
                              >
                                {trip.departureTime}{trip.returnTime && ` ~ ${trip.returnTime}`}
                              </span>
                            )}
                          </div>
                          <IoInformationCircleOutline
                            size={20}
                            color={isPast ? '#C5C8CD' : '#ABABAB'}
                            className="trip-schedule-card__info-icon flex-shrink-0"
                          />
                        </div>

                        {/* 줄 2: 어종 + 가격 배지 (나란히, 왼쪽 정렬) */}
                        {(trip.species || trip.price) && (
                          <div className="d-flex align-items-center gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
                            {trip.species && (
                              <span
                                className="trip-schedule-card__meta"
                                style={{
                                  fontSize: 13,
                                  color: isPast ? '#9A9FA5' : '#6F767E',
                                  fontFamily: FONT,
                                }}
                              >
                                {trip.species}
                              </span>
                            )}
                            {trip.price && (
                              <span
                                className="trip-schedule-card__price badge rounded-pill"
                                style={{
                                  backgroundColor: isPast ? '#E8EAED' : '#EBF1FE',
                                  color: isPast ? '#6F767E' : '#1B6FF5',
                                  fontSize: 12,
                                  fontFamily: FONT,
                                  fontWeight: 600,
                                }}
                              >
                                {formatPrice(trip.price)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                  );
                })}
              </div>
            )}
          </>
        )}

      <OhgoModal
        open={!!modalTrip}
        onClose={() => setModalTrip(null)}
        title={modalTrip?.destination ?? '출조 정보'}
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
                value={`${modalTrip.departureTime}${modalTrip.returnTime ? ` ~ ${modalTrip.returnTime}` : ''}`}
              />
              {modalTrip.species ? (
                <OhgoModalInfoRow icon={IoFishOutline} label="목표 어종" value={modalTrip.species} />
              ) : null}
              {modalTrip.contact ? (
                <OhgoModalInfoRow icon={IoCallOutline} label="예약 문의" value={modalTrip.contact} />
              ) : null}
            </OhgoModalInfoList>
            {modalTrip.price && (
              <div
                className="p-3 rounded-3 d-flex align-items-center justify-content-between"
                style={{ backgroundColor: '#EBF1FE' }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1B6FF5', fontFamily: FONT }}>1인 요금</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#1B6FF5', fontFamily: FONT }}>
                  {formatPrice(modalTrip.price)}
                </span>
              </div>
            )}
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
            {canShowReserveButton && (
              <OhgoModalButton
                variant="primary"
                disabled={!!modalReservation || isTripFull}
                onClick={() => void handleReserveClick()}
              >
                {modalReservation ? '예약 완료' : isTripFull ? '정원 마감' : '예약'}
              </OhgoModalButton>
            )}
          </div>
        )}
      </OhgoModal>
    </SubPageFrame>
  );
}
