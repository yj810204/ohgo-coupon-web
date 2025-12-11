'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getStamps, getCouponCount, issue50PercentCoupon, deleteStamp } from '@/utils/stamp-service';
import { getUser } from '@/lib/storage';
import { FiTag, FiX } from 'react-icons/fi';
import { IoQrCodeOutline } from 'react-icons/io5';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

function StampPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stamps, setStamps] = useState<string[]>([]);
  const [couponCount, setCouponCount] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedStampInfo, setSelectedStampInfo] = useState<{ date: string; method?: string; index?: number; value?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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

  const fetchStamps = useCallback(async () => {
    if (!user?.uuid) return;
  
    try {
      const data = await getStamps(user.uuid);
      
      // 날짜 + 시간 기준으로 최신순 정렬
      const sorted = [...data].sort((a, b) => {
        const [dateA, , timeA] = a.split('|');
        const [dateB, , timeB] = b.split('|');
        try {
          const dateAObj = new Date(`20${dateA.replace(/-/g, '-')}T${timeA || '00:00:00'}`);
          const dateBObj = new Date(`20${dateB.replace(/-/g, '-')}T${timeB || '00:00:00'}`);
          return dateBObj.getTime() - dateAObj.getTime();
        } catch (e) {
          return 0;
        }
      });
    
      setStamps(sorted);
    
      const coupons = await getCouponCount(user.uuid);
      setCouponCount(coupons);
    } catch (error) {
      console.error('스탬프 조회 오류:', error);
      setStamps([]);
    }
  }, [user?.uuid]);

  useEffect(() => {
    if (user?.uuid) {
      fetchStamps();
    }
  }, [user?.uuid, fetchStamps]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStamps();
    setRefreshing(false);
  };

  const { containerRef, isRefreshing: isPulling, pullProgress } = usePullToRefresh({
    onRefresh: onRefresh,
    enabled: true,
  });

  const renderStampItem = (raw: string, index: number) => {
    if (!raw) return null;
    const [date, method, time] = raw.split('|');
    const methodLabel = method === 'ADMIN' ? '선장님' : method === 'QR' ? 'QR 스캔' : '알 수 없음';
  
    const fifthStampRaw = stamps[stamps.length - 5];
    const isFifth = raw === fifthStampRaw && stamps.length >= 5;
  
    return (
      <button
        key={index}
        onClick={() => {
          if (isFifth && !fromAdmin) {
            if (confirm('50% 할인 쿠폰을 발급하시겠습니까?')) {
              issue50PercentCoupon(user!.uuid!).then(() => {
                alert('🎉 쿠폰 발급 완료: 50% 쿠폰이 발급되었습니다!');
                fetchStamps();
              }).catch(err => alert('오류: ' + err.message));
            }
          } else {
            setSelectedStampInfo({
              date: `${date} ${time}`,
              method: methodLabel,
              index,
              value: raw,
            });
            setModalVisible(true);
          }
        }}
        className={`w-full p-4 mb-3 rounded-lg border-2 ${
          isFifth 
            ? 'bg-yellow-50 border-yellow-400 border-l-4' 
            : 'bg-white border-gray-200'
        } hover:shadow-md transition-shadow`}
      >
        <div className="flex items-center">
          <FiTag 
            size={24} 
            className={isFifth ? 'text-yellow-600 mr-3' : 'text-green-600 mr-3'} 
          />
          <div>
            <p className={`font-medium ${isFifth ? 'text-yellow-800' : 'text-gray-800'}`}>
              {date.replace(/-/g, '-')}, {time?.slice(0, 5)}
            </p>
            <p className={`text-sm ${isFifth ? 'text-yellow-700' : 'text-gray-600'}`}>
              {isFifth ? '⭐ 50% 쿠폰 발급 가능 ⭐' : `적립 방법: ${methodLabel}`}
            </p>
          </div>
        </div>
      </button>
    );
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
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <h1 className="text-2xl font-bold text-blue-600 mb-2">
            스탬프 현황 {fromAdmin && <span className="text-sm text-gray-500">(관리자모드)</span>}
          </h1>
          <p className="text-sm text-gray-600">
            회원정보 : {user.name} / {user.dob?.length === 8 ? `${user.dob.slice(2, 4)}-${user.dob.slice(4, 6)}-${user.dob.slice(6, 8)}` : user.dob}
          </p>
        </div>

        {stamps.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-600">스탬프가 아직 없어요!</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            {stamps.map((stamp, index) => renderStampItem(stamp, index))}
          </div>
        )}

        <div className="space-y-3">
          {!fromAdmin && (
            <button
              onClick={() => router.push(`/coupons?uuid=${user.uuid}&name=${user.name}&dob=${user.dob}`)}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700"
            >
              보유 쿠폰: {couponCount}개
            </button>
          )}
        </div>
      </div>

      {/* Stamp Modal */}
      {modalVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">스탬프 정보</h2>
              <button onClick={() => setModalVisible(false)}>
                <FiX size={24} className="text-gray-500" />
              </button>
            </div>
            <p className="text-gray-700 mb-2">적립일: {selectedStampInfo?.date}</p>
            <p className="text-gray-700 mb-4">적립 방법: {selectedStampInfo?.method || '알 수 없음'}</p>
            {fromAdmin && selectedStampInfo?.value && (
              <button
                onClick={async () => {
                  await deleteStamp(user.uuid!, selectedStampInfo.value!, user.name!, user.dob!);
                  await fetchStamps();
                  setModalVisible(false);
                }}
                className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700"
              >
                스탬프 회수
              </button>
            )}
          </div>
        </div>
      )}

      {!fromAdmin && (
        <button
          onClick={() => router.push(`/qr-scan?uuid=${user.uuid}&name=${user.name}&dob=${user.dob}`)}
          className="fixed bottom-8 right-8 w-20 h-20 bg-pink-600 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow"
        >
          <IoQrCodeOutline size={40} className="text-white" />
        </button>
      )}
    </div>
  );
}

export default function StampPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    }>
      <StampPageContent />
    </Suspense>
  );
}

