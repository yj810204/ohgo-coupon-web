'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getStamps, getCouponCount, addStamp, addStampBatch, deleteUser } from '@/utils/stamp-service';
import { sendPushToUser } from '@/utils/send-push';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

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
  const [refreshing, setRefreshing] = useState(false);
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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCounts();
    await loadTargetUserInfo();
    setRefreshing(false);
  };

  const { containerRef, isRefreshing: isPulling, pullProgress } = usePullToRefresh({
    onRefresh: onRefresh,
    enabled: true,
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

  return (
    <div 
      ref={containerRef}
      className="min-vh-100 bg-light"
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
      <div className="container py-4">
        <div className="card shadow-sm mb-3">
          <div className="card-body">
            <div className="mb-2">
              <span className="text-muted me-2">이름:</span>
              <button
                onClick={handleNamePress}
                className="btn btn-link p-0 text-primary text-decoration-underline"
              >
                {name}
              </button>
            </div>
            <div className="mb-2">
              <span className="text-muted me-2">생년월일:</span>
              <span>
                {dob?.length === 8
                  ? `${dob.slice(2, 4)}-${dob.slice(4, 6)}-${dob.slice(6, 8)}`
                  : dob}
              </span>
            </div>
            <div className="mb-2">
              <span className="text-muted me-2">가입일:</span>
              <span>{createdAt}</span>
            </div>
            <div className="mb-2">
              <span className="text-muted me-2">포인트:</span>
              <button
                onClick={resetPoints}
                className="btn btn-link p-0 text-primary text-decoration-underline"
                disabled={isResettingPoints}
              >
                {points.toLocaleString()}P
              </button>
            </div>
            <div className="mb-2">
              <span className="text-muted me-2">UUID:</span>
              <button
                onClick={() => alert('UUID: ' + uuid)}
                className="btn btn-link p-0 text-primary text-decoration-underline"
              >
                눌러서 확인
              </button>
            </div>
          </div>
        </div>

        <div className="row g-3 mb-3">
          <div className="col-4">
            <button
              onClick={() => router.push(`/stamp?uuid=${uuid}&name=${name}&dob=${dob}&fromAdmin=true`)}
              className="btn btn-light w-100 h-100 d-flex flex-column align-items-center justify-content-center shadow-sm"
              style={{ minHeight: '100px' }}
            >
              <div className="text-muted small mb-1">스탬프</div>
              <div className="fs-4 fw-bold">{stampCount}</div>
            </button>
          </div>
          <div className="col-4">
            <button
              onClick={() => router.push(`/coupons?uuid=${uuid}&name=${name}&dob=${dob}&fromAdmin=true`)}
              className="btn btn-light w-100 h-100 d-flex flex-column align-items-center justify-content-center shadow-sm"
              style={{ minHeight: '100px' }}
            >
              <div className="text-muted small mb-1">쿠폰</div>
              <div className="fs-4 fw-bold">{couponCount}</div>
            </button>
          </div>
          <div className="col-4">
            <button
              onClick={() => setBaitModalVisible(true)}
              className="btn btn-light w-100 h-100 d-flex flex-column align-items-center justify-content-center shadow-sm"
              style={{ minHeight: '100px' }}
            >
              <div className="text-muted small mb-1">교환권</div>
              <div className="fs-4 fw-bold">{baitCoupons}</div>
            </button>
          </div>
        </div>

        <div className="d-grid gap-2">
          <div className="btn-group" role="group">
            <button
              className="btn btn-primary d-flex align-items-center justify-content-center"
              onClick={handleAddStamp}
              disabled={isLoadingOne || isLoadingFive}
              style={{
                padding: '12px',
                fontSize: '1rem',
                fontWeight: '500',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              {isLoadingOne ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  적립 중...
                </>
              ) : (
                '스탬프 +1'
              )}
            </button>
            <button
              className="btn btn-primary d-flex align-items-center justify-content-center"
              onClick={handleAddStampFive}
              disabled={isLoadingOne || isLoadingFive}
              style={{
                padding: '12px',
                fontSize: '1rem',
                fontWeight: '500',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              {isLoadingFive ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  적립 중...
                </>
              ) : (
                '스탬프 +5'
              )}
            </button>
            <button
              className="btn btn-warning d-flex align-items-center justify-content-center"
              onClick={() => setBaitModalVisible(true)}
              disabled={isLoadingBait}
              style={{
                padding: '12px',
                fontSize: '1rem',
                fontWeight: '500',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              {isLoadingBait ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  처리 중...
                </>
              ) : (
                '교환권 +1'
              )}
            </button>
          </div>

          <hr />

          <button
            className="btn text-white d-flex align-items-center justify-content-center"
            style={{ 
              backgroundColor: '#8E44AD',
              padding: '12px',
              fontSize: '1rem',
              fontWeight: '500',
              borderRadius: '8px',
              transition: 'all 0.2s ease'
            }}
            onClick={() => router.push(`/memo?uuid=${uuid}&name=${name}`)}
          >
            관리자 메모
          </button>

          <hr />

          <div className="btn-group" role="group">
            <button
              className="btn text-white d-flex align-items-center justify-content-center"
              style={{ 
                backgroundColor: '#607D8B',
                padding: '12px',
                fontSize: '1rem',
                fontWeight: '500',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
              onClick={() => router.push(`/logs?uuid=${uuid}&name=${name}`)}
            >
              로그 보기
            </button>
            <button
              className="btn text-white d-flex align-items-center justify-content-center"
              style={{ 
                backgroundColor: '#009688',
                padding: '12px',
                fontSize: '1rem',
                fontWeight: '500',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
              onClick={() => router.push(`/stamp-history?uuid=${uuid}&name=${name}`)}
            >
              스탬프 이력
            </button>
          </div>

          <hr />

          <button
            className="btn btn-danger d-flex align-items-center justify-content-center"
            onClick={handleDeleteUser}
            disabled={isDeleting}
            style={{
              padding: '12px',
              fontSize: '1rem',
              fontWeight: '500',
              borderRadius: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            {isDeleting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                회원 삭제중...
              </>
            ) : (
              '회원 삭제'
            )}
          </button>
        </div>
      </div>

      {/* 명부 정보 모달 */}
      {modalVisible && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{name}님의 명부 정보</h5>
                <button type="button" className="btn-close" onClick={() => setModalVisible(false)}></button>
              </div>
              <div className="modal-body">
                {rosterData && (
                  <div>
                    <div className="mb-2">
                      <strong>이름:</strong> {rosterData.name}
                    </div>
                    <div className="mb-2">
                      <strong>생년월일:</strong> {rosterData.birth}
                    </div>
                    <div className="mb-2">
                      <strong>성별:</strong> {rosterData.gender}
                    </div>
                    <div className="mb-2">
                      <strong>연락처:</strong> {rosterData.phone}
                    </div>
                    <div className="mb-2">
                      <strong>비상 연락처:</strong> {rosterData.emergency}
                    </div>
                    <div className="mb-2">
                      <strong>주소:</strong> {rosterData.address}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModalVisible(false)}>닫기</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 교환권 모달 */}
      {baitModalVisible && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{name}님의 교환권</h5>
                <button type="button" className="btn-close" onClick={() => setBaitModalVisible(false)}></button>
              </div>
              <div className="modal-body text-center">
                <div className="d-flex align-items-center justify-content-center gap-3 mb-3">
                  <button
                    className="btn btn-success rounded-circle"
                    style={{ width: '60px', height: '60px' }}
                    onClick={() => updateBaitCoupons(1)}
                    disabled={isLoadingBait}
                  >
                    <span className="fs-4">+</span>
                  </button>
                  <div className="fs-2 fw-bold">{baitCoupons}</div>
                  {baitCoupons > 0 && (
                    <button
                      className="btn btn-danger rounded-circle"
                      style={{ width: '60px', height: '60px' }}
                      onClick={() => updateBaitCoupons(-1)}
                      disabled={isLoadingBait}
                    >
                      <span className="fs-4">-</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setBaitModalVisible(false)}>닫기</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MemberDetailPage() {
  return (
    <Suspense fallback={
      <div className="d-flex min-vh-100 align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">로딩 중...</p>
        </div>
      </div>
    }>
      <MemberDetailContent />
    </Suspense>
  );
}

