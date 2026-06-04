'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, { OhgoModalButton, OhgoModalField, OhgoModalText } from '@/components/OhgoModal';
import { OhgoPageLoading } from '@/lib/page-styles';
import { getUser } from '@/lib/storage';
import {
  isTripConfirmed,
  loadDailyRoster,
  removeMemberFromDailyRoster,
  type RosterItem,
} from '@/utils/roster-service';
import { IoChevronForwardOutline, IoAddOutline, IoArrowBackOutline, IoBoatOutline } from 'react-icons/io5';
import EmptyState from '@/components/EmptyState';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';


type RosterListItem = RosterItem;

function RosterListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get('date');
  const dateDisplay = searchParams.get('dateDisplay');
  const tripNumber = searchParams.get('tripNumber');
  const showPreview = searchParams.get('showPreview');

  const tripNum = tripNumber ? parseInt(tripNumber) : 1;

  const [loading, setLoading] = useState(true);
  const [rosterItems, setRosterItems] = useState<RosterListItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [noRosterModalVisible, setNoRosterModalVisible] = useState(false);
  const [selectedRoster, setSelectedRoster] = useState<RosterListItem | null>(null);

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
    if (!date || !tripNumber) return false;

    try {
      if (await isTripConfirmed(String(date), tripNum)) {
        alert(`${dateDisplay} ${tripNum}항차는 이미 출항 확정되었습니다.`);
        router.back();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error checking trip status:', error);
      return false;
    }
  };

  const loadRosterData = async () => {
    if (!date) return;

    setLoading(true);
    try {
      const items = await loadDailyRoster(String(date), tripNum);
      setRosterItems(items);
    } catch (error) {
      console.error('Error loading roster data:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeMemberFromRoster = async (memberId: string) => {
    if (!date) return;

    try {
      await removeMemberFromDailyRoster(String(date), memberId);
      await loadRosterData();
      alert('명부에서 삭제되었습니다.');
    } catch (error) {
      console.error('Error removing member from roster:', error);
      alert('명부에서 삭제하는 중 오류가 발생했습니다.');
    }
  };

  const handleRosterItemPress = (item: RosterListItem) => {
    if (item.hasRoster) {
      setSelectedRoster(item);
      setModalVisible(true);
    } else {
      setSelectedRoster(item);
      setNoRosterModalVisible(true);
    }
  };

  useNativePullToRefresh(loadRosterData);

  return (
    <SubPageFrame title="승선명부" onRefresh={loadRosterData}>
        <div className="ohgo-card mb-3">
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
          <EmptyState icon={IoBoatOutline} message="해당 날짜의 명부 정보가 없습니다." />
        ) : (
          <div className="d-flex flex-column gap-2 mb-3">
            {rosterItems.map((item) => (
              <div
                key={item.id}
                className={`ohgo-card ${
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

      <div
        className="position-fixed bottom-0 start-0 end-0 bg-white border-top p-3 shadow-lg"
        style={{ maxWidth: 480, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}
      >
        <div>
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
                <IoAddOutline size={20} className="flex-shrink-0" />
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

      <OhgoModal
        open={modalVisible && !!selectedRoster}
        onClose={() => setModalVisible(false)}
        title={selectedRoster ? `${selectedRoster.name}님의 명부 정보` : ''}
        footerLayout="row"
        footer={
          selectedRoster ? (
            <>
              <OhgoModalButton
                variant="warning"
                onClick={() => {
                  router.push(
                    `/boarding-form?uuid=${selectedRoster.id}&name=${encodeURIComponent(selectedRoster.name)}&dob=${selectedRoster.birth}&returnTo=roster-list&date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&tripNumber=${tripNum}`
                  );
                  setModalVisible(false);
                }}
              >
                수정
              </OhgoModalButton>
              <OhgoModalButton
                variant="danger"
                onClick={() => {
                  if (confirm(`${selectedRoster.name}님을 명부에서 삭제하시겠습니까?`)) {
                    removeMemberFromRoster(selectedRoster.id);
                    setModalVisible(false);
                  }
                }}
              >
                삭제
              </OhgoModalButton>
            </>
          ) : null
        }
      >
        {selectedRoster && (
          <>
            <OhgoModalField label="이름" value={selectedRoster.name} />
            <OhgoModalField label="생년월일" value={selectedRoster.birth} />
            <OhgoModalField label="성별" value={selectedRoster.gender || '미입력'} />
            <OhgoModalField label="연락처" value={selectedRoster.phone || '미입력'} />
            <OhgoModalField label="비상 연락처" value={selectedRoster.emergency} />
            <OhgoModalField label="주소" value={selectedRoster.address} />
          </>
        )}
      </OhgoModal>

      <OhgoModal
        open={noRosterModalVisible && !!selectedRoster}
        onClose={() => setNoRosterModalVisible(false)}
        title="명부 정보 없음"
        titleTone="danger"
        footerLayout="row"
        footer={
          selectedRoster ? (
            <>
              <OhgoModalButton
                variant="danger"
                onClick={() => {
                  if (confirm(`${selectedRoster.name}님을 명부에서 삭제하시겠습니까?`)) {
                    removeMemberFromRoster(selectedRoster.id);
                    setNoRosterModalVisible(false);
                  }
                }}
              >
                삭제
              </OhgoModalButton>
              <OhgoModalButton
                variant="success"
                onClick={() => {
                  router.push(
                    `/boarding-form?uuid=${selectedRoster.id}&name=${encodeURIComponent(selectedRoster.name)}&dob=${selectedRoster.birth}&returnTo=roster-list&date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&tripNumber=${tripNum}`
                  );
                  setNoRosterModalVisible(false);
                }}
              >
                명부 작성
              </OhgoModalButton>
            </>
          ) : null
        }
      >
        {selectedRoster && (
          <OhgoModalText>{selectedRoster.name}님의 명부 정보가 없습니다.</OhgoModalText>
        )}
      </OhgoModal>
    </SubPageFrame>
  );
}

export default function RosterListPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <RosterListContent />
    </Suspense>
  );
}

