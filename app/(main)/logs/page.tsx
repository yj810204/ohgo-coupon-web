'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { collection, getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

function LogsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uuid = searchParams.get('uuid') || '';
  const name = searchParams.get('name') || '';

  const [logs, setLogs] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadLogs = async () => {
    const logRef = collection(db, `users/${uuid}/logs`);
    const q = query(logRef, orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    const items = snap.docs.map(doc => {
      const { action, detail, timestamp } = doc.data();
      return {
        id: doc.id,
        action,
        detail,
        timestamp: timestamp?.toDate?.() || new Date(),
      };
    });
    setLogs(items);
  };

  useEffect(() => {
    if (uuid) {
      loadLogs();
    }
  }, [uuid]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
  };

  const { containerRef, isRefreshing: isPulling, pullProgress } = usePullToRefresh({
    onRefresh: onRefresh,
    enabled: true,
  });

  const clearLogs = async () => {
    if (!confirm('정말로 이 회원의 모든 로그를 삭제하시겠습니까?')) return;
    try {
      const logRef = collection(db, `users/${uuid}/logs`);
      const snap = await getDocs(logRef);
      const batchDeletes = snap.docs.map(docSnap => deleteDoc(docSnap.ref));
      await Promise.all(batchDeletes);
      setLogs([]);
    } catch (e) {
      alert('삭제 실패: 삭제 중 오류가 발생했습니다.');
    }
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
      {isPulling && (
        <div 
          className="position-fixed top-0 start-50 translate-middle-x d-flex align-items-center justify-content-center bg-primary text-white rounded-bottom p-2"
          style={{
            zIndex: 1000,
            transform: 'translateX(-50%)',
            minWidth: '120px',
            height: `${Math.min(pullProgress * 50, 50)}px`,
            opacity: pullProgress,
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
      <div className="container py-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h1 className="display-6 fw-bold text-primary mb-0">{name}님의 활동 로그</h1>
          {logs.length > 0 && (
            <button 
              className="btn btn-outline-danger d-flex align-items-center justify-content-center"
              onClick={clearLogs}
              style={{
                padding: '8px 16px',
                fontSize: '0.9rem',
                fontWeight: '500',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              삭제
            </button>
          )}
        </div>

        <div className="d-flex flex-column gap-3">
          {logs.map((item, index) => {
            const parts = item.detail.split(/(사용)/);
            return (
              <div key={item.id || index} className="card shadow-sm">
                <div className="card-body">
                  <h6 className="card-title text-primary">{item.action}</h6>
                  <p className="card-text">
                    {parts.map((part: string, idx: number) =>
                      part === '사용' ? (
                        <span key={idx} className="text-danger fw-bold">{part}</span>
                      ) : (
                        <span key={idx}>{part}</span>
                      )
                    )}
                  </p>
                  <small className="text-muted">
                    {format(item.timestamp, 'yyyy-MM-dd HH:mm:ss')}
                  </small>
                </div>
              </div>
            );
          })}
        </div>

        {logs.length === 0 && (
          <div className="text-center py-5">
            <p className="text-muted">📝 기록된 활동이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LogsPage() {
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
      <LogsPageContent />
    </Suspense>
  );
}

