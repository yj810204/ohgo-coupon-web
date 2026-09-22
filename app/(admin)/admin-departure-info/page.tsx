'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addMonths, format, subMonths } from 'date-fns';
import {
  getCachedMonthRosterSummary,
  getYearConfirmedTripCount,
  invalidateRosterSummaryCache,
  peekMonthRosterSummary,
  peekYearRosterSummary,
  type MonthRosterSummary,
} from '@/utils/roster-service';
import {
  IoBoatOutline,
  IoChevronBackOutline,
  IoChevronForwardOutline,
  IoStatsChartOutline,
} from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import { useRequireAdmin } from '@/hooks/useRequireAdmin';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { OHGO_CARD, OHGO_FONT, OhgoPageLoading } from '@/lib/page-styles';

const CARD: React.CSSProperties = { ...OHGO_CARD };

function countConfirmedTrips(summary: MonthRosterSummary): number {
  return Object.values(summary.confirmedTrips).reduce((sum, nums) => sum + nums.length, 0);
}

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
    <div className="d-flex align-items-center gap-3" style={{ ...CARD, padding: '14px 16px' }}>
      <div
        className="d-flex align-items-center justify-content-center flex-shrink-0"
        style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: iconBg }}
      >
        <Icon size={22} color={iconColor} />
      </div>
      <div className="min-w-0">
        <div style={{ fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1A1D1F', fontFamily: OHGO_FONT, lineHeight: 1.2 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

export default function AdminDepartureInfoPage() {
  const { ready } = useRequireAdmin();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const year = currentMonth.getFullYear();
  const monthKey = format(currentMonth, 'yyyy-MM');
  const cachedInitial = peekMonthRosterSummary(monthKey);
  const yearCached = peekYearRosterSummary(year);
  const [monthSummary, setMonthSummary] = useState<MonthRosterSummary | null>(cachedInitial ?? null);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(cachedInitial ? monthKey : null);
  const [yearTrips, setYearTrips] = useState<number | null>(
    yearCached ? countConfirmedTrips(yearCached) : null
  );
  const [loadedYear, setLoadedYear] = useState<number | null>(yearCached ? year : null);
  const [loading, setLoading] = useState(!cachedInitial);

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
        if (forceRefresh) {
          const count = await getYearConfirmedTripCount(year);
          setYearTrips(count);
          setLoadedYear(year);
        }
      } catch (error) {
        console.error('Error fetching departure stats:', error);
        alert('출항 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    },
    [monthKey, year]
  );

  useEffect(() => {
    if (ready) void fetchMonthSummary(false);
  }, [ready, fetchMonthSummary]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const count = await getYearConfirmedTripCount(year);
        if (!cancelled) {
          setYearTrips(count);
          setLoadedYear(year);
        }
      } catch (error) {
        console.warn('Error fetching year trip count:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, year]);

  useNativePullToRefresh(() => fetchMonthSummary(true));

  const monthTrips = useMemo(() => {
    if (!monthSummary || loadedMonth !== monthKey) return 0;
    return countConfirmedTrips(monthSummary);
  }, [monthSummary, loadedMonth, monthKey]);

  const yearTripsDisplay = loadedYear === year ? yearTrips ?? 0 : 0;

  if (!ready) return <OhgoPageLoading />;

  return (
    <SubPageFrame title="출항 정보" onRefresh={() => fetchMonthSummary(true)}>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          aria-label="이전 달"
        >
          <IoChevronBackOutline size={18} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: OHGO_FONT }}>
          {format(currentMonth, 'yyyy년 M월')}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
          aria-label="다음 달"
        >
          <IoChevronForwardOutline size={18} />
        </button>
      </div>

      {loading && !monthSummary ? (
        <OhgoPageLoading />
      ) : (
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
            value={`${monthTrips.toLocaleString()}회`}
          />
          <StatCard
            icon={IoStatsChartOutline}
            iconBg="#E8F8EE"
            iconColor="#34C759"
            label={`${year}년 누적 출항수`}
            value={`${yearTripsDisplay.toLocaleString()}회`}
          />
        </div>
      )}
    </SubPageFrame>
  );
}
