'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { updateMemo } from '@/utils/memo-service';
import { IoCheckmarkOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import {
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_DISMISS_BTN,
  OHGO_DISMISS_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OhgoPageLoading,
} from '@/lib/page-styles';

function MemoEditContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uuid = searchParams.get('uuid') || '';
  const memoId = searchParams.get('memoId') || '';
  const name = searchParams.get('name') || '';
  const initial = searchParams.get('content') || '';
  const [editingText, setEditingText] = useState(initial);
  const [saving, setSaving] = useState(false);

  const handleUpdate = async () => {
    if (!uuid || !memoId) {
      alert('잘못된 접근입니다.');
      router.back();
      return;
    }
    if (!editingText.trim()) {
      alert('메모 내용을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      await updateMemo(uuid, memoId, editingText.trim());
      router.replace(`/memo?uuid=${encodeURIComponent(uuid)}&name=${encodeURIComponent(name)}`);
    } catch (e) {
      console.error(e);
      alert('메모 수정 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (!uuid || !memoId) {
    return <OhgoPageLoading />;
  }

  return (
    <SubPageFrame title="메모 수정">
      {name && (
        <p className="mb-3" style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT }}>
          {name} 회원
        </p>
      )}
      <textarea
        className="form-control mb-4"
        rows={6}
        value={editingText}
        onChange={e => setEditingText(e.target.value)}
        style={{ ...OHGO_INPUT, resize: 'none' }}
      />
      <div className="d-flex gap-2">
        <button
          type="button"
          className={`btn flex-grow-1 fw-semibold ${OHGO_DISMISS_BTN_CLASS}`}
          onClick={() => router.back()}
          style={OHGO_DISMISS_BTN}
        >
          취소
        </button>
        <button
          type="button"
          className={`btn flex-grow-1 fw-semibold d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
          onClick={() => void handleUpdate()}
          disabled={saving}
          style={OHGO_CONFIRM_BTN}
        >
          {saving ? <span className="spinner-border spinner-border-sm" /> : <IoCheckmarkOutline size={18} />}
          저장
        </button>
      </div>
    </SubPageFrame>
  );
}

export default function MemoEditPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <MemoEditContent />
    </Suspense>
  );
}
