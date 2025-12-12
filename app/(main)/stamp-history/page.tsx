'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getStampHistory } from '@/utils/stamp-service';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PageHeader from '@/components/PageHeader';

type StampHistoryItem = {
  id: string;
  action: 'add' | 'recall' | 'remove';
  method: string;
  timestamp: any;
  message: string;
  date?: string;
  [key: string]: any;
};

async function clearStampHistory(uuid: string) {
  const historyRef = collection(db, `users/${uuid}/stampHistory`);
  const snap = await getDocs(historyRef);
  const batchDeletes = snap.docs.map(docSnap => deleteDoc(docSnap.ref));
  await Promise.all(batchDeletes);
}

function StampHistoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uuid = searchParams.get('uuid') || '';
  const name = searchParams.get('name') || '';

  const [history, setHistory] = useState<StampHistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [action, setAction] = useState<'all' | 'add' | 'recall' | 'remove'>('all');

  const fetchHistory = async () => {
    setRefreshing(true);
    try {
      let result = await getStampHistory({
        uuid,
        startDate,
        endDate,
      }) as StampHistoryItem[];
      if (action !== 'all') result = result.filter(x => x.action === action);
      setHistory(result);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (uuid) {
      fetchHistory();
    }
  }, [uuid, startDate, endDate, action]);

  const onRefresh = async () => {
    await fetchHistory();
  };

  const { containerRef, isRefreshing: isPulling, pullProgress } = usePullToRefresh({
    onRefresh: onRefresh,
    enabled: true,
  });

  const handleClearHistory = async () => {
    if (!confirm('정말로 이 회원의 모든 스탬프 이력을 삭제하시겠습니까?')) return;
    await clearStampHistory(uuid);
    setHistory([]);
  };

  const getActionLabel = (action: string) => {
    if (action === 'add') return '적립';
    if (action === 'remove') return '삭제';
    if (action === 'recall') return '회수';
    return action;
  };

  const getActionColor = (action: string) => {
    if (action === 'add') return 'success';
    if (action === 'remove') return 'danger';
    if (action === 'recall') return 'warning';
    return 'secondary';
  };

  return (
    <div 
      ref={containerRef}
      className="min-vh-100 bg-light"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}
    >
      <PageHeader title="스탬프 이력" />
      {isPulling && (
        <div 
          className="position-fixed top-0 start-50 translate-middle-x d-flex align-items-center justify-content-center bg-primary text-white rounded-bottom p-2"
          style={{
            zIndex: 1000,
            transform: 'translateX(-50%)',
            minWidth: '120px',
            height: `${Math.min(pullProgress * 50, 50)}px`,
            opacity: pullProgress,
            marginTop: '60px'
          }}
        >
          {pullProgress >= 1 ? (
            <div className="spinner-border spinner-border-sm" role="status">
              <span className="visually-hidden">새로고침 중...</span>
            </div>
          ) : (
            <span className="small">아래로 당겨서 새로고침</span>
          )}
        </div>
      )}
      <div className="container pb-4" style={{ paddingTop: '80px' }}>
        {history.length > 0 && (
          <div className="d-flex justify-content-end mb-3">
            <button 
              className="btn btn-outline-danger d-flex align-items-center justify-content-center"
              onClick={handleClearHistory}
              style={{
                padding: '8px 16px',
                fontSize: '0.9rem',
                fontWeight: '500',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              전체 삭제
            </button>
          </div>
        )}

        {/* 필터 */}
        <div className="card shadow-sm mb-3">
          <div className="card-body">
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
            <div className="btn-group w-100" role="group">
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
              className="btn btn-outline-secondary w-100 mt-2 d-flex align-items-center justify-content-center"
              onClick={() => {
                setAction('all');
                setStartDate(undefined);
                setEndDate(undefined);
              }}
              style={{
                padding: '10px',
                fontSize: '0.95rem',
                fontWeight: '500',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              필터 초기화
            </button>
          </div>
        </div>

        <div className="d-flex flex-column gap-3">
          {history.map((item) => (
            <div key={item.id} className="card shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <span className={`badge bg-${getActionColor(item.action)}`}>
                    {getActionLabel(item.action)}
                  </span>
                  <small className="text-muted">
                    {item.timestamp?.toDate
                      ? format(item.timestamp.toDate(), 'yyyy-MM-dd HH:mm')
                      : '-'}
                  </small>
                </div>
                <p className="card-text mb-1">{item.message}</p>
                {item.date && (
                  <small className="text-muted">최초 적립일: {item.date}</small>
                )}
              </div>
            </div>
          ))}
        </div>

        {history.length === 0 && (
          <div className="text-center py-5">
            <p className="text-muted">📝 기록된 스탬프 이력이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StampHistoryPage() {
  return (
    <Suspense fallback={
      <div className="d-flex min-vh-100 align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">로딩 중...</p>
        </div>
      </div>
    }>
      <StampHistoryPageContent />
    </Suspense>
  );
}

