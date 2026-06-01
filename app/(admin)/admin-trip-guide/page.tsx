'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import { TripGuide, TripGuideInput, getAllTrips, addTrip, deleteTrip } from '@/utils/trip-guide-service';
import { IoAddOutline, IoTrashOutline, IoPencilOutline, IoBoatOutline, IoCopyOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { OHGO_INPUT, OHGO_PRIMARY_BTN, OHGO_SECONDARY_BTN } from '@/lib/page-styles';

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
    price: trip.price,
    notes: trip.notes,
    contact: trip.contact,
  };
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
      const data = await getAllTrips();
      setTrips(data);
    } finally { setLoading(false); }
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

        {/* 목록 */}
        {loading ? (
          <div className="py-5 text-center"><div className="spinner-border text-primary" /></div>
        ) : trips.length === 0 ? (
          <EmptyState icon={IoBoatOutline} message="등록된 출조 일정이 없습니다." style={CARD} />
        ) : (
          <div className="d-flex flex-column gap-3">
            {trips.map(trip => {
              const dayStyle = getTripDayStyle(trip.date);
              return (
              <div
                key={trip.id}
                className="p-3"
                style={CARD}
              >
                <div className="d-flex align-items-center gap-3">
                  <div className="text-center flex-shrink-0" style={{ width: 44 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: dayStyle.dayLabelColor,
                        fontFamily: FONT,
                        fontWeight: dayStyle.isWeekend ? 700 : 400,
                      }}
                    >
                      {dayLabel(trip.date)}
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: dayStyle.dayNumberColor,
                        fontFamily: FONT,
                      }}
                    >
                      {parseInt(trip.date.split('-')[2])}
                    </div>
                    <div style={{ fontSize: 11, color: dayStyle.monthColor, fontFamily: FONT }}>
                      {trip.date.slice(0, 7)}
                    </div>
                  </div>
                  <div
                    style={{ width: 1, height: 44, backgroundColor: dayStyle.dividerColor, flexShrink: 0 }}
                  />
                  <div className="flex-grow-1">
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>{trip.destination}</div>
                    <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginTop: 2 }}>
                      {trip.departureTime} 출발
                      {trip.returnTime && ` ~ ${trip.returnTime} 귀항`}
                      {trip.species && ` · ${trip.species}`}
                    </div>
                    {trip.price && (
                      <div style={{ fontSize: 12, color: '#1B6FF5', fontFamily: FONT, fontWeight: 600, marginTop: 2 }}>
                        {trip.price.toLocaleString()}원
                      </div>
                    )}
                  </div>
                  <div className="d-flex flex-row gap-1 flex-shrink-0 align-self-center">
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
                      <span style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, lineHeight: 1.5 }}>
                        시작일~종료일 기간의 각 날짜에 목적지·시간·요금 등이 복사됩니다.
                        {copyDateCount > 0 && (
                          <span style={{ color: '#1B6FF5', fontWeight: 700 }}> {copyDateCount}일</span>
                        )}
                      </span>
                      <div className="d-flex gap-2 align-items-end">
                        <div className="flex-grow-1" style={{ minWidth: 0 }}>
                          <label className="form-label mb-1" style={{ fontSize: 11, color: '#6F767E', fontFamily: FONT }}>
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
                          <label className="form-label mb-1" style={{ fontSize: 11, color: '#6F767E', fontFamily: FONT }}>
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
                          className="btn fw-semibold w-100 d-flex align-items-center justify-content-center gap-2"
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
        )}
    </SubPageFrame>
  );
}
