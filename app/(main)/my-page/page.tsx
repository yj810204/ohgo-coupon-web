'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { getUser } from '@/lib/storage';
import { resolveAppUser, signOutApp } from '@/lib/auth-session';
import { isNativeApp, requestPushTokenFromNative, savePushTokenToUser } from '@/lib/native-bridge';
import { useNavigation } from '@/hooks/useNavigation';
import { getMemberProfile, saveExpoPushToken, uploadAvatar } from '@/utils/member-profile-service';
import { getUserPointBalance } from '@/utils/point-mall-service';
import SubPageFrame from '@/components/SubPageFrame';
import {
  IoPersonOutline,
  IoNotificationsOutline,
  IoLogOutOutline,
  IoGameControllerOutline,
  IoChatbubblesOutline,
  IoBoatOutline,
  IoCalendarOutline,
  IoChevronForwardOutline,
  IoCameraOutline,
  IoSettingsOutline,
  IoCreateOutline,
  IoStorefrontOutline,
} from 'react-icons/io5';
import { getReservationSettings } from '@/utils/reservation-service';
import { OHGO_LIST, OHGO_LIST_DIVIDER } from '@/lib/page-styles';
import { useImageEditQueue } from '@/hooks/useImageEditQueue';
import { requestMemberPurge } from '@/utils/member-purge-client';
import {
  MEMBER_WITHDRAW_CONFIRM_TITLE,
  selfWithdrawConfirmMessage,
  selfWithdrawSecondConfirmMessage,
} from '@/lib/member-purge.shared';
import { ohgoConfirm } from '@/lib/ohgo-dialog';

const ImageEditor = dynamic(() => import('@/components/ImageEditor'), { ssr: false });

const FONT = "var(--font-ohgo), sans-serif";
const CARD: CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: 'none',
};

export default function MyPage() {
  const { navigate, navigateReplace } = useNavigation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [userInfo, setUserInfo] = useState<{ name: string; dob: string; uuid: string } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [gamePoints, setGamePoints] = useState(0);
  const [communityPoints, setCommunityPoints] = useState(0);
  const [reservationEnabled, setReservationEnabled] = useState(false);
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const [adminMenuLabel, setAdminMenuLabel] = useState('관리자 화면');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isAdminAccount, setIsAdminAccount] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const loadUser = useCallback(async () => {
    const user = await getUser();
    if (!user?.uuid) { navigateReplace('/login'); return; }
    setUserInfo(user);
    const token = localStorage.getItem('expoPushToken');
    setIsPushEnabled(!!token);
    try {
      const appUser = await resolveAppUser();
      const isStaff = !!appUser && (appUser.isAdmin || !!appUser.isCaptain);
      setCanAccessAdmin(isStaff);
      setIsAdminAccount(Boolean(appUser?.isAdmin));
      setAdminMenuLabel(appUser?.isAdmin ? '관리자 화면' : '선장 화면');

      const profile = await getMemberProfile(user.uuid);
      if (profile) {
        setAvatarUrl(profile.profileImageUrl ?? null);
      }
      const balance = await getUserPointBalance(user.uuid);
      setGamePoints(balance.gamePoints);
      setCommunityPoints(balance.communityPoints);
      const resSettings = await getReservationSettings();
      setReservationEnabled(resSettings.enabled);
    } catch (err) { console.error(err); }
  }, [navigateReplace]);

  const avatarEditQueue = useImageEditQueue(async (edited) => {
    const file = edited[0];
    if (!file || !userInfo?.uuid) return;
    setAvatarUploading(true);
    try {
      const url = await uploadAvatar(userInfo.uuid, file);
      setAvatarUrl(url);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : '프로필 이미지 업로드에 실패했습니다.');
    } finally {
      setAvatarUploading(false);
    }
  });

  const handleAvatarPick = () => {
    if (avatarUploading || avatarEditQueue.isEditing) return;
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userInfo?.uuid) return;
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 선택할 수 있습니다.');
      return;
    }
    avatarEditQueue.startWithFiles([file]);
  };

  useEffect(() => { loadUser(); }, [loadUser]);

  const togglePush = async () => {
    if (!userInfo?.uuid || pushBusy) return;

    if (isPushEnabled) {
      const prevToken = localStorage.getItem('expoPushToken');
      localStorage.removeItem('expoPushToken');
      setIsPushEnabled(false);
      setPushBusy(true);
      try {
        await saveExpoPushToken(userInfo.uuid, null);
      } catch (err) {
        console.error(err);
        if (prevToken) localStorage.setItem('expoPushToken', prevToken);
        setIsPushEnabled(true);
        alert('푸시 알림을 끄지 못했습니다. 다시 시도해 주세요.');
      } finally {
        setPushBusy(false);
      }
      return;
    }

    if (!isNativeApp()) {
      alert('웹 브라우저에서는 푸시 알림 설정이 제한적입니다. 앱에서 이용해 주세요.');
      return;
    }

    setIsPushEnabled(true);
    setPushBusy(true);
    try {
      const token = await requestPushTokenFromNative();
      if (!token) {
        setIsPushEnabled(false);
        alert('푸시 알림 권한이 필요합니다.');
        return;
      }
      await savePushTokenToUser(userInfo.uuid, token);
    } catch (err) {
      console.error(err);
      localStorage.removeItem('expoPushToken');
      setIsPushEnabled(false);
      alert('푸시 알림을 켜지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOutApp({ uuid: userInfo?.uuid });
      navigateReplace('/login');
    } catch (e) {
      console.error(e);
      alert('로그아웃 중 오류가 발생했습니다.');
    }
  };

  const handleWithdraw = async () => {
    if (!userInfo?.uuid) return;
    if (isAdminAccount) {
      alert('관리자 계정은 탈퇴할 수 없습니다.');
      return;
    }
    if (!(await ohgoConfirm(selfWithdrawConfirmMessage(), MEMBER_WITHDRAW_CONFIRM_TITLE))) return;
    if (!(await ohgoConfirm(selfWithdrawSecondConfirmMessage(), MEMBER_WITHDRAW_CONFIRM_TITLE))) return;

    setIsWithdrawing(true);
    try {
      await requestMemberPurge({
        userId: userInfo.uuid,
        mode: 'self',
        confirmName: userInfo.name,
      });
      await signOutApp({ uuid: userInfo.uuid });
      alert('회원탈퇴가 완료되었습니다.');
      navigateReplace('/login');
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '탈퇴 처리 중 오류가 발생했습니다.');
    } finally {
      setIsWithdrawing(false);
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
            <button
              type="button"
              onClick={handleAvatarPick}
              disabled={avatarUploading}
              aria-label="프로필 이미지 변경"
              className="position-relative border-0 p-0 flex-shrink-0"
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'transparent',
                cursor: avatarUploading ? 'wait' : 'pointer',
                overflow: 'visible',
              }}
            >
              <span
                className="d-flex align-items-center justify-content-center"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: avatarUrl ? '#EBF1FE' : 'linear-gradient(135deg,#1B6FF5,#5B8DEF)',
                  boxShadow: '0 2px 8px rgba(27,111,245,0.25)',
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: FONT }}>
                    {userInfo.name[0]}
                  </span>
                )}
              </span>
              <span
                className="position-absolute d-flex align-items-center justify-content-center"
                style={{
                  right: -2,
                  bottom: -2,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  backgroundColor: '#1B6FF5',
                  border: '2px solid #FFFFFF',
                  boxShadow: '0 2px 8px rgba(27,111,245,0.45)',
                  zIndex: 1,
                }}
              >
                {avatarUploading ? (
                  <span className="spinner-border spinner-border-sm text-white" style={{ width: 12, height: 12, borderWidth: 2 }} />
                ) : (
                  <IoCameraOutline size={15} color="#fff" />
                )}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              hidden
            />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>{userInfo.name}</div>
              <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginTop: 2 }}>
                {userInfo.dob?.length === 8
                  ? `${userInfo.dob.slice(0, 4)}.${userInfo.dob.slice(4, 6)}.${userInfo.dob.slice(6)}`
                  : userInfo.dob}
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', fontFamily: FONT, marginTop: 4 }}>
                사진을 눌러 프로필 이미지를 변경할 수 있습니다
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
            <button
              type="button"
              onClick={() => navigate('/game-point-history')}
              className="p-3 h-100 w-100 text-start border-0"
              style={{ ...CARD, cursor: 'pointer' }}
            >
              <div className="d-flex align-items-center justify-content-between gap-1 mb-1">
                <span className="d-inline-flex align-items-center gap-2 min-w-0">
                  <IoGameControllerOutline size={18} color="#1B6FF5" />
                  <span style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>게임</span>
                </span>
                <IoChevronForwardOutline size={16} color="#ABABAB" aria-hidden />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                {gamePoints.toLocaleString()}P
              </div>
            </button>
          </div>
          <div className="col-6">
            <button
              type="button"
              onClick={() => navigate('/community-point-history')}
              className="p-3 h-100 w-100 text-start border-0"
              style={{ ...CARD, cursor: 'pointer' }}
            >
              <div className="d-flex align-items-center justify-content-between gap-1 mb-1">
                <span className="d-inline-flex align-items-center gap-2 min-w-0">
                  <IoChatbubblesOutline size={18} color="#34C759" />
                  <span style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>커뮤니티</span>
                </span>
                <IoChevronForwardOutline size={16} color="#ABABAB" aria-hidden />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                {communityPoints.toLocaleString()}P
              </div>
            </button>
          </div>
        </div>

        {/* 알림 설정 */}
        <div className="mb-3 px-1">
          <span style={{ fontSize: 17, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>설정</span>
        </div>
        <div className="mb-4" style={CARD}>
          <div className="ohgo-menu-list-row">
            <div className="ohgo-menu-list-row__icon" style={{ backgroundColor: '#EBF1FE' }}>
              <IoNotificationsOutline size={OHGO_LIST.iconGlyph} color="#1B6FF5" />
            </div>
            <div className="flex-grow-1 min-w-0">
              <div className="ohgo-menu-list-row__title">푸시 알림</div>
              <div className="ohgo-menu-list-row__desc">쿠폰 발급, 스탬프 회수 알림</div>
            </div>
            <div className="form-check form-switch mb-0">
              <input
                className="form-check-input"
                type="checkbox"
                checked={isPushEnabled}
                disabled={pushBusy}
                onChange={() => void togglePush()}
                style={{ cursor: pushBusy ? 'wait' : 'pointer', width: 44, height: 24 }}
              />
            </div>
          </div>
          <div style={OHGO_LIST_DIVIDER} />
          <div className="ohgo-menu-list-row">
            <div className="ohgo-menu-list-row__icon" style={{ backgroundColor: '#F0FAF4' }}>
              <IoPersonOutline size={OHGO_LIST.iconGlyph} color="#34C759" />
            </div>
            <div className="flex-grow-1 min-w-0">
              <div className="ohgo-menu-list-row__title">내 정보</div>
              <div className="ohgo-menu-list-row__desc" style={{ wordBreak: 'break-all' }}>
                UUID: {userInfo.uuid}
              </div>
            </div>
          </div>
        </div>

        {/* 기능 버튼 */}
        <div className="mb-4" style={CARD}>
          {[
            ...(canAccessAdmin
              ? [{ icon: IoSettingsOutline, color: '#1B6FF5', label: adminMenuLabel, path: '/admin-main' }]
              : []),
            { icon: IoBoatOutline, color: '#007AFF', label: '승선명부 작성', path: '/boarding-form' },
            ...(reservationEnabled
              ? [{ icon: IoCalendarOutline, color: '#237FFF', label: '나의 예약', path: '/my-reservations' }]
              : []),
            { icon: IoCreateOutline, color: '#00BCD4', label: '내가쓴글', path: '/community/my' },
            { icon: IoStorefrontOutline, color: '#9C27B0', label: '판매관리', path: '/market/my' },
            { icon: IoNotificationsOutline, color: '#FF9500', label: '알림 내역', path: '/notification-history' },
          ].map(({ icon: Icon, color, label, path }, idx) => (
            <div key={path}>
              {idx > 0 && (
                <div style={OHGO_LIST_DIVIDER} />
              )}
              <button
                type="button"
                onClick={() => navigate(path)}
                className="btn ohgo-menu-list-row"
              >
                <div className="ohgo-menu-list-row__icon" style={{ backgroundColor: `${color}18` }}>
                  <Icon size={OHGO_LIST.iconGlyph} color={color} />
                </div>
                <span className="ohgo-menu-list-row__title flex-grow-1">{label}</span>
                <IoChevronForwardOutline size={OHGO_LIST.chevronSize} color={OHGO_LIST.chevronColor} />
              </button>
            </div>
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

        {!isAdminAccount ? (
          <button
            type="button"
            onClick={() => void handleWithdraw()}
            disabled={isWithdrawing}
            className="btn w-100 border-0 bg-transparent"
            style={{
              marginTop: 8,
              padding: '10px',
              color: '#9A9A9A',
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            {isWithdrawing ? '탈퇴 처리 중...' : '회원탈퇴'}
          </button>
        ) : null}

      {avatarEditQueue.current ? (
        <ImageEditor
          imageUrl={avatarEditQueue.current.previewUrl}
          title="프로필 사진 편집"
          defaultAspect="1:1"
          onSave={(file) => avatarEditQueue.acceptCurrent(file)}
          onCancel={avatarEditQueue.skipCurrent}
        />
      ) : null}
    </SubPageFrame>
  );
}
