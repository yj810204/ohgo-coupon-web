'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, getDocs, doc, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUser } from '@/lib/storage';
import { sendPushToUser } from '@/utils/send-push';
import { useCouponById as useCouponByIdFunc } from '@/utils/stamp-service';
import { FiGift, FiX } from 'react-icons/fi';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

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

  const { containerRef, isRefreshing: isPulling, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: true,
  });

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
      ref={containerRef}
      className="min-h-screen bg-gray-50"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}
    >
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
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-blue-600 mb-6">쿠폰</h1>

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-3">사용 가능한 쿠폰 ({usableCoupons.length}개)</h2>
            {usableCoupons.length === 0 ? (
              <p className="text-gray-500 text-center py-8">사용 가능한 쿠폰이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {usableCoupons.map((coupon) => (
                  <button
                    key={coupon.id}
                    onClick={() => {
                      setSelectedCoupon(coupon);
                      setModalVisible(true);
                    }}
                    className="w-full bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow text-left"
                  >
                    <div className="flex items-center">
                      <FiGift size={24} className="text-red-500 mr-3" />
                      <div>
                        <p className="font-semibold">{coupon.reason || '쿠폰'}</p>
                        <p className="text-sm text-gray-600">
                          발급일: {coupon.issuedAt || '알 수 없음'}
                          {coupon.isHalf === 'Y' && ' (50% 할인)'}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {usedCoupons.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">사용된 쿠폰 ({usedCoupons.length}개)</h2>
              <div className="space-y-3">
                {usedCoupons.map((coupon) => (
                  <div
                    key={coupon.id}
                    className="w-full bg-gray-100 p-4 rounded-lg opacity-60"
                  >
                    <div className="flex items-center">
                      <FiGift size={24} className="text-gray-400 mr-3" />
                      <div>
                        <p className="font-semibold line-through">{coupon.reason || '쿠폰'}</p>
                        <p className="text-sm text-gray-500">
                          발급일: {coupon.issuedAt || '알 수 없음'} (사용됨)
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Coupon Modal */}
      {modalVisible && selectedCoupon && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">쿠폰 정보</h2>
              <button onClick={() => setModalVisible(false)}>
                <FiX size={24} className="text-gray-500" />
              </button>
            </div>
            <p className="text-gray-700 mb-2">쿠폰: {selectedCoupon.reason || '쿠폰'}</p>
            <p className="text-gray-700 mb-2">발급일: {selectedCoupon.issuedAt || '알 수 없음'}</p>
            {selectedCoupon.isHalf === 'Y' && (
              <p className="text-yellow-600 font-semibold mb-4">50% 할인 쿠폰</p>
            )}
            {!selectedCoupon.used && (
              <div className="space-y-2">
                <button
                  onClick={handleUse}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700"
                >
                  쿠폰 사용
                </button>
                {fromAdmin && (
                  <button
                    onClick={handleRevoke}
                    className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700"
                  >
                    쿠폰 회수
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Password Modal */}
      {passwordModalVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">비밀번호 입력</h2>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setPasswordModalVisible(false);
                  setPassword('');
                }}
                className="flex-1 bg-gray-300 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-400"
              >
                취소
              </button>
              <button
                onClick={handlePasswordSubmit}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700"
              >
                확인
              </button>
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

