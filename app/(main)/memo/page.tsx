'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { addMemo, getMemos, softDeleteMemo, updateMemo } from '@/utils/memo-service';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PageHeader from '@/components/PageHeader';

function MemoPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uuid = searchParams.get('uuid') || '';
  const name = searchParams.get('name') || '';

  const [memoList, setMemoList] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [newMemo, setNewMemo] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

  const loadMemos = async () => {
    const memos = await getMemos(uuid);
    setMemoList(memos);
  };

  useEffect(() => {
    if (uuid) {
      loadMemos();
    }
  }, [uuid]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMemos();
    setRefreshing(false);
  };

  const { containerRef, isRefreshing: isPulling, pullProgress } = usePullToRefresh({
    onRefresh: onRefresh,
    enabled: true,
  });

  const handleAdd = async () => {
    if (!newMemo.trim()) return;
    await addMemo(uuid, newMemo.trim());
    setNewMemo('');
    await loadMemos();
  };

  const handleUpdate = async () => {
    if (!editingText.trim()) return;
    await updateMemo(uuid, editingId!, editingText.trim());
    setEditingId(null);
    setEditingText('');
    setModalVisible(false);
    await loadMemos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('해당 메모를 삭제할까요?')) return;
    await softDeleteMemo(uuid, id);
    await loadMemos();
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
      <PageHeader title="관리자 메모" />
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

        <div className="card shadow-sm mb-3">
          <div className="card-body">
            <textarea
              className="form-control mb-2"
              placeholder="새 메모 입력..."
              value={newMemo}
              onChange={(e) => setNewMemo(e.target.value)}
              rows={3}
            />
            <button 
              className="btn btn-primary w-100 d-flex align-items-center justify-content-center"
              onClick={handleAdd}
              style={{
                padding: '12px',
                fontSize: '1rem',
                fontWeight: '500',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              메모 추가
            </button>
          </div>
        </div>

        <div className="d-flex flex-column gap-3">
          {memoList.map(item => (
            <div key={item.id} className="card shadow-sm">
              <div className="card-body">
                <p className="card-text mb-2">{item.content}</p>
                <small className="text-muted">
                  {format(item.createdAt?.toDate?.() || new Date(), 'yyyy-MM-dd HH:mm:ss')}
                </small>
                <div className="d-flex gap-2 mt-2">
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingText(item.content);
                      setModalVisible(true);
                    }}
                  >
                    수정
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => handleDelete(item.id)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {memoList.length === 0 && (
          <div className="text-center py-5">
            <p className="text-muted">📝 등록된 메모가 없습니다.</p>
          </div>
        )}
      </div>

      {/* 수정 모달 */}
      {modalVisible && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">메모 수정</h5>
                <button type="button" className="btn-close" onClick={() => setModalVisible(false)}></button>
              </div>
              <div className="modal-body">
                <textarea
                  className="form-control"
                  rows={4}
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary d-flex align-items-center justify-content-center"
                  onClick={() => setModalVisible(false)}
                  style={{
                    padding: '10px 20px',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  취소
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary d-flex align-items-center justify-content-center"
                  onClick={handleUpdate}
                  style={{
                    padding: '10px 20px',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MemoPage() {
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
      <MemoPageContent />
    </Suspense>
  );
}

