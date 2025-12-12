'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getStamps, getCouponCount, issue50PercentCoupon, deleteStamp } from '@/utils/stamp-service';
import { getUser } from '@/lib/storage';
import { FiTag, FiX } from 'react-icons/fi';
import { IoQrCodeOutline, IoPricetagOutline, IoGiftOutline } from 'react-icons/io5';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PageHeader from '@/components/PageHeader';

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
        className={`btn btn-light w-100 text-start p-3 border-0 shadow-sm ${
          isFifth ? 'bg-warning bg-opacity-10' : ''
        }`}
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
                    <div className={`fw-semibold mb-1 ${isFifth ? 'text-warning' : 'text-dark'}`}>
                      {date.replace(/-/g, '-')}, {time?.slice(0, 5)}
                    </div>
                    <div className={`small ${isFifth ? 'text-warning' : 'text-muted'}`}>
                      {isFifth ? '⭐ 50% 쿠폰 발급 가능 ⭐' : `적립 방법: ${methodLabel}`}
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
      <PageHeader title="스탬프" />
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
      <div className="container pb-4" style={{ paddingTop: '80px' }}>
        {/* 회원 정보 카드 */}
        <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: '12px' }}>
          <div className="card-body p-3">
            <div className="d-flex align-items-center mb-2">
              <IoPricetagOutline size={20} className="text-primary me-2" />
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

        {/* 스탬프 리스트 */}
        {stamps.length === 0 ? (
          <div className="card border-0 shadow-sm" style={{ borderRadius: '12px' }}>
            <div className="card-body text-center py-5 d-flex flex-column align-items-center">
              <IoPricetagOutline size={48} className="text-muted mb-3 opacity-50" />
              <p className="text-muted mb-0">스탬프가 아직 없어요!</p>
            </div>
          </div>
        ) : (
          <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: '12px' }}>
            <div className="card-body p-3">
              <div className="d-flex flex-column gap-2">
                {stamps.map((stamp, index) => renderStampItem(stamp, index))}
              </div>
            </div>
          </div>
        )}

        {/* 쿠폰 버튼 */}
        {!fromAdmin && (
          <button
            onClick={() => router.push(`/coupons?uuid=${user.uuid}&name=${user.name}&dob=${user.dob}`)}
            className="btn btn-primary w-100 d-flex align-items-center justify-content-center mt-4"
            style={{
              padding: '14px',
              fontSize: '1rem',
              fontWeight: '600',
              borderRadius: '12px',
              border: 'none',
              boxShadow: '0 2px 8px rgba(13, 110, 253, 0.3)'
            }}
          >
            <IoGiftOutline size={20} />
            <span>보유 쿠폰: {couponCount}개</span>
          </button>
        )}
      </div>

      {/* Stamp Modal */}
      {modalVisible && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header border-0" style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '20px'
              }}>
                <h5 className="modal-title text-white fw-bold mb-0">스탬프 정보</h5>
                <button 
                  type="button" 
                  className="btn-close btn-close-white" 
                  onClick={() => setModalVisible(false)}
                  style={{ opacity: 0.8 }}
                ></button>
              </div>
              <div className="modal-body p-4">
                <div className="mb-3">
                  <div className="small text-muted mb-1">적립일</div>
                  <div className="fw-semibold">{selectedStampInfo?.date}</div>
                </div>
                <div className="mb-3">
                  <div className="small text-muted mb-1">적립 방법</div>
                  <div className="fw-semibold">{selectedStampInfo?.method || '알 수 없음'}</div>
                </div>
                {fromAdmin && selectedStampInfo?.value && (
                  <button
                    onClick={async () => {
                      await deleteStamp(user.uuid!, selectedStampInfo.value!, user.name!, user.dob!);
                      await fetchStamps();
                      setModalVisible(false);
                    }}
                    className="btn btn-danger w-100"
                    style={{ borderRadius: '12px', padding: '12px' }}
                  >
                    스탬프 회수
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!fromAdmin && (
        <button
          onClick={() => router.push(`/qr-scan?uuid=${user.uuid}&name=${user.name}&dob=${user.dob}`)}
          className="btn btn-primary position-fixed rounded-circle d-flex align-items-center justify-content-center shadow-lg"
          style={{
            width: '64px',
            height: '64px',
            bottom: '24px',
            right: '24px',
            zIndex: 1000,
            border: 'none',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 8px 16px rgba(13, 110, 253, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
          }}
        >
          <IoQrCodeOutline size={32} className="text-white" />
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

