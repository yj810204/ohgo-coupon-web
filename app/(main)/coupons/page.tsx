'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, getDocs, doc, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUser } from '@/lib/storage';
import { sendPushToUser } from '@/utils/send-push';
import { useCouponById as useCouponByIdFunc } from '@/utils/stamp-service';
import { FiGift, FiX } from 'react-icons/fi';
import { IoGiftOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';

export async function checkPasswordFromFirestore(input: string): Promise<boolean> {
  const { doc, getDoc } = await import('firebase/firestore');
  const ref = doc(db, 'config', 'password');
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    console.warn('❗ config/password 문서가 존재하지 않습니다.');
    return false;
  }

  const data = snap.data();
  const serverPassword = data.value;
  const type = data.type;

  if (type !== 'useCoupon') {
    console.warn('❗ type이 useCoupon이 아님:', type);
    return false;
  }

  return input === serverPassword;
}

function CouponsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [coupons, setCoupons] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
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
        // 관리자 모드: URL 파라미터의 회원 정보 사용
        setUser({
          uuid: targetUuid,
          name: targetName,
          dob: targetDob,
        });
      } else {
        // 일반 모드: 로그인한 사용자 정보 사용
        const u = await getUser();
        if (!u?.uuid) {
          router.replace('/login');
          return;
        }
        setUser(u);
      }
    };
    loadUser();
  }, [router, fromAdmin, targetUuid, targetName, targetDob]);

  const fetchCoupons = async () => {
    if (!user?.uuid) return;
    const ref = collection(db, `users/${user.uuid}/coupons`);
    const snapshot = await getDocs(ref);
    let list: any[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
    // 일반 사용자 → 삭제된 것만 필터링
    if (!fromAdmin) {
      list = list.filter(c => !c.deleted);
    }
  
    setCoupons(list);
  };

  useEffect(() => {
    if (user?.uuid) {
      fetchCoupons();
    }
  }, [user?.uuid]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCoupons();
    setRefreshing(false);
  };


  const handleRevoke = async () => {
    if (!user?.uuid || !selectedCoupon) return;
    try {
      await deleteDoc(doc(db, `users/${user.uuid}/coupons`, selectedCoupon.id));
      await fetchCoupons();
      await sendPushToUser({
        uuid: user.uuid,
        title: '쿠폰 회수 알림',
        body: '선택한 쿠폰이 관리자에 의해 회수되었습니다.',
        data: {
          screen: 'coupons',
          uuid: user.uuid,
        },
      });
    } catch {
      alert('오류: 회수 중 문제가 발생했습니다.');
    } finally {
      setModalVisible(false);
    }
  };

  const handleUse = () => {
    if (!selectedCoupon) return;
    const messages: string[] = [];
  
    const issuedAt = selectedCoupon?.issuedAt;
    const isTodayIssued =
      (issuedAt instanceof Timestamp && issuedAt.toDate().toDateString() === new Date().toDateString()) ||
      (typeof issuedAt === 'string' && issuedAt === new Date().toISOString().split('T')[0]);
  
    if (isTodayIssued) messages.push('- 금일 생성된 쿠폰입니다.');
    if (selectedCoupon?.isHalf === 'Y') messages.push('- 50% 쿠폰입니다.');
  
    if (messages.length > 0) {
      const warningText = messages.join('\n') + '\n\n그래도 사용하시겠습니까?';
      if (!confirm(warningText)) return;
    }
    
    setModalVisible(false);
    setTimeout(() => {
      setPasswordModalVisible(true);
    }, 200);
  };

  const handlePasswordSubmit = async () => {
    if (!user?.uuid || !selectedCoupon) return;
    const isValid = await checkPasswordFromFirestore(password);
    if (!isValid) {
      alert('비밀번호가 올바르지 않습니다.');
      return;
    }

    try {
      await useCouponByIdFunc(user.uuid, selectedCoupon.id);
      await fetchCoupons();
      setPasswordModalVisible(false);
      setPassword('');
      alert('쿠폰이 사용되었습니다.');
    } catch (error: any) {
      alert('오류: ' + error.message);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  const usableCoupons = coupons.filter(c => !c.used);
  const usedCoupons = coupons.filter(c => c.used);

  return (
    <div 
      className="min-h-screen bg-gray-50"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}
    >
      <PageHeader title="쿠폰" />
      <div className="container pb-4" style={{ paddingTop: '80px' }}>
        {/* 회원 정보 카드 */}
        <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: '12px' }}>
          <div className="card-body p-3">
            <div className="d-flex align-items-center mb-2">
              <IoGiftOutline size={20} className="text-danger me-2 flex-shrink-0" />
              <span className="text-muted small">회원정보</span>
            </div>
            <div className="ps-4">
              <div className="fw-semibold">{user.name}</div>
              <div className="small text-muted">
                {user.dob?.length === 8 ? `${user.dob.slice(2, 4)}-${user.dob.slice(4, 6)}-${user.dob.slice(6, 8)}` : user.dob}
                {fromAdmin && <span className="ms-2 text-primary">(관리자모드)</span>}
              </div>
            </div>
          </div>
        </div>

        {/* 사용 가능한 쿠폰 */}
        <div className="mb-4">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h5 className="mb-0 fw-semibold">사용 가능한 쿠폰</h5>
            <span className="badge bg-primary rounded-pill">{usableCoupons.length}개</span>
          </div>
            {usableCoupons.length === 0 ? (
            <div className="card border-0 shadow-sm" style={{ borderRadius: '12px' }}>
              <div className="card-body text-center py-5 d-flex flex-column align-items-center">
                <IoGiftOutline size={48} className="text-muted mb-3 opacity-50" />
                <p className="text-muted mb-0">사용 가능한 쿠폰이 없습니다.</p>
              </div>
            </div>
            ) : (
            <div className="d-flex flex-column gap-2">
                {usableCoupons.map((coupon) => (
                  <button
                    key={coupon.id}
                    onClick={() => {
                      setSelectedCoupon(coupon);
                      setModalVisible(true);
                    }}
                  className="btn btn-light w-100 text-start p-3 border-0 shadow-sm"
                  style={{ 
                    borderRadius: '12px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  }}
                >
                  <div className="flex-grow-1">
                    <div className="fw-semibold mb-1">{coupon.reason || '쿠폰'}</div>
                    <div className="small text-muted">
                          발급일: {coupon.issuedAt || '알 수 없음'}
                      {coupon.isHalf === 'Y' && <span className="ms-2 text-warning">(50% 할인)</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

        {/* 사용된 쿠폰 */}
          {usedCoupons.length > 0 && (
            <div>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h5 className="mb-0 fw-semibold">사용된 쿠폰</h5>
              <span className="badge bg-secondary rounded-pill">{usedCoupons.length}개</span>
            </div>
            <div className="d-flex flex-column gap-2">
                {usedCoupons.map((coupon) => (
                  <div
                    key={coupon.id}
                  className="card border-0 shadow-sm opacity-60"
                  style={{ borderRadius: '12px' }}
                  >
                  <div className="card-body p-3">
                    <div className="flex-grow-1">
                      <div className="fw-semibold text-decoration-line-through text-muted mb-1">{coupon.reason || '쿠폰'}</div>
                      <div className="small text-muted">
                          발급일: {coupon.issuedAt || '알 수 없음'} (사용됨)
                      </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
      </div>

      {/* Coupon Modal */}
      {modalVisible && selectedCoupon && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header border-0" style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '20px'
              }}>
                <h5 className="modal-title text-white fw-bold mb-0">쿠폰 정보</h5>
                <button 
                  type="button" 
                  className="btn-close btn-close-white" 
                  onClick={() => setModalVisible(false)}
                  style={{ opacity: 0.8 }}
                ></button>
              </div>
              <div className="modal-body p-4">
                <div className="mb-3">
                  <div className="small text-muted mb-1">쿠폰</div>
                  <div className="fw-semibold">{selectedCoupon.reason || '쿠폰'}</div>
                </div>
                <div className="mb-3">
                  <div className="small text-muted mb-1">발급일</div>
                  <div className="fw-semibold">{selectedCoupon.issuedAt || '알 수 없음'}</div>
            </div>
            {selectedCoupon.isHalf === 'Y' && (
                  <div className="mb-3">
                    <span className="badge bg-warning text-dark">50% 할인 쿠폰</span>
                  </div>
            )}
            {!selectedCoupon.used && (
                  <div className="d-grid gap-2">
                <button
                  onClick={handleUse}
                      className="btn btn-primary"
                      style={{ borderRadius: '12px', padding: '12px' }}
                >
                  쿠폰 사용
                </button>
                {fromAdmin && (
                  <button
                    onClick={handleRevoke}
                        className="btn btn-danger"
                        style={{ borderRadius: '12px', padding: '12px' }}
                  >
                    쿠폰 회수
                  </button>
                )}
              </div>
            )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {passwordModalVisible && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header border-0" style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '20px'
              }}>
                <h5 className="modal-title text-white fw-bold mb-0">비밀번호 입력</h5>
                <button 
                  type="button" 
                  className="btn-close btn-close-white" 
                  onClick={() => {
                    setPasswordModalVisible(false);
                    setPassword('');
                  }}
                  style={{ opacity: 0.8 }}
                ></button>
              </div>
              <div className="modal-body p-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
                  className="form-control mb-3"
                  style={{ borderRadius: '12px', padding: '12px' }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handlePasswordSubmit();
                    }
                  }}
            />
                <div className="d-grid gap-2">
                  <button
                    onClick={handlePasswordSubmit}
                    className="btn btn-primary"
                    style={{ borderRadius: '12px', padding: '12px' }}
                  >
                    확인
                  </button>
              <button
                onClick={() => {
                  setPasswordModalVisible(false);
                  setPassword('');
                }}
                    className="btn btn-secondary"
                    style={{ borderRadius: '12px', padding: '12px' }}
              >
                취소
              </button>
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
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    }>
      <CouponsPageContent />
    </Suspense>
  );
}

