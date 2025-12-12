'use client';

import { useEffect, useCallback } from 'react';
import { getUser } from '@/lib/storage';
import { FiClipboard, FiGift } from 'react-icons/fi';
import { IoGameControllerOutline, IoBoatOutline, IoPersonOutline } from 'react-icons/io5';
import { useNavigation } from '@/hooks/useNavigation';
import PageHeader from '@/components/PageHeader';

export default function MainPage() {
  const { navigate, navigateReplace } = useNavigation();

  const handleRefresh = useCallback(async () => {
    // 메인 페이지는 단순히 인증 확인만
    const user = await getUser();
    if (!user?.uuid) {
      navigateReplace('/login');
    }
  }, [navigateReplace]);

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  const menuItems = [
    { icon: FiClipboard, label: '스탬프', path: '/stamp', color: '#FF9500' },
    { icon: FiGift, label: '쿠폰', path: '/coupons', color: '#FF2D55' },
    { icon: IoGameControllerOutline, label: '미니 게임', path: '/mini-games', color: '#FF3B30' },
    { icon: IoBoatOutline, label: '명부 작성', path: '/boarding-form', color: '#007AFF' },
    { icon: IoPersonOutline, label: '마이페이지', path: '/my-page', color: '#9C27B0' },
  ];

  return (
    <div 
      className="min-vh-100 bg-light"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}
    >
      <PageHeader title="오고피씽" showBackButton={false} />
      <div className="container pb-4" style={{ paddingTop: '80px' }}>

        <div className="row g-4 mb-5">
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

