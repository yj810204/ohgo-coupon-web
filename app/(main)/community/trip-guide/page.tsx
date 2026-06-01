'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getTripsByMonth, TripGuide } from '@/utils/trip-guide-service';
import {
  IoChevronBackOutline,
  IoChevronForwardOutline,
  IoBoatOutline,
  IoTimeOutline,
  IoPeopleOutline,
  IoFishOutline,
  IoCallOutline,
  IoInformationCircleOutline,
  IoCloseOutline,
} from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function toYM(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function tripKey(t: TripGuide) {
  return t.date; // YYYY-MM-DD
}

function formatPrice(p?: number) {
  if (!p) return '';
  return p.toLocaleString('ko-KR') + '원';
}

export default function TripGuidePage() {
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [trips, setTrips] = useState<TripGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalTrip, setModalTrip] = useState<TripGuide | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) { router.replace('/login'); return; }
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getTripsByMonth(toYM(year, month));
        setTrips(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
    setSelectedDate(null);
  }, [year, month]);

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

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const getDateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const selectedTrips = selectedDate ? (tripMap[selectedDate] || []) : [];

  return (
    <div className="min-vh-100 pb-4" style={{ backgroundColor: '#F7F8FA', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <PageHeader title="출조 안내" />
      <div className="container py-3" style={{ maxWidth: 480 }}>

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
                    if (!day) return <div key={col} style={{ flex: 1, minHeight: 52 }} />;
                    const dateStr = getDateStr(day);
                    const hasTrip = !!tripMap[dateStr]?.length;
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    const isSun = col === 0;
                    const isSat = col === 6;

                    return (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                        style={{
                          flex: 1,
                          minHeight: 56,
                          border: 'none',
                          backgroundColor: isSelected ? '#EBF1FE' : 'transparent',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 3,
                          cursor: 'pointer',
                          padding: '4px 2px',
                        }}
                      >
                        <div
                          style={{
                            width: 30,
                            height: 30,
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
                        {/* 출조 도트 */}
                        {hasTrip && (
                          <div style={{ display: 'flex', gap: 2 }}>
                            {(tripMap[dateStr] || []).slice(0, 3).map((_, i) => (
                              <div
                                key={i}
                                style={{
                                  width: 5,
                                  height: 5,
                                  borderRadius: '50%',
                                  backgroundColor: isToday ? '#FFFFFF' : '#1B6FF5',
                                  opacity: isToday ? 0.8 : 1,
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 출조 없을 때 안내 */}
        {!loading && trips.length === 0 && (
          <div className="py-4 text-center" style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <IoBoatOutline size={48} color="#EFEFEF" />
            <p className="mt-3 mb-1" style={{ fontSize: 15, fontWeight: 600, color: '#6F767E', fontFamily: FONT }}>
              이달의 출조 일정이 없습니다.
            </p>
          </div>
        )}

        {/* 날짜 선택 시 출조 리스트 */}
        {selectedDate && (
          <>
            <div className="d-flex align-items-center mb-2 px-1">
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                {parseInt(selectedDate.split('-')[1])}월 {parseInt(selectedDate.split('-')[2])}일 출조
              </span>
            </div>

            {selectedTrips.length === 0 ? (
              <div className="py-4 text-center" style={{ backgroundColor: '#FFFFFF', borderRadius: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                <p className="mb-0" style={{ fontSize: 14, color: '#6F767E', fontFamily: FONT }}>이 날은 출조 일정이 없습니다.</p>
              </div>
            ) : (
              <div className="d-flex flex-column gap-3">
                {selectedTrips.map(trip => (
                  <button
                    key={trip.id}
                    type="button"
                    onClick={() => setModalTrip(trip)}
                    className="btn w-100 text-start p-3"
                    style={{ backgroundColor: '#FFFFFF', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: 'none', borderLeft: '4px solid #1B6FF5' }}
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

        {/* 이달 전체 출조 요약 (날짜 미선택시) */}
        {!selectedDate && !loading && trips.length > 0 && (
          <>
            <div className="d-flex align-items-center mb-2 px-1">
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>이달의 출조 일정</span>
              <span className="badge rounded-pill ms-2" style={{ backgroundColor: '#1B6FF5', fontSize: 12 }}>{trips.length}건</span>
            </div>
            <div className="d-flex flex-column gap-2">
              {trips.map(trip => (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => { setSelectedDate(trip.date); setModalTrip(trip); }}
                  className="btn w-100 text-start d-flex align-items-center gap-3 px-3 py-3"
                  style={{ backgroundColor: '#FFFFFF', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: 'none' }}
                >
                  <div className="text-center flex-shrink-0" style={{ width: 40 }}>
                    <div style={{ fontSize: 11, color: '#6F767E', fontFamily: FONT }}>{DAYS[new Date(trip.date + 'T00:00:00').getDay()]}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>{parseInt(trip.date.split('-')[2])}</div>
                  </div>
                  <div style={{ width: 1, height: 32, backgroundColor: '#EFEFEF', flexShrink: 0 }} />
                  <div className="flex-grow-1">
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1D1F', fontFamily: FONT }}>{trip.destination}</div>
                    <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginTop: 2 }}>
                      {trip.departureTime} 출발
                      {trip.species && ` · ${trip.species}`}
                    </div>
                  </div>
                  {trip.price && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1B6FF5', fontFamily: FONT, flexShrink: 0 }}>
                      {formatPrice(trip.price)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 상세 모달 */}
      {modalTrip && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1} onClick={() => setModalTrip(null)}>
          <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content border-0" style={{ borderRadius: 20, overflow: 'hidden' }}>
              {/* 헤더 */}
              <div className="px-4 pt-4 pb-3 d-flex align-items-start justify-content-between"
                style={{ borderBottom: '1px solid #F7F8FA' }}>
                <div className="d-flex align-items-center gap-3">
                  <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: 48, height: 48, background: 'linear-gradient(135deg,#1B6FF5,#5B8DEF)' }}>
                    <IoBoatOutline size={24} color="#fff" />
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}>{modalTrip.destination}</div>
                    <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
                      {parseInt(modalTrip.date.split('-')[1])}월 {parseInt(modalTrip.date.split('-')[2])}일 ({DAYS[new Date(modalTrip.date + 'T00:00:00').getDay()]})
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => setModalTrip(null)}
                  className="btn p-1 rounded-circle d-flex align-items-center justify-content-center"
                  style={{ border: 'none', backgroundColor: '#F7F8FA', width: 32, height: 32 }}>
                  <IoCloseOutline size={20} color="#6F767E" />
                </button>
              </div>

              {/* 정보 */}
              <div className="px-4 py-3">
                {[
                  { icon: IoTimeOutline, label: '출발', value: `${modalTrip.departureTime}${modalTrip.returnTime ? ` ~ ${modalTrip.returnTime}` : ''}` },
                  modalTrip.species ? { icon: IoFishOutline, label: '목표 어종', value: modalTrip.species } : null,
                  modalTrip.capacity ? { icon: IoPeopleOutline, label: '정원', value: `${modalTrip.capacity}명` } : null,
                  modalTrip.contact ? { icon: IoCallOutline, label: '예약 문의', value: modalTrip.contact } : null,
                ].filter(Boolean).map((item, idx) => item && (
                  <div key={idx} className="d-flex align-items-start gap-3 mb-3">
                    <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{ width: 36, height: 36, backgroundColor: '#F7F8FA' }}>
                      <item.icon size={18} color="#1B6FF5" />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>{item.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1D1F', fontFamily: FONT }}>{item.value}</div>
                    </div>
                  </div>
                ))}

                {modalTrip.price && (
                  <div className="p-3 rounded-3 mb-3 d-flex align-items-center justify-content-between"
                    style={{ backgroundColor: '#EBF1FE' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1B6FF5', fontFamily: FONT }}>1인 요금</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#1B6FF5', fontFamily: FONT }}>{formatPrice(modalTrip.price)}</span>
                  </div>
                )}

                {modalTrip.notes && (
                  <div className="p-3 rounded-3" style={{ backgroundColor: '#F7F8FA' }}>
                    <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginBottom: 6 }}>비고</div>
                    <div style={{ fontSize: 14, color: '#1A1D1F', fontFamily: FONT, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {modalTrip.notes}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-4 pb-4 pt-1">
                <button type="button" onClick={() => setModalTrip(null)} className="btn w-100 fw-semibold"
                  style={{ backgroundColor: '#F7F8FA', color: '#1A1D1F', borderRadius: 12, padding: 13, border: 'none', fontFamily: FONT }}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
