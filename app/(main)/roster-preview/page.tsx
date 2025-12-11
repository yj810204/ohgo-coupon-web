'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { IoCloseOutline } from 'react-icons/io5';

function RosterPreviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const imageUri = searchParams.get('imageUri');
  const date = searchParams.get('date');
  const tripNumber = searchParams.get('tripNumber');

  return (
    <div className="min-vh-100 bg-dark d-flex align-items-center justify-content-center position-relative">
      <button
        className="btn btn-light position-absolute top-0 end-0 m-3"
        onClick={() => router.back()}
        style={{ zIndex: 10 }}
      >
        <IoCloseOutline size={24} />
      </button>
      
      {imageUri ? (
        <img
          src={imageUri}
          alt={`${date} ${tripNumber}항차 명부`}
          className="img-fluid"
          style={{ maxHeight: '100vh', maxWidth: '100vw' }}
        />
      ) : (
        <div className="text-center text-white">
          <p>이미지를 불러올 수 없습니다.</p>
          <button className="btn btn-light" onClick={() => router.back()}>
            돌아가기
          </button>
        </div>
      )}
    </div>
  );
}

export default function RosterPreviewPage() {
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
      <RosterPreviewContent />
    </Suspense>
  );
}

