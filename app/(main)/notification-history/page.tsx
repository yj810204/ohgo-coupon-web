'use client';

import { useEffect, useState } from 'react';
import { IoTrashOutline, IoNotificationsOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";

type NotificationLog = { title: string; body: string; time: string };

export default function NotificationHistoryPage() {
  const [history, setHistory] = useState<NotificationLog[]>([]);

  const loadHistory = () => {
    if (typeof window === 'undefined') return;
    try {
      const json = localStorage.getItem('notificationHistory');
      if (json) setHistory(JSON.parse(json));
    } catch { setHistory([]); }
  };

  useEffect(() => { loadHistory(); }, []);

  const clearHistory = () => {
    if (!confirm('모든 알림 기록을 삭제하시겠습니까?')) return;
    localStorage.removeItem('notificationHistory');
    setHistory([]);
  };

  return (
    <div className="min-vh-100 pb-4" style={{ backgroundColor: '#F7F8FA', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <PageHeader title="알림 내역" />
      <div className="container py-3" style={{ maxWidth: 480 }}>

        {history.length > 0 && (
          <div className="d-flex justify-content-end mb-3">
            <button
              type="button"
              onClick={clearHistory}
              className="btn d-flex align-items-center gap-2"
              style={{ backgroundColor: '#FFF0F0', color: '#FF3B30', borderRadius: 10, border: 'none', padding: '8px 14px', fontSize: 13, fontFamily: FONT }}
            >
              <IoTrashOutline size={15} />
              기록 삭제
            </button>
          </div>
        )}

        {history.length === 0 ? (
          <div className="py-5 text-center" style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <IoNotificationsOutline size={52} color="#EFEFEF" />
            <p className="mt-3 mb-1" style={{ color: '#6F767E', fontFamily: FONT, fontWeight: 600 }}>저장된 알림이 없습니다.</p>
            <p style={{ color: '#ABABAB', fontFamily: FONT, fontSize: 13 }}>로그아웃 시 알림 내역이 삭제됩니다.</p>
          </div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {history.map((item, index) => (
              <div
                key={index}
                className="p-3"
                style={{ backgroundColor: '#FFFFFF', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', borderLeft: '4px solid #1B6FF5' }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, marginBottom: 4 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 14, color: '#6F767E', fontFamily: FONT, lineHeight: 1.5, marginBottom: 8 }}>
                  {item.body}
                </div>
                <div style={{ fontSize: 12, color: '#ABABAB', fontFamily: FONT }}>
                  {new Date(item.time).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
