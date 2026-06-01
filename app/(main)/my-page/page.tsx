'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { deleteField, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { clearUser, getUser } from '@/lib/storage';
import { isNativeApp, requestPushTokenFromNative, savePushTokenToUser } from '@/lib/native-bridge';
import { getCommunityPoints } from '@/utils/community-point-service';
import SubPageFrame from '@/components/SubPageFrame';
import {
  IoPersonOutline,
  IoNotificationsOutline,
  IoLogOutOutline,
  IoGameControllerOutline,
  IoChatbubblesOutline,
  IoBoatOutline,
  IoChevronForwardOutline,
} from 'react-icons/io5';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
const CARD: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: 'none',
};

export default function MyPage() {
  const router = useRouter();
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [userInfo, setUserInfo] = useState<{ name: string; dob: string; uuid: string } | null>(null);
  const [gamePoints, setGamePoints] = useState(0);
  const [communityPoints, setCommunityPoints] = useState(0);

  const loadUser = useCallback(async () => {
    const user = await getUser();
    if (!user?.uuid) { router.replace('/login'); return; }
    setUserInfo(user);
    const token = localStorage.getItem('expoPushToken');
    setIsPushEnabled(!!token);
    try {
      const userRef = doc(db, 'users', user.uuid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) setGamePoints(userSnap.data().totalPoint || 0);
      const cp = await getCommunityPoints(user.uuid);
      setCommunityPoints(cp);
    } catch (err) { console.error(err); }
  }, [router]);

  useEffect(() => { loadUser(); }, [loadUser]);

  const togglePush = async () => {
    if (!userInfo?.uuid) return;
    if (isPushEnabled) {
      localStorage.removeItem('expoPushToken');
      await updateDoc(doc(db, 'users', userInfo.uuid), { expoPushToken: deleteField() });
      setIsPushEnabled(false);
    } else {
      if (isNativeApp()) {
        const token = await requestPushTokenFromNative();
        if (token) { await savePushTokenToUser(userInfo.uuid, token); setIsPushEnabled(true); }
        else alert('푸시 알림 권한이 필요합니다.');
      } else {
        alert('웹 브라우저에서는 푸시 알림 설정이 제한적입니다. 앱에서 이용해 주세요.');
      }
    }
  };

  const handleLogout = async () => {
    try {
      const uuid = userInfo?.uuid;
      const token = localStorage.getItem('expoPushToken');
      if (uuid && token) {
        const ref = doc(db, 'users', uuid);
        const snap = await getDoc(ref);
        if (snap.exists()) await updateDoc(ref, { expoPushToken: deleteField() });
        localStorage.removeItem('expoPushToken');
      }
      await clearUser();
      localStorage.removeItem('notificationHistory');
      router.replace('/login');
    } catch (e) {
      console.error(e);
      alert('로그아웃 중 오류가 발생했습니다.');
    }
  };

  if (!userInfo) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <SubPageFrame title="마이페이지" onRefresh={loadUser}>
        {/* 프로필 카드 */}
        <div className="mb-4 p-4" style={CARD}>
          <div className="d-flex align-items-center gap-3">
            <div
              className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: 56, height: 56, background: 'linear-gradient(135deg,#1B6FF5,#5B8DEF)' }}
            >
              <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: FONT }}>
                {userInfo.name[0]}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>{userInfo.name}</div>
              <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginTop: 2 }}>
                {userInfo.dob?.length === 8
                  ? `${userInfo.dob.slice(0, 4)}.${userInfo.dob.slice(4, 6)}.${userInfo.dob.slice(6)}`
                  : userInfo.dob}
              </div>
            </div>
          </div>
        </div>

        {/* 포인트 현황 */}
        <div className="mb-3 px-1">
          <span style={{ fontSize: 17, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>포인트 현황</span>
        </div>
        <div className="row g-3 mb-4">
          <div className="col-6">
            <div className="p-3 h-100" style={CARD}>
              <div className="d-flex align-items-center gap-2 mb-1">
                <IoGameControllerOutline size={18} color="#1B6FF5" />
                <span style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>게임 포인트</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                {gamePoints.toLocaleString()}P
              </div>
            </div>
          </div>
          <div className="col-6">
            <div className="p-3 h-100" style={CARD}>
              <div className="d-flex align-items-center gap-2 mb-1">
                <IoChatbubblesOutline size={18} color="#34C759" />
                <span style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>커뮤니티</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                {communityPoints.toLocaleString()}P
              </div>
            </div>
          </div>
        </div>

        {/* 알림 설정 */}
        <div className="mb-3 px-1">
          <span style={{ fontSize: 17, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>설정</span>
        </div>
        <div className="mb-4" style={CARD}>
          <div className="d-flex align-items-center gap-3 p-3">
            <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: 40, height: 40, backgroundColor: '#EBF1FE' }}>
              <IoNotificationsOutline size={20} color="#1B6FF5" />
            </div>
            <div className="flex-grow-1">
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1D1F', fontFamily: FONT }}>푸시 알림</div>
              <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>쿠폰 발급, 스탬프 회수 알림</div>
            </div>
            <div className="form-check form-switch mb-0">
              <input className="form-check-input" type="checkbox" checked={isPushEnabled} onChange={togglePush} style={{ cursor: 'pointer', width: 44, height: 24 }} />
            </div>
          </div>
          <div style={{ height: 1, backgroundColor: '#F7F8FA', marginInline: 16 }} />
          <div className="d-flex align-items-center gap-3 p-3">
            <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: 40, height: 40, backgroundColor: '#F0FAF4' }}>
              <IoPersonOutline size={20} color="#34C759" />
            </div>
            <div className="flex-grow-1">
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1D1F', fontFamily: FONT }}>내 정보</div>
              <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>UUID: {userInfo.uuid.slice(0, 16)}…</div>
            </div>
          </div>
        </div>

        {/* 기능 버튼 */}
        <div className="mb-4" style={CARD}>
          {[
            { icon: IoBoatOutline, color: '#007AFF', label: '승선명부 작성', path: '/boarding-form' },
            { icon: IoNotificationsOutline, color: '#FF9500', label: '알림 내역', path: '/notification-history' },
          ].map(({ icon: Icon, color, label, path }, idx, arr) => (
            <button
              key={path}
              type="button"
              onClick={() => router.push(path)}
              className="btn w-100 d-flex align-items-center gap-3 p-3"
              style={{
                borderBottom: idx < arr.length - 1 ? '1px solid #F7F8FA' : 'none',
                borderRadius: 0,
                background: 'none',
                textAlign: 'left',
              }}
            >
              <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 40, height: 40, backgroundColor: `${color}18` }}>
                <Icon size={20} color={color} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1A1D1F', fontFamily: FONT, flexGrow: 1 }}>{label}</span>
              <IoChevronForwardOutline size={18} color="#ABABAB" />
            </button>
          ))}
        </div>

        {/* 로그아웃 */}
        <button
          type="button"
          onClick={handleLogout}
          className="btn w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold"
          style={{
            backgroundColor: '#E53935',
            color: '#FFFFFF',
            borderRadius: 14,
            padding: '14px',
            border: 'none',
            fontFamily: FONT,
            fontSize: 15,
            boxShadow: '0 4px 12px rgba(229, 57, 53, 0.28)',
          }}
        >
          <IoLogOutOutline size={20} color="#FFFFFF" />
          로그아웃
        </button>
    </SubPageFrame>
  );
}
