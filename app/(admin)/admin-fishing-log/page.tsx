'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resolveAppUser } from '@/lib/auth-session';
import { getProfileByUserId } from '@/lib/supabase-auth';
import {
  deleteLog,
  formatSpeciesDisplay,
  getLogsByMonth,
  getMonthlyStats,
  type FishingLog,
  type FishingLogMonthlyStats,
} from '@/utils/fishing-operation-service';
import {
  IoAddOutline,
  IoChevronBackOutline,
  IoChevronForwardOutline,
  IoFishOutline,
  IoTrashOutline,
} from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { OHGO_CARD, OHGO_FONT, OhgoPageLoading } from '@/lib/page-styles';
import { ADMIN_EDIT_ICON } from '@/lib/admin-icons';

const CARD: React.CSSProperties = { ...OHGO_CARD };

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function AdminFishingLogContent() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [logs, setLogs] = useState<FishingLog[]>([]);
  const [stats, setStats] = useState<FishingLogMonthlyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }
      const profile = await getProfileByUserId(appUser.uuid);
      if (!profile || (profile.role !== 'admin' && profile.role !== 'captain')) {
        router.replace('/main');
        return;
      }
      setReady(true);
    };
    void check();
  }, [router]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [logList, monthStats] = await Promise.all([
        getLogsByMonth(yearMonth),
        getMonthlyStats(yearMonth),
      ]);
      setLogs(logList);
      setStats(monthStats);
    } catch (e) {
      console.error(e);
      alert('조업일지를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    if (ready) void loadData();
  }, [ready, loadData]);

  useNativePullToRefresh(loadData);

  const monthLabel = useMemo(() => {
    const [y, m] = yearMonth.split('-');
    return `${y}년 ${Number(m)}월`;
  }, [yearMonth]);

  const handleDelete = async (log: FishingLog) => {
    if (!confirm(`${log.date} 조업 기록을 삭제할까요?`)) return;
    try {
      await deleteLog(log.id);
      await loadData();
    } catch (e) {
      alert('삭제 실패: ' + (e as Error).message);
    }
  };

  if (!ready) return <OhgoPageLoading />;

  return (
    <SubPageFrame title="조업일지">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setYearMonth((m) => shiftMonth(m, -1))}
          aria-label="이전 달"
        >
          <IoChevronBackOutline size={18} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: OHGO_FONT }}>{monthLabel}</span>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setYearMonth((m) => shiftMonth(m, 1))}
          aria-label="다음 달"
        >
          <IoChevronForwardOutline size={18} />
        </button>
      </div>

      {stats && (
        <div className="row g-2 mb-3">
          <div className="col-4">
            <div className="p-3 text-center h-100" style={CARD}>
              <div style={{ fontSize: 11, color: '#6F767E', fontFamily: OHGO_FONT }}>출항</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1B6FF5', fontFamily: OHGO_FONT }}>
                {stats.tripCount}
              </div>
            </div>
          </div>
          <div className="col-4">
            <div className="p-3 text-center h-100" style={CARD}>
              <div style={{ fontSize: 11, color: '#6F767E', fontFamily: OHGO_FONT }}>어획(kg)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#2E7D32', fontFamily: OHGO_FONT }}>
                {stats.totalCatchKg.toLocaleString()}
              </div>
            </div>
          </div>
          <div className="col-4">
            <div className="p-3 text-center h-100" style={CARD}>
              <div style={{ fontSize: 11, color: '#6F767E', fontFamily: OHGO_FONT }}>매출(원)</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#E65100', fontFamily: OHGO_FONT }}>
                {stats.totalRevenue.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {stats && stats.speciesTotals.length > 0 && (
        <div className="p-3 mb-3" style={CARD}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: OHGO_FONT, marginBottom: 8 }}>
            어종별 출조
          </div>
          <div className="d-flex flex-wrap gap-2">
            {stats.speciesTotals.map((item) => (
              <span
                key={item.species}
                className="badge rounded-pill"
                style={{ backgroundColor: '#EBF1FE', color: '#1B6FF5', fontWeight: 600, fontFamily: OHGO_FONT }}
              >
                {item.species} {item.count}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn w-100 mb-3 d-flex align-items-center justify-content-center gap-2"
        style={{
          backgroundColor: '#1B6FF5',
          color: '#fff',
          borderRadius: 14,
          padding: '12px',
          fontWeight: 700,
          fontFamily: OHGO_FONT,
          border: 'none',
        }}
        onClick={() => router.push('/admin-fishing-log/form')}
      >
        <IoAddOutline size={20} />
        조업일지 작성
      </button>

      {loading ? (
        <div className="text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState icon={IoFishOutline} message="이번 달 조업 기록이 없습니다." style={CARD} />
      ) : (
        <div className="d-flex flex-column gap-2">
          {logs.map((log) => (
            <div key={log.id} className="p-3" style={CARD}>
              <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: OHGO_FONT }}>{log.date}</div>
                  <div style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT }}>
                    {log.area || '해역 미입력'}
                    {log.departureTime ? ` · ${log.departureTime}` : ''}
                    {log.arrivalTime ? ` ~ ${log.arrivalTime}` : ''}
                  </div>
                </div>
                <div className="d-flex gap-1 flex-shrink-0">
                  <button
                    type="button"
                    className="btn btn-sm btn-light"
                    onClick={() => router.push(`/admin-fishing-log/form?id=${log.id}`)}
                    aria-label="수정"
                  >
                    <ADMIN_EDIT_ICON size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-light text-danger"
                    onClick={() => void handleDelete(log)}
                    aria-label="삭제"
                  >
                    <IoTrashOutline size={16} />
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 13, fontFamily: OHGO_FONT, color: '#1A1D1F' }}>
                어종: {formatSpeciesDisplay(log.species)}
              </div>
              <div className="d-flex gap-3 mt-1" style={{ fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT }}>
                {log.catchKg != null && <span>어획 {log.catchKg}kg</span>}
                {log.waterTemp != null && <span>수온 {log.waterTemp}°C</span>}
                {log.weather && <span>{log.weather}</span>}
                {log.revenue != null && <span>매출 {log.revenue.toLocaleString()}원</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </SubPageFrame>
  );
}

export default function AdminFishingLogPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <AdminFishingLogContent />
    </Suspense>
  );
}
