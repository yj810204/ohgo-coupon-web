'use client';

import { useEffect, useState, Suspense, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  getStamps,
  getCouponCount,
  addStampBatchWithReason,
  removeStampBatchWithReason,
  adjustCouponsWithReason,
  deleteUser,
} from '@/utils/stamp-service';
import {
  getMemberProfile,
  getMemberTripCount,
  resetTotalPoint,
  updateBaitCoupons as saveBaitCouponsCount,
  updateTripCount as saveTripCount,
} from '@/utils/member-profile-service';
import { getBoardingForm } from '@/utils/boarding-service';
import {
  adjustGuestLegacyCoupons,
  adjustGuestLegacyStamps,
  findDuplicateUsers,
  getAdminGuestDetail,
  mergeDuplicateUsers,
  type DuplicateMemberCandidate,
} from '@/utils/admin-member-service';
import { invalidateAdminMemberStatsCache } from '@/utils/admin-member-service';
import {
  nameHasOddWhitespace,
  displayNameWithVisibleSpaces,
  describeDuplicateReason,
} from '@/lib/person-name';
import { sendPushToUser } from '@/utils/send-push';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, { OhgoModalButton } from '@/components/OhgoModal';
import { addUserActionLog } from '@/utils/user-action-log-service';
import { getMemos } from '@/utils/memo-service';
import BoardingInfoModal from '@/components/BoardingInfoModal';
import MemberListAvatar from '@/components/MemberListAvatar';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OHGO_PRIMARY_BTN,
  OHGO_LIST,
  OHGO_LIST_DIVIDER,
  OhgoPageLoading,
} from '@/lib/page-styles';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { useNavigation } from '@/hooks/useNavigation';
import { isFirebaseDataSource } from '@/lib/data-source';
import type { IconType } from 'react-icons';
import {
  IoPricetagOutline,
  IoDocumentTextOutline,
  IoListOutline,
  IoTrashOutline,
  IoChevronForwardOutline,
  IoLinkOutline,
  IoWarningOutline,
  IoCallOutline,
} from 'react-icons/io5';
import { ohgoConfirm } from '@/lib/ohgo-dialog';
import { openPhoneDialer } from '@/lib/native-bridge';

function memberContactTel(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/[^\d+]/g, '');
}

const DETAIL_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  lineHeight: 1.2,
};

function DetailMenuRow({
  icon: Icon,
  iconColor,
  label,
  count,
  onClick,
}: {
  icon: IconType;
  iconColor: string;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className="btn ohgo-menu-list-row" onClick={onClick}>
      <div className="ohgo-menu-list-row__icon" style={{ backgroundColor: `${iconColor}18` }}>
        <Icon size={OHGO_LIST.iconGlyph} color={iconColor} aria-hidden />
      </div>
      <span className="ohgo-menu-list-row__title flex-grow-1">
        {label}
        {count != null && count > 0 ? (
          <span style={{ color: '#1B6FF5', fontWeight: 700 }}> ({count})</span>
        ) : null}
      </span>
      <IoChevronForwardOutline
        size={OHGO_LIST.chevronSize}
        color={OHGO_LIST.chevronColor}
        aria-hidden
      />
    </button>
  );
}

const ADJUST_REASONS = [
  '현장 누락',
  '오적립·오지급 보정',
  '이벤트·행사',
  '고객 보상',
  '기타',
] as const;

const ADJUST_ADD_MAX = 99;

type AdjustKind = 'stamp' | 'coupon' | 'bait' | 'trip';

const ADJUST_META: Record<
  AdjustKind,
  { title: string; addVerb: string; deductVerb: string; accent: string; unit: string }
> = {
  stamp: { title: '스탬프 조정', addVerb: '적립', deductVerb: '회수', accent: '#1B6FF5', unit: '개' },
  coupon: { title: '쿠폰 조정', addVerb: '지급', deductVerb: '회수', accent: '#FF9500', unit: '개' },
  bait: { title: '미끼 조정', addVerb: '지급', deductVerb: '차감', accent: '#2E7D32', unit: '개' },
  trip: { title: '승선 횟수 조정', addVerb: '가산', deductVerb: '차감', accent: '#007AFF', unit: '회' },
};

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
  unit = '개',
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
  unit?: string;
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
            pointerEvents: 'none',
            ...minusStyle,
          }}
          tabIndex={-1}
          aria-hidden
        >
          −
        </button>
      )}
      <input
        type="text"
        readOnly
        tabIndex={-1}
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
          pointerEvents: 'none',
        }}
        value={`${currentCount}${unit}`}
        disabled={disabled}
        aria-hidden
      />
      <button
        type="button"
        className="btn text-white"
        style={{
          ...ADMIN_QTY_SIDE_BTN,
          backgroundColor: '#1B6FF5',
          boxShadow: '0 4px 12px rgba(27,111,245,0.25)',
          pointerEvents: 'none',
          ...plusStyle,
        }}
        tabIndex={-1}
        aria-hidden
      >
        +
      </button>
    </div>
  );
}

function AdminAdjustBlock({
  label,
  bordered,
  loading,
  currentCount,
  onPress,
  onMinus,
  onPlus,
  disabled,
  minusDisabled,
  plusDisabled,
  minusAriaLabel,
  plusAriaLabel,
  plusStyle,
  accentColor,
  unit,
}: {
  label: string;
  bordered?: boolean;
  loading?: boolean;
  currentCount: number;
  onPress?: () => void;
  onMinus?: () => void;
  onPlus?: () => void;
  disabled?: boolean;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  minusAriaLabel: string;
  plusAriaLabel: string;
  plusStyle?: CSSProperties;
  accentColor?: string;
  unit?: string;
}) {
  const hitStyle: CSSProperties = {
    flex: 1,
    margin: 0,
    padding: 0,
    border: 'none',
    background: 'transparent',
  };

  return (
    <div
      className={bordered ? 'mb-3 pb-3' : undefined}
      style={{
        position: 'relative',
        ...(bordered ? { borderBottom: '1px solid #F7F8FA' } : {}),
      }}
    >
      <span
        style={{
          ...DETAIL_LABEL,
          display: 'block',
          marginBottom: 10,
          pointerEvents: 'none',
        }}
      >
        {label}
      </span>
      <AdminQtyStepperRow
        currentCount={currentCount}
        onMinus={onMinus ?? (() => {})}
        onPlus={onPlus ?? (() => {})}
        disabled={disabled}
        minusDisabled={minusDisabled}
        plusDisabled={plusDisabled}
        minusAriaLabel={minusAriaLabel}
        plusAriaLabel={plusAriaLabel}
        plusStyle={plusStyle}
        accentColor={accentColor}
        unit={unit}
      />
      {loading && (
        <p
          className="mb-0 mt-2 text-center"
          style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT, pointerEvents: 'none' }}
        >
          처리 중...
        </p>
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
        }}
      >
        {onPress ? (
          <button
            type="button"
            onClick={onPress}
            disabled={disabled}
            aria-label={plusAriaLabel}
            style={{
              ...hitStyle,
              width: '100%',
              cursor: disabled ? 'default' : 'pointer',
            }}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={onMinus}
              disabled={disabled || minusDisabled}
              aria-label={minusAriaLabel}
              style={{
                ...hitStyle,
                cursor: disabled || minusDisabled ? 'default' : 'pointer',
              }}
            />
            <button
              type="button"
              onClick={onPlus}
              disabled={disabled || plusDisabled}
              aria-label={plusAriaLabel}
              style={{
                ...hitStyle,
                cursor: disabled || plusDisabled ? 'default' : 'pointer',
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function MemberDetailContent() {
  const { navigate, navigateReplace, navigateBack } = useNavigation();
  const searchParams = useSearchParams();
  const uuid = searchParams.get('uuid') || '';
  const nameParam = decodeURIComponent(searchParams.get('name') || '');
  const dobParam = searchParams.get('dob') || '';
  // firebase 공용 소스 모드에서는 회원/게스트 이원화 없음 (모두 Firestore users)
  const isGuestMember =
    !isFirebaseDataSource() && searchParams.get('guest') === '1';

  const [displayName, setDisplayName] = useState(nameParam);
  const [displayDob, setDisplayDob] = useState(dobParam);
  const [targetUserIsAdmin, setTargetUserIsAdmin] = useState(false);
  const [stampCount, setStampCount] = useState(0);
  const [couponCount, setCouponCount] = useState(0);
  const [points, setPoints] = useState(0);
  const [baitCoupons, setBaitCoupons] = useState(0);
  const [tripCount, setTripCount] = useState(0);
  const [isLoadingStamp, setIsLoadingStamp] = useState(false);
  const [isLoadingCoupon, setIsLoadingCoupon] = useState(false);
  const [isLoadingBait, setIsLoadingBait] = useState(false);
  const [isLoadingTrip, setIsLoadingTrip] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResettingPoints, setIsResettingPoints] = useState(false);
  const [adjustKind, setAdjustKind] = useState<AdjustKind | null>(null);
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustReason, setAdjustReason] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [lastStampDate, setLastStampDate] = useState('');
  const [guestPhone, setGuestPhone] = useState<string | null>(null);
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
  const [uuidModalVisible, setUuidModalVisible] = useState(false);
  const [uuidCopied, setUuidCopied] = useState(false);
  const [duplicateAccounts, setDuplicateAccounts] = useState<DuplicateMemberCandidate[]>([]);
  const [keepMergeUuid, setKeepMergeUuid] = useState(uuid);
  const [duplicateMergeLoading, setDuplicateMergeLoading] = useState(false);
  const [memoCount, setMemoCount] = useState(0);

  const name = displayName || nameParam;
  const dob = displayDob || dobParam;

  const loadCounts = async () => {
    if (isGuestMember) {
      const detail = await getAdminGuestDetail(uuid);
      if (detail) {
        setStampCount(detail.stampCount);
        setCouponCount(detail.couponCount);
      }
      return;
    }
    const stamps = await getStamps(uuid);
    const coupons = await getCouponCount(uuid);
    setStampCount(stamps.length);
    setCouponCount(coupons);
  };

  const loadTargetUserInfo = async () => {
    if (isGuestMember) return;
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
      setTripCount(await getMemberTripCount(uuid));
      try {
        const memos = await getMemos(uuid);
        setMemoCount(memos.length);
      } catch (err) {
        console.warn('메모 개수 로딩 실패:', err);
        setMemoCount(0);
      }

      const stamps = await getStamps(uuid);
      if (isFirebaseDataSource()) {
        const dups = await findDuplicateUsers(uuid, displayName || nameParam, displayDob || dobParam);
        setDuplicateAccounts(dups);
        const stamped = dups.find((d) => d.stampCount > 0 || Boolean(d.lastStampTimeMs));
        setKeepMergeUuid(stamps.length > 0 ? uuid : stamped?.uuid ?? uuid);
      } else {
        setDuplicateAccounts([]);
      }

      if (stamps.length > 0) {
        const last = stamps[stamps.length - 1];
        const [date, , time] = last.split('|');
        setLastStampDate(`${date} ${time || ''}`);
      }
    } catch (err) {
      console.warn('회원 정보 로딩 실패:', err);
    }
  };

  const loadGuestDetail = async () => {
    try {
      const detail = await getAdminGuestDetail(uuid);
      if (!detail) {
        alert('기존 회원 정보를 찾을 수 없습니다.');
        return;
      }
      if (detail.mergedTo) {
        alert('이미 신규 회원과 연결된 기존 회원입니다. 신규 회원 상세로 이동합니다.');
        navigateReplace(
          `/member-detail?uuid=${detail.mergedTo}&name=${encodeURIComponent(detail.name)}&dob=${detail.dob}`
        );
        return;
      }
      setDisplayName(detail.name);
      setDisplayDob(detail.dob);
      setGuestPhone(detail.phone);
      setStampCount(detail.stampCount);
      setCouponCount(detail.couponCount);
      if (detail.createdAt) {
        setCreatedAt(format(new Date(detail.createdAt), 'yy-MM-dd'));
      }
      if (detail.boarding) {
        const address = detail.boarding.addressDetail
          ? `${detail.boarding.address ?? ''} ${detail.boarding.addressDetail}`.trim()
          : detail.boarding.address ?? '';
        setRosterData({
          name: detail.boarding.name || detail.name,
          birth: detail.boarding.birth || detail.dob,
          gender: detail.boarding.gender || '',
          phone: detail.boarding.phone || detail.phone || '',
          emergency: detail.boarding.emergency || '',
          address,
        });
      } else {
        setRosterData(null);
      }
    } catch (err) {
      console.warn('기존 회원 정보 로딩 실패:', err);
    }
  };

  const loadRosterData = async () => {
    if (isGuestMember) {
      await loadGuestDetail();
      return Boolean(rosterData);
    }
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
    if (!uuid) return;
    if (isGuestMember) {
      void loadGuestDetail();
      return;
    }
    void loadCounts();
    void loadTargetUserInfo();
    void loadRosterData();
  }, [uuid, isGuestMember]);

  useNativePullToRefresh(async () => {
    if (isGuestMember) {
      await loadGuestDetail();
      return;
    }
    await loadCounts();
    await loadTargetUserInfo();
  });

  const adjustBusy = isLoadingStamp || isLoadingBait || isLoadingCoupon || isLoadingTrip;

  const adjustCurrentCount = (kind: AdjustKind) => {
    if (kind === 'stamp') return stampCount;
    if (kind === 'coupon') return couponCount;
    if (kind === 'trip') return tripCount;
    return baitCoupons;
  };

  const adjustMaxQty = (kind: AdjustKind) => adjustCurrentCount(kind) + ADJUST_ADD_MAX;

  const adjustDelta = adjustKind != null ? adjustQty - adjustCurrentCount(adjustKind) : 0;

  const openAdjustModal = (kind: AdjustKind) => {
    setAdjustKind(kind);
    setAdjustQty(adjustCurrentCount(kind));
    setAdjustReason('');
  };

  const closeAdjustModal = () => {
    if (adjustBusy) return;
    setAdjustKind(null);
    setAdjustQty(0);
    setAdjustReason('');
  };

  const handleGrantStamp = async (count: number, reason: string) => {
    setIsLoadingStamp(true);
    try {
      if (isGuestMember) {
        await adjustGuestLegacyStamps(uuid, count);
        await addUserActionLog(
          uuid,
          '스탬프 적립',
          `ADMIN 방식으로 ${count}개 적립 (${reason})`
        );
        await loadCounts();
        alert(`완료: 기존 회원 staging에 스탬프 ${count}개가 적립되었습니다.\n(회원 계정 연결 시 반영됩니다. 신원 데이터는 변경되지 않습니다.)`);
        return;
      }

      await addStampBatchWithReason(uuid, count, reason);
      await loadCounts();

      const newTotal = stampCount + count;
      if (Math.floor(stampCount / 10) < Math.floor(newTotal / 10)) {
        alert('쿠폰 발급: ' + name + '님에게 쿠폰이 발급되었을 수 있습니다. 스탬프 화면에서 확인해 주세요.');
      }

      await sendPushToUser({
        uuid,
        title: '스탬프 적립',
        body: `${count}개의 스탬프가 적립되었습니다.`,
        data: { screen: 'stamp', uuid, name, dob },
      });

      alert(`완료: 스탬프 ${count}개가 적립되었습니다.`);
    } catch (err: any) {
      alert('스탬프 적립 실패: ' + err.message);
      throw err;
    } finally {
      setIsLoadingStamp(false);
    }
  };

  const handleDeductStamp = async (count: number, reason: string) => {
    if (stampCount < count) {
      alert(`보유 스탬프(${stampCount}개)보다 많이 회수할 수 없습니다.`);
      return;
    }

    setIsLoadingStamp(true);
    try {
      if (isGuestMember) {
        await adjustGuestLegacyStamps(uuid, -count);
        await addUserActionLog(
          uuid,
          '스탬프 회수',
          `ADMIN 방식으로 ${count}개 회수 (${reason})`
        );
        await loadCounts();
        alert(`완료: 미반영 staging 스탬프 ${count}개가 회수되었습니다.`);
        return;
      }
      await removeStampBatchWithReason(uuid, count, reason);
      await loadCounts();
      await sendPushToUser({
        uuid,
        title: '스탬프 차감',
        body: `${count}개의 스탬프가 차감되었습니다.`,
        data: { screen: 'stamp', uuid, name, dob },
      });
      alert(`완료: 스탬프 ${count}개가 회수되었습니다.`);
    } catch (err: any) {
      alert('스탬프 회수 실패: ' + err.message);
      throw err;
    } finally {
      setIsLoadingStamp(false);
    }
  };

  const handleAdjustCoupon = async (increment: number, reason: string) => {
    if (increment === 0) return;
    const amount = Math.abs(increment);
    const verb = increment > 0 ? '지급' : '회수';
    setIsLoadingCoupon(true);
    try {
      if (isGuestMember) {
        await adjustGuestLegacyCoupons(uuid, increment);
        await addUserActionLog(
          uuid,
          increment > 0 ? '쿠폰 지급' : '쿠폰 회수',
          `ADMIN 방식으로 ${amount}개 ${verb} (${reason})`
        );
        await loadCounts();
        alert(`완료: 기존 회원 staging에 쿠폰 ${amount}개가 ${verb}되었습니다.`);
        return;
      }

      await adjustCouponsWithReason(uuid, increment, reason);
      await loadCounts();
      await sendPushToUser({
        uuid,
        title: increment > 0 ? '쿠폰 지급' : '쿠폰 회수',
        body: `${amount}개의 쿠폰이 ${verb}되었습니다.`,
        data: { screen: 'coupons', uuid, name, dob },
      });
      alert(`완료: 쿠폰 ${amount}개가 ${verb}되었습니다.`);
    } catch (err: any) {
      alert(`쿠폰 ${verb} 실패: ` + err.message);
      throw err;
    } finally {
      setIsLoadingCoupon(false);
    }
  };

  const resetPoints = async () => {
    if (!(await ohgoConfirm(`${name}님의 포인트를 0으로 초기화 하시겠습니까?`))) return;

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

  const updateBaitCoupons = async (increment: number, reason: string) => {
    if (increment === 0) return;

    const amount = Math.abs(increment);
    setIsLoadingBait(true);
    try {
      const next = Math.max(0, baitCoupons + increment);
      await saveBaitCouponsCount(uuid, next);
      const actionText = increment > 0 ? '지급' : '차감';
      await addUserActionLog(
        uuid,
        increment > 0 ? '미끼 지급' : '미끼 차감',
        `ADMIN 방식으로 ${amount}개 ${actionText} (${reason})`
      );

      setBaitCoupons(next);
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
      throw err;
    } finally {
      setIsLoadingBait(false);
    }
  };

  const updateMemberTripCount = async (increment: number, reason: string) => {
    if (increment === 0) return;

    const amount = Math.abs(increment);
    setIsLoadingTrip(true);
    try {
      const next = Math.max(0, tripCount + increment);
      await saveTripCount(uuid, next);
      const actionText = increment > 0 ? '가산' : '차감';
      await addUserActionLog(
        uuid,
        increment > 0 ? '승선 횟수 가산' : '승선 횟수 차감',
        `ADMIN 방식으로 ${amount}회 ${actionText} (${reason})`
      );

      setTripCount(next);
      alert(`완료: 승선 횟수가 ${amount}회 ${actionText}되었습니다.`);
    } catch (err: any) {
      alert('승선 횟수 업데이트 실패: ' + err.message);
      throw err;
    } finally {
      setIsLoadingTrip(false);
    }
  };

  const confirmAdjust = async () => {
    if (!adjustKind || !adjustReason || adjustDelta === 0) return;
    const count = Math.abs(adjustDelta);
    try {
      if (adjustKind === 'stamp') {
        if (adjustDelta > 0) await handleGrantStamp(count, adjustReason);
        else await handleDeductStamp(count, adjustReason);
      } else if (adjustKind === 'coupon') {
        await handleAdjustCoupon(adjustDelta, adjustReason);
      } else if (adjustKind === 'trip') {
        await updateMemberTripCount(adjustDelta, adjustReason);
      } else if (adjustDelta > 0) {
        await updateBaitCoupons(count, adjustReason);
      } else {
        await updateBaitCoupons(-count, adjustReason);
      }
      setAdjustKind(null);
      setAdjustQty(0);
      setAdjustReason('');
    } catch {
      // 오류는 각 핸들러에서 alert
    }
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

  const mergeDuplicateAccounts = async () => {
    if (!keepMergeUuid || duplicateAccounts.length === 0) return;
    const others = [uuid, ...duplicateAccounts.map((d) => d.uuid)].filter((id) => id !== keepMergeUuid);
    const keepName =
      keepMergeUuid === uuid
        ? displayName
        : duplicateAccounts.find((d) => d.uuid === keepMergeUuid)?.name ?? displayName;
    if (
      !(await ohgoConfirm(
        `${(keepName || '').trim()} 계정으로 ${others.length}건을 통합할까요?\n스탬프·쿠폰·명부 이력이 남길 계정으로 모이고, 나머지는 목록에서 숨깁니다.`
      ))
    ) {
      return;
    }
    setDuplicateMergeLoading(true);
    try {
      for (const drop of others) {
        await mergeDuplicateUsers(keepMergeUuid, drop);
      }
      invalidateAdminMemberStatsCache();
      alert('계정이 통합되었습니다.');
      const keep = duplicateAccounts.find((d) => d.uuid === keepMergeUuid);
      navigateReplace(
        `/member-detail?uuid=${keepMergeUuid}&name=${encodeURIComponent(keep?.name ?? displayName)}&dob=${keep?.dob ?? displayDob}`
      );
      setDuplicateAccounts([]);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '통합에 실패했습니다.');
    } finally {
      setDuplicateMergeLoading(false);
    }
  };

  const mergeGuest = async (guestLegacyId: string, guestName: string, guestPhone: string | null) => {
    const phoneHint =
      rosterData?.phone && guestPhone && rosterData.phone.replace(/\D/g, '') === guestPhone.replace(/\D/g, '')
        ? '\n(전화번호 일치)'
        : guestPhone
          ? `\n게스트 전화: ${guestPhone}`
          : '';
    if (!(await ohgoConfirm(`${guestName} 게스트 계정을 ${name}님과 연결할까요?${phoneHint}`))) return;

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
    if (isGuestMember) {
      alert('기존 회원 원본 데이터는 삭제할 수 없습니다.');
      return;
    }
    if (targetUserIsAdmin) {
      alert('삭제 불가: 관리자는 삭제할 수 없습니다.');
      return;
    }
    if (legacyUuid) {
      alert('구앱과 연결된 기존 회원은 삭제할 수 없습니다. (원본 데이터 보호)');
      return;
    }

    if (!(await ohgoConfirm(`${name}님의 모든 데이터가 삭제됩니다.\n진행할까요?`))) return;

    setIsDeleting(true);
    try {
      await deleteUser(uuid);
      alert('삭제 완료: ' + name + '님의 정보가 삭제되었습니다.');
      navigateBack();
    } catch (err: any) {
      alert('삭제 실패: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const openBoardingEditor = () => {
    setModalVisible(false);
    navigate(
      `/boarding-form?uuid=${uuid}&name=${encodeURIComponent(name)}&dob=${dob}&returnTo=member-detail`
    );
  };

  const handleNamePress = async () => {
    if (isGuestMember) {
      setModalVisible(true);
      return;
    }
    await loadRosterData();
    setModalVisible(true);
  };

  const closeUuidModal = () => {
    setUuidModalVisible(false);
    setUuidCopied(false);
  };

  const copyUuid = async () => {
    if (!uuid) return;
    try {
      await navigator.clipboard.writeText(uuid);
      setUuidCopied(true);
      window.setTimeout(() => setUuidCopied(false), 1500);
    } catch {
      alert(uuid);
    }
  };

  const formattedDob =
    dob?.length === 8
      ? `${dob.slice(2, 4)}-${dob.slice(4, 6)}-${dob.slice(6, 8)}`
      : dob;

  const statItems: {
    label: string;
    value: number;
    valueColor: string;
    onClick?: () => void;
  }[] = isGuestMember
    ? [
        { label: '스탬프', value: stampCount, valueColor: '#1B6FF5' },
        { label: '쿠폰', value: couponCount, valueColor: '#FF9500' },
      ]
    : [
        {
          label: '스탬프',
          value: stampCount,
          valueColor: '#1B6FF5',
          onClick: () =>
            navigate(
              `/stamp?uuid=${uuid}&name=${encodeURIComponent(name)}&dob=${dob}&fromAdmin=true`
            ),
        },
        {
          label: '쿠폰',
          value: couponCount,
          valueColor: '#FF9500',
          onClick: () =>
            navigate(
              `/coupons?uuid=${uuid}&name=${encodeURIComponent(name)}&dob=${dob}&fromAdmin=true`
            ),
        },
        {
          label: '승선',
          value: tripCount,
          valueColor: '#007AFF',
          onClick: () => openAdjustModal('trip'),
        },
        {
          label: '미끼',
          value: baitCoupons,
          valueColor: '#2E7D32',
          onClick: () => openAdjustModal('bait'),
        },
      ];

  const contactPhone = (rosterData?.phone || guestPhone || '').trim();
  const contactTel = memberContactTel(contactPhone);

  const callMember = () => {
    if (!contactTel) {
      alert('등록된 연락처가 없습니다.');
      return;
    }
    if (!openPhoneDialer(contactPhone)) {
      alert('등록된 연락처가 없습니다.');
    }
  };

  return (
    <SubPageFrame title={isGuestMember ? '기존 회원 상세' : '회원 상세'}>
        {isGuestMember && (
          <div
            className="d-flex align-items-start gap-2 mb-3"
            style={{
              ...OHGO_CARD,
              padding: 12,
              backgroundColor: '#FFF8E1',
              border: '1px solid #FFE082',
            }}
          >
            <IoWarningOutline size={18} color="#F57C00" className="flex-shrink-0 mt-1" aria-hidden />
            <p style={{ margin: 0, fontSize: 12, color: '#6D4C41', fontFamily: OHGO_FONT, lineHeight: 1.45 }}>
              기존 회원 원본(이름·생년월일·명부)은 수정·삭제할 수 없습니다.
              스탬프·쿠폰만 staging에 관리되며, 회원 계정 연결 시 반영됩니다.
            </p>
          </div>
        )}

        <div className="ohgo-profile-banner mb-3">
          <MemberListAvatar imageUrl={profileImageUrl} name={name} size={48} tone="light" />
          <div className="ohgo-profile-banner__body">
            <div className="ohgo-profile-banner__top">
              <div className="ohgo-profile-banner__name">
                <span className="text-truncate">{name}</span>
                {isGuestMember && (
                  <span className="ohgo-profile-banner__badge">기존</span>
                )}
              </div>
              <div className="ohgo-profile-banner__badges">
                {uuid && (
                  <button
                    type="button"
                    className="ohgo-profile-banner__badge"
                    onClick={() => setUuidModalVisible(true)}
                  >
                    UUID
                  </button>
                )}
                {rosterData && (
                  <button
                    type="button"
                    className="ohgo-profile-banner__badge"
                    onClick={handleNamePress}
                  >
                    명부
                  </button>
                )}
              </div>
            </div>
            <div className="ohgo-profile-banner__meta">
              <span>{formattedDob || '—'}</span>
              {!isGuestMember && (
                <button
                  type="button"
                  onClick={resetPoints}
                  className="ohgo-profile-banner__point"
                  disabled={isResettingPoints}
                >
                  {points.toLocaleString()}P
                </button>
              )}
              <span>{isGuestMember ? '등록' : '가입'} {createdAt || '—'}</span>
            </div>
            {contactPhone && (
              <div className="ohgo-profile-banner__actions">
                <button
                  type="button"
                  onClick={callMember}
                  className="ohgo-profile-banner__chip ohgo-profile-banner__chip--call"
                  aria-label={`${contactPhone} 전화 걸기`}
                >
                  <IoCallOutline size={14} aria-hidden />
                  {contactPhone}
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          className="mb-3"
          style={{
            ...OHGO_CARD,
            display: 'grid',
            gridTemplateColumns: isGuestMember ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
            padding: 0,
            overflow: 'hidden',
          }}
        >
          {statItems.map((item, index) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              disabled={!item.onClick}
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

        <div className="mb-3" style={{ ...OHGO_CARD, padding: 14 }}>
          <AdminAdjustBlock
            bordered
            label="스탬프 조정"
            currentCount={stampCount}
            accentColor="#1B6FF5"
            disabled={adjustBusy}
            minusAriaLabel="스탬프 조정"
            plusAriaLabel="스탬프 조정"
            onPress={() => openAdjustModal('stamp')}
            loading={isLoadingStamp}
          />

          <AdminAdjustBlock
            bordered
            label="쿠폰 조정"
            currentCount={couponCount}
            accentColor="#FF9500"
            disabled={adjustBusy}
            minusAriaLabel="쿠폰 조정"
            plusAriaLabel="쿠폰 조정"
            onPress={() => openAdjustModal('coupon')}
            plusStyle={{
              backgroundColor: '#FF9500',
              boxShadow: '0 4px 12px rgba(255,149,0,0.3)',
            }}
            loading={isLoadingCoupon}
          />

          {!isGuestMember && (
            <AdminAdjustBlock
              bordered
              label="승선 횟수 조정"
              currentCount={tripCount}
              accentColor="#007AFF"
              unit="회"
              disabled={adjustBusy}
              minusAriaLabel="승선 횟수 조정"
              plusAriaLabel="승선 횟수 조정"
              onPress={() => openAdjustModal('trip')}
              plusStyle={{
                backgroundColor: '#007AFF',
                boxShadow: '0 4px 12px rgba(0,122,255,0.3)',
              }}
              loading={isLoadingTrip}
            />
          )}

          {!isGuestMember && (
            <AdminAdjustBlock
              label="미끼 조정"
              currentCount={baitCoupons}
              accentColor="#2E7D32"
              disabled={adjustBusy}
              minusAriaLabel="미끼 조정"
              plusAriaLabel="미끼 조정"
              onPress={() => openAdjustModal('bait')}
              plusStyle={{
                backgroundColor: '#2E7D32',
                boxShadow: '0 4px 12px rgba(46,125,50,0.3)',
              }}
              loading={isLoadingBait}
            />
          )}
        </div>

        {!isGuestMember && (
        <div className="mb-3" style={{ ...OHGO_CARD, padding: 0, overflow: 'hidden' }}>
          {[
            {
              icon: IoDocumentTextOutline,
              iconColor: '#1B6FF5',
              label: '관리자 메모',
              count: memoCount,
              onClick: () => navigate(`/memo?uuid=${uuid}&name=${encodeURIComponent(name)}`),
            },
            {
              icon: IoListOutline,
              iconColor: '#00BCD4',
              label: '로그 보기',
              onClick: () => navigate(`/logs?uuid=${uuid}&name=${encodeURIComponent(name)}`),
            },
            {
              icon: IoPricetagOutline,
              iconColor: '#34C759',
              label: '스탬프 이력',
              onClick: () => navigate(`/stamp-history?uuid=${uuid}&name=${encodeURIComponent(name)}`),
            },
          ].map((item, idx) => (
            <div key={item.label}>
              {idx > 0 && (
                <div style={OHGO_LIST_DIVIDER} />
              )}
              <DetailMenuRow
                icon={item.icon}
                iconColor={item.iconColor}
                label={item.label}
                count={item.count}
                onClick={item.onClick}
              />
            </div>
          ))}
        </div>
        )}

        {isFirebaseDataSource() && !isGuestMember && duplicateAccounts.length > 0 && (
          <div className="mb-3" style={{ ...OHGO_CARD, padding: 14 }}>
            <div className="d-flex align-items-center gap-2 mb-2">
              <IoWarningOutline size={18} color="#FF9500" aria-hidden />
              <span className="ohgo-menu-list-row__title">중복 계정 통합</span>
            </div>
            <p style={{ fontSize: 12, color: '#6F767E', margin: '0 0 12px', fontFamily: OHGO_FONT, lineHeight: 1.45 }}>
              같은 이름·생년월일 계정이 {duplicateAccounts.length}건 더 있습니다. 남길 계정을 고르면 스탬프·명부가 그쪽으로 모입니다.
            </p>
            {[
              {
                uuid,
                name: displayName,
                dob: displayDob,
                stampCount,
                tripCount,
                lastStampTimeMs: undefined as number | undefined,
                isCurrent: true,
              },
              ...duplicateAccounts.map((d) => ({ ...d, isCurrent: false })),
            ].map((item) => (
              <label
                key={item.uuid}
                className="d-flex align-items-start gap-2"
                style={{ padding: '10px 0', borderTop: '1px solid #F7F8FA', fontFamily: OHGO_FONT }}
              >
                <input
                  type="radio"
                  name="keep-duplicate"
                  checked={keepMergeUuid === item.uuid}
                  onChange={() => setKeepMergeUuid(item.uuid)}
                  style={{ marginTop: 4 }}
                />
                <div className="min-w-0">
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1D1F' }}>
                    <span
                      className={nameHasOddWhitespace(item.name) ? 'ohgo-member-row-name--ws' : undefined}
                      style={
                        nameHasOddWhitespace(item.name)
                          ? { background: '#FFF3CD', borderRadius: 4, padding: '0 4px' }
                          : undefined
                      }
                    >
                      {nameHasOddWhitespace(item.name)
                        ? displayNameWithVisibleSpaces(item.name)
                        : item.name}
                    </span>
                    {item.isCurrent ? ' (현재)' : ''}
                  </div>
                  <div style={{ fontSize: 11, color: '#6F767E' }}>
                    스탬프 {item.stampCount} · 승선 {item.tripCount}
                  </div>
                  <div style={{ fontSize: 11, color: '#8A6D1B', wordBreak: 'break-word' }}>
                    사유 :{' '}
                    {describeDuplicateReason(
                      item.name,
                      item.dob,
                      item.isCurrent
                        ? duplicateAccounts[0]?.name ?? item.name
                        : displayName,
                      item.isCurrent
                        ? duplicateAccounts[0]?.dob ?? item.dob
                        : displayDob
                    )}
                  </div>
                </div>
              </label>
            ))}
            <button
              type="button"
              className="btn w-100 mt-2"
              disabled={duplicateMergeLoading}
              onClick={() => void mergeDuplicateAccounts()}
              style={OHGO_PRIMARY_BTN}
            >
              {duplicateMergeLoading ? '통합 중...' : '선택한 계정으로 통합'}
            </button>
          </div>
        )}

        {!isGuestMember && !legacyUuid && (
          <div className="mb-3" style={{ ...OHGO_CARD, padding: 14 }}>
            <div className="d-flex align-items-center gap-2 mb-2">
              <IoLinkOutline size={18} color="#1B6FF5" aria-hidden />
              <span className="ohgo-menu-list-row__title">게스트 계정 연결</span>
            </div>
            <p style={{ fontSize: 12, color: '#6F767E', margin: '0 0 12px', fontFamily: OHGO_FONT, lineHeight: 1.45 }}>
              승선명부에만 등록된 비회원(uuidv5)을 이 회원과 수동 연결합니다.
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

        {isGuestMember && (
          <div className="mb-3" style={{ ...OHGO_CARD, padding: 14 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT, lineHeight: 1.45 }}>
              신규 회원과 연결하려면 해당 신규 회원 상세의 「게스트 계정 연결」을 사용하세요.
              기존 회원 원본 레코드는 연결 표시만 갱신되며, 이름·생년월일·명부 내용은 변경되지 않습니다.
            </p>
          </div>
        )}

        {!isGuestMember && !legacyUuid && (
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
        )}

      <OhgoModal
        open={uuidModalVisible}
        onClose={closeUuidModal}
        title="UUID"
        footer={
          <>
            <OhgoModalButton variant="secondary" onClick={closeUuidModal}>
              닫기
            </OhgoModalButton>
            <OhgoModalButton variant="primary" onClick={() => void copyUuid()}>
              {uuidCopied ? '복사됨' : '복사'}
            </OhgoModalButton>
          </>
        }
      >
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'ui-monospace, monospace',
            lineHeight: 1.5,
            wordBreak: 'break-all',
            color: '#1A1D1F',
          }}
        >
          {uuid || '—'}
        </p>
      </OhgoModal>

      <BoardingInfoModal
        open={modalVisible}
        onClose={() => setModalVisible(false)}
        personName={name}
        data={rosterData}
        empty={!rosterData}
        footer={
          isGuestMember ? undefined : (
            <OhgoModalButton variant="primary" onClick={openBoardingEditor}>
              {rosterData ? '수정' : '작성'}
            </OhgoModalButton>
          )
        }
      />

      <OhgoModal
        open={adjustKind != null}
        onClose={closeAdjustModal}
        title={adjustKind ? ADJUST_META[adjustKind].title : '조정'}
        closeOnBackdrop={!adjustBusy}
        footer={
          <>
            <OhgoModalButton
              variant="secondary"
              onClick={closeAdjustModal}
              disabled={adjustBusy}
            >
              취소
            </OhgoModalButton>
            <OhgoModalButton
              variant="primary"
              onClick={() => void confirmAdjust()}
              disabled={!adjustReason || adjustDelta === 0 || adjustBusy}
            >
              {adjustBusy ? '처리 중...' : '확인'}
            </OhgoModalButton>
          </>
        }
      >
        {adjustKind && (
          <div>
            <div className="d-flex align-items-center justify-content-center gap-3 mb-3">
              <button
                type="button"
                style={{
                  ...ADMIN_QTY_SIDE_BTN,
                  backgroundColor: '#F2F3F5',
                  color: adjustQty <= 0 ? '#C4C4C4' : '#6F767E',
                }}
                disabled={adjustQty <= 0 || adjustBusy}
                onClick={() => setAdjustQty((q) => Math.max(0, q - 1))}
                aria-label="차감"
              >
                −
              </button>
              <div
                style={{
                  minWidth: 132,
                  textAlign: 'center',
                  fontFamily: OHGO_FONT,
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                  color: '#1A1D1F',
                }}
              >
                <span style={{ color: '#9A9FA5', fontWeight: 600 }}>
                  {adjustCurrentCount(adjustKind)}{ADJUST_META[adjustKind].unit}
                </span>
                <span style={{ margin: '0 8px', color: '#C4C4C4', fontWeight: 500 }}>→</span>
                <span
                  style={{
                    color:
                      adjustDelta === 0 ? '#1A1D1F' : adjustDelta > 0 ? '#FF3B30' : '#1B6FF5',
                  }}
                >
                  {adjustQty}{ADJUST_META[adjustKind].unit}
                </span>
              </div>
              <button
                type="button"
                style={{
                  ...ADMIN_QTY_SIDE_BTN,
                  backgroundColor: '#F2F3F5',
                  color: adjustQty >= adjustMaxQty(adjustKind) ? '#C4C4C4' : '#6F767E',
                }}
                disabled={adjustQty >= adjustMaxQty(adjustKind) || adjustBusy}
                onClick={() =>
                  setAdjustQty((q) => Math.min(adjustMaxQty(adjustKind), q + 1))
                }
                aria-label="적립"
              >
                +
              </button>
            </div>
            <label style={{ ...DETAIL_LABEL, display: 'block', marginBottom: 8 }}>
              사유 <span style={{ color: '#FF3B30' }}>*</span>
            </label>
            <select
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              disabled={adjustBusy}
              style={{ ...OHGO_INPUT, width: '100%', backgroundColor: '#FFFFFF' }}
            >
              <option value="">사유를 선택하세요</option>
              {ADJUST_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
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

