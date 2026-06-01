'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { addMemo, getMemos, softDeleteMemo } from '@/utils/memo-service';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { IoDocumentTextOutline } from 'react-icons/io5';
import { OHGO_CARD, OHGO_FONT, OHGO_INPUT, OHGO_PRIMARY_BTN, OhgoPageLoading } from '@/lib/page-styles';

function MemoPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uuid = searchParams.get('uuid') || '';
  const name = searchParams.get('name') || '';

  const [memoList, setMemoList] = useState<any[]>([]);
  const [newMemo, setNewMemo] = useState('');

  const loadMemos = async () => {
    const memos = await getMemos(uuid);
    setMemoList(memos);
  };

  useEffect(() => {
    if (uuid) {
      loadMemos();
    }
  }, [uuid]);

  useNativePullToRefresh(loadMemos);

  const handleAdd = async () => {
    if (!newMemo.trim()) return;
    await addMemo(uuid, newMemo.trim());
    setNewMemo('');
    await loadMemos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('해당 메모를 삭제할까요?')) return;
    await softDeleteMemo(uuid, id);
    await loadMemos();
  };

  return (
    <SubPageFrame title="관리자 메모" onRefresh={loadMemos}>
        {name && (
          <p className="mb-3" style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT }}>
            {name} 회원 메모
          </p>
        )}

        <div className="p-3 mb-3" style={OHGO_CARD}>
          <textarea
            className="form-control mb-3"
            placeholder="새 메모 입력..."
            value={newMemo}
            onChange={e => setNewMemo(e.target.value)}
            rows={3}
            style={{ ...OHGO_INPUT, resize: 'none' }}
          />
          <button type="button" className="btn w-100 fw-semibold" onClick={handleAdd} style={OHGO_PRIMARY_BTN}>
            메모 추가
          </button>
        </div>

        <div className="d-flex flex-column gap-3">
          {memoList.map(item => (
            <div key={item.id} className="p-3" style={OHGO_CARD}>
              <p className="mb-2" style={{ fontSize: 15, color: '#1A1D1F', fontFamily: OHGO_FONT, lineHeight: 1.5 }}>
                {item.content}
              </p>
              <small style={{ fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT }}>
                {format(item.createdAt?.toDate?.() || new Date(), 'yyyy-MM-dd HH:mm:ss')}
              </small>
              <div className="d-flex gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-sm fw-semibold flex-grow-1"
                  style={{ backgroundColor: '#EBF1FE', color: '#1B6FF5', border: 'none', borderRadius: 10, fontFamily: OHGO_FONT }}
                  onClick={() =>
                    router.push(
                      `/memo/edit?uuid=${encodeURIComponent(uuid)}&memoId=${encodeURIComponent(item.id)}&name=${encodeURIComponent(name)}&content=${encodeURIComponent(item.content)}`
                    )
                  }
                >
                  수정
                </button>
                <button
                  type="button"
                  className="btn btn-sm fw-semibold flex-grow-1"
                  style={{ backgroundColor: '#FFF0F0', color: '#FF3B30', border: 'none', borderRadius: 10, fontFamily: OHGO_FONT }}
                  onClick={() => handleDelete(item.id)}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>

        {memoList.length === 0 && (
          <EmptyState icon={IoDocumentTextOutline} message="등록된 메모가 없습니다." style={OHGO_CARD} />
        )}

    </SubPageFrame>
  );
}

export default function MemoPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <MemoPageContent />
    </Suspense>
  );
}

