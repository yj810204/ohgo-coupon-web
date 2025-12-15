'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUser } from '@/lib/storage';
import { v5 as uuidv5 } from 'uuid';
import { UUID_NAMESPACE } from '@/lib/firebase-auth';
import { IoSearchOutline, IoAddOutline, IoArrowBackOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';

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
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      
      const searchTextLower = searchText.toLowerCase();
      const filteredUsers: UserData[] = snapshot.docs
        .map(doc => ({
          id: doc.id,
          uuid: doc.data().uuid || doc.id,
          ...doc.data()
        } as UserData))
        .filter(user => 
          user.name && user.name.toLowerCase().includes(searchTextLower)
        );
      
      const usersWithDetails = await Promise.all(
        filteredUsers.map(async (user) => {
          const boardingInfoRef = doc(db, 'users', user.uuid, 'boarding', 'info');
          const boardingInfoSnap = await getDoc(boardingInfoRef);
          const hasBoarding = boardingInfoSnap.exists();
          
          return {
            ...user,
            hasBoarding
          };
        })
      );
      
      setSearchResults(usersWithDetails);
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
      const attendanceRef = doc(db, 'attendance', String(date));
      const attendanceSnap = await getDoc(attendanceRef);

      let memberIds: string[] = attendanceSnap.exists() && attendanceSnap.data().members
        ? attendanceSnap.data().members
        : [];

      if (memberIds.includes(member.uuid)) {
        alert(`${member.name}님은 이미 명부에 추가되어 있습니다.`);
        setIsLoading(false);
        return;
      }

      memberIds.push(member.uuid);

      if (attendanceSnap.exists()) {
        await updateDoc(attendanceRef, {
          members: memberIds,
          tripNumber: parseInt(tripNumber) || 1
        });
      } else {
        await setDoc(attendanceRef, {
          members: memberIds,
          tripNumber: parseInt(tripNumber) || 1
        });
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
      const memberUuid = uuidv5(`${newMemberName}-${normalizedDob}`, UUID_NAMESPACE);

      // Check if user already exists by UUID
      const userRef = doc(db, 'users', memberUuid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        alert('이미 존재하는 회원입니다. 기존 회원을 검색해주세요.');
        setIsSubmitting(false);
        return;
      }

      // Create user document with UUID
      await setDoc(userRef, {
        uuid: memberUuid,
        name: newMemberName,
        dob: newMemberDob,
        phone: newMemberPhone,
        createdAt: new Date().toISOString()
      });

      // Create boarding info
      const boardingInfoRef = doc(db, 'users', memberUuid, 'boarding', 'info');
      await setDoc(boardingInfoRef, {
        name: newMemberName,
        birth: newMemberDob,
        gender: newMemberGender,
        phone: newMemberPhone,
        emergency: newMemberEmergency,
        address: newMemberAddress
      });

      // Add to roster
      const attendanceRef = doc(db, 'attendance', String(date));
      const attendanceSnap = await getDoc(attendanceRef);

      let memberIds: string[] = attendanceSnap.exists() && attendanceSnap.data().members
        ? attendanceSnap.data().members
        : [];

      memberIds.push(memberUuid);

      if (attendanceSnap.exists()) {
        await updateDoc(attendanceRef, {
          members: memberIds,
          tripNumber: parseInt(tripNumber || '1')
        });
      } else {
        await setDoc(attendanceRef, {
          members: memberIds,
          tripNumber: parseInt(tripNumber || '1')
        });
      }

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

  const onRefresh = async () => {
    if (searchText.trim()) {
      await searchMembers();
    }
  };


  return (
    <div 
      className="min-vh-100 bg-light"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
        paddingBottom: showNewMemberForm ? '20px' : '80px',
      }}
    >
      <PageHeader title="회원 검색" />
      <div className="container pb-4" style={{ paddingTop: '80px' }}>
        <div className="card shadow-sm mb-3">
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
          <div className="card shadow-sm mb-3">
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
              <div key={member.id} className="card shadow-sm">
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
          <div className="text-center py-5">
            <p className="text-muted">검색 결과가 없습니다.</p>
          </div>
        ) : null}
      </div>

      <div className="position-fixed bottom-0 start-0 end-0 bg-white border-top p-3 shadow-lg">
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
    </div>
  );
}

export default function RosterMemberSearchPage() {
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
      <RosterMemberSearchContent />
    </Suspense>
  );
}

