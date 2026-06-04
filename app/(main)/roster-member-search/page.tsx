'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  searchMembersByName,
  addMemberToDailyRoster,
  createGuestMember,
  guestMemberExists,
} from '@/utils/roster-service';
import { getUser } from '@/lib/storage';
import { computeLegacyUuid } from '@/lib/legacy-uuid';
import { IoSearchOutline, IoAddOutline, IoArrowBackOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import { OhgoPageLoading } from '@/lib/page-styles';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import EmptyState from '@/components/EmptyState';

interface UserData {
  id: string;
  uuid: string;
  name: string;
  dob?: string;
  phone?: string;
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
      // Generate UUID for new member (using name-dob combination, same as login logic)
      const normalizedDob = newMemberDob.length === 8 ? newMemberDob : newMemberDob;
      const memberUuid = computeLegacyUuid(newMemberName, normalizedDob);

      if (await guestMemberExists(memberUuid)) {
        alert('이미 존재하는 회원입니다. 기존 회원을 검색해주세요.');
        setIsSubmitting(false);
        return;
      }

      await createGuestMember({
        uuid: memberUuid,
        name: newMemberName,
        dob: newMemberDob,
        phone: newMemberPhone,
        gender: newMemberGender,
        emergency: newMemberEmergency,
        address: newMemberAddress,
      });

      await addMemberToDailyRoster(String(date), memberUuid, parseInt(tripNumber || '1'));

      alert(`${newMemberName}님이 등록되고 명부에 추가되었습니다.`);
      router.push(`/roster-list?date=${date}&dateDisplay=${encodeURIComponent(dateDisplay || '')}&tripNumber=${tripNumber}`);
    } catch (error) {
      console.error('Error creating new member:', error);
      alert('회원 등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchMembers();
  };

  useNativePullToRefresh(async () => {
    if (searchText.trim()) {
      await searchMembers();
    }
  });

  return (
    <SubPageFrame title="회원 검색">
        <div className="ohgo-card mb-3">
          <div className="card-body">
            <h5 className="text-primary mb-3">{dateDisplay} {tripNumber}항차 - 회원 추가</h5>
            
            <div className="mb-3 position-relative">
              <input
                type="text"
                className="form-control form-control-lg"
                placeholder="회원 이름 검색"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ paddingRight: '40px' }}
              />
              <IoSearchOutline 
                size={20} 
                className="position-absolute top-50 end-0 translate-middle-y me-3 text-muted"
                style={{ pointerEvents: 'none' }}
              />
            </div>

            <button
              className={`btn w-100 d-flex align-items-center justify-content-center gap-2 ${
                showNewMemberForm ? 'btn-outline-secondary' : 'btn-success'
              }`}
              onClick={() => setShowNewMemberForm(!showNewMemberForm)}
              style={{
                padding: '12px',
                fontSize: '1rem',
                fontWeight: '500',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <IoAddOutline size={20} className="flex-shrink-0" />
              <span>{showNewMemberForm ? '새 회원 등록 취소' : '새 회원 등록'}</span>
            </button>
          </div>
        </div>

        {showNewMemberForm && (
          <div className="ohgo-card mb-3">
            <div className="card-body">
              <h6 className="mb-3">새 회원 등록</h6>
              <div className="mb-3">
                <label className="form-label">이름 *</label>
                <input
                  type="text"
                  className="form-control"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label">생년월일 (8자리) *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="예: 19900101"
                  value={newMemberDob}
                  onChange={(e) => setNewMemberDob(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  maxLength={8}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label">전화번호 *</label>
                <input
                  type="tel"
                  className="form-control"
                  value={newMemberPhone}
                  onChange={(e) => setNewMemberPhone(e.target.value)}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label">성별 *</label>
                <select
                  className="form-select"
                  value={newMemberGender}
                  onChange={(e) => setNewMemberGender(e.target.value)}
                  required
                >
                  <option value="">선택하세요</option>
                  <option value="남">남</option>
                  <option value="여">여</option>
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label">비상 연락처 *</label>
                <input
                  type="tel"
                  className="form-control"
                  value={newMemberEmergency}
                  onChange={(e) => setNewMemberEmergency(e.target.value)}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label">주소 *</label>
                <input
                  type="text"
                  className="form-control"
                  value={newMemberAddress}
                  onChange={(e) => setNewMemberAddress(e.target.value)}
                  required
                />
              </div>
              <button
                className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
                onClick={createNewMemberAndAddToRoster}
                disabled={isSubmitting}
                style={{
                  padding: '12px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease'
                }}
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
          </div>
        )}

        {isLoading && searchText.trim() ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="text-muted">검색 중...</p>
          </div>
        ) : searchResults.length > 0 ? (
          <div className="d-flex flex-column gap-2">
            {searchResults.map((member) => (
              <div key={member.id} className="ohgo-card">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className="mb-1">{member.name}</h6>
                      <div className="small text-muted">
                        <div>생년월일: {member.dob || '미입력'}</div>
                        <div>전화번호: {member.phone || '미입력'}</div>
                        {member.hasBoarding && (
                          <span className="badge bg-success mt-1">명부 정보 있음</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary d-flex align-items-center justify-content-center gap-1"
                      onClick={() => addMemberToRoster(member)}
                      disabled={isLoading}
                      style={{
                        minWidth: '80px',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        fontWeight: '500'
                      }}
                    >
                      <IoAddOutline size={16} className="flex-shrink-0" />
                      <span>추가</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : searchText.trim() && !isLoading ? (
          <EmptyState icon={IoSearchOutline} message="검색 결과가 없습니다." />
        ) : null}

      <div className="position-fixed bottom-0 start-0 end-0 bg-white border-top p-3 shadow-lg" style={{ maxWidth: 480, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
        <div className="container">
          <button 
            className="btn btn-secondary w-100 d-flex align-items-center justify-content-center gap-2"
            onClick={() => router.back()}
            style={{
              padding: '12px',
              fontSize: '1rem',
              fontWeight: '500',
              borderRadius: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            <IoArrowBackOutline size={20} />
            <span>돌아가기</span>
          </button>
        </div>
      </div>
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

