'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { collection, getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import SubPageFrame from '@/components/SubPageFrame';
import SubPageActionBar from '@/components/SubPageActionBar';
import EmptyState from '@/components/EmptyState';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { IoListOutline } from 'react-icons/io5';
import { OHGO_CARD, OHGO_FONT, OhgoPageLoading } from '@/lib/page-styles';

function LogsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uuid = searchParams.get('uuid') || '';
  const name = searchParams.get('name') || '';

  const [logs, setLogs] = useState<any[]>([]);

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

  useNativePullToRefresh(loadLogs);

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
    <SubPageFrame title="로그 보기" onRefresh={loadLogs}>
        {logs.length > 0 && (
          <SubPageActionBar
            meta={`총 ${logs.length}건`}
            label="전체 삭제"
            onClick={clearLogs}
            variant="danger"
          />
        )}

        <div className="d-flex flex-column gap-3">
          {logs.map((item, index) => {
            const parts = item.detail.split(/(사용)/);
            return (
              <div key={item.id || index} className="p-3" style={OHGO_CARD}>
                <h6 style={{ fontSize: 14, fontWeight: 700, color: '#1B6FF5', fontFamily: OHGO_FONT, marginBottom: 8 }}>
                  {item.action}
                </h6>
                <p style={{ fontSize: 14, color: '#1A1D1F', fontFamily: OHGO_FONT, marginBottom: 8 }}>
                  {parts.map((part: string, idx: number) =>
                    part === '사용' ? (
                      <span key={idx} style={{ color: '#FF3B30', fontWeight: 700 }}>{part}</span>
                    ) : (
                      <span key={idx}>{part}</span>
                    )
                  )}
                </p>
                <small style={{ fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT }}>
                  {format(item.timestamp, 'yyyy-MM-dd HH:mm:ss')}
                </small>
              </div>
            );
          })}
        </div>

        {logs.length === 0 && (
          <EmptyState icon={IoListOutline} message="기록된 활동이 없습니다." style={OHGO_CARD} />
        )}
    </SubPageFrame>
  );
}

export default function LogsPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <LogsPageContent />
    </Suspense>
  );
}

