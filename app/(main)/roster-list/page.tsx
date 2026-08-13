'use client';

import { useState, useEffect, Suspense, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import SubPageFrame from '@/components/SubPageFrame';
import { OhgoModalButton } from '@/components/OhgoModal';
import BoardingInfoModal from '@/components/BoardingInfoModal';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_FONT,
  OHGO_LIST,
  OHGO_LIST_DIVIDER,
  OhgoPageLoading,
} from '@/lib/page-styles';
import { getUser } from '@/lib/storage';
import {
  isTripConfirmed,
  loadDailyRoster,
  removeMemberFromDailyRoster,
  type RosterItem,
} from '@/utils/roster-service';
import {
  IoAddOutline,
  IoBoatOutline,
  IoChevronForwardOutline,
  IoPersonOutline,
  IoWarningOutline,
} from 'react-icons/io5';
import EmptyState from '@/components/EmptyState';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { ohgoConfirm } from '@/lib/ohgo-dialog';

type RosterListItem = RosterItem;

const ROLE_PILL: Record<'captain' | 'sailor' | 'missing', CSSProperties> = {
  captain: {
    fontSize: 11,
    fontWeight: 700,
    fontFamily: OHGO_FONT,
    color: '#1B6FF5',
    backgroundColor: '#EBF1FE',
    borderRadius: 20,
    padding: '3px 8px',
    lineHeight: 1.2,
  },
  sailor: {
    fontSize: 11,
    fontWeight: 700,
    fontFamily: OHGO_FONT,
    color: '#34C759',
    backgroundColor: '#E8F8EE',
    borderRadius: 20,
    padding: '3px 8px',
    lineHeight: 1.2,
  },
  missing: {
    fontSize: 11,
    fontWeight: 700,
    fontFamily: OHGO_FONT,
    color: '#FF3B30',
    backgroundColor: '#FFECEA',
    borderRadius: 20,
    padding: '3px 8px',
    lineHeight: 1.2,
  },
};

function RoleIcon({ item }: { item: RosterListItem }) {
  const bg = item.isCaptain ? '#EBF1FE' : item.isSailor ? '#E8F8EE' : '#F2F3F5';
  const color = item.isCaptain ? '#1B6FF5' : item.isSailor ? '#34C759' : '#6F767E';
  return (
    <div
      style={{
        width: OHGO_LIST.iconBox,
        height: OHGO_LIST.iconBox,
        borderRadius: '50%',
        backgroundColor: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {item.isCaptain || item.isSailor ? (
        <IoBoatOutline size={OHGO_LIST.iconGlyph} color={color} />
      ) : (
        <IoPersonOutline size={OHGO_LIST.iconGlyph} color={color} />
      )}
    </div>
  );
}

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
    setSelectedRoster(item);
    if (item.hasRoster) setModalVisible(true);
    else setNoRosterModalVisible(true);
  };

  const goNext = () => {
    if (!date || !tripNumber) {
      alert('날짜 또는 항차 정보가 없습니다.');
      return;
    }
    if (rosterItems.length === 0) {
      alert('명부에 회원이 없습니다. 회원을 추가해주세요.');
      return;
    }

    const dateYear = dateDisplay?.toString().split('년')[0] || '';
    const dateMonth = dateDisplay?.toString().split('년')[1]?.split('월')[0]?.trim() || '';
    const dateDay = dateDisplay?.toString().split('월')[1]?.split('일')[0]?.trim() || '';
    const rosterItemsJson = JSON.stringify(rosterItems);

    router.push(
      `/location-time-selection?date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&dateYear=${dateYear}&dateMonth=${dateMonth}&dateDay=${dateDay}&tripNumber=${tripNum}&rosterItems=${encodeURIComponent(rosterItemsJson)}`,
    );
  };

  useNativePullToRefresh(loadRosterData);

  return (
    <SubPageFrame title="승선명부" onRefresh={loadRosterData} dense>
      {/* 날짜 · 항차 · 인원 + 추가 — 단일 툴바 */}
      <div
        className="d-flex align-items-center gap-2 mb-2"
        style={{ padding: '2px 2px 8px' }}
      >
        <div
          className="flex-grow-1 min-w-0 d-flex align-items-center gap-1 flex-wrap"
          style={{ fontFamily: OHGO_FONT, rowGap: 4 }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: '#1A1D1F',
              letterSpacing: -0.2,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}
          >
            {dateDisplay || date || '날짜 미선택'}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#1B6FF5',
              backgroundColor: '#EBF1FE',
              borderRadius: 999,
              padding: '2px 8px',
              lineHeight: 1.4,
              flexShrink: 0,
            }}
          >
            {tripNum}항차
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#6F767E',
              flexShrink: 0,
            }}
          >
            {loading ? '…' : `${rosterItems.length}명`}
          </span>
        </div>
        <button
          type="button"
          aria-label="회원 추가"
          className="btn d-flex align-items-center justify-content-center gap-1 flex-shrink-0"
          style={{
            minHeight: 32,
            height: 32,
            padding: '0 10px',
            fontSize: 13,
            fontWeight: 700,
            fontFamily: OHGO_FONT,
            borderRadius: 999,
            whiteSpace: 'nowrap',
            backgroundColor: '#1B6FF5',
            color: '#FFFFFF',
            border: 'none',
            boxShadow: 'none',
          }}
          onClick={() => {
            router.push(
              `/roster-member-search?date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&tripNumber=${tripNum}`,
            );
          }}
        >
          <IoAddOutline size={15} aria-hidden />
          추가
        </button>
      </div>

      {loading ? (
        <div className="text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary mb-2" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mb-0" style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT }}>
            불러오는 중…
          </p>
        </div>
      ) : rosterItems.length === 0 ? (
        <EmptyState
          icon={IoBoatOutline}
          message="등록된 승선자가 없습니다."
          subtitle="「추가」로 승선자를 등록해 주세요."
          style={OHGO_CARD}
        />
      ) : (
        <div className="mb-3" style={{ ...OHGO_CARD, overflow: 'hidden' }}>
          {rosterItems.map((item, index) => (
            <div key={item.id}>
              {index > 0 && <div style={OHGO_LIST_DIVIDER} />}
              <button
                type="button"
                onClick={() => handleRosterItemPress(item)}
                className="btn w-100 text-start border-0 rounded-0"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: OHGO_LIST.gap,
                  padding: `${OHGO_LIST.rowPaddingY}px ${OHGO_LIST.rowPaddingX}px`,
                  minHeight: OHGO_LIST.rowMinHeight,
                  backgroundColor: !item.hasRoster ? '#FFFAFA' : '#FFFFFF',
                }}
              >
                <RoleIcon item={item} />
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span
                      style={{
                        fontSize: OHGO_LIST.titleSize,
                        fontWeight: OHGO_LIST.titleWeight,
                        color: OHGO_LIST.titleColor,
                        fontFamily: OHGO_FONT,
                      }}
                    >
                      {item.name}
                    </span>
                    {item.isCaptain && <span style={ROLE_PILL.captain}>선장</span>}
                    {item.isSailor && <span style={ROLE_PILL.sailor}>선원</span>}
                    {!item.hasRoster && (
                      <span style={ROLE_PILL.missing}>
                        <IoWarningOutline size={11} style={{ marginRight: 2, verticalAlign: -1 }} />
                        명부 없음
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: OHGO_LIST.descSize,
                      color: OHGO_LIST.mutedColor,
                      fontFamily: OHGO_FONT,
                      marginTop: 2,
                      lineHeight: 1.4,
                    }}
                  >
                    {item.birth} ({item.gender || '미입력'})
                  </div>
                  <div
                    style={{
                      fontSize: OHGO_LIST.metaSize,
                      color: OHGO_LIST.mutedColor,
                      fontFamily: OHGO_FONT,
                      marginTop: 1,
                    }}
                  >
                    {item.phone || '연락처 미입력'}
                  </div>
                </div>
                <IoChevronForwardOutline
                  size={OHGO_LIST.chevronSize}
                  color={OHGO_LIST.chevronColor}
                  className="flex-shrink-0"
                />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className={`btn w-100 d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
        style={OHGO_CONFIRM_BTN}
        onClick={goNext}
      >
        <span>다음</span>
        <IoChevronForwardOutline size={20} className="flex-shrink-0" aria-hidden />
      </button>

      <BoardingInfoModal
        open={modalVisible && !!selectedRoster}
        onClose={() => setModalVisible(false)}
        personName={selectedRoster?.name || ''}
        data={
          selectedRoster
            ? {
                name: selectedRoster.name,
                birth: selectedRoster.birth,
                gender: selectedRoster.gender,
                phone: selectedRoster.phone,
                emergency: selectedRoster.emergency,
                address: selectedRoster.address,
              }
            : null
        }
        footer={
          selectedRoster ? (
            <>
              <OhgoModalButton
                variant="warning"
                onClick={() => {
                  router.push(
                    `/boarding-form?uuid=${selectedRoster.id}&name=${encodeURIComponent(selectedRoster.name)}&dob=${selectedRoster.birth}&returnTo=roster-list&date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&tripNumber=${tripNum}`,
                  );
                  setModalVisible(false);
                }}
              >
                수정
              </OhgoModalButton>
              <OhgoModalButton
                variant="danger"
                onClick={async () => {
                  if (await ohgoConfirm(`${selectedRoster.name}님을 명부에서 삭제하시겠습니까?`)) {
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
      />

      <BoardingInfoModal
        open={noRosterModalVisible && !!selectedRoster}
        onClose={() => setNoRosterModalVisible(false)}
        personName={selectedRoster?.name || ''}
        data={null}
        empty
        emptyMessage={
          selectedRoster
            ? `${selectedRoster.name}님의 명부 정보가 없습니다.`
            : undefined
        }
        footer={
          selectedRoster ? (
            <>
              <OhgoModalButton
                variant="danger"
                onClick={async () => {
                  if (await ohgoConfirm(`${selectedRoster.name}님을 명부에서 삭제하시겠습니까?`)) {
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
                    `/boarding-form?uuid=${selectedRoster.id}&name=${encodeURIComponent(selectedRoster.name)}&dob=${selectedRoster.birth}&returnTo=roster-list&date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&tripNumber=${tripNum}`,
                  );
                  setNoRosterModalVisible(false);
                }}
              >
                명부 작성
              </OhgoModalButton>
            </>
          ) : null
        }
      />
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
