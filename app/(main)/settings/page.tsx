'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { deleteField, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { clearUser, getUser } from '@/lib/storage';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PageHeader from '@/components/PageHeader';

export default function SettingsPage() {
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

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
      <PageHeader title="설정" />
      {isPulling && (
        <div 
          className="position-fixed top-0 start-50 translate-middle-x d-flex align-items-center justify-content-center bg-primary text-white rounded-bottom p-2"
          style={{
            zIndex: 1000,
            transform: 'translateX(-50%)',
            minWidth: '120px',
            height: `${Math.min(pullProgress * 50, 50)}px`,
            opacity: pullProgress,
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
        <h1 className="text-2xl font-bold text-blue-600 mb-6">설정</h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">알림 설정</h2>
            <button
              onClick={() => router.push('/notification-history')}
              className="text-blue-600 hover:text-blue-700"
            >
              내역
            </button>
          </div>

          <div className="flex justify-between items-center py-3 border-b">
            <span className="text-gray-700">푸시 알림 받기</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isPushEnabled}
                onChange={togglePush}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <p className="text-sm text-gray-500 mt-4">
            푸시 알림을 받으면 쿠폰 발급, 스탬프 회수 등의 알림을 받을 수 있습니다.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">회원 정보</h2>
          <div className="space-y-2">
            <p className="text-gray-700">
              <span className="font-semibold">이름:</span> {userInfo.name}
            </p>
            <p className="text-gray-700">
              <span className="font-semibold">생년월일:</span> {userInfo.dob}
            </p>
            <p className="text-gray-700">
              <span className="font-semibold">UUID:</span> {userInfo.uuid}
            </p>
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
            transition: 'all 0.2s ease'
          }}
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}

