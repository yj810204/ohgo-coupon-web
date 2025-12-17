'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { IoImageOutline, IoBoatOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';
import { useNavigation } from '@/hooks/useNavigation';

interface SubMenuItem {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<any>;
  color: string;
}

const subMenuItems: SubMenuItem[] = [
  { 
    id: 'photos', 
    label: '조황 사진', 
    path: '/community/photos', 
    icon: IoImageOutline, 
    color: '#9C27B0' 
  },
  { 
    id: 'trip-guide', 
    label: '출조 안내', 
    path: '/community/trip-guide', 
    icon: IoBoatOutline, 
    color: '#007AFF' 
  },
];

export default function CommunityPage() {
  const router = useRouter();
  const { navigate } = useNavigation();

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
      <PageHeader title="커뮤니티" />
      <div className="container">
        <div className="row g-4">
          {subMenuItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="col-6 col-md-4 col-lg-3">
                <button
                  onClick={() => navigate(item.path)}
                  className="btn btn-light w-100 h-100 p-4 d-flex flex-column align-items-center shadow-sm"
                  style={{ minHeight: '150px' }}
                >
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center mb-3"
                    style={{ 
                      width: '80px', 
                      height: '80px',
                      backgroundColor: `${item.color}20` 
                    }}
                  >
                    <Icon size={40} style={{ color: item.color }} />
                  </div>
                  <span className="fw-medium text-dark">{item.label}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
