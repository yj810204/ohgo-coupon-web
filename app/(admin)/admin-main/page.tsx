'use client';

import { useEffect, useState } from 'react';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import { FiUsers, FiSend } from 'react-icons/fi';
import { IoPeopleOutline, IoCalendarOutline, IoNotificationsOutline, IoGameControllerOutline, IoBoatOutline, IoSettingsOutline } from 'react-icons/io5';
import { useNavigation } from '@/hooks/useNavigation';
import PageHeader from '@/components/PageHeader';

export default function AdminMainPage() {
  const { navigateReplace, navigate } = useNavigation();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        navigateReplace('/login');
        return;
      }

      const remoteUser = await getUserByUUID(user.uuid);
      if (!remoteUser?.isAdmin) {
        navigateReplace('/main');
        return;
      }

      setLoading(false);
    };
    checkAuth();
  }, [navigateReplace]);

  if (loading) {
    return (
      <div className="d-flex min-vh-100 align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">로딩 중...</p>
        </div>
      </div>
    );
  }

  const menuItems = [
    { icon: IoPeopleOutline, label: '회원 관리', path: '/admin', color: '#1E88E5' },
    { icon: IoCalendarOutline, label: '승선 명부', path: '/today-roster', color: '#FF5722' },
    { icon: IoNotificationsOutline, label: '전체 알림', path: '/admin-push', color: '#FF9500' },
    { icon: IoGameControllerOutline, label: '미니 게임', path: '/mini-games', color: '#FF3B30' },
    { icon: IoSettingsOutline, label: '게임 설정', path: '/admin-game-settings', color: '#4CAF50' },
    { icon: IoBoatOutline, label: '명부 작성', path: '/boarding-form', color: '#007AFF' },
  ];

  return (
    <div className="min-vh-100 bg-light">
      <PageHeader title="관리자" showBackButton={false} />
      <div className="container pb-4" style={{ paddingTop: '80px' }}>
        
        <div className="row g-4">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={index} className="col-6 col-md-4 col-lg-3">
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

