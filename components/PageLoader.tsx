'use client';

import { useLoading } from '@/contexts/LoadingContext';

export default function PageLoader() {
  const { isLoading } = useLoading();

  if (!isLoading) return null;

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        zIndex: 9999,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div className="text-center">
        <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
          <span className="visually-hidden">로딩 중...</span>
        </div>
      </div>
    </div>
  );
}

