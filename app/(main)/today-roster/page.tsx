'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { useLoading } from '@/contexts/LoadingContext';
import { getUser } from '@/lib/storage';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, getDay, eachDayOfInterval } from 'date-fns';
import {
  getCachedMonthRosterSummary,
  peekMonthRosterSummary,
  getConfirmedTrip,
  invalidateRosterSummaryCache,
  type MonthRosterSummary,
} from '@/utils/roster-service';
import {
  IoChevronBackOutline,
  IoChevronForwardOutline,
} from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, { OhgoModalActions, OhgoModalButton } from '@/components/OhgoModal';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { OHGO_CARD, OHGO_FONT } from '@/lib/page-styles';

const FONT = OHGO_FONT;
const CARD: React.CSSProperties = { ...OHGO_CARD };
const TODAY_ACCENT = '#E65100';
const TODAY_BG = '#FFF3E0';
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function TodayRosterPage() {
  const router = useRouter();
  const { setLoading: setNavLoading } = useLoading();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const initialMonthKey = format(currentMonth, 'yyyy-MM');
  const cachedInitial = peekMonthRosterSummary(initialMonthKey);
  const [loading, setLoading] = useState(!cachedInitial);
  const [modalVisible, setModalVisible] = useState(false);
  const [tempSelectedDate, setTempSelectedDate] = useState<Date | null>(null);
  const [monthSummary, setMonthSummary] = useState<MonthRosterSummary | null>(cachedInitial ?? null);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(cachedInitial ? initialMonthKey : null);

  const year = currentMonth.getFullYear();
  const monthKey = format(currentMonth, 'yyyy-MM');
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const confirmedTrips = useMemo(() => {
    if (!monthSummary || loadedMonth !== monthKey) {
      return {} as Record<string, number[]>;
    }
    return monthSummary.confirmedTrips;
  }, [monthSummary, loadedMonth, monthKey]);

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = getDay(monthStart);
  const calendarCells: (Date | null)[] = [
    ...Array(startDay).fill(null),
    ...days,
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
      }
    };
    checkAuth();
  }, [router]);

  const fetchMonthSummary = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = peekMonthRosterSummary(monthKey);
        if (cached) {
          setMonthSummary(cached);
          setLoadedMonth(monthKey);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      try {
        if (forceRefresh) {
          invalidateRosterSummaryCache(year);
        }
        const summary = await getCachedMonthRosterSummary(monthKey);
        setMonthSummary(summary);
        setLoadedMonth(monthKey);
      } catch (error) {
        console.error('Error fetching roster data:', error);
      } finally {
        setLoading(false);
      }
    },
    [monthKey, year]
  );

  useEffect(() => {
    fetchMonthSummary(false);
  }, [fetchMonthSummary]);

  useEffect(() => {
    if (loadedMonth !== monthKey) return;
    const base = new Date(`${monthKey}-01T00:00:00`);
    void getCachedMonthRosterSummary(format(subMonths(base, 1), 'yyyy-MM'));
    void getCachedMonthRosterSummary(format(addMonths(base, 1), 'yyyy-MM'));
  }, [loadedMonth, monthKey]);

  const prevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const handleDateClick = (day: Date) => {
    setTempSelectedDate(day);
    setModalVisible(true);
  };

  const isDateBeforeToday = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date < today;
  };

  const handleTripSelection = (tripNumber: number) => {
    if (!tempSelectedDate) return;
    const dateStr = format(tempSelectedDate, 'yyyy-MM-dd');
    const dateDisplay = format(tempSelectedDate, 'yyyy년 MM월 dd일');
    setModalVisible(false);
    router.push(
      `/roster-list?date=${dateStr}&dateDisplay=${encodeURIComponent(dateDisplay)}&tripNumber=${tripNumber}`
    );
  };

  const handleTripClick = async (tripNumber: number) => {
    if (!tempSelectedDate) return;

    const dateStr = format(tempSelectedDate, 'yyyy-MM-dd');
    const confirmedForDate = confirmedTrips[dateStr] || [];

    if (confirmedForDate.includes(tripNumber)) {
      // getConfirmedTrip 대기 전에 이동 표시 — 가만히 있는 것처럼 보이는 문제 방지
      setNavLoading(true);
      setModalVisible(false);
      try {
        const tripData = await getConfirmedTrip(dateStr, tripNumber);

        if (tripData?.rosterImageUrl) {
          router.push(
            `/roster-preview?imageUri=${encodeURIComponent(tripData.rosterImageUrl)}&date=${dateStr}&tripNumber=${tripNumber}`
          );
        } else {
          const dateDisplay = format(tempSelectedDate, 'yyyy년 MM월 dd일');
          router.push(
            `/roster-list?date=${dateStr}&dateDisplay=${encodeURIComponent(dateDisplay)}&tripNumber=${tripNumber}&showPreview=true`
          );
        }
      } catch (error) {
        console.error('Error loading confirmed trip:', error);
        setNavLoading(false);
        alert('확정 명부 정보를 불러오지 못했습니다.');
      }
    } else {
      handleTripSelection(tripNumber);
    }
  };

  useNativePullToRefresh(async () => {
    await fetchMonthSummary(true);
  });

  return (
    <SubPageFrame title="명부 관리" onRefresh={async () => { await fetchMonthSummary(true); }}>
        <div className="position-relative mb-4" style={{ ...CARD, overflow: 'hidden' }}>
          {loading && (
            <div
              className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
              style={{ zIndex: 10, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 16 }}
            >
              <div className="text-center">
                <div className="spinner-border text-primary mb-2" role="status" />
                <p className="small mb-0" style={{ color: '#6F767E', fontFamily: FONT }}>
                  명부 정보를 불러오는 중...
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
              {format(currentMonth, 'yyyy년 M월')}
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

          {Array.from({ length: calendarCells.length / 7 }, (_, row) => (
            <div
              key={row}
              className="d-flex"
              style={{ borderBottom: row < calendarCells.length / 7 - 1 ? '1px solid #F7F8FA' : 'none' }}
            >
              {calendarCells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (!day) {
                  return (
                    <div
                      key={col}
                      style={{ flex: 1, minHeight: 56, padding: '6px 2px' }}
                      aria-hidden
                    />
                  );
                }

                const dayOfWeek = getDay(day);
                const dateStr = format(day, 'yyyy-MM-dd');
                const isToday = dateStr === todayStr;
                const isPastDate = isDateBeforeToday(new Date(day));
                const confirmedForDate = confirmedTrips[dateStr] || [];
                const hasTrips = confirmedForDate.length > 0;
                const isSun = dayOfWeek === 0;
                const isSat = dayOfWeek === 6;
                const tripBadgeColor =
                  confirmedForDate.length >= 2 ? '#FF9500' : '#34C759';

                let dayNumberColor = '#1A1D1F';
                if (isSun) dayNumberColor = '#FF3B30';
                else if (isSat) dayNumberColor = '#1B6FF5';
                else if (isPastDate) dayNumberColor = '#ABABAB';

                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => !loading && handleDateClick(day)}
                    disabled={loading}
                    className="btn"
                    style={{
                      flex: 1,
                      minHeight: 56,
                      border: 'none',
                      backgroundColor: isToday ? TODAY_BG : isPastDate ? '#FAFAFA' : '#FFFFFF',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      gap: 4,
                      padding: '6px 2px',
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
                      {format(day, 'd')}
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
                      {hasTrips ? (
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
                          title={`${confirmedForDate.length}항차 확정`}
                        >
                          {confirmedForDate.length}
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

      <OhgoModal
        open={modalVisible && !!tempSelectedDate}
        onClose={() => setModalVisible(false)}
        title={tempSelectedDate ? format(tempSelectedDate, 'yyyy년 MM월 dd일') : ''}
      >
        {tempSelectedDate && (() => {
          const dateStr = format(tempSelectedDate, 'yyyy-MM-dd');
          const confirmedForDate = confirmedTrips[dateStr] || [];
          return (
            <OhgoModalActions direction="stack">
              {([1, 2, 3] as const).map(trip => {
                const isConfirmed = confirmedForDate.some(t => Number(t) === trip);
                return (
                  <OhgoModalButton
                    key={trip}
                    variant={isConfirmed ? 'success' : 'primary'}
                    onClick={() => handleTripClick(trip)}
                  >
                    {isConfirmed ? `✓ ${trip}항차 (확정)` : `${trip}항차`}
                  </OhgoModalButton>
                );
              })}
            </OhgoModalActions>
          );
        })()}
      </OhgoModal>
    </SubPageFrame>
  );
}
