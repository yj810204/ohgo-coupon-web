'use client';

import { useEffect, useState, Suspense, type CSSProperties, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getStamps, getCouponCount, addStamp, addStampBatch, deleteUser } from '@/utils/stamp-service';
import { sendPushToUser } from '@/utils/send-push';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, { OhgoModalButton } from '@/components/OhgoModal';
import MemberListAvatar from '@/components/MemberListAvatar';
import { getMemberProfileImageUrl } from '@/lib/member-profile';
import { OHGO_CARD, OHGO_FONT, OHGO_PRIMARY_BTN, OhgoPageLoading } from '@/lib/page-styles';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import type { IconType } from 'react-icons';
import { 
  IoPersonCircleOutline, 
  IoCalendarOutline, 
  IoTimeOutline,
  IoPricetagOutline,
  IoAddCircleOutline,
  IoDocumentTextOutline,
  IoListOutline,
  IoTrashOutline,
  IoChevronForwardOutline
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
  const [isLoadingOne, setIsLoadingOne] = useState(false);
  const [isLoadingFive, setIsLoadingFive] = useState(false);
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

  const loadCounts = async () => {
    const stamps = await getStamps(uuid);
    const coupons = await getCouponCount(uuid);
    setStampCount(stamps.length);
    setCouponCount(coupons);
  };

  const loadTargetUserInfo = async () => {
    try {
      const snap = await getDoc(doc(db, 'users', uuid));
      if (snap.exists()) {
        const data = snap.data();
        setProfileImageUrl(getMemberProfileImageUrl(data));
        setTargetUserIsAdmin(!!data.isAdmin);
        if (data.createdAt) {
          const ts = typeof data.createdAt === 'string' ? new Date(data.createdAt) : data.createdAt.toDate();
          setCreatedAt(format(ts, 'yy-MM-dd'));
        }
        setPoints(data.totalPoint || 0);
        setBaitCoupons(data.baitCoupons || 0);
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
      const rosterSnap = await getDoc(doc(db, 'users', uuid, 'boarding', 'info'));
      if (rosterSnap.exists()) {
        const data = rosterSnap.data();
        setRosterData(data as typeof rosterData);
        return true;
      } else {
        setRosterData(null);
        return false;
      }
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

  const handleAddStamp = async () => {
    if (!confirm(`${name}님에게 스탬프 1개를 적립하시겠습니까?`)) return;

    setIsLoadingOne(true);
    try {
      await addStamp(uuid, 'ADMIN');
      await loadCounts();

      if (stampCount + 1 >= 10) {
        alert('쿠폰 발급: ' + name + '님에게 쿠폰이 1개 발급되었습니다.');
      }

      await sendPushToUser({
        uuid,
        title: '스탬프가 적립되었어요~!',
        body: `${name}님, 스탬프가 1개 적립되었습니다~! ✨`,
        data: { screen: 'stamp', uuid, name, dob },
      });
    } catch (err: any) {
      alert('스탬프 적립 실패: ' + err.message);
    } finally {
      setIsLoadingOne(false);
    }
  };

  const handleAddStampFive = async () => {
    if (!confirm(`${name}님에게 스탬프 5개를 적립하시겠습니까?`)) return;

    setIsLoadingFive(true);
    try {
      await addStampBatch(uuid, 5);
      await loadCounts();

      await sendPushToUser({
        uuid,
        title: '스탬프 5개가 적립되었어요~!',
        body: `${name}님, 스탬프가 5개 적립되었습니다~! 🎉`,
        data: { screen: 'stamp', uuid, name, dob },
      });

      alert('완료: 스탬프 5개가 적립되었습니다.');
    } catch (err: any) {
      alert('실패: ' + err.message);
    } finally {
      setIsLoadingFive(false);
    }
  };

  const resetPoints = async () => {
    if (!confirm(`${name}님의 포인트를 0으로 초기화 하시겠습니까?`)) return;

    setIsResettingPoints(true);
    try {
      const userRef = doc(db, 'users', uuid);
      await updateDoc(userRef, { totalPoint: 0 });
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

    const message = increment > 0
      ? `${name}님의 미끼 교환권을 1개 추가하시겠습니까?`
      : `${name}님의 미끼 교환권을 1개 차감하시겠습니까?`;

    if (!confirm(message)) return;

    setIsLoadingBait(true);
    try {
      const userRef = doc(db, 'users', uuid);
      await updateDoc(userRef, {
        baitCoupons: (baitCoupons + increment) >= 0 ? baitCoupons + increment : 0
      });

      setBaitCoupons(prev => (prev + increment >= 0 ? prev + increment : 0));

      const actionText = increment > 0 ? '추가' : '차감';
      alert('완료: 미끼 교환권이 1개 ' + actionText + '되었습니다.');

      if (increment > 0) {
        await sendPushToUser({
          uuid,
          title: '미끼 교환권 업데이트',
          body: `${name}님, 미끼 교환권이 1개 추가되었습니다.`,
          data: { screen: 'fishing', uuid, name, dob },
        });
      }
    } catch (err: any) {
      alert('미끼 교환권 업데이트 실패: ' + err.message);
    } finally {
      setIsLoadingBait(false);
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
      label: '교환권',
      value: baitCoupons,
      valueColor: '#1A1D1F',
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

        <div className="row g-2 mb-3">
          <div className="col-6">
            <button
              type="button"
              className="btn w-100 d-flex align-items-center justify-content-center gap-2"
              onClick={handleAddStamp}
              disabled={isLoadingOne || isLoadingFive}
              style={OHGO_PRIMARY_BTN}
            >
              {isLoadingOne ? (
                <>
                  <span className="spinner-border spinner-border-sm text-white" />
                  <span>적립 중...</span>
                </>
              ) : (
                <>
                  <IoAddCircleOutline size={18} className="flex-shrink-0" />
                  <span>스탬프 +1</span>
                </>
              )}
            </button>
          </div>
          <div className="col-6">
            <button
              type="button"
              className="btn w-100 d-flex align-items-center justify-content-center gap-2 text-white"
              onClick={handleAddStampFive}
              disabled={isLoadingOne || isLoadingFive}
              style={{
                ...OHGO_PRIMARY_BTN,
                backgroundColor: '#6F767E',
                boxShadow: '0 4px 12px rgba(111,118,126,0.25)',
              }}
            >
              {isLoadingFive ? (
                <>
                  <span className="spinner-border spinner-border-sm text-white" />
                  <span>적립 중...</span>
                </>
              ) : (
                <>
                  <IoAddCircleOutline size={18} className="flex-shrink-0" />
                  <span>스탬프 +5</span>
                </>
              )}
            </button>
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
        footer={
          <OhgoModalButton variant="secondary" onClick={() => setModalVisible(false)}>
            닫기
          </OhgoModalButton>
        }
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
        title={`${name}님의 교환권`}
        footer={
          <OhgoModalButton variant="secondary" onClick={() => setBaitModalVisible(false)}>
            닫기
          </OhgoModalButton>
        }
      >
        <div className="d-flex align-items-center justify-content-center py-2">
          <button
            type="button"
            className="btn btn-success rounded-circle d-flex align-items-center justify-content-center"
            style={{ width: 56, height: 56, fontSize: '1.5rem', border: 'none' }}
            onClick={() => updateBaitCoupons(1)}
            disabled={isLoadingBait}
          >
            +
          </button>
          <div
            className="fw-bold text-center mx-3"
            style={{ minWidth: 72, fontSize: 28, color: '#1A1D1F', fontFamily: OHGO_FONT }}
          >
            {baitCoupons}
          </div>
          {baitCoupons > 0 && (
            <button
              type="button"
              className="btn btn-danger rounded-circle d-flex align-items-center justify-content-center"
              style={{ width: 56, height: 56, fontSize: '1.5rem', border: 'none' }}
              onClick={() => updateBaitCoupons(-1)}
              disabled={isLoadingBait}
            >
              −
            </button>
          )}
        </div>
        {isLoadingBait && (
          <div className="text-center pb-2">
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

