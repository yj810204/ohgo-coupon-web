'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import {
  searchMembersByName,
  addMemberToDailyRoster,
  createGuestMember,
  guestMemberExists,
  findUserByNameDob,
} from '@/utils/roster-service';
import { getUser } from '@/lib/storage';
import { computeLegacyUuid } from '@/lib/legacy-uuid';
import { normalizePersonName } from '@/lib/person-name';
import { IoSearchOutline, IoAddOutline, IoPersonOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OHGO_LIST,
  OHGO_LIST_DIVIDER,
  OhgoPageLoading,
} from '@/lib/page-styles';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import EmptyState from '@/components/EmptyState';
import type { CSSProperties } from 'react';

const LABEL: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  marginBottom: 8,
};

const FIELD: CSSProperties = {
  ...OHGO_INPUT,
  width: '100%',
  backgroundColor: '#FFFFFF',
};

const pillBtn = (active: boolean): CSSProperties => ({
  border: 'none',
  borderRadius: 20,
  padding: '8px 14px',
  fontSize: 14,
  fontWeight: 700,
  fontFamily: OHGO_FONT,
  backgroundColor: active ? '#EBF1FE' : '#F2F3F5',
  color: active ? '#1B6FF5' : '#6F767E',
  cursor: 'pointer',
});

interface UserData {
  id: string;
  uuid: string;
  name: string;
  dob?: string;
  phone?: string;
  gender?: string;
  hasBoarding?: boolean;
  [key: string]: any;
}

function RosterMemberSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get('date');
  const dateDisplay = searchParams.get('dateDisplay');
  const tripNumber = searchParams.get('tripNumber');

  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showNewMemberForm, setShowNewMemberForm] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberDob, setNewMemberDob] = useState('');
  const [newMemberGender, setNewMemberGender] = useState('');
  const [newMemberEmergency, setNewMemberEmergency] = useState('');
  const [newMemberAddress, setNewMemberAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const searchMembers = useCallback(async () => {
    if (!searchText.trim()) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const results = await searchMembersByName(searchText);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching members:', error);
      alert('회원 검색 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [searchText]);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
    };
    checkAuth();
  }, [router]);

  // 실시간 검색을 위한 debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchText.trim()) {
        searchMembers();
      } else {
        setSearchResults([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchText, searchMembers]);

  const addMemberToRoster = async (member: UserData) => {
    if (!date || !tripNumber) {
      alert('날짜 또는 항차 정보가 없습니다.');
      return;
    }

    setIsLoading(true);
    try {
      const added = await addMemberToDailyRoster(
        String(date),
        member.uuid,
        parseInt(tripNumber) || 1
      );

      if (!added) {
        alert(`${member.name}님은 이미 명부에 추가되어 있습니다.`);
        setIsLoading(false);
        return;
      }

      alert(`${member.name}님이 명부에 추가되었습니다.`);
      router.push(`/roster-list?date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&tripNumber=${tripNumber}`);
    } catch (error) {
      console.error('Error adding member to roster:', error);
      alert('명부에 회원을 추가하는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const createNewMemberAndAddToRoster = async () => {
    if (!newMemberName.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }
    
    if (!newMemberPhone.trim()) {
      alert('전화번호를 입력해주세요.');
      return;
    }
    
    if (!newMemberDob.trim() || newMemberDob.length !== 8) {
      alert('생년월일을 8자리로 입력해주세요. (예: 19900101)');
      return;
    }
    
    if (!newMemberGender) {
      alert('성별을 선택해주세요.');
      return;
    }
    
    if (!newMemberEmergency.trim()) {
      alert('비상 연락처를 입력해주세요.');
      return;
    }
    
    if (!newMemberAddress.trim()) {
      alert('주소를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const name = normalizePersonName(newMemberName);
      const dob = newMemberDob.trim();
      const phone = newMemberPhone.trim();
      const emergency = newMemberEmergency.trim();
      const address = newMemberAddress.trim();
      const existingId = await findUserByNameDob(name, dob);
      const memberUuid = existingId ?? computeLegacyUuid(name, dob);

      if (existingId || (await guestMemberExists(memberUuid))) {
        const added = await addMemberToDailyRoster(
          String(date),
          existingId ?? memberUuid,
          parseInt(tripNumber || '1')
        );
        alert(
          added
            ? `${name}님은 기존 회원으로 명부에 추가되었습니다.`
            : `${name}님은 이미 명부에 있습니다.`
        );
        router.push(
          `/roster-list?date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&tripNumber=${tripNumber}`
        );
        return;
      }

      await createGuestMember({
        uuid: memberUuid,
        name,
        dob,
        phone,
        gender: newMemberGender,
        emergency,
        address,
      });

      await addMemberToDailyRoster(String(date), memberUuid, parseInt(tripNumber || '1'));

      alert(`${name}님이 등록되고 명부에 추가되었습니다.`);
      router.push(`/roster-list?date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&tripNumber=${tripNumber}`);
    } catch (error) {
      console.error('Error creating new member:', error);
      alert('회원 등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useNativePullToRefresh(async () => {
    if (searchText.trim()) {
      await searchMembers();
    }
  });

  const tripNum = tripNumber ? parseInt(tripNumber, 10) || 1 : 1;

  return (
    <SubPageFrame title="회원 검색" dense>
      {/* 승선명부와 동일: 날짜 · 항차 툴바 */}
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
        </div>
        <button
          type="button"
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
            backgroundColor: showNewMemberForm ? '#F2F3F5' : '#1B6FF5',
            color: showNewMemberForm ? '#6F767E' : '#FFFFFF',
            border: 'none',
            boxShadow: 'none',
          }}
          onClick={() => setShowNewMemberForm(!showNewMemberForm)}
        >
          <IoAddOutline size={15} aria-hidden />
          {showNewMemberForm ? '취소' : '새 회원'}
        </button>
      </div>

      <div className="position-relative mb-2">
        <input
          type="text"
          placeholder="이름 검색"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            ...FIELD,
            paddingRight: 40,
            minHeight: 40,
            height: 40,
            borderRadius: 12,
            fontSize: 14,
          }}
        />
        <IoSearchOutline
          size={18}
          className="position-absolute top-50 end-0 translate-middle-y me-3"
          style={{ pointerEvents: 'none', color: '#9A9FA5' }}
        />
      </div>

      {showNewMemberForm && (
        <div className="p-3 mb-2" style={OHGO_CARD}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#1A1D1F',
              fontFamily: OHGO_FONT,
              marginBottom: 12,
            }}
          >
            새 회원 등록
          </div>
          <div className="mb-3">
            <label style={LABEL}>이름 *</label>
            <input
              type="text"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              style={FIELD}
            />
          </div>
          <div className="mb-3">
            <label style={LABEL}>생년월일 (8자리) *</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="예: 19900101"
              value={newMemberDob}
              onChange={(e) => setNewMemberDob(e.target.value.replace(/\D/g, '').slice(0, 8))}
              maxLength={8}
              style={FIELD}
            />
          </div>
          <div className="mb-3">
            <label style={LABEL}>전화번호 *</label>
            <input
              type="tel"
              value={newMemberPhone}
              onChange={(e) => setNewMemberPhone(e.target.value)}
              style={FIELD}
            />
          </div>
          <div className="mb-3">
            <label style={LABEL}>성별 *</label>
            <div className="d-flex gap-2">
              {(['남', '여'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className="flex-fill"
                  style={pillBtn(newMemberGender === g)}
                  onClick={() => setNewMemberGender(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-3">
            <label style={LABEL}>비상 연락처 *</label>
            <input
              type="tel"
              value={newMemberEmergency}
              onChange={(e) => setNewMemberEmergency(e.target.value)}
              style={FIELD}
            />
          </div>
          <div className="mb-3">
            <label style={LABEL}>주소 *</label>
            <input
              type="text"
              value={newMemberAddress}
              onChange={(e) => setNewMemberAddress(e.target.value)}
              style={FIELD}
            />
          </div>
          <button
            type="button"
            className={`btn w-100 d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
            style={{
              ...OHGO_CONFIRM_BTN,
              opacity: isSubmitting ? 0.65 : 1,
            }}
            onClick={createNewMemberAndAddToRoster}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <div className="spinner-border spinner-border-sm" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <span>등록 중...</span>
              </>
            ) : (
              <>
                <IoAddOutline size={20} className="flex-shrink-0" />
                <span>등록 및 명부 추가</span>
              </>
            )}
          </button>
        </div>
      )}

      {isLoading && searchText.trim() ? (
        <div className="text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary mb-2" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mb-0" style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT }}>
            검색 중…
          </p>
        </div>
      ) : searchResults.length > 0 ? (
        <div className="mb-3" style={{ ...OHGO_CARD, overflow: 'hidden' }}>
          {searchResults.map((member, index) => (
            <div key={member.id || member.uuid}>
              {index > 0 && <div style={OHGO_LIST_DIVIDER} />}
              <div
                className="d-flex align-items-center"
                style={{
                  gap: OHGO_LIST.gap,
                  padding: '10px 14px',
                  minHeight: 56,
                }}
              >
                <div
                  className="d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{
                    width: OHGO_LIST.iconBox,
                    height: OHGO_LIST.iconBox,
                    borderRadius: 12,
                    backgroundColor: '#EBF1FE',
                  }}
                >
                  <IoPersonOutline size={OHGO_LIST.iconGlyph} color="#1B6FF5" />
                </div>
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center gap-2 min-w-0">
                    <div
                      className="text-truncate"
                      style={{
                        fontSize: OHGO_LIST.titleSize,
                        fontWeight: OHGO_LIST.titleWeight,
                        color: OHGO_LIST.titleColor,
                        fontFamily: OHGO_FONT,
                      }}
                    >
                      {member.name}
                      {member.gender?.trim() ? ` (${member.gender.trim()})` : ''}
                    </div>
                    {member.hasBoarding ? (
                      <span
                        className="flex-shrink-0"
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          fontFamily: OHGO_FONT,
                          backgroundColor: '#E8F5E9',
                          color: '#2E7D32',
                        }}
                      >
                        명부
                      </span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      fontSize: OHGO_LIST.descSize,
                      color: OHGO_LIST.mutedColor,
                      fontFamily: OHGO_FONT,
                      marginTop: 2,
                    }}
                  >
                    생년월일 {member.dob || '미입력'}
                  </div>
                </div>
                <button
                  type="button"
                  className="d-flex align-items-center justify-content-center gap-1 flex-shrink-0"
                  onClick={() => addMemberToRoster(member)}
                  disabled={isLoading}
                  style={{
                    border: 'none',
                    borderRadius: 999,
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: OHGO_FONT,
                    backgroundColor: '#237FFF',
                    color: '#FFFFFF',
                    opacity: isLoading ? 0.65 : 1,
                    cursor: 'pointer',
                  }}
                >
                  <IoAddOutline size={16} className="flex-shrink-0" />
                  <span>추가</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : searchText.trim() && !isLoading ? (
        <EmptyState icon={IoSearchOutline} message="검색 결과가 없습니다." />
      ) : null}
    </SubPageFrame>
  );
}

export default function RosterMemberSearchPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <RosterMemberSearchContent />
    </Suspense>
  );
}

