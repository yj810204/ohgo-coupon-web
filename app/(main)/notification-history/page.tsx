'use client';

import { useEffect, useState } from 'react';
import { IoTrashOutline, IoNotificationsOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import SubPageActionBar from '@/components/SubPageActionBar';
import EmptyState from '@/components/EmptyState';

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
    <SubPageFrame title="알림 내역">
        {history.length > 0 && (
          <SubPageActionBar
            meta={`총 ${history.length}건`}
            label="기록 삭제"
            icon={IoTrashOutline}
            onClick={clearHistory}
            variant="danger"
          />
        )}

        {history.length === 0 ? (
          <EmptyState
            icon={IoNotificationsOutline}
            message="저장된 알림이 없습니다."
            subtitle="로그아웃 시 알림 내역이 삭제됩니다."
            style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
          />
        ) : (
          <div className="d-flex flex-column gap-2">
            {history.map((item, index) => (
              <div
                key={index}
                className="p-3"
                style={{ backgroundColor: '#FFFFFF', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
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
    </SubPageFrame>
  );
}
