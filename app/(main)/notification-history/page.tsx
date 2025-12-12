'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IoTrashOutline } from 'react-icons/io5';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PageHeader from '@/components/PageHeader';

type NotificationLog = {
  title: string;
  body: string;
  time: string;
};

export default function NotificationHistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<NotificationLog[]>([]);

  const loadHistory = () => {
    if (typeof window !== 'undefined') {
      const json = localStorage.getItem('notificationHistory');
      if (json) {
        try {
          setHistory(JSON.parse(json));
        } catch (e) {
          console.error('알림 내역 파싱 오류:', e);
          setHistory([]);
        }
      }
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const onRefresh = () => {
    loadHistory();
  };

  const { containerRef, isRefreshing: isPulling, pullProgress } = usePullToRefresh({
    onRefresh: onRefresh,
    enabled: true,
  });

  const clearHistory = async () => {
    if (!confirm('모든 알림 기록을 삭제하시겠습니까?')) return;
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem('notificationHistory');
      setHistory([]);
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
      <PageHeader title="알림 내역" />
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
      <div className="container pb-4" style={{ paddingTop: '80px' }}>
        {history.length > 0 && (
          <div className="d-flex justify-content-end mb-3">
            <button 
              className="btn btn-outline-danger d-flex align-items-center justify-content-center gap-2"
              onClick={clearHistory}
              style={{
                padding: '8px 16px',
                fontSize: '0.9rem',
                fontWeight: '500',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <IoTrashOutline size={18} />
              <span>기록 초기화</span>
            </button>
          </div>
        )}

        <div className="d-flex flex-column gap-3">
          {history.map((item, index) => (
            <div key={index} className="card shadow-sm border-0">
              <div className="card-body p-3">
                <h6 className="card-title mb-2 fw-semibold" style={{ fontSize: '1rem' }}>{item.title}</h6>
                <p className="card-text mb-2 text-muted" style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>{item.body}</p>
                <small className="text-muted" style={{ fontSize: '0.8rem' }}>
                  {new Date(item.time).toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
              </div>
            </div>
          ))}
        </div>

        {history.length === 0 && (
          <div className="text-center py-5">
            <p className="text-muted mb-0" style={{ fontSize: '0.95rem' }}>
              🔔 저장된 알림이 없습니다.
            </p>
            <p className="text-muted mt-2 mb-0" style={{ fontSize: '0.85rem' }}>
              (로그아웃 시 알림 내역은 자동으로 삭제됩니다.)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

