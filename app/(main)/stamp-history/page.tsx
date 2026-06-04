'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { getStampHistory, clearStampHistory } from '@/utils/stamp-service';
import SubPageFrame from '@/components/SubPageFrame';
import SubPageActionBar from '@/components/SubPageActionBar';
import EmptyState from '@/components/EmptyState';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { IoTimeOutline } from 'react-icons/io5';
import { OHGO_CARD, OHGO_FONT, OHGO_SECONDARY_BTN, OhgoPageLoading } from '@/lib/page-styles';

type StampHistoryItem = {
  id: string;
  action: 'add' | 'recall' | 'remove' | string;
  method?: string;
  timestamp: unknown;
  message?: string;
  date?: string;
};

function formatHistoryTimestamp(timestamp: unknown): string {
  if (!timestamp) return '-';
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? '-' : format(d, 'yyyy-MM-dd HH:mm');
  }
  if (
    typeof timestamp === 'object' &&
    timestamp &&
    'toDate' in timestamp &&
    typeof (timestamp as { toDate: () => Date }).toDate === 'function'
  ) {
    return format((timestamp as { toDate: () => Date }).toDate(), 'yyyy-MM-dd HH:mm');
  }
  return '-';
}

function StampHistoryPageContent() {
  const searchParams = useSearchParams();
  const uuid = searchParams.get('uuid') || '';

  const [history, setHistory] = useState<StampHistoryItem[]>([]);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [action, setAction] = useState<'all' | 'add' | 'recall' | 'remove'>('all');

  const fetchHistory = async () => {
    if (!uuid) return;
    let result = (await getStampHistory({
      uuid,
      startDate,
      endDate,
    })) as StampHistoryItem[];
    if (action !== 'all') result = result.filter((x) => x.action === action);
    setHistory(result);
  };

  useEffect(() => {
    if (uuid) {
      fetchHistory();
    }
  }, [uuid, startDate, endDate, action]);

  useNativePullToRefresh(fetchHistory);

  const handleClearHistory = async () => {
    if (!confirm('정말로 이 회원의 모든 스탬프 이력을 삭제하시겠습니까?')) return;
    await clearStampHistory(uuid);
    setHistory([]);
  };

  const getActionLabel = (actionValue: string) => {
    if (actionValue === 'add') return '적립';
    if (actionValue === 'remove') return '삭제';
    if (actionValue === 'recall') return '회수';
    return actionValue;
  };

  const getActionColor = (actionValue: string) => {
    if (actionValue === 'add') return 'success';
    if (actionValue === 'remove') return 'danger';
    if (actionValue === 'recall') return 'warning';
    return 'secondary';
  };

  return (
    <SubPageFrame title="스탬프 이력" onRefresh={fetchHistory}>
        <div className="p-3 mb-3" style={OHGO_CARD}>
            <div className="mb-2">
              <label className="form-label small">시작일</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={startDate ? format(startDate, 'yyyy-MM-dd') : ''}
                onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : undefined)}
              />
            </div>
            <div className="mb-2">
              <label className="form-label small">종료일</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={endDate ? format(endDate, 'yyyy-MM-dd') : ''}
                onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value) : undefined)}
              />
            </div>
            <div className="ohgo-filter-group w-100 mb-2" role="group">
              <button
                type="button"
                className={`btn btn-sm ${action === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setAction('all')}
              >
                전체
              </button>
              <button
                type="button"
                className={`btn btn-sm ${action === 'add' ? 'btn-success' : 'btn-outline-success'}`}
                onClick={() => setAction('add')}
              >
                적립
              </button>
              <button
                type="button"
                className={`btn btn-sm ${action === 'recall' ? 'btn-warning' : 'btn-outline-warning'}`}
                onClick={() => setAction('recall')}
              >
                회수
              </button>
              <button
                type="button"
                className={`btn btn-sm ${action === 'remove' ? 'btn-danger' : 'btn-outline-danger'}`}
                onClick={() => setAction('remove')}
              >
                삭제
              </button>
            </div>
            <button
              type="button"
              className="btn w-100 mt-2 fw-semibold"
              onClick={() => {
                setAction('all');
                setStartDate(undefined);
                setEndDate(undefined);
              }}
              style={{ ...OHGO_SECONDARY_BTN, marginTop: 8 }}
            >
              필터 초기화
            </button>
        </div>

        {history.length > 0 && (
          <SubPageActionBar
            meta={`조회 ${history.length}건 · 전체 이력 삭제`}
            label="전체 삭제"
            onClick={handleClearHistory}
            variant="danger"
          />
        )}

        <div className="d-flex flex-column gap-3">
          {history.map((item) => (
            <div key={item.id} className="p-3" style={OHGO_CARD}>
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <span className={`badge bg-${getActionColor(item.action)}`}>
                    {getActionLabel(item.action)}
                  </span>
                  <small className="text-muted">
                    {formatHistoryTimestamp(item.timestamp)}
                  </small>
                </div>
                <p className="mb-1" style={{ fontSize: 14, color: '#1A1D1F', fontFamily: OHGO_FONT }}>{item.message}</p>
                {item.date && (
                  <small style={{ fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT }}>최초 적립일: {item.date}</small>
                )}
            </div>
          ))}
        </div>

        {history.length === 0 && (
          <EmptyState icon={IoTimeOutline} message="기록된 스탬프 이력이 없습니다." style={OHGO_CARD} />
        )}
    </SubPageFrame>
  );
}

export default function StampHistoryPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <StampHistoryPageContent />
    </Suspense>
  );
}
