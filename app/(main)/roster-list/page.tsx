'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUser } from '@/lib/storage';
import { findCaptains } from '@/utils/find-captains';
import { IoChevronForwardOutline, IoAddOutline, IoArrowBackOutline } from 'react-icons/io5';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

type RosterItem = {
  id: string;
  name: string;
  birth: string;
  gender: string;
  phone: string;
  emergency: string;
  address: string;
  hasRoster: boolean;
  isCaptain?: boolean;
  isSailor?: boolean;
  role?: string;
};

function RosterListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get('date');
  const dateDisplay = searchParams.get('dateDisplay');
  const tripNumber = searchParams.get('tripNumber');
  const showPreview = searchParams.get('showPreview');

  const tripNum = tripNumber ? parseInt(tripNumber) : 1;

  const [loading, setLoading] = useState(true);
  const [rosterItems, setRosterItems] = useState<RosterItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [noRosterModalVisible, setNoRosterModalVisible] = useState(false);
  const [selectedRoster, setSelectedRoster] = useState<RosterItem | null>(null);

  useEffect(() => {
    const init = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
      
      if (showPreview === 'true') {
        await loadRosterData();
      } else {
        const tripAlreadyMade = await checkTripStatus();
        if (!tripAlreadyMade) {
          await loadRosterData();
        }
      }
    };
    init();
  }, [date, router, showPreview]);

  const checkTripStatus = async () => {
    if (!date || !tripNumber) return;

    try {
      const tripsDocRef = doc(db, 'trips', String(date));
      const tripsDocSnap = await getDoc(tripsDocRef);

      if (tripsDocSnap.exists()) {
        const tripKey = `trip${tripNum}`;
        const tripData = tripsDocSnap.data()[tripKey];

        if (tripData && tripData.confirmed) {
          alert(`${dateDisplay} ${tripNum}항차는 이미 출항 확정되었습니다.`);
          router.back();
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking trip status:', error);
      return false;
    }
  };

  const updateAttendanceWithCaptains = async (dateStr: string, captainIds: string[], existingMemberIds: string[] = []) => {
    try {
      const attendanceRef = doc(db, 'attendance', dateStr);
      const attendanceSnap = await getDoc(attendanceRef);

      const uniqueMemberIds = new Set([...existingMemberIds, ...captainIds]);
      const updatedMemberIds = Array.from(uniqueMemberIds);

      if (attendanceSnap.exists()) {
        await updateDoc(attendanceRef, {
          members: updatedMemberIds,
          tripNumber: tripNum
        });
      } else {
        await setDoc(attendanceRef, {
          members: updatedMemberIds,
          tripNumber: tripNum
        });
      }

      return updatedMemberIds;
    } catch (error) {
      console.error('Error updating attendance with captains:', error);
      return existingMemberIds;
    }
  };

  const loadRosterData = async () => {
    if (!date) return;

    setLoading(true);
    try {
      const crewMembers = await findCaptains();
      const crewIds = crewMembers.map(member => member.uuid);
      const captainIds = crewMembers.filter(member => member.role === 'captain').map(captain => captain.uuid);
      const sailorIds = crewMembers.filter(member => member.role === 'sailor').map(sailor => sailor.uuid);

      const attendanceRef = doc(db, 'attendance', String(date));
      const attendanceSnap = await getDoc(attendanceRef);

      const rosterData: RosterItem[] = [];
      let memberIds: string[] = attendanceSnap.exists() && attendanceSnap.data().members
          ? attendanceSnap.data().members
          : [];

      if (captainIds.length > 0) {
        memberIds = await updateAttendanceWithCaptains(String(date), captainIds, memberIds);
      }

      const formatDate = (dateStr: string): string => {
        if (!dateStr || dateStr.length !== 8) return dateStr;
        return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      };

      for (const crewMember of crewMembers) {
        const userRef = doc(db, 'users', crewMember.uuid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userData = userSnap.data();
          const boardingInfoRef = doc(db, 'users', crewMember.uuid, 'boarding', 'info');
          const boardingInfoSnap = await getDoc(boardingInfoRef);

          const hasRoster = boardingInfoSnap.exists();
          const isCaptain = crewMember.role === 'captain';
          const isSailor = crewMember.role === 'sailor';

          let rosterInfo: RosterItem = {
            id: crewMember.uuid,
            name: userData.name || crewMember.name || '',
            birth: formatDate(userData.dob),
            gender: '',
            phone: '',
            emergency: '',
            address: '',
            hasRoster: hasRoster,
            isCaptain: isCaptain,
            isSailor: isSailor,
            role: crewMember.role
          };

          if (hasRoster) {
            const data = boardingInfoSnap.data();
            rosterInfo = {
              ...rosterInfo,
              name: data.name || userData.displayName || '',
              birth: formatDate(data.birth) || '',
              gender: data.gender || '',
              phone: data.phone || '',
              emergency: data.emergency || '',
              address: data.address || '',
            };
          }

          rosterData.push(rosterInfo);
        }
      }

      if (memberIds.length > 0) {
        for (const memberId of memberIds) {
          if (crewIds.includes(memberId)) continue;

          const userRef = doc(db, 'users', memberId);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();
            const boardingInfoRef = doc(db, 'users', memberId, 'boarding', 'info');
            const boardingInfoSnap = await getDoc(boardingInfoRef);

            const hasRoster = boardingInfoSnap.exists();

            let rosterInfo: RosterItem = {
              id: memberId,
              name: userData.name || '',
              birth: formatDate(userData.dob),
              gender: '',
              phone: '',
              emergency: '',
              address: '',
              hasRoster: hasRoster,
              isCaptain: false,
              isSailor: false
            };

            if (hasRoster) {
              const data = boardingInfoSnap.data();
              rosterInfo = {
                ...rosterInfo,
                name: data.name || userData.displayName || '',
                birth: formatDate(data.birth) || '',
                gender: data.gender || '',
                phone: data.phone || '',
                emergency: data.emergency || '',
                address: data.address || '',
              };
            }

            rosterData.push(rosterInfo);
          }
        }
      }

      rosterData.sort((a, b) => {
        if (a.isCaptain && !b.isCaptain) return -1;
        if (!a.isCaptain && b.isCaptain) return 1;
        if (a.isSailor && !b.isSailor) return -1;
        if (!a.isSailor && b.isSailor) return 1;
        return a.name.localeCompare(b.name);
      });

      setRosterItems(rosterData);
    } catch (error) {
      console.error('Error loading roster data:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeMemberFromRoster = async (memberId: string) => {
    if (!date) return;
    
    try {
      const attendanceRef = doc(db, 'attendance', String(date));
      const attendanceSnap = await getDoc(attendanceRef);
      
      if (attendanceSnap.exists()) {
        const attendanceData = attendanceSnap.data();
        const currentMembers = attendanceData.members || [];
        const updatedMembers = currentMembers.filter((id: string) => id !== memberId);
        
        await updateDoc(attendanceRef, {
          members: updatedMembers
        });
        
        await loadRosterData();
        alert('명부에서 삭제되었습니다.');
      }
    } catch (error) {
      console.error('Error removing member from roster:', error);
      alert('명부에서 삭제하는 중 오류가 발생했습니다.');
    }
  };

  const handleRosterItemPress = (item: RosterItem) => {
    if (item.hasRoster) {
      setSelectedRoster(item);
      setModalVisible(true);
    } else {
      setSelectedRoster(item);
      setNoRosterModalVisible(true);
    }
  };

  const onRefresh = async () => {
    await loadRosterData();
  };

  const { containerRef, isRefreshing: isPulling, pullProgress } = usePullToRefresh({
    onRefresh: onRefresh,
    enabled: true,
  });

  return (
    <div 
      ref={containerRef}
      className="min-vh-100 bg-light"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
        paddingBottom: '80px',
      }}
    >
      <PageHeader title="승선명부" />
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
        <div className="card shadow-sm mb-3">
          <div className="card-body text-center">
            <h5 className="text-primary mb-0">{dateDisplay} {tripNum}항차</h5>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="text-muted">명부 정보를 불러오는 중...</p>
          </div>
        ) : rosterItems.length === 0 ? (
          <div className="text-center py-5">
            <p className="text-muted">해당 날짜의 명부 정보가 없습니다.</p>
          </div>
        ) : (
          <div className="d-flex flex-column gap-2 mb-3">
            {rosterItems.map((item) => (
              <div
                key={item.id}
                className={`card shadow-sm ${
                  item.isCaptain ? 'border-primary border-start border-4' : 
                  item.isSailor ? 'border-success border-start border-4' : ''
                }`}
                style={{
                  backgroundColor: item.isCaptain ? '#e3f2fd' : item.isSailor ? '#e8f5e9' : 'white'
                }}
              >
                <div className="card-body">
                  <div 
                    className="d-flex justify-content-between align-items-center"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleRosterItemPress(item)}
                  >
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2 mb-2">
                        <h6 className="mb-0">{item.name}</h6>
                        {item.isCaptain && (
                          <span className="badge bg-primary">선장</span>
                        )}
                        {item.isSailor && (
                          <span className="badge bg-success">선원</span>
                        )}
                        {!item.hasRoster && (
                          <span className="badge bg-danger">명부 없음</span>
                        )}
                      </div>
                      <div className="small text-muted">
                        <div>{item.birth} ({item.gender || '미입력'})</div>
                        <div>{item.phone || '미입력'}</div>
                      </div>
                    </div>
                    <IoChevronForwardOutline size={20} className="text-muted" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="position-fixed bottom-0 start-0 end-0 bg-white border-top p-3 shadow-lg">
        <div className="container">
          <div className="row g-2">
            <div className="col-4">
              <button 
                className="btn btn-secondary w-100 d-flex align-items-center justify-content-center"
                onClick={() => router.back()}
                style={{
                  padding: '12px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                이전
              </button>
            </div>
            <div className="col-4">
              <button 
                className="btn btn-success w-100 d-flex align-items-center justify-content-center gap-2"
                onClick={() => {
                  router.push(`/roster-member-search?date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&tripNumber=${tripNum}`);
                }}
                style={{
                  padding: '12px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                <IoAddOutline size={20} />
                <span>추가</span>
              </button>
            </div>
            <div className="col-4">
              <button 
                className="btn btn-primary w-100 d-flex align-items-center justify-content-center"
                onClick={() => {
                  if (!date || !tripNumber) {
                    alert('날짜 또는 항차 정보가 없습니다.');
                    return;
                  }

                  if (rosterItems.length === 0) {
                    alert('명부에 회원이 없습니다. 회원을 추가해주세요.');
                    return;
                  }

                  // Extract year, month, and day from dateDisplay
                  const dateYear = dateDisplay?.toString().split('년')[0] || '';
                  const dateMonth = dateDisplay?.toString().split('년')[1]?.split('월')[0]?.trim() || '';
                  const dateDay = dateDisplay?.toString().split('월')[1]?.split('일')[0]?.trim() || '';

                  // Stringify the roster items to pass as a parameter
                  const rosterItemsJson = JSON.stringify(rosterItems);
                  
                  router.push(`/location-time-selection?date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&dateYear=${dateYear}&dateMonth=${dateMonth}&dateDay=${dateDay}&tripNumber=${tripNum}&rosterItems=${encodeURIComponent(rosterItemsJson)}`);
                }}
                style={{
                  padding: '12px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                다음
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 명부 정보 모달 */}
      {modalVisible && selectedRoster && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{selectedRoster.name}님의 명부 정보</h5>
                <button type="button" className="btn-close" onClick={() => setModalVisible(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <strong>이름:</strong> {selectedRoster.name}
                </div>
                <div className="mb-3">
                  <strong>생년월일:</strong> {selectedRoster.birth}
                </div>
                <div className="mb-3">
                  <strong>성별:</strong> {selectedRoster.gender || '미입력'}
                </div>
                <div className="mb-3">
                  <strong>연락처:</strong> {selectedRoster.phone || '미입력'}
                </div>
                <div className="mb-3">
                  <strong>비상 연락처:</strong> {selectedRoster.emergency}
                </div>
                <div className="mb-3">
                  <strong>주소:</strong> {selectedRoster.address}
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  className="btn btn-secondary d-flex align-items-center justify-content-center"
                  onClick={() => setModalVisible(false)}
                  style={{
                    padding: '10px 20px',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  닫기
                </button>
                <button 
                  className="btn btn-warning d-flex align-items-center justify-content-center"
                  onClick={() => {
                    router.push(`/boarding-form?uuid=${selectedRoster.id}&name=${encodeURIComponent(selectedRoster.name)}&dob=${selectedRoster.birth}&returnTo=roster-list&date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&tripNumber=${tripNum}`);
                    setModalVisible(false);
                  }}
                  style={{
                    padding: '10px 20px',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  수정
                </button>
                <button 
                  className="btn btn-danger d-flex align-items-center justify-content-center"
                  onClick={() => {
                    if (confirm(`${selectedRoster.name}님을 명부에서 삭제하시겠습니까?`)) {
                      removeMemberFromRoster(selectedRoster.id);
                      setModalVisible(false);
                    }
                  }}
                  style={{
                    padding: '10px 20px',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 명부 정보 없음 모달 */}
      {noRosterModalVisible && selectedRoster && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">명부 정보 없음</h5>
                <button type="button" className="btn-close" onClick={() => setNoRosterModalVisible(false)}></button>
              </div>
              <div className="modal-body">
                <p>{selectedRoster.name}님의 명부 정보가 없습니다.</p>
              </div>
              <div className="modal-footer">
                <button 
                  className="btn btn-secondary d-flex align-items-center justify-content-center"
                  onClick={() => setNoRosterModalVisible(false)}
                  style={{
                    padding: '10px 20px',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  닫기
                </button>
                <button 
                  className="btn btn-danger d-flex align-items-center justify-content-center"
                  onClick={() => {
                    if (confirm(`${selectedRoster.name}님을 명부에서 삭제하시겠습니까?`)) {
                      removeMemberFromRoster(selectedRoster.id);
                      setNoRosterModalVisible(false);
                    }
                  }}
                  style={{
                    padding: '10px 20px',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  삭제
                </button>
                <button 
                  className="btn btn-success d-flex align-items-center justify-content-center"
                  onClick={() => {
                    router.push(`/boarding-form?uuid=${selectedRoster.id}&name=${encodeURIComponent(selectedRoster.name)}&dob=${selectedRoster.birth}&returnTo=roster-list&date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&tripNumber=${tripNum}`);
                    setNoRosterModalVisible(false);
                  }}
                  style={{
                    padding: '10px 20px',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  명부 작성
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RosterListPage() {
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
      <RosterListContent />
    </Suspense>
  );
}

