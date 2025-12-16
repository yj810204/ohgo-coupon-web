'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUser } from '@/lib/storage';
import { FiX } from 'react-icons/fi';
import { IoFishOutline, IoTrophyOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';

// 메달 아이콘 컴포넌트
const MedalIcon = ({ rank, medalCount }: { rank: number; medalCount: number }) => {
  if (rank === 1) {
    return (
      <div className="rounded-circle bg-warning d-flex align-items-center justify-content-center" style={{ width: '36px', height: '36px' }}>
        <span className="fs-5">🥇</span>
      </div>
    );
  } else if (rank === 2 && medalCount >= 2) {
    return (
      <div className="rounded-circle bg-secondary d-flex align-items-center justify-content-center" style={{ width: '36px', height: '36px' }}>
        <span className="fs-5">🥈</span>
      </div>
    );
  } else if (rank === 3 && medalCount >= 3) {
    return (
      <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: '36px', height: '36px', backgroundColor: '#CD7F32' }}>
        <span className="fs-5">🥉</span>
      </div>
    );
  } else {
    return (
      <div className="rounded-circle bg-light d-flex align-items-center justify-content-center" style={{ width: '36px', height: '36px' }}>
        <span className="small fw-semibold text-dark">{rank}</span>
      </div>
    );
  }
};

// 사용자 타입 정의
type User = {
  id: string;
  name: string;
  totalPoint: number;
};

// 대회 정보 타입 정의
type Tournament = {
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
} | null;

// 그룹화된 물고기 기록 타입 정의
type GroupedFishCatch = {
  fishName: string;
  totalPoints: number;
  count: number;
  img?: string;
};

// 이름 중간을 '*'로 마스킹하는 함수
const maskName = (name: string): string => {
  if (!name) return name;
  
  if (name.length === 2) {
    return name.charAt(0) + '*';
  } else if (name.length > 2) {
    const firstChar = name.charAt(0);
    const lastChar = name.charAt(name.length - 1);
    const middleMask = '*'.repeat(name.length - 2);
    return firstChar + middleMask + lastChar;
  }
  
  return name;
};

function RankingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tournament, setTournament] = useState<Tournament>(null);
  const [totalMembers, setTotalMembers] = useState<number>(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rankingMedalCount, setRankingMedalCount] = useState<number>(3);
  
  // 물고기 잡은 기록 모달 관련 상태
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [groupedFishCatches, setGroupedFishCatches] = useState<GroupedFishCatch[]>([]);
  const [loadingFishCatches, setLoadingFishCatches] = useState(false);
  
  // 대회 정보 모달 관련 상태
  const [tournamentModalVisible, setTournamentModalVisible] = useState(false);
  const [user, setUser] = useState<{ uuid?: string; name?: string } | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const u = await getUser();
      if (!u?.uuid) {
        router.replace('/login');
        return;
      }
      setUser(u);
      setIsAdmin(u.isAdmin || false);
    };
    loadUser();
  }, [router]);

  useEffect(() => {
    if (user?.uuid) {
      fetchRankingData();
      fetchRankingMedalCount();
    }
  }, [user?.uuid]);

  // 순위 메달 표시 개수 설정 가져오기
  const fetchRankingMedalCount = async () => {
    try {
      // gameSettings/global에서 가져오기
      const gameSettingsDoc = await getDoc(doc(db, 'gameSettings', 'global'));
      
      if (gameSettingsDoc.exists()) {
        const data = gameSettingsDoc.data();
        if (data.ranking_medal_count !== undefined) {
          setRankingMedalCount(data.ranking_medal_count);
        } else {
          // 기본값 3
          setRankingMedalCount(3);
        }
      } else {
        // 문서가 없으면 기본값 3
        setRankingMedalCount(3);
      }
    } catch (error) {
      console.error('Error fetching ranking medal count:', error);
      // 오류 발생 시 기본값 3 유지
      setRankingMedalCount(3);
    }
  };
  
  const fetchTournamentData = async () => {
    try {
      const tournamentDoc = await getDoc(doc(db, 'gameSettings', 'tournament'));
      
      if (tournamentDoc.exists()) {
        const data = tournamentDoc.data();
        if (data.title && data.startDate && data.endDate) {
          setTournament({
            title: data.title,
            description: data.description || '',
            startDate: data.startDate.toDate(),
            endDate: data.endDate.toDate(),
          });
        } else {
          setTournament(null);
        }
      } else {
        setTournament(null);
      }
    } catch (error) {
      console.error('대회 정보 가져오기 오류:', error);
      setTournament(null);
    }
  };

  // 랭킹 데이터 가져오는 공통 함수
  const fetchRankingDataCommon = async () => {
    const q = query(
      collection(db, 'users'),
      orderBy('totalPoint', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const usersData: User[] = [];
    
    querySnapshot.forEach((doc) => {
      const userData = doc.data();
      usersData.push({
        id: doc.id,
        name: userData.name || '이름 없음',
        totalPoint: userData.totalPoint || 0,
      });
    });
    
    setTotalMembers(usersData.length);
    
    // 0포인트 초과인 사용자만 표시
    const filteredUsersData = usersData.filter(user => user.totalPoint > 0);
    
    setUsers(filteredUsersData);
    
    // 현재 사용자의 순위 찾기
    if (user?.uuid) {
      const myIndex = filteredUsersData.findIndex(u => u.id === user.uuid);
      if (myIndex !== -1) {
        setMyRank(myIndex + 1);
      } else {
        setMyRank(null);
      }
    }
  };

  const fetchRankingData = async () => {
    try {
      setLoading(true);
      await fetchTournamentData();
      await fetchRankingDataCommon();
    } catch (error) {
      console.error('랭킹 데이터 가져오기 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchTournamentData();
      await fetchRankingDataCommon();
      await fetchRankingMedalCount();
    } catch (error) {
      console.error('새로고침 중 오류 발생:', error);
    } finally {
      setRefreshing(false);
    }
  };

  
  // 사용자의 물고기 잡은 기록 가져오기
  const fetchUserFishCatches = async (userId: string) => {
    setLoadingFishCatches(true);
    try {
      const q = query(
        collection(db, `users/${userId}/points`),
        orderBy('at', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const catches: any[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        catches.push({
          id: doc.id,
          fishName: data.fishName || '이름 없음',
          point: data.point || 0,
          fishLevel: data.fishLevel || 1,
          extraPoint: data.extraPoint || 0,
          at: data.at.toDate(),
        });
      });
      
      // 물고기 이름별로 그룹화하고 포인트 합계 계산
      const fishGroups: Record<string, GroupedFishCatch> = {};
      
      catches.forEach(fish => {
        if (!fishGroups[fish.fishName]) {
          fishGroups[fish.fishName] = {
            fishName: fish.fishName,
            totalPoints: 0,
            count: 0,
            img: undefined
          };
        }
        
        fishGroups[fish.fishName].totalPoints += fish.point;
        fishGroups[fish.fishName].count += 1;
      });
      
      // 물고기 이미지 정보 가져오기
      const fishesCollection = collection(db, 'fishes');
      const fishesSnapshot = await getDocs(fishesCollection);
      const fishesData: Record<string, string> = {};
      
      fishesSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.name && data.img) {
          fishesData[data.name] = data.img;
        }
      });
      
      // 이미지 정보 추가
      Object.keys(fishGroups).forEach(fishName => {
        if (fishesData[fishName]) {
          fishGroups[fishName].img = fishesData[fishName];
        }
      });
      
      // 객체를 배열로 변환하고 포인트 내림차순으로 정렬
      const grouped = Object.values(fishGroups).sort((a, b) => 
        b.totalPoints - a.totalPoints
      );
      
      setGroupedFishCatches(grouped);
    } catch (error) {
      console.error('물고기 잡은 기록 가져오기 오류:', error);
      setGroupedFishCatches([]);
    } finally {
      setLoadingFishCatches(false);
    }
  };

  // 사용자 선택 시 모달 열기
  const handleUserSelect = (selectedUser: User) => {
    setSelectedUser(selectedUser);
    fetchUserFishCatches(selectedUser.id);
    setModalVisible(true);
  };

  // 대회 기간 포맷팅 함수
  const formatTournamentPeriod = () => {
    if (!tournament) return '';
    
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    };
    
    return `${formatDate(tournament.startDate)} ~ ${formatDate(tournament.endDate)}`;
  };

  if (!user) {
    return (
      <div className="d-flex min-vh-100 align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-vh-100 bg-light"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
        paddingBottom: '20px',
          }}
        >
      <PageHeader title="랭킹" />
      {loading ? (
        <div className="d-flex min-vh-100 align-items-center justify-content-center">
          <div className="text-center">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="text-muted">랭킹 정보를 불러오는 중...</p>
          </div>
        </div>
      ) : (
        <div className="container pb-4" style={{ paddingTop: '80px' }}>
          {tournament ? (
            <button
              onClick={() => setTournamentModalVisible(true)}
              className="w-100 btn btn-primary d-flex align-items-center justify-content-center gap-2 mb-3"
              style={{
                padding: '16px 20px',
                borderRadius: '12px',
                fontSize: '1rem',
                fontWeight: '600',
                boxShadow: '0 2px 8px rgba(0, 123, 255, 0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 123, 255, 0.3)';
              }}
            >
              <IoTrophyOutline size={24} />
              <span>{tournament.title}</span>
            </button>
          ) : (
            <div className="w-100 bg-secondary text-white py-3 px-4 text-center mb-3 rounded">
              <span className="fw-semibold">현재 진행 중인 대회가 없습니다</span>
            </div>
          )}
          
          <div className="card shadow-sm mb-3 border-0">
            <div className="card-body p-0">
          <div className="bg-secondary text-white">
            <div className="row g-0 px-3 py-2">
              <div className="col-2"><span className="fw-semibold">순위</span></div>
              <div className="col-6"><span className="fw-semibold">이름</span></div>
              <div className="col-4 text-end"><span className="fw-semibold">포인트</span></div>
            </div>
          </div>
          
              <div>
            {users.map((item, index) => {
              const isCurrentUser = item.id === user.uuid;
              return (
                <button
                  key={item.id}
                  onClick={() => handleUserSelect(item)}
                  className={`w-100 btn btn-link text-start text-decoration-none d-flex align-items-center px-3 py-3 border-bottom ${
                    isCurrentUser ? 'bg-info bg-opacity-10' : 'bg-white'
                  }`}
                >
                  <div className="col-2">
                    <MedalIcon rank={index + 1} medalCount={rankingMedalCount} />
                  </div>
                  
                  <div className="col-6">
                    <span className={`fw-medium ${
                      isCurrentUser ? 'text-primary' : 'text-dark'
                    }`}>
                      {isCurrentUser || isAdmin ? item.name : maskName(item.name)}
                      {isCurrentUser && ' (나)'}
                    </span>
                  </div>
                  
                  <div className="col-4 text-end">
                    <span className={`fw-semibold ${
                      isCurrentUser ? 'text-primary' : 'text-primary'
                    }`}>
                      {item.totalPoint.toLocaleString()}P
                    </span>
                  </div>
                </button>
              );
            })}
          
          {myRank && (
            <div className="bg-white border-top px-3 py-3 text-center">
              <p className="text-dark fw-medium mb-0">
                내 순위: {myRank}위 / {users.length}명 중
              </p>
                  </div>
                )}
              </div>
            </div>
          </div>
            </div>
          )}
          
          {/* 물고기 잡은 기록 모달 */}
          {modalVisible && selectedUser && (
            <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} tabIndex={-1}>
              <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
                <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
                  <div className="modal-header border-0" style={{ 
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    padding: '20px'
                  }}>
                    <h5 className="modal-title text-white fw-bold mb-0">
                      {selectedUser.id === user.uuid || isAdmin 
                        ? selectedUser.name 
                        : maskName(selectedUser.name)}님의 기록 요약
                    </h5>
                    <button type="button" className="btn-close btn-close-white" onClick={() => setModalVisible(false)} style={{ opacity: 0.8 }}></button>
                  </div>
                  
                  <div className="modal-body">
                    {loadingFishCatches ? (
                      <div className="d-flex flex-column align-items-center justify-content-center py-5">
                        <div className="spinner-border text-primary mb-3" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        <p className="text-muted">기록을 불러오는 중...</p>
                      </div>
                    ) : groupedFishCatches.length > 0 ? (
                      <div className="d-flex flex-column gap-3">
                        {groupedFishCatches.map((item) => (
                          <div key={item.fishName} className="bg-light rounded p-3 border">
                            <div className="d-flex align-items-center mb-2">
                              {item.img ? (
                                <img
                                  src={item.img}
                                  alt={item.fishName}
                                  width={24}
                                  height={24}
                                  className="me-2 rounded"
                                  style={{ objectFit: 'contain' }}
                                />
                              ) : (
                                <IoFishOutline size={18} className="text-primary me-2" />
                              )}
                              <span className="fw-medium text-dark">
                                {item.fishName} ({item.count}마리)
                              </span>
                            </div>
                            <div>
                              <span className="text-primary fw-semibold">
                                누적: {item.totalPoints.toLocaleString()}P
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="d-flex flex-column align-items-center justify-content-center py-5">
                        <IoFishOutline size={48} className="text-muted mb-2" />
                        <p className="text-muted">기록이 없습니다.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* 대회 정보 모달 */}
          {tournamentModalVisible && tournament && (
            <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} tabIndex={-1}>
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
                  <div className="modal-header border-0" style={{ 
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    padding: '20px'
                  }}>
                    <h5 className="modal-title text-white fw-bold mb-0">{tournament.title}</h5>
                    <button type="button" className="btn-close btn-close-white" onClick={() => setTournamentModalVisible(false)} style={{ opacity: 0.8 }}></button>
                  </div>
                  
                  <div className="modal-body">
                    <p className="text-muted small mb-3">{formatTournamentPeriod()}</p>
                    {tournament.description && (
                      <p className="text-dark" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{tournament.description}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
      )}
    </div>
  );
}

export default function RankingPage() {
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
      <RankingPageContent />
    </Suspense>
  );
}

