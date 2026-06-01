'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getTripsByMonth, TripGuide } from '@/utils/trip-guide-service';
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
import OhgoModal, { OhgoModalButton } from '@/components/OhgoModal';
import EmptyState from '@/components/EmptyState';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function toYM(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatPrice(p?: number) {
  if (!p) return '';
  return p.toLocaleString('ko-KR') + '원';
}

export default function TripGuidePage() {
  const router = useRouter();
  const today = new Date();
  const todayStr = toDateStr(today);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [trips, setTrips] = useState<TripGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [modalTrip, setModalTrip] = useState<TripGuide | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) { router.replace('/login'); return; }
    };
    checkAuth();
  }, [router]);

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

  // 다른 달로 이동 시 선택 날짜를 해당 월 범위로 맞춤 (현재 달이면 오늘)
  useEffect(() => {
    setSelectedDate(prev => {
      if (!prev) return todayStr;
      const [y, m] = prev.split('-').map(Number);
      if (y === year && m === month + 1) return prev;
      if (year === today.getFullYear() && month === today.getMonth()) return todayStr;
      return `${year}-${String(month + 1).padStart(2, '0')}-01`;
    });
  }, [year, month, todayStr]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  // 달력 날짜 배열 생성
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // 6줄 맞춤
  while (cells.length % 7 !== 0) cells.push(null);

  // 날짜별 trip map
  const tripMap: Record<string, TripGuide[]> = {};
  trips.forEach(t => {
    if (!tripMap[t.date]) tripMap[t.date] = [];
    tripMap[t.date].push(t);
  });

  const getDateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const selectedTrips = tripMap[selectedDate] || [];

  return (
    <SubPageFrame title="출조 안내" onRefresh={loadTrips}>
        {/* 월 이동 헤더 */}
        <div className="d-flex align-items-center justify-content-between mb-3">
          <button type="button" onClick={prevMonth} className="btn p-2 rounded-circle" style={{ border: 'none', backgroundColor: '#F7F8FA' }}>
            <IoChevronBackOutline size={20} color="#1A1D1F" />
          </button>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}>
            {year}년 {month + 1}월
          </span>
          <button type="button" onClick={nextMonth} className="btn p-2 rounded-circle" style={{ border: 'none', backgroundColor: '#F7F8FA' }}>
            <IoChevronForwardOutline size={20} color="#1A1D1F" />
          </button>
        </div>

        {/* 달력 카드 */}
        <div className="mb-4" style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {/* 요일 헤더 */}
          <div className="d-flex" style={{ borderBottom: '1px solid #F7F8FA' }}>
            {DAYS.map((d, i) => (
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

          {/* 날짜 셀 */}
          {loading ? (
            <div className="py-4 text-center"><div className="spinner-border text-primary" /></div>
          ) : (
            <div>
              {Array.from({ length: cells.length / 7 }, (_, row) => (
                <div key={row} className="d-flex" style={{ borderBottom: row < cells.length / 7 - 1 ? '1px solid #F7F8FA' : 'none' }}>
                  {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                    if (!day) {
                      return (
                        <div
                          key={col}
                          style={{ flex: 1, minHeight: 58, padding: '6px 2px' }}
                          aria-hidden
                        />
                      );
                    }
                    const dateStr = getDateStr(day);
                    const dayTrips = tripMap[dateStr] || [];
                    const hasTrip = dayTrips.length > 0;
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    const isSun = col === 0;
                    const isSat = col === 6;
                    const dotColor = isToday ? '#FFCC00' : '#1B6FF5';

                    return (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setSelectedDate(dateStr)}
                        style={{
                          flex: 1,
                          minHeight: 58,
                          border: 'none',
                          backgroundColor: isSelected ? '#EBF1FE' : 'transparent',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          gap: 4,
                          cursor: 'pointer',
                          padding: '6px 2px',
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
                            backgroundColor: isToday ? '#1B6FF5' : 'transparent',
                            fontSize: 13,
                            fontWeight: isToday || isSelected ? 700 : 500,
                            fontFamily: FONT,
                            color: isToday
                              ? '#FFFFFF'
                              : isSelected
                              ? '#1B6FF5'
                              : isSun
                              ? '#FF3B30'
                              : isSat
                              ? '#1B6FF5'
                              : '#1A1D1F',
                          }}
                        >
                          {day}
                        </div>
                        {/* 출조 도트 — 일정 없어도 동일 높이 유지 */}
                        <div
                          style={{
                            display: 'flex',
                            gap: 2,
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: 6,
                            minHeight: 6,
                            width: '100%',
                          }}
                        >
                          {hasTrip &&
                            dayTrips.slice(0, 3).map((_, i) => (
                              <div
                                key={i}
                                style={{
                                  width: 5,
                                  height: 5,
                                  borderRadius: '50%',
                                  backgroundColor: dotColor,
                                  boxShadow: isToday ? '0 0 0 1px rgba(0,0,0,0.12)' : 'none',
                                }}
                              />
                            ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 선택한 날짜 출조 리스트 */}
        {!loading && (
          <>
            <div className="d-flex align-items-center mb-2 px-1">
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                {parseInt(selectedDate.split('-')[1])}월 {parseInt(selectedDate.split('-')[2])}일 출조 일정
              </span>
            </div>

            {selectedTrips.length === 0 ? (
              <EmptyState
                icon={IoBoatOutline}
                message="이 날은 출조 일정이 없습니다."
                compact
                style={{ backgroundColor: '#FFFFFF', borderRadius: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
              />
            ) : (
              <div className="d-flex flex-column gap-3">
                {selectedTrips.map(trip => (
                  <button
                    key={trip.id}
                    type="button"
                    onClick={() => setModalTrip(trip)}
                    className="btn w-100 text-start p-3"
                    style={{ backgroundColor: '#FFFFFF', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: 'none' }}
                  >
                    <div className="d-flex align-items-start gap-3">
                      <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                        style={{ width: 44, height: 44, backgroundColor: '#EBF1FE' }}>
                        <IoBoatOutline size={22} color="#1B6FF5" />
                      </div>
                      <div className="flex-grow-1">
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                          {trip.destination}
                        </div>
                        <div className="d-flex align-items-center gap-3 mt-1 flex-wrap">
                          <span className="d-flex align-items-center gap-1" style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
                            <IoTimeOutline size={14} />
                            {trip.departureTime} 출발
                            {trip.returnTime && ` ~ ${trip.returnTime} 귀항`}
                          </span>
                          {trip.species && (
                            <span className="d-flex align-items-center gap-1" style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
                              <IoFishOutline size={14} />
                              {trip.species}
                            </span>
                          )}
                        </div>
                        {trip.price && (
                          <div className="mt-1">
                            <span className="badge rounded-pill" style={{ backgroundColor: '#EBF1FE', color: '#1B6FF5', fontSize: 12, fontFamily: FONT, fontWeight: 600 }}>
                              {formatPrice(trip.price)}
                            </span>
                          </div>
                        )}
                      </div>
                      <IoInformationCircleOutline size={20} color="#ABABAB" style={{ flexShrink: 0, marginTop: 2 }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

      <OhgoModal
        open={!!modalTrip}
        onClose={() => setModalTrip(null)}
        closeOnBackdrop
        title={modalTrip?.destination ?? '출조 정보'}
        footer={
          <OhgoModalButton variant="secondary" onClick={() => setModalTrip(null)}>
            닫기
          </OhgoModalButton>
        }
      >
        {modalTrip && (
          <>
            <div className="d-flex align-items-center gap-3 mb-3">
              <div
                className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 44, height: 44, backgroundColor: '#1B6FF5' }}
              >
                <IoBoatOutline size={22} color="#fff" />
              </div>
              <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
                {parseInt(modalTrip.date.split('-')[1])}월 {parseInt(modalTrip.date.split('-')[2])}일 (
                {DAYS[new Date(modalTrip.date + 'T00:00:00').getDay()]})
              </div>
            </div>
            {[
              {
                icon: IoTimeOutline,
                label: '출발',
                value: `${modalTrip.departureTime}${modalTrip.returnTime ? ` ~ ${modalTrip.returnTime}` : ''}`,
              },
              modalTrip.species ? { icon: IoFishOutline, label: '목표 어종', value: modalTrip.species } : null,
              modalTrip.contact ? { icon: IoCallOutline, label: '예약 문의', value: modalTrip.contact } : null,
            ]
              .filter(Boolean)
              .map((item, idx) =>
                item ? (
                  <div key={idx} className="d-flex align-items-start gap-3 mb-3">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{ width: 36, height: 36, backgroundColor: '#F7F8FA' }}
                    >
                      <item.icon size={18} color="#1B6FF5" />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>{item.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1D1F', fontFamily: FONT }}>
                        {item.value}
                      </div>
                    </div>
                  </div>
                ) : null
              )}
            {modalTrip.price && (
              <div
                className="p-3 rounded-3 mb-3 d-flex align-items-center justify-content-between"
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
          </>
        )}
      </OhgoModal>
    </SubPageFrame>
  );
}
