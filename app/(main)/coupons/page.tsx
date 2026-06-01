'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, getDocs, doc, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUser } from '@/lib/storage';
import { sendPushToUser } from '@/utils/send-push';
import { useCouponById as useCouponByIdFunc } from '@/utils/stamp-service';
import { IoGiftOutline, IoCheckmarkCircleOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
const CARD: React.CSSProperties = { backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: 'none' };

export async function checkPasswordFromFirestore(input: string): Promise<boolean> {
  const { doc, getDoc } = await import('firebase/firestore');
  const ref = doc(db, 'config', 'password');
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data();
  if (data.type !== 'useCoupon') return false;
  return input === data.value;
}

function CouponsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [coupons, setCoupons] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<any>(null);
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
    const ref = collection(db, `users/${user.uuid}/coupons`);
    const snapshot = await getDocs(ref);
    let list: any[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!fromAdmin) list = list.filter(c => !c.deleted);
    setCoupons(list);
  };

  useEffect(() => { if (user?.uuid) fetchCoupons(); }, [user?.uuid]);

  const handleRevoke = async () => {
    if (!user?.uuid || !selectedCoupon) return;
    try {
      await deleteDoc(doc(db, `users/${user.uuid}/coupons`, selectedCoupon.id));
      await fetchCoupons();
      await sendPushToUser({ uuid: user.uuid, title: '쿠폰 회수 알림', body: '선택한 쿠폰이 관리자에 의해 회수되었습니다.', data: { screen: 'coupons', uuid: user.uuid } });
    } catch { alert('회수 중 문제가 발생했습니다.'); }
    finally { setModalVisible(false); }
  };

  const handleUse = () => {
    if (!selectedCoupon) return;
    const msgs: string[] = [];
    const issuedAt = selectedCoupon?.issuedAt;
    const isTodayIssued = (issuedAt instanceof Timestamp && issuedAt.toDate().toDateString() === new Date().toDateString()) || (typeof issuedAt === 'string' && issuedAt === new Date().toISOString().split('T')[0]);
    if (isTodayIssued) msgs.push('- 금일 생성된 쿠폰입니다.');
    if (selectedCoupon?.isHalf === 'Y') msgs.push('- 50% 쿠폰입니다.');
    if (msgs.length > 0 && !confirm(msgs.join('\n') + '\n\n그래도 사용하시겠습니까?')) return;
    setModalVisible(false);
    setTimeout(() => setPasswordModalVisible(true), 200);
  };

  const handlePasswordSubmit = async () => {
    if (!user?.uuid || !selectedCoupon) return;
    const isValid = await checkPasswordFromFirestore(password);
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
    <div className="min-vh-100 pb-4" style={{ backgroundColor: '#F7F8FA', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <PageHeader title="쿠폰" />
      <div className="container py-3" style={{ maxWidth: 480 }}>

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
          <div className="py-5 text-center mb-4" style={CARD}>
            <IoGiftOutline size={48} color="#EFEFEF" />
            <p className="mt-3 mb-0" style={{ color: '#6F767E', fontFamily: FONT }}>사용 가능한 쿠폰이 없습니다.</p>
          </div>
        ) : (
          <div className="d-flex flex-column gap-2 mb-4">
            {usable.map(coupon => (
              <button
                key={coupon.id}
                type="button"
                onClick={() => { setSelectedCoupon(coupon); setModalVisible(true); }}
                className="btn w-100 text-start p-3"
                style={{ ...CARD, borderLeft: '4px solid #1B6FF5' }}
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
                <div key={coupon.id} className="p-3" style={{ ...CARD, opacity: 0.5, borderLeft: '4px solid #EFEFEF' }}>
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
      </div>

      {/* 쿠폰 상세 모달 */}
      {modalVisible && selectedCoupon && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0" style={{ borderRadius: 20, overflow: 'hidden' }}>
              <div className="modal-header border-0 px-4 pt-4 pb-2">
                <h5 className="modal-title fw-bold" style={{ color: '#1A1D1F', fontFamily: FONT }}>쿠폰 정보</h5>
                <button type="button" className="btn-close" onClick={() => setModalVisible(false)} />
              </div>
              <div className="modal-body px-4 pb-4">
                <div className="mb-3 p-3 rounded-3" style={{ backgroundColor: '#F7F8FA' }}>
                  <div style={{ fontSize: 12, color: '#6F767E' }}>쿠폰</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1D1F', fontFamily: FONT }}>{selectedCoupon.reason || '쿠폰'}</div>
                </div>
                <div className="mb-3 p-3 rounded-3" style={{ backgroundColor: '#F7F8FA' }}>
                  <div style={{ fontSize: 12, color: '#6F767E' }}>발급일</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1D1F', fontFamily: FONT }}>{selectedCoupon.issuedAt || '알 수 없음'}</div>
                </div>
                {selectedCoupon.isHalf === 'Y' && (
                  <div className="mb-3"><span className="badge rounded-pill" style={{ backgroundColor: '#FF9500', fontSize: 12 }}>50% 할인 쿠폰</span></div>
                )}
                {!selectedCoupon.used && (
                  <div className="d-grid gap-2">
                    <button type="button" onClick={handleUse} className="btn fw-semibold" style={{ backgroundColor: '#1B6FF5', color: '#fff', borderRadius: 12, padding: 13, border: 'none', fontFamily: FONT }}>쿠폰 사용</button>
                    {fromAdmin && (
                      <button type="button" onClick={handleRevoke} className="btn fw-semibold" style={{ backgroundColor: '#FF3B30', color: '#fff', borderRadius: 12, padding: 13, border: 'none', fontFamily: FONT }}>쿠폰 회수</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 비밀번호 모달 */}
      {passwordModalVisible && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0" style={{ borderRadius: 20, overflow: 'hidden' }}>
              <div className="modal-header border-0 px-4 pt-4 pb-2">
                <h5 className="modal-title fw-bold" style={{ color: '#1A1D1F', fontFamily: FONT }}>비밀번호 입력</h5>
                <button type="button" className="btn-close" onClick={() => { setPasswordModalVisible(false); setPassword(''); }} />
              </div>
              <div className="modal-body px-4 pb-4">
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className="form-control mb-3"
                  style={{ borderRadius: 12, padding: 12, fontFamily: FONT, border: '2px solid #EFEFEF' }}
                  onKeyDown={e => { if (e.key === 'Enter') handlePasswordSubmit(); }}
                />
                <div className="d-grid gap-2">
                  <button type="button" onClick={handlePasswordSubmit} className="btn fw-semibold" style={{ backgroundColor: '#1B6FF5', color: '#fff', borderRadius: 12, padding: 13, border: 'none', fontFamily: FONT }}>확인</button>
                  <button type="button" onClick={() => { setPasswordModalVisible(false); setPassword(''); }} className="btn fw-semibold" style={{ backgroundColor: '#F7F8FA', color: '#1A1D1F', borderRadius: 12, padding: 13, border: 'none', fontFamily: FONT }}>취소</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CouponsPage() {
  return (
    <Suspense fallback={<div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}><div className="spinner-border text-primary" /></div>}>
      <CouponsPageContent />
    </Suspense>
  );
}
