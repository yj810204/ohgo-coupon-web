'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, getDay, eachDayOfInterval } from 'date-fns';
import {
  getMonthRosterSummary,
  getYearConfirmedTripCount,
  getConfirmedTrip,
} from '@/utils/roster-service';
import {
  IoChevronBackOutline,
  IoChevronForwardOutline,
  IoStatsChartOutline,
  IoBoatOutline,
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

function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <div
      className="d-flex align-items-center gap-3"
      style={{ ...CARD, padding: '14px 16px' }}
    >
      <div
        className="d-flex align-items-center justify-content-center flex-shrink-0"
        style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: iconBg }}
      >
        <Icon size={22} color={iconColor} />
      </div>
      <div className="min-w-0">
        <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT, lineHeight: 1.2 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

type CachedMonth = {
  datesWithRoster: string[];
  confirmedTrips: Record<string, number[]>;
  timestamp: number;
};

export default function TodayRosterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [modalVisible, setModalVisible] = useState(false);
  const [tempSelectedDate, setTempSelectedDate] = useState<Date | null>(null);
  const [datesWithRoster, setDatesWithRoster] = useState<string[]>([]);
  const [confirmedTrips, setConfirmedTrips] = useState<Record<string, number[]>>({});
  const [cachedMonths, setCachedMonths] = useState<Record<string, CachedMonth>>({});
  const [totalConfirmedTrips, setTotalConfirmedTrips] = useState<number>(0);
  const [currentMonthTrips, setCurrentMonthTrips] = useState<number>(0);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
    };
    checkAuth();
    fetchTotalConfirmedTrips();
  }, [router]);

  useEffect(() => {
    fetchRosterData();
    fetchTotalConfirmedTrips();
  }, [currentMonth]);

  useEffect(() => {
    let count = 0;
    Object.values(confirmedTrips).forEach(trips => {
      count += trips.length;
    });
    setCurrentMonthTrips(count);
  }, [confirmedTrips]);

  const limitCacheSize = (cache: Record<string, CachedMonth>) => {
    const MAX_CACHE_SIZE = 3;
    if (Object.keys(cache).length <= MAX_CACHE_SIZE) return cache;
    
    const sortedEntries = Object.entries(cache).sort((a, b) => b[1].timestamp - a[1].timestamp);
    const limitedEntries = sortedEntries.slice(0, MAX_CACHE_SIZE);
    
    return Object.fromEntries(limitedEntries);
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = getDay(monthStart);
  const calendarCells: (Date | null)[] = [
    ...Array(startDay).fill(null),
    ...days,
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const prevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const fetchRosterData = async (forceRefresh: boolean = false) => {
    setLoading(true);
    try {
      const monthKey = format(currentMonth, 'yyyy-MM');
      
      if (!forceRefresh && cachedMonths[monthKey]) {
        console.log('Using cached data for month:', monthKey);
        setDatesWithRoster(cachedMonths[monthKey].datesWithRoster);
        setConfirmedTrips(cachedMonths[monthKey].confirmedTrips);
        
        setCachedMonths(prev => {
          const updatedCache = {
            ...prev,
            [monthKey]: {
              ...prev[monthKey],
              timestamp: Date.now()
            }
          };
          return limitCacheSize(updatedCache);
        });
        
        setLoading(false);
        return;
      }
      
      const startDateStr = format(monthStart, 'yyyy-MM-dd');
      const endDateStr = format(monthEnd, 'yyyy-MM-dd');

      const summary = await getMonthRosterSummary(startDateStr, endDateStr);
      setDatesWithRoster(summary.datesWithRoster);
      setConfirmedTrips(summary.confirmedTrips);

      setCachedMonths((prev) => {
        const updatedCache = {
          ...prev,
          [monthKey]: {
            datesWithRoster: summary.datesWithRoster,
            confirmedTrips: summary.confirmedTrips,
            timestamp: Date.now(),
          },
        };
        return limitCacheSize(updatedCache);
      });
      
    } catch (error) {
      console.error('Error fetching roster data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTotalConfirmedTrips = async () => {
    try {
      const totalCount = await getYearConfirmedTripCount(currentMonth.getFullYear());
      setTotalConfirmedTrips(totalCount);
    } catch (error) {
      console.error('Error fetching total confirmed trips:', error);
    }
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

  const handleTripSelection = async (tripNumber: number) => {
    if (tempSelectedDate) {
      const dateStr = format(tempSelectedDate, 'yyyy-MM-dd');
      const dateDisplay = format(tempSelectedDate, 'yyyy년 MM월 dd일');
      
      router.push(`/roster-list?date=${dateStr}&dateDisplay=${encodeURIComponent(dateDisplay)}&tripNumber=${tripNumber}`);
      setModalVisible(false);
    }
  };

  const handleTripClick = async (tripNumber: number) => {
    if (!tempSelectedDate) return;

    const dateStr = format(tempSelectedDate, 'yyyy-MM-dd');
    const confirmedForDate = confirmedTrips[dateStr] || [];

    if (confirmedForDate.includes(tripNumber)) {
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
    } else {
      handleTripSelection(tripNumber);
    }
  };

  useNativePullToRefresh(async () => {
    await fetchRosterData(true);
    await fetchTotalConfirmedTrips();
  });

  return (
    <SubPageFrame title="명부 관리" onRefresh={async () => { await fetchRosterData(true); await fetchTotalConfirmedTrips(); }}>
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

        <p
          className="mb-3 px-1"
          style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, lineHeight: 1.5, textAlign: 'center' }}
        >
          날짜를 선택하면 해당 날짜의 명부를 확인할 수 있습니다.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          <StatCard
            icon={IoBoatOutline}
            iconBg="#EBF1FE"
            iconColor="#1B6FF5"
            label={`${format(currentMonth, 'M')}월 출항수`}
            value={`${currentMonthTrips.toLocaleString()}회`}
          />
          <StatCard
            icon={IoStatsChartOutline}
            iconBg="#E8F8EE"
            iconColor="#34C759"
            label={`${currentMonth.getFullYear()}년 누적 출항수`}
            value={`${totalConfirmedTrips.toLocaleString()}회`}
          />
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
            <OhgoModalActions>
              {([1, 2, 3] as const).map(trip => {
                const isConfirmed = confirmedForDate.some(t => Number(t) === trip);
                return (
                  <OhgoModalButton
                    key={trip}
                    variant={isConfirmed ? 'success' : 'primary'}
                    onClick={() => handleTripClick(trip)}
                  >
                    {isConfirmed ? `✓ ${trip}항차 (출항 확정)` : `${trip}항차`}
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
