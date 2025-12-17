'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { IoBoatOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';

export default function TripGuidePage() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
    };
    checkAuth();
  }, [router]);

  return (
    <div 
      className="min-vh-100 bg-light"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}
    >
      <PageHeader title="출조 안내" />
      <div className="container">
        <div className="d-flex flex-column align-items-center justify-content-center py-5" style={{ minHeight: '50vh' }}>
          <IoBoatOutline size={64} className="text-muted mb-3" />
          <p className="text-muted mb-0">출조 안내 페이지는 준비 중입니다.</p>
        </div>
      </div>
    </div>
  );
}

