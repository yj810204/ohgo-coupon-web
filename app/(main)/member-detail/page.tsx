'use client';

import { useEffect, useState, Suspense, type CSSProperties, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { getStamps, getCouponCount, addStampBatch, removeStampBatch, deleteUser } from '@/utils/stamp-service';
import {
  getMemberProfile,
  resetTotalPoint,
  updateBaitCoupons as saveBaitCouponsCount,
} from '@/utils/member-profile-service';
import { getBoardingForm } from '@/utils/boarding-service';
import { sendPushToUser } from '@/utils/send-push';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal from '@/components/OhgoModal';
import MemberListAvatar from '@/components/MemberListAvatar';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OHGO_PRIMARY_BTN,
  OhgoPageLoading,
} from '@/lib/page-styles';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import type { IconType } from 'react-icons';
import { 
  IoPersonCircleOutline, 
  IoCalendarOutline, 
  IoTimeOutline,
  IoPricetagOutline,
  IoDocumentTextOutline,
  IoListOutline,
  IoTrashOutline,
  IoChevronForwardOutline,
  IoLinkOutline,
} from 'react-icons/io5';

const DETAIL_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  lineHeight: 1.2,
};

const DETAIL_VALUE: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#1A1D1F',
  fontFamily: OHGO_FONT,
  lineHeight: 1.35,
};

const DETAIL_BANNER_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  opacity: 0.9,
  fontFamily: OHGO_FONT,
  lineHeight: 1.2,
  marginBottom: 2,
};

const DETAIL_BANNER_VALUE: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  fontFamily: OHGO_FONT,
  lineHeight: 1.3,
};

const DETAIL_MENU_LABEL: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#1A1D1F',
  fontFamily: OHGO_FONT,
};

function DetailInfoRow({
  icon: Icon,
  label,
  value,
  valueStyle,
  isLast,
}: {
  icon: IconType;
  label: string;
  value: ReactNode;
  valueStyle?: CSSProperties;
  isLast?: boolean;
}) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderBottom: isLast ? undefined : '1px solid #F7F8FA',
      }}
    >
      <div className="d-flex align-items-center gap-2" style={{ marginBottom: 4 }}>
        <Icon size={16} color="#9CA3AF" aria-hidden />
        <span style={DETAIL_LABEL}>{label}</span>
      </div>
      <div style={{ ...DETAIL_VALUE, ...valueStyle }}>{value}</div>
    </div>
  );
}

function DetailMenuRow({
  icon: Icon,
  iconColor,
  label,
  onClick,
  isLast,
}: {
  icon: IconType;
  iconColor: string;
  label: string;
  onClick: () => void;
  isLast?: boolean;
}) {
  return (
    <button
      type="button"
      className="btn w-100 d-flex align-items-center justify-content-between"
      onClick={onClick}
      style={{
        padding: '12px 14px',
        borderRadius: 0,
        border: 'none',
        borderBottom: isLast ? undefined : '1px solid #F7F8FA',
        background: 'none',
        textAlign: 'left',
      }}
    >
      <div className="d-flex align-items-center gap-2">
        <Icon size={18} color={iconColor} aria-hidden />
        <span style={DETAIL_MENU_LABEL}>{label}</span>
      </div>
      <IoChevronForwardOutline size={18} color="#C4C8CC" aria-hidden />
    </button>
  );
}

const ADMIN_QTY_RADIUS = 18;

const ADMIN_QTY_SIDE_BTN: CSSProperties = {
  flex: '0 0 48px',
  width: 48,
  height: 48,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: ADMIN_QTY_RADIUS,
  border: 'none',
  fontSize: 22,
  fontWeight: 600,
  lineHeight: 1,
  fontFamily: OHGO_FONT,
};

function AdminQtyStepperRow({
  currentCount,
  onMinus,
  onPlus,
  disabled,
  minusDisabled,
  plusDisabled,
  minusAriaLabel,
  plusAriaLabel,
  minusStyle,
  plusStyle,
  accentColor = '#1A1D1F',
  hideMinus,
}: {
  currentCount: number;
  onMinus: () => void;
  onPlus: () => void;
  disabled?: boolean;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  minusAriaLabel: string;
  plusAriaLabel: string;
  minusStyle?: CSSProperties;
  plusStyle?: CSSProperties;
  accentColor?: string;
  hideMinus?: boolean;
}) {
  return (
    <div className="d-flex align-items-center gap-2">
      {!hideMinus && (
        <button
          type="button"
          className="btn"
          style={{
            ...ADMIN_QTY_SIDE_BTN,
            backgroundColor: '#F2F3F5',
            color: '#6F767E',
            ...minusStyle,
          }}
          onClick={onMinus}
          disabled={disabled || minusDisabled}
          aria-label={minusAriaLabel}
        >
          −
        </button>
      )}
      <input
        type="text"
        readOnly
        className="form-control text-center"
        style={{
          ...OHGO_INPUT,
          flex: 1,
          minWidth: 0,
          padding: '12px 10px',
          fontWeight: 600,
          fontSize: 15,
          borderRadius: ADMIN_QTY_RADIUS,
          backgroundColor: '#F7F8FA',
          color: accentColor,
          cursor: 'default',
        }}
        value={`${currentCount}개`}
        disabled={disabled}
        aria-label={`현재 수량 ${currentCount}개`}
        aria-readonly
      />
      <button
        type="button"
        className="btn text-white"
        style={{
          ...ADMIN_QTY_SIDE_BTN,
          backgroundColor: '#1B6FF5',
          boxShadow: '0 4px 12px rgba(27,111,245,0.25)',
          ...plusStyle,
        }}
        onClick={onPlus}
        disabled={disabled || plusDisabled}
        aria-label={plusAriaLabel}
      >
        +
      </button>
    </div>
  );
}

function MemberDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uuid = searchParams.get('uuid') || '';
  const name = searchParams.get('name') || '';
  const dob = searchParams.get('dob') || '';

  const [targetUserIsAdmin, setTargetUserIsAdmin] = useState(false);
  const [stampCount, setStampCount] = useState(0);
  const [couponCount, setCouponCount] = useState(0);
  const [points, setPoints] = useState(0);
  const [baitCoupons, setBaitCoupons] = useState(0);
  const [isLoadingStamp, setIsLoadingStamp] = useState(false);
  const [isLoadingBait, setIsLoadingBait] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResettingPoints, setIsResettingPoints] = useState(false);
  const [baitModalVisible, setBaitModalVisible] = useState(false);
  const [createdAt, setCreatedAt] = useState('');
  const [lastStampDate, setLastStampDate] = useState('');
  const [rosterData, setRosterData] = useState<{
    name: string;
    birth: string;
    gender: string;
    phone: string;
    emergency: string;
    address: string;
  } | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState<string | undefined>();
  const [guestSearchPhone, setGuestSearchPhone] = useState('');
  const [guestSearchName, setGuestSearchName] = useState('');
  const [guestResults, setGuestResults] = useState<
    { id: string; name: string; dob: string; phone: string | null }[]
  >([]);
  const [guestSearchLoading, setGuestSearchLoading] = useState(false);
  const [guestMergeLoading, setGuestMergeLoading] = useState(false);
  const [legacyUuid, setLegacyUuid] = useState<string | null>(null);

  const loadCounts = async () => {
    const stamps = await getStamps(uuid);
    const coupons = await getCouponCount(uuid);
    setStampCount(stamps.length);
    setCouponCount(coupons);
  };

  const loadTargetUserInfo = async () => {
    try {
      const profile = await getMemberProfile(uuid);
      if (profile) {
        setProfileImageUrl(profile.profileImageUrl);
        setTargetUserIsAdmin(profile.isAdmin);
        if (profile.createdAt) {
          setCreatedAt(format(profile.createdAt, 'yy-MM-dd'));
        }
        setPoints(profile.totalPoint);
        setBaitCoupons(profile.baitCoupons);
        if (profile.legacyUuid) setLegacyUuid(profile.legacyUuid);
      }

      const stamps = await getStamps(uuid);
      if (stamps.length > 0) {
        const last = stamps[stamps.length - 1];
        const [date, , time] = last.split('|');
        setLastStampDate(`${date} ${time || ''}`);
      }
    } catch (err) {
      console.warn('회원 정보 로딩 실패:', err);
    }
  };

  const loadRosterData = async () => {
    try {
      const boarding = await getBoardingForm(uuid);
      if (boarding) {
        const address = boarding.addressDetail
          ? `${boarding.address} ${boarding.addressDetail}`.trim()
          : boarding.address;
        setRosterData({
          name: boarding.name,
          birth: boarding.birth,
          gender: boarding.gender,
          phone: boarding.phone,
          emergency: boarding.emergency,
          address,
        });
        return true;
      }
      setRosterData(null);
      return false;
    } catch (err) {
      console.warn('명부 정보 로딩 실패:', err);
      setRosterData(null);
      return false;
    }
  };

  useEffect(() => {
    if (uuid) {
      loadCounts();
      loadTargetUserInfo();
      loadRosterData();
    }
  }, [uuid]);

  useNativePullToRefresh(async () => {
    await loadCounts();
    await loadTargetUserInfo();
  });

  const ADMIN_ADJUST_AMOUNT = 1;

  const handleGrantStamp = async () => {
    const count = ADMIN_ADJUST_AMOUNT;
    if (!confirm(`${name}님에게 스탬프 ${count}개를 적립하시겠습니까?`)) return;

    setIsLoadingStamp(true);
    try {
      await addStampBatch(uuid, count);
      await loadCounts();

      const newTotal = stampCount + count;
      if (Math.floor(stampCount / 10) < Math.floor(newTotal / 10)) {
        alert('쿠폰 발급: ' + name + '님에게 쿠폰이 발급되었을 수 있습니다. 스탬프 화면에서 확인해 주세요.');
      }

      await sendPushToUser({
        uuid,
        title: '스탬프가 적립되었어요~!',
        body: `${name}님, 스탬프가 ${count}개 적립되었습니다~! ✨`,
        data: { screen: 'stamp', uuid, name, dob },
      });

      alert(`완료: 스탬프 ${count}개가 적립되었습니다.`);
    } catch (err: any) {
      alert('스탬프 적립 실패: ' + err.message);
    } finally {
      setIsLoadingStamp(false);
    }
  };

  const handleDeductStamp = async () => {
    const count = ADMIN_ADJUST_AMOUNT;
    if (stampCount < count) {
      alert(`보유 스탬프(${stampCount}개)보다 많이 회수할 수 없습니다.`);
      return;
    }
    if (!confirm(`${name}님의 스탬프 ${count}개를 회수하시겠습니까?`)) return;

    setIsLoadingStamp(true);
    try {
      await removeStampBatch(uuid, count);
      await loadCounts();
      alert(`완료: 스탬프 ${count}개가 회수되었습니다.`);
    } catch (err: any) {
      alert('스탬프 회수 실패: ' + err.message);
    } finally {
      setIsLoadingStamp(false);
    }
  };

  const resetPoints = async () => {
    if (!confirm(`${name}님의 포인트를 0으로 초기화 하시겠습니까?`)) return;

    setIsResettingPoints(true);
    try {
      await resetTotalPoint(uuid);
      setPoints(0);
      alert('포인트 초기화 완료: ' + name + '님의 포인트가 0으로 초기화되었습니다.');
    } catch (err: any) {
      console.error('포인트 초기화 실패:', err);
      alert('포인트 초기화 실패: ' + err.message);
    } finally {
      setIsResettingPoints(false);
    }
  };

  const updateBaitCoupons = async (increment: number) => {
    if (increment === 0) return;

    const amount = Math.abs(increment);
    const message =
      increment > 0
        ? `${name}님에게 미끼 ${amount}개를 지급하시겠습니까?`
        : `${name}님의 미끼 ${amount}개를 차감하시겠습니까?`;

    if (!confirm(message)) return;

    setIsLoadingBait(true);
    try {
      const next = Math.max(0, baitCoupons + increment);
      await saveBaitCouponsCount(uuid, next);

      setBaitCoupons(next);

      const actionText = increment > 0 ? '지급' : '차감';
      alert(`완료: 미끼 ${amount}개가 ${actionText}되었습니다.`);

      if (increment > 0) {
        await sendPushToUser({
          uuid,
          title: '미끼가 지급되었어요',
          body: `${name}님, 미끼 ${amount}개가 추가되었습니다.`,
          data: { screen: 'mini-games', uuid, name, dob },
        });
      }
    } catch (err: any) {
      alert('미끼 업데이트 실패: ' + err.message);
    } finally {
      setIsLoadingBait(false);
    }
  };

  const handleGrantBait = () => {
    void updateBaitCoupons(ADMIN_ADJUST_AMOUNT);
  };

  const handleDeductBait = () => {
    if (baitCoupons < ADMIN_ADJUST_AMOUNT) {
      alert(`보유 미끼(${baitCoupons}개)보다 많이 차감할 수 없습니다.`);
      return;
    }
    void updateBaitCoupons(-ADMIN_ADJUST_AMOUNT);
  };

  const searchGuests = async () => {
    if (!guestSearchPhone.trim() && !guestSearchName.trim()) {
      alert('전화번호 또는 이름을 입력해 주세요.');
      return;
    }
    setGuestSearchLoading(true);
    try {
      const params = new URLSearchParams();
      if (guestSearchPhone.trim()) params.set('phone', guestSearchPhone.trim());
      else params.set('name', guestSearchName.trim());
      const res = await fetch(`/api/auth/merge-legacy/manual?${params}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.message || '검색 실패');
        return;
      }
      setGuestResults(data.guests ?? []);
      if ((data.guests ?? []).length === 0) {
        alert('일치하는 게스트가 없습니다.');
      }
    } catch (e) {
      console.error(e);
      alert('검색 중 오류가 발생했습니다.');
    } finally {
      setGuestSearchLoading(false);
    }
  };

  const mergeGuest = async (guestLegacyId: string, guestName: string, guestPhone: string | null) => {
    const phoneHint =
      rosterData?.phone && guestPhone && rosterData.phone.replace(/\D/g, '') === guestPhone.replace(/\D/g, '')
        ? '\n(전화번호 일치)'
        : guestPhone
          ? `\n게스트 전화: ${guestPhone}`
          : '';
    if (!confirm(`${guestName} 게스트 계정을 ${name}님과 연결할까요?${phoneHint}`)) return;

    setGuestMergeLoading(true);
    try {
      const res = await fetch('/api/auth/merge-legacy/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestLegacyId, targetUserId: uuid }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.message || '연결 실패');
        return;
      }
      alert('게스트 계정이 연결되었습니다.');
      setLegacyUuid(guestLegacyId);
      setGuestResults([]);
      await loadRosterData();
      await loadTargetUserInfo();
    } catch (e) {
      console.error(e);
      alert('연결 중 오류가 발생했습니다.');
    } finally {
      setGuestMergeLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (targetUserIsAdmin) {
      alert('삭제 불가: 관리자는 삭제할 수 없습니다.');
      return;
    }

    if (!confirm(`${name}님의 모든 데이터가 삭제됩니다.\n진행할까요?`)) return;

    setIsDeleting(true);
    try {
      await deleteUser(uuid);
      alert('삭제 완료: ' + name + '님의 정보가 삭제되었습니다.');
      router.back();
    } catch (err: any) {
      alert('삭제 실패: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleNamePress = async () => {
    const hasRoster = await loadRosterData();
    if (hasRoster) {
      setModalVisible(true);
    } else {
      alert('알림: ' + name + '님의 명부 정보가 없습니다.');
    }
  };

  const formattedDob =
    dob?.length === 8
      ? `${dob.slice(2, 4)}-${dob.slice(4, 6)}-${dob.slice(6, 8)}`
      : dob;

  const statItems = [
    {
      label: '스탬프',
      value: stampCount,
      valueColor: '#1B6FF5',
      onClick: () =>
        router.push(`/stamp?uuid=${uuid}&name=${name}&dob=${dob}&fromAdmin=true`),
    },
    {
      label: '쿠폰',
      value: couponCount,
      valueColor: '#FF9500',
      onClick: () =>
        router.push(`/coupons?uuid=${uuid}&name=${name}&dob=${dob}&fromAdmin=true`),
    },
    {
      label: '미끼',
      value: baitCoupons,
      valueColor: '#2E7D32',
      onClick: () => setBaitModalVisible(true),
    },
  ];

  return (
    <SubPageFrame title="회원 상세">
        <div className="ohgo-profile-banner mb-3">
          <div className="d-flex align-items-center gap-3 mb-3">
            <MemberListAvatar imageUrl={profileImageUrl} name={name} size={56} tone="light" />
            <div className="flex-grow-1 min-w-0">
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: OHGO_FONT, lineHeight: 1.25 }}>
                {name}
              </div>
              <button
                type="button"
                onClick={handleNamePress}
                className="btn btn-link p-0 text-white text-decoration-underline"
                style={{ fontSize: 12, opacity: 0.9, fontFamily: OHGO_FONT, marginTop: 2 }}
              >
                명부 정보 보기
              </button>
            </div>
          </div>
          <div className="d-flex align-items-end justify-content-between gap-3">
            <div>
              <div style={DETAIL_BANNER_LABEL}>포인트</div>
              <button
                type="button"
                onClick={resetPoints}
                className="btn btn-link p-0 text-white"
                disabled={isResettingPoints}
                style={{
                  ...DETAIL_BANNER_VALUE,
                  fontSize: 18,
                  textDecoration: 'none',
                  lineHeight: 1.2,
                }}
              >
                {points.toLocaleString()}
                <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, marginLeft: 2 }}>P</span>
              </button>
            </div>
            <div className="text-end">
              <div style={DETAIL_BANNER_LABEL}>가입일</div>
              <div style={DETAIL_BANNER_VALUE}>{createdAt || '—'}</div>
            </div>
          </div>
        </div>

        <div
          className="mb-3"
          style={{
            ...OHGO_CARD,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            padding: 0,
            overflow: 'hidden',
          }}
        >
          {statItems.map((item, index) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="btn d-flex flex-column align-items-center justify-content-center"
              style={{
                border: 'none',
                background: 'none',
                padding: '12px 8px',
                borderRight: index < statItems.length - 1 ? '1px solid #EFEFEF' : undefined,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: item.valueColor,
                  fontFamily: OHGO_FONT,
                  lineHeight: 1.2,
                }}
              >
                {item.value}
              </div>
              <div style={{ ...DETAIL_LABEL, marginTop: 4 }}>{item.label}</div>
            </button>
          ))}
        </div>

        <div className="mb-3" style={{ ...OHGO_CARD, padding: 0, overflow: 'hidden' }}>
          <DetailInfoRow icon={IoCalendarOutline} label="생년월일" value={formattedDob || '—'} />
          <DetailInfoRow
            icon={IoTimeOutline}
            label="UUID"
            value={uuid}
            isLast
            valueStyle={{
              fontSize: 12,
              fontWeight: 500,
              fontFamily: 'ui-monospace, monospace',
              wordBreak: 'break-all',
            }}
          />
        </div>

        <div className="mb-3" style={{ ...OHGO_CARD, padding: 14 }}>
          <div className="mb-3 pb-3" style={{ borderBottom: '1px solid #F7F8FA' }}>
            <span style={{ ...DETAIL_LABEL, display: 'block', marginBottom: 10 }}>스탬프 적립</span>
            <AdminQtyStepperRow
              currentCount={stampCount}
              accentColor="#1B6FF5"
              disabled={isLoadingStamp || isLoadingBait}
              minusDisabled={isLoadingStamp || stampCount < 1}
              plusDisabled={isLoadingStamp}
              minusAriaLabel="스탬프 1개 회수"
              plusAriaLabel="스탬프 1개 적립"
              onMinus={() => void handleDeductStamp()}
              onPlus={() => void handleGrantStamp()}
            />
            {isLoadingStamp && (
              <p className="mb-0 mt-2 text-center" style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT }}>
                적립 중...
              </p>
            )}
          </div>

          <div>
            <span style={{ ...DETAIL_LABEL, display: 'block', marginBottom: 10 }}>미끼 조정</span>
            <AdminQtyStepperRow
              currentCount={baitCoupons}
              accentColor="#2E7D32"
              disabled={isLoadingStamp || isLoadingBait}
              minusDisabled={isLoadingBait || baitCoupons < 1}
              plusDisabled={isLoadingBait}
              minusAriaLabel="미끼 1개 차감"
              plusAriaLabel="미끼 1개 지급"
              onMinus={() => handleDeductBait()}
              onPlus={() => handleGrantBait()}
              plusStyle={{
                backgroundColor: '#2E7D32',
                boxShadow: '0 4px 12px rgba(46,125,50,0.3)',
              }}
            />
            {isLoadingBait && (
              <p className="mb-0 mt-2 text-center" style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT }}>
                처리 중...
              </p>
            )}
          </div>
        </div>

        <div className="mb-3" style={{ ...OHGO_CARD, padding: 0, overflow: 'hidden' }}>
          <DetailMenuRow
            icon={IoDocumentTextOutline}
            iconColor="#1B6FF5"
            label="관리자 메모"
            onClick={() => router.push(`/memo?uuid=${uuid}&name=${name}`)}
          />
          <DetailMenuRow
            icon={IoListOutline}
            iconColor="#00BCD4"
            label="로그 보기"
            onClick={() => router.push(`/logs?uuid=${uuid}&name=${name}`)}
          />
          <DetailMenuRow
            icon={IoPricetagOutline}
            iconColor="#34C759"
            label="스탬프 이력"
            onClick={() => router.push(`/stamp-history?uuid=${uuid}&name=${name}`)}
            isLast
          />
        </div>

        {!legacyUuid && (
          <div className="mb-3" style={{ ...OHGO_CARD, padding: 14 }}>
            <div className="d-flex align-items-center gap-2 mb-2">
              <IoLinkOutline size={18} color="#1B6FF5" aria-hidden />
              <span style={{ ...DETAIL_MENU_LABEL, fontSize: 15 }}>게스트 계정 연결</span>
            </div>
            <p style={{ fontSize: 12, color: '#6F767E', margin: '0 0 12px', fontFamily: OHGO_FONT, lineHeight: 1.45 }}>
              승선명부에만 등록된 비회원(uuidv5)을 이 OAuth 회원과 수동 연결합니다.
              전화번호로 검색하면 일치 여부를 확인할 수 있습니다.
            </p>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                type="text"
                placeholder="전화번호 (예: 01012345678)"
                value={guestSearchPhone}
                onChange={(e) => setGuestSearchPhone(e.target.value)}
                style={{ ...OHGO_INPUT, width: '100%' }}
              />
            </div>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                type="text"
                placeholder="또는 이름 검색"
                value={guestSearchName}
                onChange={(e) => setGuestSearchName(e.target.value)}
                style={{ ...OHGO_INPUT, width: '100%' }}
              />
            </div>
            <button
              type="button"
              className="btn w-100"
              onClick={() => void searchGuests()}
              disabled={guestSearchLoading || guestMergeLoading}
              style={{ ...OHGO_PRIMARY_BTN, marginBottom: guestResults.length ? 12 : 0 }}
            >
              {guestSearchLoading ? '검색 중...' : '게스트 검색'}
            </button>
            {guestResults.map((guest) => (
              <div
                key={guest.id}
                className="d-flex align-items-center justify-content-between gap-2"
                style={{
                  padding: '10px 0',
                  borderTop: '1px solid #F7F8FA',
                }}
              >
                <div className="min-w-0">
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: OHGO_FONT }}>{guest.name}</div>
                  <div style={{ fontSize: 11, color: '#6F767E', fontFamily: OHGO_FONT }}>
                    {guest.dob}
                    {guest.phone ? ` · ${guest.phone}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={guestMergeLoading}
                  onClick={() => void mergeGuest(guest.id, guest.name, guest.phone)}
                  style={{
                    backgroundColor: '#EBF1FE',
                    color: '#1B6FF5',
                    borderRadius: 10,
                    fontWeight: 600,
                    fontFamily: OHGO_FONT,
                    flexShrink: 0,
                  }}
                >
                  연결
                </button>
              </div>
            ))}
          </div>
        )}

        {legacyUuid && (
          <div className="mb-3" style={{ ...OHGO_CARD, padding: 14 }}>
            <span style={{ ...DETAIL_LABEL, display: 'block', marginBottom: 4 }}>연결된 게스트 UUID</span>
            <span
              style={{
                fontSize: 12,
                fontFamily: 'ui-monospace, monospace',
                wordBreak: 'break-all',
                color: '#1A1D1F',
              }}
            >
              {legacyUuid}
            </span>
          </div>
        )}

        <button
          type="button"
          className="btn w-100 d-flex align-items-center justify-content-center gap-2 mb-3"
          onClick={handleDeleteUser}
          disabled={isDeleting}
          style={{
            padding: '13px',
            fontSize: 15,
            fontWeight: 600,
            borderRadius: 14,
            border: 'none',
            backgroundColor: '#FF3B30',
            color: '#FFFFFF',
            fontFamily: OHGO_FONT,
          }}
        >
            {isDeleting ? (
              <>
              <span className="spinner-border spinner-border-sm text-white"></span>
              <span>삭제 중...</span>
              </>
            ) : (
            <>
              <IoTrashOutline size={20} color="#FFFFFF" className="flex-shrink-0" />
              <span>회원 삭제</span>
            </>
            )}
          </button>

      <OhgoModal
        open={modalVisible}
        onClose={() => setModalVisible(false)}
        title={`${name}님의 명부 정보`}
        bodyPadding={false}
      >
        {rosterData && (
          <div style={{ ...OHGO_CARD, borderRadius: 0, boxShadow: 'none' }}>
            {(
              [
                { icon: IoPersonCircleOutline, label: '이름', value: rosterData.name },
                { icon: IoCalendarOutline, label: '생년월일', value: rosterData.birth },
                { icon: IoPersonCircleOutline, label: '성별', value: rosterData.gender },
                { icon: IoTimeOutline, label: '연락처', value: rosterData.phone },
                { icon: IoTimeOutline, label: '비상 연락처', value: rosterData.emergency },
                { icon: IoTimeOutline, label: '주소', value: rosterData.address },
              ] as const
            ).map((row, index, arr) => (
              <DetailInfoRow
                key={row.label}
                icon={row.icon}
                label={row.label}
                value={row.value}
                isLast={index === arr.length - 1}
              />
            ))}
          </div>
        )}
      </OhgoModal>

      <OhgoModal
        open={baitModalVisible}
        onClose={() => setBaitModalVisible(false)}
        title={`${name}님의 미끼`}
      >
        <AdminQtyStepperRow
          currentCount={baitCoupons}
          accentColor="#2E7D32"
          disabled={isLoadingBait}
          minusDisabled={isLoadingBait || baitCoupons < 1}
          plusDisabled={isLoadingBait}
          minusAriaLabel="미끼 1개 차감"
          plusAriaLabel="미끼 1개 지급"
          onMinus={() => handleDeductBait()}
          onPlus={() => handleGrantBait()}
          plusStyle={{
            backgroundColor: '#2E7D32',
            boxShadow: '0 4px 12px rgba(46,125,50,0.3)',
          }}
        />
        {isLoadingBait && (
          <div className="text-center mt-3">
            <div className="spinner-border spinner-border-sm text-primary" />
          </div>
        )}
      </OhgoModal>
    </SubPageFrame>
  );
}

export default function MemberDetailPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <MemberDetailContent />
    </Suspense>
  );
}

