'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUser } from '@/lib/storage';
import { IoFishOutline, IoTrophyOutline, IoRefreshOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
const CARD: React.CSSProperties = { backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: 'none', overflow: 'hidden' };

const maskName = (name: string): string => {
  if (!name) return name;
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
};

type User = { id: string; name: string; totalPoint: number };
type Tournament = { title: string; description: string; startDate: Date; endDate: Date } | null;
type GroupedFishCatch = { fishName: string; totalPoints: number; count: number; img?: string };

function MedalBadge({ rank, medalCount }: { rank: number; medalCount: number }) {
  if (rank === 1) return <span style={{ fontSize: 22 }}>🥇</span>;
  if (rank === 2 && medalCount >= 2) return <span style={{ fontSize: 22 }}>🥈</span>;
  if (rank === 3 && medalCount >= 3) return <span style={{ fontSize: 22 }}>🥉</span>;
  return (
    <div className="rounded-circle d-flex align-items-center justify-content-center"
      style={{ width: 32, height: 32, backgroundColor: '#F7F8FA' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#6F767E', fontFamily: FONT }}>{rank}</span>
    </div>
  );
}

function RankingPageContent() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [tournament, setTournament] = useState<Tournament>(null);
  const [medalCount, setMedalCount] = useState(3);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<{ uuid?: string; name?: string; isAdmin?: boolean } | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [groupedFish, setGroupedFish] = useState<GroupedFishCatch[]>([]);
  const [loadingFish, setLoadingFish] = useState(false);
  const [tournamentModal, setTournamentModal] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const u = await getUser();
      if (!u?.uuid) { router.replace('/login'); return; }
      setUser(u);
      setIsAdmin(u.isAdmin || false);
    };
    loadUser();
  }, [router]);

  useEffect(() => { if (user?.uuid) loadAll(); }, [user?.uuid]);

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchTournament(), fetchMedalCount(), fetchRanking()]);
    } finally { setLoading(false); }
  };

  const fetchTournament = async () => {
    try {
      const snap = await getDoc(doc(db, 'gameSettings', 'tournament'));
      if (snap.exists()) {
        const d = snap.data();
        if (d.title && d.startDate && d.endDate) {
          setTournament({ title: d.title, description: d.description || '', startDate: d.startDate.toDate(), endDate: d.endDate.toDate() });
          return;
        }
      }
      setTournament(null);
    } catch { setTournament(null); }
  };

  const fetchMedalCount = async () => {
    try {
      const snap = await getDoc(doc(db, 'gameSettings', 'global'));
      if (snap.exists()) setMedalCount(snap.data().ranking_medal_count ?? 3);
    } catch { /* keep default */ }
  };

  const fetchRanking = async () => {
    try {
      const q = query(collection(db, 'users'), orderBy('totalPoint', 'desc'));
      const snap = await getDocs(q);
      const all: User[] = snap.docs.map(d => ({ id: d.id, name: d.data().name || '이름 없음', totalPoint: d.data().totalPoint || 0 }));
      const filtered = all.filter(u => u.totalPoint > 0);
      setUsers(filtered);
      const myIdx = filtered.findIndex(u => u.id === user?.uuid);
      setMyRank(myIdx >= 0 ? myIdx + 1 : null);
    } catch (e) { console.error(e); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchTournament(), fetchMedalCount(), fetchRanking()]);
    setRefreshing(false);
  };

  const handleUserSelect = async (u: User) => {
    setSelectedUser(u);
    setModalVisible(true);
    setLoadingFish(true);
    try {
      const q = query(collection(db, `users/${u.id}/points`), orderBy('at', 'desc'));
      const snap = await getDocs(q);
      const fishMap: Record<string, GroupedFishCatch> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const fn = data.fishName || '이름 없음';
        if (!fishMap[fn]) fishMap[fn] = { fishName: fn, totalPoints: 0, count: 0 };
        fishMap[fn].totalPoints += data.point || 0;
        fishMap[fn].count += 1;
      });
      const fishesSnap = await getDocs(collection(db, 'fishes'));
      fishesSnap.docs.forEach(d => {
        const data = d.data();
        if (data.name && data.img && fishMap[data.name]) fishMap[data.name].img = data.img;
      });
      setGroupedFish(Object.values(fishMap).sort((a, b) => b.totalPoints - a.totalPoints));
    } catch { setGroupedFish([]); }
    finally { setLoadingFish(false); }
  };

  if (!user) {
    return <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}><div className="spinner-border text-primary" /></div>;
  }

  const formatPeriod = () => {
    if (!tournament) return '';
    const fmt = (d: Date) => d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    return `${fmt(tournament.startDate)} ~ ${fmt(tournament.endDate)}`;
  };

  return (
    <div className="min-vh-100 pb-4" style={{ backgroundColor: '#F7F8FA', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <PageHeader title="랭킹" />
      <div className="container py-3" style={{ maxWidth: 480 }}>

        {/* 대회 배너 */}
        {tournament ? (
          <button
            type="button"
            onClick={() => setTournamentModal(true)}
            className="btn w-100 d-flex align-items-center gap-3 mb-4 p-3 text-start"
            style={{ backgroundColor: '#EBF1FE', borderRadius: 14, border: 'none' }}
          >
            <IoTrophyOutline size={20} color="#1B6FF5" className="flex-shrink-0" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1B6FF5', fontFamily: FONT, flexGrow: 1 }}>{tournament.title}</span>
            <span style={{ fontSize: 12, color: '#1B6FF5', flexShrink: 0 }}>자세히 →</span>
          </button>
        ) : (
          <div className="mb-4 p-3 text-center" style={{ backgroundColor: '#F7F8FA', borderRadius: 14 }}>
            <span style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>현재 진행 중인 대회가 없습니다</span>
          </div>
        )}

        {/* 새로고침 버튼 */}
        <div className="d-flex justify-content-end mb-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn d-flex align-items-center gap-1"
            style={{ backgroundColor: '#F7F8FA', borderRadius: 10, border: 'none', padding: '7px 12px', fontSize: 13, color: '#6F767E', fontFamily: FONT }}
          >
            <IoRefreshOutline size={15} />
            새로고침
          </button>
        </div>

        {/* 랭킹 리스트 */}
        {loading ? (
          <div className="py-5 text-center"><div className="spinner-border text-primary" /></div>
        ) : users.length === 0 ? (
          <div className="py-5 text-center" style={CARD}>
            <IoTrophyOutline size={52} color="#EFEFEF" />
            <p className="mt-3 mb-0" style={{ color: '#6F767E', fontFamily: FONT }}>랭킹 데이터가 없습니다.</p>
          </div>
        ) : (
          <div style={CARD}>
            {/* 헤더 */}
            <div className="d-flex px-3 py-2" style={{ backgroundColor: '#F7F8FA' }}>
              <div style={{ width: 48, fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: FONT }}>순위</div>
              <div style={{ flexGrow: 1, fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: FONT }}>이름</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: FONT, textAlign: 'right' }}>포인트</div>
            </div>

            {users.map((item, idx) => {
              const isMe = item.id === user.uuid;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleUserSelect(item)}
                  className="btn w-100 d-flex align-items-center px-3 py-3 text-start"
                  style={{
                    borderTop: '1px solid #F7F8FA',
                    borderRadius: 0,
                    background: isMe ? '#EBF1FE' : '#FFFFFF',
                  }}
                >
                  <div style={{ width: 48, flexShrink: 0 }}>
                    <MedalBadge rank={idx + 1} medalCount={medalCount} />
                  </div>
                  <div style={{ flexGrow: 1, fontSize: 14, fontWeight: isMe ? 700 : 500, color: isMe ? '#1B6FF5' : '#1A1D1F', fontFamily: FONT }}>
                    {isMe || isAdmin ? item.name : maskName(item.name)}
                    {isMe && <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.7 }}>(나)</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1B6FF5', fontFamily: FONT }}>
                    {item.totalPoint.toLocaleString()}P
                  </div>
                </button>
              );
            })}

            {myRank && (
              <div className="px-3 py-3 text-center" style={{ borderTop: '1px solid #F7F8FA', backgroundColor: '#F7F8FA' }}>
                <span style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
                  내 순위: <strong style={{ color: '#1B6FF5' }}>{myRank}위</strong> / {users.length}명 중
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 물고기 기록 모달 */}
      {modalVisible && selectedUser && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content border-0" style={{ borderRadius: 20, overflow: 'hidden' }}>
              <div className="modal-header border-0 px-4 pt-4 pb-2">
                <h5 className="modal-title fw-bold" style={{ color: '#1A1D1F', fontFamily: FONT }}>
                  {selectedUser.id === user.uuid || isAdmin ? selectedUser.name : maskName(selectedUser.name)}님의 기록
                </h5>
                <button type="button" className="btn-close" onClick={() => setModalVisible(false)} />
              </div>
              <div className="modal-body px-4">
                {loadingFish ? (
                  <div className="py-4 text-center"><div className="spinner-border text-primary" /></div>
                ) : groupedFish.length === 0 ? (
                  <div className="py-4 text-center">
                    <IoFishOutline size={40} color="#EFEFEF" />
                    <p className="mt-2 mb-0" style={{ color: '#6F767E', fontFamily: FONT }}>기록이 없습니다.</p>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {groupedFish.map(f => (
                      <div key={f.fishName} className="d-flex align-items-center gap-3 p-3 rounded-3" style={{ backgroundColor: '#F7F8FA' }}>
                        {f.img ? (
                          <img src={f.img} alt={f.fishName} width={28} height={28} style={{ objectFit: 'contain', borderRadius: 6 }} />
                        ) : (
                          <IoFishOutline size={22} color="#1B6FF5" />
                        )}
                        <div className="flex-grow-1">
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1D1F', fontFamily: FONT }}>{f.fishName}</div>
                          <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>{f.count}마리</div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1B6FF5', fontFamily: FONT }}>{f.totalPoints.toLocaleString()}P</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-footer border-0 px-4 pb-4 pt-2">
                <button type="button" onClick={() => setModalVisible(false)} className="btn w-100 fw-semibold" style={{ backgroundColor: '#F7F8FA', color: '#1A1D1F', borderRadius: 12, padding: 13, border: 'none', fontFamily: FONT }}>닫기</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 대회 정보 모달 */}
      {tournamentModal && tournament && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0" style={{ borderRadius: 20, overflow: 'hidden' }}>
              <div className="modal-header border-0 px-4 pt-4 pb-2">
                <h5 className="modal-title fw-bold" style={{ color: '#1A1D1F', fontFamily: FONT }}>{tournament.title}</h5>
                <button type="button" className="btn-close" onClick={() => setTournamentModal(false)} />
              </div>
              <div className="modal-body px-4">
                <p style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginBottom: 12 }}>{formatPeriod()}</p>
                {tournament.description && (
                  <p style={{ fontSize: 14, color: '#1A1D1F', fontFamily: FONT, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{tournament.description}</p>
                )}
              </div>
              <div className="modal-footer border-0 px-4 pb-4 pt-2">
                <button type="button" onClick={() => setTournamentModal(false)} className="btn w-100 fw-semibold" style={{ backgroundColor: '#1B6FF5', color: '#fff', borderRadius: 12, padding: 13, border: 'none', fontFamily: FONT }}>닫기</button>
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
    <Suspense fallback={<div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}><div className="spinner-border text-primary" /></div>}>
      <RankingPageContent />
    </Suspense>
  );
}
