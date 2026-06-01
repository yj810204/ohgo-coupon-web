'use client';

import { useState } from 'react';
import { sendPushToAllUsers } from '@/utils/send-push';
import SubPageFrame from '@/components/SubPageFrame';
import { OHGO_CARD, OHGO_FONT, OHGO_INPUT, OHGO_PRIMARY_BTN } from '@/lib/page-styles';

export default function AdminPushPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendPush = async () => {
    if (!title.trim() || !body.trim()) {
      alert('입력 오류: 제목과 내용을 모두 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      await sendPushToAllUsers({
        title,
        body,
        data: { screen: 'notice' },
      });
      alert('푸시 알림이 발송되었습니다.');
      setTitle('');
      setBody('');
    } catch (error) {
      alert('오류: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SubPageFrame title="전체 알림 발송">
      <p className="mb-4" style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT }}>
        등록된 푸시 토큰이 있는 모든 회원에게 알림을 발송합니다.
      </p>

      <div className="p-4" style={OHGO_CARD}>
        <div className="mb-3">
          <label htmlFor="title" style={{ fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: OHGO_FONT, marginBottom: 6, display: 'block' }}>
            푸시 제목
          </label>
          <input
            type="text"
            id="title"
            className="form-control"
            placeholder="제목 입력"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={OHGO_INPUT}
          />
        </div>

        <div className="mb-4">
          <label htmlFor="body" style={{ fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: OHGO_FONT, marginBottom: 6, display: 'block' }}>
            푸시 내용
          </label>
          <textarea
            id="body"
            className="form-control"
            placeholder="내용 입력"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={5}
            style={{ ...OHGO_INPUT, resize: 'none' }}
          />
        </div>

        <button
          type="button"
          className="btn w-100 fw-semibold"
          onClick={handleSendPush}
          disabled={loading}
          style={OHGO_PRIMARY_BTN}
        >
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" />
              발송 중...
            </>
          ) : (
            '전체 사용자에게 푸시 발송'
          )}
        </button>
      </div>
    </SubPageFrame>
  );
}
