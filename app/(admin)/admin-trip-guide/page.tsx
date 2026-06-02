'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import {
  TripGuide,
  TripGuideInput,
  getAllTrips,
  addTrip,
  deleteTrip,
  isPastTripDate,
  isPastTripSchedule,
  sortTripsByNearestDeparture,
  tripDateToStr,
} from '@/utils/trip-guide-service';
import {
  adminDeleteCancelledReservation,
  approveReservation,
  getAllReservations,
  getReservationsByTrip,
  rejectReservation,
  reservationStatusLabel,
  type TripReservation,
} from '@/utils/reservation-service';
import { IoAddOutline, IoTrashOutline, IoPencilOutline, IoBoatOutline, IoCopyOutline, IoPeopleOutline, IoChevronBackOutline, IoChevronForwardOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import OhgoModal, { OhgoModalButton } from '@/components/OhgoModal';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { OHGO_CONFIRM_BTN_CLASS, OHGO_INPUT, OHGO_PRIMARY_BTN, OHGO_SECONDARY_BTN } from '@/lib/page-styles';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
const CARD: React.CSSProperties = { backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: 'none' };

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

type TripDayStyle = {
  dayLabelColor: string;
  dayNumberColor: string;
  monthColor: string;
  dividerColor: string;
  isWeekend: boolean;
};

function getTripDayStyle(dateStr: string): TripDayStyle {
  const dayIdx = new Date(`${dateStr}T00:00:00`).getDay();
  if (dayIdx === 6) {
    return {
      dayLabelColor: '#1B6FF5',
      dayNumberColor: '#1B6FF5',
      monthColor: '#5B9BF5',
      dividerColor: '#C7D9FD',
      isWeekend: true,
    };
  }
  if (dayIdx === 0) {
    return {
      dayLabelColor: '#FF3B30',
      dayNumberColor: '#FF3B30',
      monthColor: '#FF6B63',
      dividerColor: '#FFD6D4',
      isWeekend: true,
    };
  }
  return {
    dayLabelColor: '#6F767E',
    dayNumberColor: '#1A1D1F',
    monthColor: '#ABABAB',
    dividerColor: '#EFEFEF',
    isWeekend: false,
  };
}

const MAX_COPY_DAYS = 62;

function tripToCopyInput(trip: TripGuide, date: string): TripGuideInput {
  return {
    date,
    destination: trip.destination,
    departureTime: trip.departureTime,
    returnTime: trip.returnTime,
    species: trip.species,
    capacity: trip.capacity,
    price: trip.price,
    notes: trip.notes,
    contact: trip.contact,
  };
}

type TripDayGroup = { date: string; trips: TripGuide[] };

function groupTripsByDate(trips: TripGuide[]): TripDayGroup[] {
  const groups: TripDayGroup[] = [];
  for (const trip of sortTripsByNearestDeparture(trips)) {
    const last = groups[groups.length - 1];
    if (last?.date === trip.date) {
      last.trips.push(trip);
    } else {
      groups.push({ date: trip.date, trips: [trip] });
    }
  }
  return groups;
}

function dateStrFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekMonday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return dateStrFromDate(d);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dateStrFromDate(d);
}

function weekLabel(weekStart: string): string {
  const weekEnd = addDays(weekStart, 6);
  const s = new Date(`${weekStart}T00:00:00`);
  const e = new Date(`${weekEnd}T00:00:00`);
  const fmt = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`;
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  return `${fmt(s)}(${dayNames[s.getDay()]}) ~ ${fmt(e)}(${dayNames[e.getDay()]})`;
}

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime()) || cur > last) return dates;
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export default function AdminTripGuidePage() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copyStartDate, setCopyStartDate] = useState('');
  const [copyEndDate, setCopyEndDate] = useState('');
  const [copying, setCopying] = useState(false);
  const [reserveCountMap, setReserveCountMap] = useState<Record<string, number>>({});
  const [reserveModalTrip, setReserveModalTrip] = useState<TripGuide | null>(null);
  const [tripReservations, setTripReservations] = useState<TripReservation[]>([]);
  const [reserveLoading, setReserveLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<TripReservation | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const user = await getUser();
      if (!user?.uuid) { router.replace('/login'); return; }
      const remote = await getUserByUUID(user.uuid);
      if (!remote?.isAdmin) { router.replace('/main'); return; }
      loadTrips();
    };
    checkAdmin();
  }, [router]);

  const loadTrips = async () => {
    setLoading(true);
    try {
      const [data, allReservations] = await Promise.all([getAllTrips(), getAllReservations()]);
      setTrips(data);
      const counts: Record<string, number> = {};
      allReservations.forEach(r => {
        if (r.status === 'pending' || r.status === 'confirmed') {
          counts[r.tripId] = (counts[r.tripId] ?? 0) + 1;
        }
      });
      setReserveCountMap(counts);
    } finally { setLoading(false); }
  };

  const openReservations = async (trip: TripGuide) => {
    setReserveModalTrip(trip);
    setReserveLoading(true);
    try {
      const list = await getReservationsByTrip(trip.id);
      setTripReservations(list);
    } finally {
      setReserveLoading(false);
    }
  };

  useNativePullToRefresh(async () => {
    const data = await getAllTrips();
    setTrips(data);
  });

  const handleDelete = async (id: string, dest: string) => {
    if (!confirm(`"${dest}" 출조 일정을 삭제하시겠습니까?`)) return;
    try {
      await deleteTrip(id);
      if (copyingId === id) {
        setCopyingId(null);
        setCopyStartDate('');
        setCopyEndDate('');
      }
      await loadTrips();
    } catch (e) {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const resetCopyPanel = () => {
    setCopyingId(null);
    setCopyStartDate('');
    setCopyEndDate('');
  };

  const openCopyPanel = (tripId: string) => {
    if (copyingId === tripId) {
      resetCopyPanel();
      return;
    }
    setCopyingId(tripId);
    setCopyStartDate('');
    setCopyEndDate('');
  };

  const copyDateCount =
    copyStartDate && copyEndDate && copyStartDate <= copyEndDate
      ? enumerateDates(copyStartDate, copyEndDate).length
      : 0;

  const handleCopy = async (trip: TripGuide) => {
    if (!copyStartDate || !copyEndDate) {
      alert('시작일과 종료일을 선택해주세요.');
      return;
    }
    if (copyStartDate > copyEndDate) {
      alert('시작일이 종료일보다 늦을 수 없습니다.');
      return;
    }
    const dates = enumerateDates(copyStartDate, copyEndDate);
    if (dates.length === 0) {
      alert('복사할 기간이 올바르지 않습니다.');
      return;
    }
    if (dates.length > MAX_COPY_DAYS) {
      alert(`한 번에 최대 ${MAX_COPY_DAYS}일까지 복사할 수 있습니다.`);
      return;
    }
    if (!confirm(`${dates.length}일 출조 일정을 복사하시겠습니까?`)) return;

    setCopying(true);
    try {
      for (const date of dates) {
        await addTrip(tripToCopyInput(trip, date));
      }
      resetCopyPanel();
      await loadTrips();
    } catch (e) {
      console.error(e);
      alert('복사 중 오류가 발생했습니다.');
    } finally {
      setCopying(false);
    }
  };

  const dayLabel = (dateStr: string) => {
    try {
      return DAYS[new Date(dateStr + 'T00:00:00').getDay()];
    } catch { return ''; }
  };

  const todayStr = tripDateToStr();
  const tripGroups = useMemo(() => groupTripsByDate(trips), [trips]);

  const [selectedWeekStart, setSelectedWeekStart] = useState(() => getWeekMonday(tripDateToStr()));

  const weekEnd = addDays(selectedWeekStart, 6);

  const weekGroups = useMemo(
    () => tripGroups.filter(g => g.date >= selectedWeekStart && g.date <= weekEnd),
    [tripGroups, selectedWeekStart, weekEnd],
  );

  const hasPrevWeek = useMemo(() => {
    const prevStart = addDays(selectedWeekStart, -7);
    const prevEnd = addDays(prevStart, 6);
    return tripGroups.some(g => g.date >= prevStart && g.date <= prevEnd);
  }, [tripGroups, selectedWeekStart]);

  const hasNextWeek = useMemo(() => {
    const nextStart = addDays(selectedWeekStart, 7);
    const nextEnd = addDays(nextStart, 6);
    return tripGroups.some(g => g.date >= nextStart && g.date <= nextEnd);
  }, [tripGroups, selectedWeekStart]);

  const goToPrevWeek = useCallback(() => setSelectedWeekStart(s => addDays(s, -7)), []);
  const goToNextWeek = useCallback(() => setSelectedWeekStart(s => addDays(s, 7)), []);
  const goToThisWeek = useCallback(() => setSelectedWeekStart(getWeekMonday(tripDateToStr())), []);

  const isThisWeek = selectedWeekStart === getWeekMonday(tripDateToStr());

  return (
    <SubPageFrame title="출조 일정 관리" onRefresh={loadTrips}>

        {/* 추가 버튼 */}
        <button
          type="button"
          onClick={() => router.push('/admin-trip-guide/form')}
          className="btn w-100 d-flex align-items-center justify-content-center gap-2 fw-bold mb-4"
          style={{ backgroundColor: '#1B6FF5', color: '#fff', borderRadius: 14, padding: '13px', border: 'none', fontFamily: FONT, fontSize: 15, boxShadow: '0 4px 12px rgba(27,111,245,0.3)' }}
        >
          <IoAddOutline size={20} />
          새 출조 일정 추가
        </button>

        {/* 주간 네비게이션 */}
        {!loading && trips.length > 0 && (
          <div
            className="d-flex align-items-center justify-content-between mb-3"
            style={{ backgroundColor: '#F7F8FA', borderRadius: 12, padding: '0px 10px' }}
          >
            <button
              type="button"
              onClick={goToPrevWeek}
              disabled={!hasPrevWeek}
              className="btn p-0 d-flex align-items-center justify-content-center"
              style={{
                width: 28, height: 28, borderRadius: '50%',
                backgroundColor: hasPrevWeek ? '#FFFFFF' : 'transparent',
                border: 'none',
                boxShadow: hasPrevWeek ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                opacity: hasPrevWeek ? 1 : 0.3,
              }}
            >
              <IoChevronBackOutline size={15} color="#1A1D1F" />
            </button>

            <div className="d-flex flex-column align-items-center gap-1">
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                {weekLabel(selectedWeekStart)}
              </span>
              {!isThisWeek && (
                <button
                  type="button"
                  onClick={goToThisWeek}
                  className="btn p-0"
                  style={{ fontSize: 10, color: '#1B6FF5', fontFamily: FONT, fontWeight: 600, border: 'none', background: 'none', lineHeight: 1 }}
                >
                  이번 주로
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={goToNextWeek}
              disabled={!hasNextWeek}
              className="btn p-0 d-flex align-items-center justify-content-center"
              style={{
                width: 32, height: 32, borderRadius: '50%',
                backgroundColor: hasNextWeek ? '#FFFFFF' : 'transparent',
                border: 'none',
                boxShadow: hasNextWeek ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                opacity: hasNextWeek ? 1 : 0.3,
              }}
            >
              <IoChevronForwardOutline size={15} color="#1A1D1F" />
            </button>
          </div>
        )}

        {/* 목록 */}
        {loading ? (
          <div className="py-5 text-center"><div className="spinner-border text-primary" /></div>
        ) : trips.length === 0 ? (
          <EmptyState icon={IoBoatOutline} message="등록된 출조 일정이 없습니다." style={CARD} />
        ) : weekGroups.length === 0 ? (
          <EmptyState icon={IoBoatOutline} message="이번 주 등록된 출조 일정이 없습니다." style={CARD} />
        ) : (
          <div className="d-flex flex-column gap-3">
            {weekGroups.map(group => {
              const isToday = group.date === todayStr;
              const isPast = !isToday && isPastTripDate(group.date, todayStr);
              const dayStyle = getTripDayStyle(group.date);
              return (
                <div
                  key={group.date}
                  className="p-3"
                  style={{
                    ...CARD,
                    opacity: isPast ? 0.65 : 1,
                    ...(isToday
                      ? { border: '2px solid #1B6FF5', boxShadow: '0 2px 12px rgba(27,111,245,0.12)' }
                      : {}),
                  }}
                >

                  <div className="d-flex align-items-stretch gap-3">
                    <div
                      className="text-center flex-shrink-0 d-flex flex-column justify-content-center"
                      style={{ width: 44 }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: isPast ? '#9A9FA5' : isToday ? '#1B6FF5' : dayStyle.dayLabelColor,
                          fontFamily: FONT,
                          fontWeight: isToday || dayStyle.isWeekend ? 700 : 400,
                        }}
                      >
                        {dayLabel(group.date)}
                      </div>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          backgroundColor: isToday ? '#1B6FF5' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '2px auto 0',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 20,
                            fontWeight: 800,
                            color: isPast ? '#9A9FA5' : isToday ? '#FFFFFF' : dayStyle.dayNumberColor,
                            fontFamily: FONT,
                          }}
                        >
                          {parseInt(group.date.split('-')[2], 10)}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: isPast ? '#ABABAB' : isToday ? '#5B9BF5' : dayStyle.monthColor, fontFamily: FONT }}>
                        {group.date.slice(0, 7)}
                      </div>
                    </div>
                    <div
                      style={{
                        width: 1,
                        alignSelf: 'stretch',
                        backgroundColor: isPast ? '#E0E0E0' : isToday ? '#1B6FF5' : dayStyle.dividerColor,
                        flexShrink: 0,
                        opacity: isToday ? 0.35 : 1,
                      }}
                    />
                    <div className="flex-grow-1 min-w-0 d-flex flex-column">
                      {group.trips.map((trip, tripIndex) => {
                        const tripPast = isPastTripSchedule(trip.date, trip.departureTime);
                        const textMuted = isPast || tripPast;
                        return (
                        <div key={trip.id}>
                          {tripIndex > 0 && (
                            <div
                              style={{
                                height: 1,
                                backgroundColor: '#EFEFEF',
                                margin: '12px 0',
                              }}
                            />
                          )}
                          <div className="d-flex align-items-start gap-2" style={{ opacity: tripPast && !isPast ? 0.55 : 1 }}>
                            <div className="flex-grow-1 min-w-0">
                              <div style={{ fontSize: 15, fontWeight: 700, color: textMuted ? '#9A9FA5' : '#1A1D1F', fontFamily: FONT }}>
                                {trip.destination}
                              </div>
                              <div style={{ fontSize: 12, color: textMuted ? '#ABABAB' : '#6F767E', fontFamily: FONT, marginTop: 2 }}>
                                {trip.departureTime} 출발
                                {trip.returnTime && ` ~ ${trip.returnTime} 귀항`}
                                {trip.species && ` · ${trip.species}`}
                              </div>
                              {trip.price ? (
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: textMuted ? '#ABABAB' : '#1B6FF5',
                                    fontFamily: FONT,
                                    fontWeight: 600,
                                    marginTop: 2,
                                  }}
                                >
                                  {trip.price.toLocaleString()}원
                                </div>
                              ) : null}
                              {(reserveCountMap[trip.id] ?? 0) > 0 ||
                              (trip.capacity != null && trip.capacity > 0) ? (
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: '#237FFF',
                                    fontFamily: FONT,
                                    fontWeight: 600,
                                    marginTop: 4,
                                  }}
                                >
                                  예약 {reserveCountMap[trip.id] ?? 0}명
                                  {trip.capacity != null && trip.capacity > 0
                                    ? ` / 정원 ${trip.capacity}명`
                                    : ''}
                                </div>
                              ) : null}
                            </div>
                            <div className="d-flex flex-row gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => void openReservations(trip)}
                                className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                                title="예약자 보기"
                                style={{ width: 28, height: 28, backgroundColor: '#EDF5FF', border: 'none' }}
                              >
                                <IoPeopleOutline size={14} color="#237FFF" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openCopyPanel(trip.id)}
                                className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                                title="다른 날짜로 복사"
                                style={{
                                  width: 28,
                                  height: 28,
                                  backgroundColor: copyingId === trip.id ? '#34C759' : '#E8F8EE',
                                  border: 'none',
                                }}
                              >
                                <IoCopyOutline size={14} color={copyingId === trip.id ? '#fff' : '#34C759'} />
                              </button>
                              <button
                                type="button"
                                onClick={() => router.push(`/admin-trip-guide/form?id=${trip.id}`)}
                                className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                                style={{ width: 28, height: 28, backgroundColor: '#EBF1FE', border: 'none' }}
                              >
                                <IoPencilOutline size={14} color="#1B6FF5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(trip.id, trip.destination)}
                                className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                                style={{ width: 28, height: 28, backgroundColor: '#FFF0F0', border: 'none' }}
                              >
                                <IoTrashOutline size={14} color="#FF3B30" />
                              </button>
                            </div>
                          </div>
                          {copyingId === trip.id && (
                            <div
                              className="mt-3 pt-3 d-flex flex-column gap-3"
                              style={{ borderTop: '1px solid #EFEFEF' }}
                            >
                              <div
                                className="d-flex flex-column gap-3 p-3"
                                style={{ backgroundColor: '#F7F8FA', borderRadius: 12 }}
                              >
                                <span
                                  style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, lineHeight: 1.5 }}
                                >
                                  시작일~종료일 기간의 각 날짜에 목적지·시간·요금 등이 복사됩니다.
                                  {copyDateCount > 0 && (
                                    <span style={{ color: '#1B6FF5', fontWeight: 700 }}> {copyDateCount}일</span>
                                  )}
                                </span>
                                <div className="d-flex gap-2 align-items-end">
                                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                    <label
                                      className="form-label mb-1"
                                      style={{ fontSize: 11, color: '#6F767E', fontFamily: FONT }}
                                    >
                                      시작일
                                    </label>
                                    <input
                                      type="date"
                                      value={copyStartDate}
                                      onChange={e => {
                                        setCopyStartDate(e.target.value);
                                        if (copyEndDate && e.target.value > copyEndDate) {
                                          setCopyEndDate(e.target.value);
                                        }
                                      }}
                                      className="form-control"
                                      style={{ ...OHGO_INPUT, backgroundColor: '#FFFFFF' }}
                                      disabled={copying}
                                    />
                                  </div>
                                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                    <label
                                      className="form-label mb-1"
                                      style={{ fontSize: 11, color: '#6F767E', fontFamily: FONT }}
                                    >
                                      종료일
                                    </label>
                                    <input
                                      type="date"
                                      value={copyEndDate}
                                      min={copyStartDate || undefined}
                                      onChange={e => setCopyEndDate(e.target.value)}
                                      className="form-control"
                                      style={{ ...OHGO_INPUT, backgroundColor: '#FFFFFF' }}
                                      disabled={copying}
                                    />
                                  </div>
                                </div>
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: 8,
                                    width: '100%',
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="btn fw-semibold w-100"
                                    onClick={resetCopyPanel}
                                    disabled={copying}
                                    style={{
                                      ...OHGO_SECONDARY_BTN,
                                      backgroundColor: '#FFFFFF',
                                      border: '2px solid #EFEFEF',
                                      minWidth: 0,
                                    }}
                                  >
                                    취소
                                  </button>
                                  <button
                                    type="button"
                                    className={`btn fw-semibold w-100 d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
                                    onClick={() => void handleCopy(trip)}
                                    disabled={copying || !copyStartDate || !copyEndDate || copyDateCount === 0}
                                    style={{ ...OHGO_PRIMARY_BTN, minWidth: 0 }}
                                  >
                                    {copying ? (
                                      <span className="spinner-border spinner-border-sm" role="status" />
                                    ) : (
                                      <IoCopyOutline size={18} />
                                    )}
                                    {copying
                                      ? '복사 중...'
                                      : copyDateCount > 1
                                        ? `${copyDateCount}일 복사`
                                        : '복사'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <OhgoModal
        open={!!reserveModalTrip}
        onClose={() => {
          setReserveModalTrip(null);
          setRejectTarget(null);
        }}
        title={reserveModalTrip ? `${reserveModalTrip.destination} 예약자` : '예약자'}
        footer={
          <OhgoModalButton variant="secondary" onClick={() => setReserveModalTrip(null)}>
            닫기
          </OhgoModalButton>
        }
      >
        {reserveLoading ? (
          <div className="py-4 text-center">
            <div className="spinner-border text-primary" role="status" />
          </div>
        ) : tripReservations.length === 0 ? (
          <p className="mb-0" style={{ fontSize: 14, color: '#6F767E', fontFamily: FONT }}>
            예약자가 없습니다.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tripReservations.map(r => (
              <div key={r.id} className="p-3 rounded-3" style={{ backgroundColor: '#F7F8FA' }}>
                <div className="d-flex justify-content-between gap-2 mb-1">
                  <span style={{ fontSize: 14, fontWeight: 700, fontFamily: FONT }}>{r.userName}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#237FFF', fontFamily: FONT }}>
                    {reservationStatusLabel(r.status)}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>{r.userPhone}</div>
                {r.status === 'pending' && (
                  <div className="d-flex gap-2 mt-2">
                    <button
                      type="button"
                      className="btn btn-sm flex-grow-1"
                      disabled={acting}
                      style={{ backgroundColor: '#34C759', color: '#fff', border: 'none' }}
                      onClick={async () => {
                        setActing(true);
                        const ok = await approveReservation(r.id);
                        if (!ok) alert('승인할 수 없습니다.');
                        if (reserveModalTrip) await openReservations(reserveModalTrip);
                        await loadTrips();
                        setActing(false);
                      }}
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm flex-grow-1"
                      disabled={acting}
                      style={{ backgroundColor: '#FF3B30', color: '#fff', border: 'none' }}
                      onClick={() => {
                        setRejectTarget(r);
                        setRejectReason('');
                      }}
                    >
                      거절
                    </button>
                  </div>
                )}
                {r.status === 'cancelled' && (
                  <button
                    type="button"
                    className="btn btn-sm w-100 mt-2"
                    disabled={acting}
                    style={{ border: '1px solid #EFEFEF', backgroundColor: '#fff', color: '#FF3B30', fontWeight: 600 }}
                    onClick={async () => {
                      if (!confirm('취소된 예약 내역을 삭제하시겠습니까?')) return;
                      setActing(true);
                      const ok = await adminDeleteCancelledReservation(r.id);
                      if (!ok) alert('삭제할 수 없는 내역입니다.');
                      else if (reserveModalTrip) await openReservations(reserveModalTrip);
                      await loadTrips();
                      setActing(false);
                    }}
                  >
                    내역 삭제
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </OhgoModal>

      <OhgoModal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="예약 거절"
        footer={
          <>
            <OhgoModalButton variant="secondary" onClick={() => setRejectTarget(null)}>
              닫기
            </OhgoModalButton>
            <OhgoModalButton
              variant="danger"
              disabled={acting}
              onClick={async () => {
                if (!rejectTarget) return;
                setActing(true);
                const ok = await rejectReservation(rejectTarget.id, rejectReason);
                if (!ok) alert('거절할 수 없습니다.');
                setRejectTarget(null);
                setRejectReason('');
                if (reserveModalTrip) await openReservations(reserveModalTrip);
                await loadTrips();
                setActing(false);
              }}
            >
              거절
            </OhgoModalButton>
          </>
        }
      >
        <input
          type="text"
          className="form-control"
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          placeholder="거절 사유 (선택)"
          style={{ fontFamily: FONT }}
        />
      </OhgoModal>
    </SubPageFrame>
  );
}
