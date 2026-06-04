'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { sendPushToUser } from '@/utils/send-push';
import {
  getCoupons,
  revokeCoupon,
  useCouponById as useCouponByIdFunc,
  type CouponItem,
} from '@/utils/stamp-service';
import { verifyUseCouponPassword } from '@/utils/use-coupon-password';
import { IoGiftOutline, IoCheckmarkCircleOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, { OhgoModalButton, OhgoModalField } from '@/components/OhgoModal';
import EmptyState from '@/components/EmptyState';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
const CARD: React.CSSProperties = { backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: 'none' };

function CouponsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<CouponItem | null>(null);
  const [password, setPassword] = useState('');
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [user, setUser] = useState<{ uuid?: string; name?: string; dob?: string } | null>(null);
  const fromAdmin = searchParams.get('fromAdmin') === 'true';
  const targetUuid = searchParams.get('uuid');
  const targetName = searchParams.get('name');
  const targetDob = searchParams.get('dob');

  useEffect(() => {
    const loadUser = async () => {
      if (fromAdmin && targetUuid && targetName && targetDob) {
        setUser({ uuid: targetUuid, name: targetName, dob: targetDob });
      } else {
        const u = await getUser();
        if (!u?.uuid) { router.replace('/login'); return; }
        setUser(u);
      }
    };
    loadUser();
  }, [router, fromAdmin, targetUuid, targetName, targetDob]);

  const fetchCoupons = async () => {
    if (!user?.uuid) return;
    let list = await getCoupons(user.uuid);
    if (!fromAdmin) list = list.filter(c => !c.deleted);
    setCoupons(list);
  };

  useEffect(() => { if (user?.uuid) fetchCoupons(); }, [user?.uuid]);

  const handleRevoke = async () => {
    if (!user?.uuid || !selectedCoupon) return;
    try {
      await revokeCoupon(user.uuid, selectedCoupon.id);
      await fetchCoupons();
      await sendPushToUser({ uuid: user.uuid, title: '쿠폰 회수 알림', body: '선택한 쿠폰이 관리자에 의해 회수되었습니다.', data: { screen: 'coupons', uuid: user.uuid } });
    } catch { alert('회수 중 문제가 발생했습니다.'); }
    finally { setModalVisible(false); }
  };

  const handleUse = () => {
    if (!selectedCoupon) return;
    const msgs: string[] = [];
    const issuedAt = selectedCoupon?.issuedAt;
    const isTodayIssued =
      typeof issuedAt === 'string' && issuedAt === new Date().toISOString().split('T')[0];
    if (isTodayIssued) msgs.push('- 금일 생성된 쿠폰입니다.');
    if (selectedCoupon?.isHalf === 'Y') msgs.push('- 50% 쿠폰입니다.');
    if (msgs.length > 0 && !confirm(msgs.join('\n') + '\n\n그래도 사용하시겠습니까?')) return;
    setModalVisible(false);
    setTimeout(() => setPasswordModalVisible(true), 200);
  };

  const handlePasswordSubmit = async () => {
    if (!user?.uuid || !selectedCoupon) return;
    const isValid = await verifyUseCouponPassword(password);
    if (!isValid) { alert('비밀번호가 올바르지 않습니다.'); return; }
    try {
      await useCouponByIdFunc(user.uuid, selectedCoupon.id);
      await fetchCoupons();
      setPasswordModalVisible(false);
      setPassword('');
      alert('쿠폰이 사용되었습니다.');
    } catch (error: any) { alert('오류: ' + error.message); }
  };

  if (!user) return <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}><div className="spinner-border text-primary" /></div>;

  const usable = coupons.filter(c => !c.used);
  const used = coupons.filter(c => c.used);

  return (
    <SubPageFrame title="쿠폰" onRefresh={fetchCoupons}>
        {/* 회원 정보 */}
        <div className="mb-4 p-3" style={{ ...CARD }}>
          <div className="d-flex align-items-center gap-3">
            <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: 44, height: 44, backgroundColor: '#EBF1FE' }}>
              <IoGiftOutline size={22} color="#1B6FF5" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>{user.name}</div>
              <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
                {user.dob?.length === 8 ? `${user.dob.slice(0, 4)}.${user.dob.slice(4, 6)}.${user.dob.slice(6)}` : user.dob}
                {fromAdmin && <span className="ms-2 badge rounded-pill" style={{ backgroundColor: '#FF9500', fontSize: 11 }}>관리자 모드</span>}
              </div>
            </div>
            <div className="ms-auto text-end">
              <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>사용 가능</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1B6FF5', fontFamily: FONT }}>{usable.length}장</div>
            </div>
          </div>
        </div>

        {/* 사용 가능한 쿠폰 */}
        <div className="d-flex align-items-center justify-content-between mb-2 px-1">
          <span style={{ fontSize: 17, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>사용 가능한 쿠폰</span>
          <span className="badge rounded-pill" style={{ backgroundColor: '#1B6FF5', fontSize: 12 }}>{usable.length}개</span>
        </div>

        {usable.length === 0 ? (
          <EmptyState
            icon={IoGiftOutline}
            message="사용 가능한 쿠폰이 없습니다."
            className="mb-4"
            style={CARD}
          />
        ) : (
          <div className="d-flex flex-column gap-2 mb-4">
            {usable.map(coupon => (
              <button
                key={coupon.id}
                type="button"
                onClick={() => { setSelectedCoupon(coupon); setModalVisible(true); }}
                className="btn w-100 text-start p-3"
                style={CARD}
              >
                <div className="d-flex align-items-center gap-3">
                  <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: 40, height: 40, backgroundColor: '#EBF1FE' }}>
                    <IoGiftOutline size={20} color="#1B6FF5" />
                  </div>
                  <div className="flex-grow-1">
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1D1F', fontFamily: FONT }}>{coupon.reason || '쿠폰'}</div>
                    <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginTop: 2 }}>발급일: {coupon.issuedAt || '알 수 없음'}</div>
                  </div>
                  {coupon.isHalf === 'Y' && (
                    <span className="badge rounded-pill" style={{ backgroundColor: '#FF9500', fontSize: 11, flexShrink: 0 }}>50%</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 사용된 쿠폰 */}
        {used.length > 0 && (
          <>
            <div className="d-flex align-items-center justify-content-between mb-2 px-1">
              <span style={{ fontSize: 17, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>사용된 쿠폰</span>
              <span className="badge rounded-pill" style={{ backgroundColor: '#6F767E', fontSize: 12 }}>{used.length}개</span>
            </div>
            <div className="d-flex flex-column gap-2">
              {used.map(coupon => (
                <div key={coupon.id} className="p-3" style={{ ...CARD, opacity: 0.5 }}>
                  <div className="d-flex align-items-center gap-3">
                    <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{ width: 40, height: 40, backgroundColor: '#F7F8FA' }}>
                      <IoCheckmarkCircleOutline size={20} color="#6F767E" />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#6F767E', textDecoration: 'line-through', fontFamily: FONT }}>{coupon.reason || '쿠폰'}</div>
                      <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginTop: 2 }}>발급일: {coupon.issuedAt || '알 수 없음'} (사용됨)</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

      <OhgoModal
        open={modalVisible && !!selectedCoupon}
        onClose={() => setModalVisible(false)}
        closeOnBackdrop
        title="쿠폰 정보"
        footer={
          selectedCoupon && !selectedCoupon.used ? (
            <>
              <OhgoModalButton onClick={handleUse}>쿠폰 사용</OhgoModalButton>
              {fromAdmin ? (
                <OhgoModalButton variant="danger" onClick={handleRevoke}>
                  회수
                </OhgoModalButton>
              ) : null}
            </>
          ) : undefined
        }
      >
        {selectedCoupon && (
          <>
            <OhgoModalField label="쿠폰" value={selectedCoupon.reason || '쿠폰'} />
            <OhgoModalField label="발급일" value={selectedCoupon.issuedAt || '알 수 없음'} />
            {selectedCoupon.isHalf === 'Y' && (
              <div className="mb-2">
                <span className="badge rounded-pill" style={{ backgroundColor: '#FF9500', fontSize: 12 }}>
                  50% 할인 쿠폰
                </span>
              </div>
            )}
          </>
        )}
      </OhgoModal>

      <OhgoModal
        open={passwordModalVisible}
        onClose={() => {
          setPasswordModalVisible(false);
          setPassword('');
        }}
        closeOnBackdrop
        title="비밀번호 입력"
        footer={
          <>
            <OhgoModalButton
              variant="secondary"
              onClick={() => {
                setPasswordModalVisible(false);
                setPassword('');
              }}
            >
              취소
            </OhgoModalButton>
            <OhgoModalButton onClick={handlePasswordSubmit}>확인</OhgoModalButton>
          </>
        }
      >
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="비밀번호를 입력하세요"
          className="form-control"
          style={{ borderRadius: 12, padding: 12, fontFamily: FONT, border: '2px solid #EFEFEF' }}
          onKeyDown={e => {
            if (e.key === 'Enter') handlePasswordSubmit();
          }}
        />
      </OhgoModal>
    </SubPageFrame>
  );
}

export default function CouponsPage() {
  return (
    <Suspense fallback={<div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}><div className="spinner-border text-primary" /></div>}>
      <CouponsPageContent />
    </Suspense>
  );
}
