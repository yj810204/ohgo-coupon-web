'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { deleteField, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { clearUser, getUser } from '@/lib/storage';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PageHeader from '@/components/PageHeader';
import { IoPersonOutline, IoNotificationsOutline, IoLogOutOutline } from 'react-icons/io5';

export default function MyPage() {
  const router = useRouter();
  const [isPushEnabled, setIsPushEnabled] = useState(true);
  const [userInfo, setUserInfo] = useState<{ name: string, dob: string, uuid: string } | null>(null);

  const loadUser = useCallback(async () => {
    const user = await getUser();
    if (!user?.uuid) {
      router.replace('/login');
      return;
    }
    setUserInfo(user);
    
    // 웹에서는 푸시 토큰을 localStorage에서 확인
    const token = localStorage.getItem('expoPushToken');
    setIsPushEnabled(!!token);
  }, [router]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const { containerRef, isRefreshing: isPulling, pullProgress } = usePullToRefresh({
    onRefresh: loadUser,
    enabled: true,
  });

  const togglePush = async () => {
    if (!userInfo?.uuid) return;
    
    if (isPushEnabled) {
      localStorage.removeItem('expoPushToken');
      await updateDoc(doc(db, 'users', userInfo.uuid), {
        expoPushToken: deleteField(),
      });
      setIsPushEnabled(false);
    } else {
      // 웹에서는 Web Push API를 사용해야 하지만, 일단 기본 구조만
      alert('웹에서는 푸시 알림 설정이 제한적입니다.');
      // TODO: Web Push API 구현
    }
  };

  const handleLogout = async () => {
    try {
      const uuid = userInfo?.uuid;
      const token = localStorage.getItem('expoPushToken');
  
      if (uuid && token) {
        const userRef = doc(db, 'users', uuid);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          await updateDoc(userRef, {
            expoPushToken: deleteField(),
          });
        }
        localStorage.removeItem('expoPushToken');
      }
  
      await clearUser();
      localStorage.removeItem('notificationHistory');

      console.log('✅ 로그아웃 완료');
      router.replace('/login');
    } catch (e) {
      console.error('🚨 로그아웃 오류:', e);
      alert('로그아웃 중 오류가 발생했습니다.');
    }
  };

  if (!userInfo) {
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
    {
      icon: IoNotificationsOutline,
      label: '알림 설정',
      onClick: () => {},
      content: (
        <div className="d-flex justify-content-between align-items-center w-100">
          <div>
            <div className="fw-semibold mb-1">푸시 알림 받기</div>
            <small className="text-muted">쿠폰 발급, 스탬프 회수 등의 알림을 받을 수 있습니다.</small>
          </div>
          <label className="form-check form-switch mb-0 ms-3">
            <input
              className="form-check-input"
              type="checkbox"
              checked={isPushEnabled}
              onChange={togglePush}
              style={{ cursor: 'pointer' }}
            />
          </label>
        </div>
      ),
    },
    {
      icon: IoPersonOutline,
      label: '회원 정보',
      onClick: () => {},
      content: (
        <div className="w-100">
          <div className="mb-2">
            <span className="fw-semibold">이름:</span> {userInfo.name}
          </div>
          <div className="mb-2">
            <span className="fw-semibold">생년월일:</span> {userInfo.dob}
          </div>
          <div>
            <span className="fw-semibold">UUID:</span> <small className="text-muted">{userInfo.uuid}</small>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div 
      ref={containerRef}
      className="min-h-screen bg-gray-50"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}
    >
      <PageHeader title="마이페이지" />
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
      <div className="container py-4">
        <div className="card shadow-sm mb-3">
          <div className="card-body">
            {menuItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={index} className={index > 0 ? 'border-top pt-3 mt-3' : ''}>
                  <div className="d-flex align-items-start">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center me-3"
                      style={{ 
                        width: '40px', 
                        height: '40px',
                        backgroundColor: '#f0f0f0',
                        flexShrink: 0
                      }}
                    >
                      <Icon size={20} className="text-primary" />
                    </div>
                    <div className="flex-grow-1">
                      <h6 className="fw-semibold mb-2">{item.label}</h6>
                      {item.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card shadow-sm mb-3">
          <div className="card-body">
            <button
              onClick={() => router.push('/notification-history')}
              className="btn btn-outline-primary w-100 d-flex align-items-center justify-content-center"
            >
              <IoNotificationsOutline size={20} className="me-2" />
              알림 내역
            </button>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="btn btn-danger w-100 d-flex align-items-center justify-content-center"
          style={{
            padding: '12px',
            fontSize: '1rem',
            fontWeight: '500',
            borderRadius: '8px',
          }}
        >
          <IoLogOutOutline size={20} className="me-2" />
          로그아웃
        </button>
      </div>
    </div>
  );
}

