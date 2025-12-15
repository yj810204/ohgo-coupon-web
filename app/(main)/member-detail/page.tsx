'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getStamps, getCouponCount, addStamp, addStampBatch, deleteUser } from '@/utils/stamp-service';
import { sendPushToUser } from '@/utils/send-push';
import PageHeader from '@/components/PageHeader';
import { 
  IoPersonCircleOutline, 
  IoCalendarOutline, 
  IoTimeOutline,
  IoPricetagOutline,
  IoGiftOutline,
  IoTicketOutline,
  IoAddCircleOutline,
  IoDocumentTextOutline,
  IoListOutline,
  IoTrashOutline,
  IoChevronForwardOutline
} from 'react-icons/io5';

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
      className="min-vh-100 bg-light"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}
    >
      <PageHeader title="회원 상세" />
      <div className="container pb-4" style={{ paddingTop: '80px' }}>
        {/* 프로필 헤더 */}
        <div className="card border-0 shadow-sm mb-4" style={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '16px',
          overflow: 'hidden'
        }}>
          <div className="card-body text-white p-4">
            <div className="d-flex align-items-center mb-3">
              <div className="rounded-circle bg-white bg-opacity-20 d-flex align-items-center justify-content-center me-3" 
                   style={{ width: '60px', height: '60px', fontSize: '32px' }}>
                👤
            </div>
              <div className="flex-grow-1">
                <h4 className="mb-1 fw-bold">{name}</h4>
              <button
                onClick={handleNamePress}
                  className="btn btn-link p-0 text-white text-decoration-underline opacity-75"
                  style={{ fontSize: '0.9rem' }}
              >
                  명부 정보 보기
              </button>
            </div>
            </div>
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <div className="small opacity-75 mb-1">포인트</div>
              <button
                onClick={resetPoints}
                  className="btn btn-link p-0 text-white fw-bold"
                disabled={isResettingPoints}
                  style={{ fontSize: '1.5rem', textDecoration: 'none' }}
              >
                  {points.toLocaleString()}<small className="opacity-75">P</small>
              </button>
            </div>
              <div className="text-end">
                <div className="small opacity-75 mb-1">가입일</div>
                <div className="fw-semibold">{createdAt}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="row g-3 mb-4">
          <div className="col-4">
            <button
              onClick={() => router.push(`/stamp?uuid=${uuid}&name=${name}&dob=${dob}&fromAdmin=true`)}
              className="card border-0 shadow-sm w-100 h-100 text-decoration-none"
              style={{ 
                borderRadius: '12px',
                transition: 'transform 0.2s, box-shadow 0.2s',
                border: 'none'
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
              <div className="card-body text-center p-3 d-flex flex-column align-items-center">
                <IoPricetagOutline size={28} className="text-primary mb-2" />
                <div className="fs-5 fw-bold text-dark mb-1">{stampCount}</div>
                <div className="small text-muted">스탬프</div>
              </div>
            </button>
          </div>
          <div className="col-4">
            <button
              onClick={() => router.push(`/coupons?uuid=${uuid}&name=${name}&dob=${dob}&fromAdmin=true`)}
              className="card border-0 shadow-sm w-100 h-100 text-decoration-none"
              style={{ 
                borderRadius: '12px',
                transition: 'transform 0.2s, box-shadow 0.2s',
                border: 'none'
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
              <div className="card-body text-center p-3 d-flex flex-column align-items-center">
                <IoGiftOutline size={28} className="text-danger mb-2" />
                <div className="fs-5 fw-bold text-dark mb-1">{couponCount}</div>
                <div className="small text-muted">쿠폰</div>
              </div>
            </button>
          </div>
          <div className="col-4">
            <button
              onClick={() => setBaitModalVisible(true)}
              className="card border-0 shadow-sm w-100 h-100 text-decoration-none"
              style={{ 
                borderRadius: '12px',
                transition: 'transform 0.2s, box-shadow 0.2s',
                border: 'none'
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
              <div className="card-body text-center p-3 d-flex flex-column align-items-center">
                <IoTicketOutline size={28} className="text-warning mb-2" />
                <div className="fs-5 fw-bold text-dark mb-1">{baitCoupons}</div>
                <div className="small text-muted">교환권</div>
              </div>
            </button>
          </div>
        </div>

        {/* 정보 카드 */}
        <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: '12px' }}>
          <div className="card-body p-3">
            <div className="d-flex align-items-center mb-3">
              <IoCalendarOutline size={20} className="text-muted me-2" />
              <span className="text-muted small">생년월일</span>
            </div>
            <div className="ps-4 mb-3">
              {dob?.length === 8
                ? `${dob.slice(2, 4)}-${dob.slice(4, 6)}-${dob.slice(6, 8)}`
                : dob}
            </div>
            <div className="d-flex align-items-center">
              <IoTimeOutline size={20} className="text-muted me-2" />
              <span className="text-muted small">UUID</span>
            </div>
            <button
              onClick={() => alert('UUID: ' + uuid)}
              className="btn btn-link p-0 ps-4 text-primary text-decoration-underline"
              style={{ fontSize: '0.85rem' }}
            >
              확인하기
            </button>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="row g-2 mb-4">
          <div className="col-6">
            <button
              className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
              onClick={handleAddStamp}
              disabled={isLoadingOne || isLoadingFive}
              style={{
                padding: '14px',
                fontSize: '1rem',
                fontWeight: '600',
                borderRadius: '12px',
                border: 'none',
                boxShadow: '0 2px 8px rgba(13, 110, 253, 0.3)'
              }}
            >
              {isLoadingOne ? (
                <>
                  <span className="spinner-border spinner-border-sm"></span>
                  <span>적립 중...</span>
                </>
              ) : (
                <>
                  <IoAddCircleOutline size={20} className="flex-shrink-0" />
                  <span>스탬프 +1</span>
                </>
              )}
            </button>
          </div>
          <div className="col-6">
            <button
              className="btn w-100 d-flex align-items-center justify-content-center gap-2 text-white"
              onClick={handleAddStampFive}
              disabled={isLoadingOne || isLoadingFive}
              style={{
                padding: '14px',
                fontSize: '1rem',
                fontWeight: '600',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: '#6c757d',
                boxShadow: '0 2px 8px rgba(108, 117, 125, 0.3)'
              }}
            >
              {isLoadingFive ? (
                <>
                  <span className="spinner-border spinner-border-sm"></span>
                  <span>적립 중...</span>
                </>
              ) : (
                <>
                  <IoAddCircleOutline size={20} className="flex-shrink-0" />
                  <span>스탬프 +5</span>
                </>
              )}
            </button>
          </div>
          </div>

        {/* 메뉴 버튼 */}
        <div className="d-grid gap-2 mb-4">
          <button
            className="btn btn-light d-flex align-items-center justify-content-between shadow-sm"
            onClick={() => router.push(`/memo?uuid=${uuid}&name=${name}`)}
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              border: 'none',
              textAlign: 'left'
            }}
          >
            <div className="d-flex align-items-center gap-2">
              <IoDocumentTextOutline size={20} className="text-primary" />
              <span className="fw-semibold">관리자 메모</span>
            </div>
            <IoChevronForwardOutline size={20} className="text-muted" />
          </button>
            <button
            className="btn btn-light d-flex align-items-center justify-content-between shadow-sm"
            onClick={() => router.push(`/logs?uuid=${uuid}&name=${name}`)}
              style={{ 
              padding: '14px 16px',
              borderRadius: '12px',
              border: 'none',
              textAlign: 'left'
              }}
          >
            <div className="d-flex align-items-center gap-2">
              <IoListOutline size={20} className="text-info" />
              <span className="fw-semibold">로그 보기</span>
            </div>
            <IoChevronForwardOutline size={20} className="text-muted" />
            </button>
            <button
            className="btn btn-light d-flex align-items-center justify-content-between shadow-sm"
            onClick={() => router.push(`/stamp-history?uuid=${uuid}&name=${name}`)}
              style={{ 
              padding: '14px 16px',
              borderRadius: '12px',
              border: 'none',
              textAlign: 'left'
              }}
          >
            <div className="d-flex align-items-center gap-2">
              <IoPricetagOutline size={20} className="text-success flex-shrink-0" />
              <span className="fw-semibold">스탬프 이력</span>
            </div>
            <IoChevronForwardOutline size={20} className="text-muted flex-shrink-0" />
            </button>
          </div>

        {/* 삭제 버튼 */}
          <button
          className="btn btn-outline-danger d-flex align-items-center justify-content-center gap-2 w-100"
            onClick={handleDeleteUser}
            disabled={isDeleting}
            style={{
            padding: '14px',
              fontSize: '1rem',
            fontWeight: '600',
            borderRadius: '12px',
            borderWidth: '2px'
            }}
          >
            {isDeleting ? (
              <>
              <span className="spinner-border spinner-border-sm"></span>
              <span>삭제 중...</span>
              </>
            ) : (
            <>
              <IoTrashOutline size={20} className="flex-shrink-0" />
              <span>회원 삭제</span>
            </>
            )}
          </button>
      </div>

      {/* 명부 정보 모달 */}
      {modalVisible && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header border-0" style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '20px'
              }}>
                <h5 className="modal-title text-white fw-bold mb-0">{name}님의 명부 정보</h5>
                <button 
                  type="button" 
                  className="btn-close btn-close-white" 
                  onClick={() => setModalVisible(false)}
                  style={{ opacity: 0.8 }}
                ></button>
              </div>
              <div className="modal-body p-4">
                {rosterData && (
                  <div className="d-grid gap-3">
                    <div className="d-flex align-items-start">
                      <IoPersonCircleOutline size={20} className="text-primary me-3 mt-1" />
                      <div className="flex-grow-1">
                        <div className="small text-muted mb-1">이름</div>
                        <div className="fw-semibold">{rosterData.name}</div>
                      </div>
                    </div>
                    <div className="d-flex align-items-start">
                      <IoCalendarOutline size={20} className="text-primary me-3 mt-1" />
                      <div className="flex-grow-1">
                        <div className="small text-muted mb-1">생년월일</div>
                        <div className="fw-semibold">{rosterData.birth}</div>
                      </div>
                    </div>
                    <div className="d-flex align-items-start">
                      <IoPersonCircleOutline size={20} className="text-primary me-3 mt-1" />
                      <div className="flex-grow-1">
                        <div className="small text-muted mb-1">성별</div>
                        <div className="fw-semibold">{rosterData.gender}</div>
                      </div>
                    </div>
                    <div className="d-flex align-items-start">
                      <IoTimeOutline size={20} className="text-primary me-3 mt-1" />
                      <div className="flex-grow-1">
                        <div className="small text-muted mb-1">연락처</div>
                        <div className="fw-semibold">{rosterData.phone}</div>
                      </div>
                    </div>
                    <div className="d-flex align-items-start">
                      <IoTimeOutline size={20} className="text-primary me-3 mt-1" />
                      <div className="flex-grow-1">
                        <div className="small text-muted mb-1">비상 연락처</div>
                        <div className="fw-semibold">{rosterData.emergency}</div>
                      </div>
                    </div>
                    <div className="d-flex align-items-start">
                      <IoTimeOutline size={20} className="text-primary me-3 mt-1" />
                      <div className="flex-grow-1">
                        <div className="small text-muted mb-1">주소</div>
                        <div className="fw-semibold">{rosterData.address}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer border-0 pt-0">
                <button 
                  type="button" 
                  className="btn btn-primary w-100" 
                  onClick={() => setModalVisible(false)}
                  style={{ borderRadius: '12px', padding: '12px' }}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 교환권 모달 */}
      {baitModalVisible && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header border-0" style={{ 
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                padding: '20px'
              }}>
                <h5 className="modal-title text-white fw-bold mb-0">{name}님의 교환권</h5>
                <button 
                  type="button" 
                  className="btn-close btn-close-white" 
                  onClick={() => setBaitModalVisible(false)}
                  style={{ opacity: 0.8 }}
                ></button>
              </div>
              <div className="modal-body text-center p-4">
                <div className="d-flex align-items-center justify-content-center">
                  <button
                    className="btn btn-success rounded-circle d-flex align-items-center justify-content-center shadow-lg"
                    style={{ 
                      width: '70px', 
                      height: '70px',
                      fontSize: '2rem',
                      border: 'none',
                      transition: 'transform 0.2s'
                    }}
                    onClick={() => updateBaitCoupons(1)}
                    disabled={isLoadingBait}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <span>+</span>
                  </button>
                  <div className="fs-1 fw-bold" style={{ minWidth: '80px' }}>{baitCoupons}</div>
                  {baitCoupons > 0 && (
                    <button
                      className="btn btn-danger rounded-circle d-flex align-items-center justify-content-center shadow-lg"
                      style={{ 
                        width: '70px', 
                        height: '70px',
                        fontSize: '2rem',
                        border: 'none',
                        transition: 'transform 0.2s'
                      }}
                      onClick={() => updateBaitCoupons(-1)}
                      disabled={isLoadingBait}
                      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <span>-</span>
                    </button>
                  )}
                </div>
                {isLoadingBait && (
                  <div className="text-center">
                    <div className="spinner-border spinner-border-sm text-primary"></div>
                  </div>
                )}
              </div>
              <div className="modal-footer border-0 pt-0">
                <button 
                  type="button" 
                  className="btn btn-primary w-100" 
                  onClick={() => setBaitModalVisible(false)}
                  style={{ borderRadius: '12px', padding: '12px' }}
                >
                  닫기
                </button>
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

