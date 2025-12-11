'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendPushToAllUsers } from '@/utils/send-push';

export default function AdminPushPage() {
  const router = useRouter();
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
    <div className="min-vh-100 bg-light">
      <div className="container py-5">
        <h1 className="display-5 fw-bold text-primary mb-4">전체 알림 발송</h1>
        
        <div className="card shadow-sm">
          <div className="card-body p-4">
            <div className="mb-3">
              <label htmlFor="title" className="form-label fw-semibold">푸시 제목</label>
              <input
                type="text"
                id="title"
                className="form-control"
                placeholder="제목 입력"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="body" className="form-label fw-semibold">푸시 내용</label>
              <textarea
                id="body"
                className="form-control"
                placeholder="내용 입력"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
              />
            </div>

            <button
              className="btn btn-primary w-100 d-flex align-items-center justify-content-center"
              onClick={handleSendPush}
              disabled={loading}
              style={{
                padding: '12px',
                fontSize: '1rem',
                fontWeight: '500',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                  발송 중...
                </>
              ) : (
                '전체 사용자에게 푸시 발송'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

