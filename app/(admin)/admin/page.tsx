'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import { IoChevronDownOutline, IoChevronUpOutline, IoChatbubbleEllipsesOutline } from 'react-icons/io5';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PageHeader from '@/components/PageHeader';

const STORAGE_KEY = 'collapsedSections';
const MEMBERS_CACHE_KEY = 'cachedMembers';
const CACHE_EXPIRY_TIME = 1000 * 60 * 30; // 30 minutes

type Member = {
  id: string;
  uuid: string;
  name: string;
  dob: string;
  createdAt: string;
  lastStampTime?: { seconds: number };
  gender?: string | null;
  tripCount?: number;
  couponCount?: number;
  halfCouponCount?: number;
  fullCouponCount?: number;
  stampCount?: number;
  hasMemo?: boolean;
  hasBoarding?: boolean;
};

type Section = {
  title: string;
  data: Member[];
  collapsed?: boolean;
};

// Helper function to get days from months
const getDaysFromMonths = (months: number) => months * 30;

// UTC ISO string → KST YYYY-MM-DD 변환
function toKSTDateStr(utcString: string): string {
  const date = new Date(utcString);
  date.setHours(date.getHours() + 9);
  return date.toISOString().split('T')[0];
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [todayMembers, setTodayMembers] = useState<Member[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [keyword, setKeyword] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [activeFilter, setActiveFilter] = useState<'all' | 'boarding' | 'coupon' | 'inactive'>('all');
  const [inactivePeriod, setInactivePeriod] = useState<3 | 6 | 12>(6);
  const [filterSectionExpanded, setFilterSectionExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [statsLoadingProgress, setStatsLoadingProgress] = useState<{ loaded: number; total: number } | null>(null);
  const statsLoadedRef = useRef<Set<string>>(new Set());
  const hasLoadedRef = useRef(false);
  const lastLoadedAtRef = useRef<number>(0);
  const cacheUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }

      const remoteUser = await getUserByUUID(user.uuid);
      if (!remoteUser?.isAdmin) {
        router.replace('/main');
        return;
      }

      await restoreCollapsedState();
      await fetchMembers();
    };
    checkAuth();
  }, [router]);

  const saveMembersToCache = useCallback(
    async (
      membersToCache: Member[],
      todayMembersToCache: Member[],
      sectionsToCache: Section[],
      options?: { silent?: boolean; timestampOverride?: number }
    ) => {
      try {
        const cacheData = {
          timestamp: options?.timestampOverride ?? Date.now(),
          members: membersToCache,
          todayMembers: todayMembersToCache,
          sections: sectionsToCache,
        };
        if (typeof window !== 'undefined') {
          localStorage.setItem(MEMBERS_CACHE_KEY, JSON.stringify(cacheData));
        }
      } catch (error) {
        console.error('❌ Error caching member data:', error);
      }
    },
    []
  );

  const restoreCollapsedState = async () => {
    try {
      if (typeof window !== 'undefined') {
        const json = localStorage.getItem(STORAGE_KEY);
        if (json) {
          setCollapsedSections(JSON.parse(json));
        }
      }
    } catch (err) {
      console.error('❗ 섹션 접힘 상태 복원 실패:', err);
    }
  };

  const groupByInitial = (users: Member[]) => {
    const grouped: { [key: string]: Member[] } = {};

    users.forEach((user) => {
      const initial = user.name?.charAt(0) || '#';
      if (!grouped[initial]) grouped[initial] = [];
      grouped[initial].push(user);
    });

    return Object.keys(grouped)
      .sort()
      .map((initial) => ({
        title: initial,
        data: grouped[initial].sort((a, b) => a.name.localeCompare(b.name)),
      }));
  };

  const loadStatsInBackground = async (uuids: string[]) => {
    statsLoadedRef.current.clear();
    
    const uniqueUuids = [...new Set(uuids.filter(uuid => uuid && typeof uuid === 'string'))];
    const totalCount = uniqueUuids.length;
    
    if (totalCount === 0) {
      setStatsLoadingProgress(null);
      return;
    }
    
    setIsLoadingStats(true);
    setStatsLoadingProgress({ loaded: 0, total: totalCount });
    
    const BATCH_SIZE = 15;
    const BATCH_DELAY = 100;
    
    let loadedCount = 0;
    
    for (let i = 0; i < uniqueUuids.length; i += BATCH_SIZE) {
      const batch = uniqueUuids.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map((uuid) => {
        if (statsLoadedRef.current.has(uuid)) {
          loadedCount++;
          setStatsLoadingProgress({ loaded: loadedCount, total: totalCount });
          return Promise.resolve();
        }
        
        return (async () => {
          try {
            const [couponsRef, stampsRef, memoRef, boardingRef, userDoc] = await Promise.all([
              getDocs(collection(db, `users/${uuid}/coupons`)),
              getDocs(collection(db, `users/${uuid}/stamps`)),
              getDocs(collection(db, `users/${uuid}/memo`)),
              getDocs(collection(db, `users/${uuid}/boarding`)),
              getDoc(doc(db, 'users', uuid)),
            ]);
            
            const activeCoupons = couponsRef.docs.filter((couponDoc: any) => !couponDoc.data().used);
            const halfCoupons = activeCoupons.filter((couponDoc: any) => couponDoc.data().isHalf === 'Y');
            const fullCoupons = activeCoupons.filter((couponDoc: any) => couponDoc.data().isHalf !== 'Y');
            const halfCouponCount = halfCoupons.length;
            const fullCouponCount = fullCoupons.length;
            const hasMemo = memoRef.docs.some((memoDoc: any) => !memoDoc.data().deleted);
            const boardingInfoDoc = boardingRef.docs.find((boardingDoc: any) => boardingDoc.id === 'info');
            const hasBoarding = !!boardingInfoDoc;
            const gender = boardingInfoDoc?.data()?.gender || null;
            const tripCount = userDoc.exists() ? (userDoc.data().tripCount !== undefined ? userDoc.data().tripCount : 0) : 0;
            
            statsLoadedRef.current.add(uuid);
            loadedCount++;
            
            setStatsLoadingProgress({ loaded: loadedCount, total: totalCount });
            
            setAllMembers(prev => {
              return prev.map(member => {
                if (member.uuid === uuid) {
                  return {
                    ...member,
                    couponCount: activeCoupons.length,
                    halfCouponCount,
                    fullCouponCount,
                    stampCount: stampsRef.docs.length,
                    hasMemo,
                    hasBoarding,
                    gender,
                    tripCount,
                  };
                }
                return member;
              });
            });
          } catch (error) {
            console.error(`❗ Error loading stats for ${uuid}:`, error);
            loadedCount++;
            setStatsLoadingProgress({ loaded: loadedCount, total: totalCount });
          }
        })();
      });
      
      await Promise.all(batchPromises);
      
      if (i + BATCH_SIZE < uniqueUuids.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }
    
    setIsLoadingStats(false);
    setStatsLoadingProgress(null);
  };

  const fetchMembers = async (forceRefresh = false) => {
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedData = localStorage.getItem(MEMBERS_CACHE_KEY);
        if (cachedData) {
          const { timestamp, members, todayMembers: cachedTodayMembers, sections: cachedSections } = JSON.parse(cachedData);
          
          if (Date.now() - timestamp < CACHE_EXPIRY_TIME) {
            console.log('✅ Using cached member data');
            setAllMembers(members);
            setTodayMembers(cachedTodayMembers);
            setSections(cachedSections);
            hasLoadedRef.current = true;
            lastLoadedAtRef.current = timestamp ?? Date.now();
            setLoading(false);
            if (members.some((m: Member) => m.couponCount === undefined)) {
              loadStatsInBackground(members.map((m: Member) => m.uuid));
            }
            return;
          }
        }
      } catch (error) {
        console.error('❗ Error loading cached members:', error);
      }
    }
    
    setLoading(true);
    console.log('📥 Loading basic member info...');
    const snapshot = await getDocs(collection(db, 'users'));
    const users: Member[] = snapshot.docs.map(doc => ({
      id: doc.id,
      uuid: doc.id,
      name: doc.data().name,
      dob: doc.data().dob,
      createdAt: doc.data().createdAt,
      lastStampTime: doc.data().lastStampTime,
      gender: undefined,
      tripCount: undefined,
      couponCount: undefined,
      halfCouponCount: undefined,
      fullCouponCount: undefined,
      stampCount: undefined,
      hasMemo: undefined,
      hasBoarding: undefined,
    }));

    const todayKST = new Date();
    todayKST.setHours(todayKST.getHours() + 9);
    const todayDateStr = todayKST.toISOString().split('T')[0];

    const joinedToday = users.filter(user =>
      user.createdAt && toKSTDateStr(user.createdAt) === todayDateStr
    );

    const stampedToday = users.filter(user => {
      if (!user.lastStampTime?.seconds) return false;
      const kst = new Date(user.lastStampTime.seconds * 1000);
      kst.setHours(kst.getHours() + 9);
      const stampDate = kst.toISOString().split('T')[0];
      return stampDate === todayDateStr;
    });

    const grouped = groupByInitial(
      users.filter(
        user => !joinedToday.includes(user) && !stampedToday.includes(user)
      )
    );

    const todaySections: Section[] = [];
    if (joinedToday.length > 0) {
      todaySections.push({
        title: '오늘 가입한 회원',
        data: joinedToday,
      });
    }
    if (stampedToday.length > 0) {
      todaySections.push({
        title: '오늘 스탬프 적립',
        data: stampedToday,
      });
    }

    const fullSections = [...todaySections, ...grouped];
    setAllMembers(users);
    setTodayMembers(joinedToday);
    setSections(fullSections);
    setLoading(false);
    hasLoadedRef.current = true;
    lastLoadedAtRef.current = Date.now();
    console.log('✅ Basic member info loaded, starting stats loading...');

    loadStatsInBackground(users.map(u => u.uuid));
  };

  useEffect(() => {
    if (cacheUpdateTimeoutRef.current) {
      clearTimeout(cacheUpdateTimeoutRef.current);
      cacheUpdateTimeoutRef.current = null;
    }

    if (allMembers.length === 0) return;

    cacheUpdateTimeoutRef.current = setTimeout(() => {
      cacheUpdateTimeoutRef.current = null;
      saveMembersToCache(allMembers, todayMembers, sections, { silent: true });
      lastLoadedAtRef.current = Date.now();
    }, 300);

    return () => {
      if (cacheUpdateTimeoutRef.current) {
        clearTimeout(cacheUpdateTimeoutRef.current);
        cacheUpdateTimeoutRef.current = null;
      }
    };
  }, [allMembers, todayMembers, sections, saveMembersToCache]);

  useEffect(() => {
    if (allMembers.length === 0) return;
    if (keyword.trim().length > 0) return;

    const todayKST = new Date();
    todayKST.setHours(todayKST.getHours() + 9);
    const todayDateStr = todayKST.toISOString().split('T')[0];

    const joinedToday = allMembers.filter(user =>
      user.createdAt && toKSTDateStr(user.createdAt) === todayDateStr
    );

    const stampedToday = allMembers.filter(user => {
      if (!user.lastStampTime?.seconds) return false;
      const kst = new Date(user.lastStampTime.seconds * 1000);
      kst.setHours(kst.getHours() + 9);
      const stampDate = kst.toISOString().split('T')[0];
      return stampDate === todayDateStr;
    });

    const grouped = groupByInitial(
      allMembers.filter(
        user => !joinedToday.includes(user) && !stampedToday.includes(user)
      )
    );

    const todaySections: Section[] = [];
    if (joinedToday.length > 0) {
      todaySections.push({
        title: '오늘 가입한 회원',
        data: joinedToday,
      });
    }
    if (stampedToday.length > 0) {
      todaySections.push({
        title: '오늘 스탬프 적립',
        data: stampedToday,
      });
    }

    const fullSections = [...todaySections, ...grouped];
    setSections(fullSections);
    setTodayMembers(joinedToday);
  }, [allMembers, keyword]);

  const handleSearch = (text: string) => {
    setKeyword(text);
    if (allMembers.length === 0) {
      setSections([]);
      return;
    }
    
    if (text.trim().length === 0) {
      return;
    }
    
    let filtered = allMembers.filter((m) =>
      m.name.toLowerCase().includes(text.toLowerCase())
    );
    
    if (activeFilter === 'boarding') {
      filtered = filtered.filter(member => member.hasBoarding);
    } else if (activeFilter === 'coupon') {
      filtered = filtered.filter(member => member.couponCount && member.couponCount > 0);
    } else if (activeFilter === 'inactive') {
      const today = new Date();
      const inactiveDays = getDaysFromMonths(inactivePeriod);
      filtered = filtered.filter(member => {
        if (!member.lastStampTime?.seconds) return true;
        const lastStampDate = new Date(member.lastStampTime.seconds * 1000);
        const daysDiff = Math.floor((today.getTime() - lastStampDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff >= inactiveDays;
      });
    }
    
    setSections(groupByInitial(filtered));
  };
  
  const applyFilter = (filterType: 'all' | 'boarding' | 'coupon' | 'inactive') => {
    setActiveFilter(filterType);
    
    let filtered = allMembers.filter((m) =>
      m.name.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (filterType === 'boarding') {
      filtered = filtered.filter(member => member.hasBoarding);
    } else if (filterType === 'coupon') {
      filtered = filtered.filter(member => member.couponCount && member.couponCount > 0);
    } else if (filterType === 'inactive') {
      const today = new Date();
      const inactiveDays = getDaysFromMonths(inactivePeriod);
      filtered = filtered.filter(member => {
        if (!member.lastStampTime?.seconds) return true;
        const lastStampDate = new Date(member.lastStampTime.seconds * 1000);
        const daysDiff = Math.floor((today.getTime() - lastStampDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff >= inactiveDays;
      });
    }
    
    setSections(groupByInitial(filtered));
  };

  const toggleSection = async (title: string) => {
    const updated = {
      ...collapsedSections,
      [title]: !collapsedSections[title],
    };
    setCollapsedSections(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMembers(true);
    setRefreshing(false);
  };

  const { containerRef, isRefreshing: isPulling, pullProgress } = usePullToRefresh({
    onRefresh: onRefresh,
    enabled: true,
  });

  const filterCounts = useMemo(() => {
    const today = new Date();
    const inactiveDays = getDaysFromMonths(inactivePeriod);
    return {
      boarding: allMembers.filter(member => member.hasBoarding).length,
      coupon: allMembers.filter(member => member.couponCount && member.couponCount > 0).length,
      inactive: allMembers.filter(member => {
        if (!member.lastStampTime?.seconds) return true;
        const lastStampDate = new Date(member.lastStampTime.seconds * 1000);
        const daysDiff = Math.floor((today.getTime() - lastStampDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff >= inactiveDays;
      }).length,
    };
  }, [allMembers, inactivePeriod]);

  if (loading) {
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

  const totalCount = sections.reduce((acc, sec) => acc + sec.data.length, 0);

  return (
    <div 
      ref={containerRef}
      className="min-vh-100 bg-light"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
        paddingBottom: '20px',
      }}
    >
      <PageHeader title="회원 관리" />
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
            <button
              onClick={() => setFilterSectionExpanded(!filterSectionExpanded)}
              className="btn btn-link text-start p-0 w-100 d-flex justify-content-between align-items-center text-decoration-none"
            >
              <h5 className="mb-0 text-primary">
                회원 검색 <small className="text-muted">({totalCount})</small>
              </h5>
              {filterSectionExpanded ? (
                <IoChevronUpOutline size={20} className="text-primary" />
              ) : (
                <IoChevronDownOutline size={20} className="text-primary" />
              )}
            </button>
            <input
              type="text"
              className="form-control mt-2"
              placeholder="이름으로 검색"
              value={keyword}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {filterSectionExpanded && (
              <>
                <div className="d-flex flex-wrap gap-2 mt-3 pt-3 border-top">
                  <button
                    onClick={() => applyFilter(activeFilter === 'boarding' ? 'all' : 'boarding')}
                    className={`btn btn-sm ${activeFilter === 'boarding' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  >
                    명부: {filterCounts.boarding}명
                  </button>
                  <button
                    onClick={() => applyFilter(activeFilter === 'coupon' ? 'all' : 'coupon')}
                    className={`btn btn-sm ${activeFilter === 'coupon' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  >
                    쿠폰: {filterCounts.coupon}명
                  </button>
                  <button
                    onClick={() => applyFilter(activeFilter === 'inactive' ? 'all' : 'inactive')}
                    className={`btn btn-sm ${activeFilter === 'inactive' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  >
                    {inactivePeriod}개월+ 미활동: {filterCounts.inactive}명
                  </button>
                </div>
                {activeFilter === 'inactive' && (
                  <div className="mt-3 pt-3 border-top">
                    <label className="form-label small text-muted">미활동 기간 선택:</label>
                    <div className="btn-group w-100" role="group">
                      <button
                        type="button"
                        onClick={() => setInactivePeriod(3)}
                        className={`btn btn-sm ${inactivePeriod === 3 ? 'btn-primary' : 'btn-outline-secondary'}`}
                      >
                        3개월
                      </button>
                      <button
                        type="button"
                        onClick={() => setInactivePeriod(6)}
                        className={`btn btn-sm ${inactivePeriod === 6 ? 'btn-primary' : 'btn-outline-secondary'}`}
                      >
                        6개월
                      </button>
                      <button
                        type="button"
                        onClick={() => setInactivePeriod(12)}
                        className={`btn btn-sm ${inactivePeriod === 12 ? 'btn-primary' : 'btn-outline-secondary'}`}
                      >
                        12개월
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="list-group">
          {sections.map((section) => {
            const isCollapsed = collapsedSections[section.title] ?? false;
            const isTodaySection = section.title === '오늘 가입한 회원';
            const isStampTodaySection = section.title === '오늘 스탬프 적립';
            
            return (
              <div key={section.title}>
                <button
                  onClick={() => toggleSection(section.title)}
                  className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
                    isTodaySection ? 'bg-danger text-white' : 
                    isStampTodaySection ? 'bg-success text-white' : 
                    'bg-info text-white'
                  }`}
                >
                  <div className="d-flex align-items-center">
                    {isCollapsed ? (
                      <IoChevronDownOutline size={16} className="me-2" />
                    ) : (
                      <IoChevronUpOutline size={16} className="me-2" />
                    )}
                    <span className="fw-semibold">{section.title}</span>
                  </div>
                  <span className="badge bg-light text-dark rounded-pill">({section.data.length})</span>
                </button>
                {!isCollapsed && section.data.map((member) => {
                  const lastStampDate = member.lastStampTime?.seconds 
                    ? new Date(member.lastStampTime.seconds * 1000)
                    : null;
                  const today = new Date();
                  const daysDiff = lastStampDate
                    ? Math.floor((today.getTime() - lastStampDate.getTime()) / (1000 * 60 * 60 * 24))
                    : null;
                  const inactiveDays = getDaysFromMonths(inactivePeriod);
                  const isInactive = daysDiff !== null && daysDiff >= inactiveDays;

                  return (
                    <button
                      key={member.uuid}
                      onClick={() => router.push(`/member-detail?uuid=${member.uuid}&name=${member.name}&dob=${member.dob}`)}
                      className="list-group-item list-group-item-action"
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="flex-grow-1">
                          <div className="d-flex align-items-center mb-2">
                            <h6 className="mb-0 me-2">{member.name}</h6>
                            {member.hasMemo && (
                              <IoChatbubbleEllipsesOutline size={16} className="text-primary" />
                            )}
                          </div>
                          <div className="d-flex flex-wrap gap-2 mb-2">
                            {member.stampCount !== undefined ? (
                              member.stampCount > 0 && (
                                <span className="badge bg-secondary">
                                  스탬프 {member.stampCount}
                                </span>
                              )
                            ) : (
                              <span className="spinner-border spinner-border-sm" role="status"></span>
                            )}
                            {member.halfCouponCount !== undefined && member.fullCouponCount !== undefined ? (
                              <>
                                {member.halfCouponCount > 0 && (
                                  <span className="badge bg-warning text-dark">
                                    쿠폰(50%) {member.halfCouponCount}
                                  </span>
                                )}
                                {member.fullCouponCount > 0 && (
                                  <span className="badge bg-warning text-dark">
                                    쿠폰 {member.fullCouponCount}
                                  </span>
                                )}
                              </>
                            ) : (
                              member.stampCount === undefined && (
                                <span className="spinner-border spinner-border-sm" role="status"></span>
                              )
                            )}
                            {member.tripCount !== undefined ? (
                              member.tripCount > 0 && (
                                <span className="badge bg-primary">
                                  승선 {member.tripCount}
                                </span>
                              )
                            ) : (
                              <span className="spinner-border spinner-border-sm" role="status"></span>
                            )}
                          </div>
                        </div>
                        <div className="text-end ms-3" style={{ minWidth: '120px' }}>
                          <div className="d-flex align-items-center justify-content-end mb-1">
                            <small className="text-muted me-2">
                              {member.dob?.length === 8 
                                ? `${member.dob.slice(2, 4)}-${member.dob.slice(4, 6)}-${member.dob.slice(6, 8)}` 
                                : member.dob}
                            </small>
                            {member.gender === undefined ? (
                              <span className="spinner-border spinner-border-sm" role="status"></span>
                            ) : member.gender ? (
                              <span className="badge bg-secondary">{member.gender}</span>
                            ) : (
                              <span className="badge bg-warning">✕</span>
                            )}
                          </div>
                          <small className="text-muted d-block">
                            {toKSTDateStr(member.createdAt).slice(2)}
                          </small>
                          {lastStampDate && (
                            <small className={`d-block ${isInactive ? 'text-warning' : 'text-muted'}`}>
                              최근 스탬프: {toKSTDateStr(lastStampDate.toISOString()).slice(2)}
                              {isInactive && ` (${inactivePeriod}개월+)`}
                            </small>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {sections.length === 0 && (
          <div className="text-center py-5">
            <p className="text-muted">일치하는 회원이 없습니다.</p>
          </div>
        )}

        {statsLoadingProgress && (
          <div className="position-fixed bottom-0 start-0 end-0 bg-white border-top p-3 shadow">
            <div className="progress mb-2" style={{ height: '6px' }}>
              <div
                className="progress-bar"
                role="progressbar"
                style={{ width: `${(statsLoadingProgress.loaded / statsLoadingProgress.total) * 100}%` }}
              ></div>
            </div>
            <small className="text-muted text-center d-block">
              {statsLoadingProgress.loaded}명 로딩 중... ({statsLoadingProgress.total}명 중)
            </small>
          </div>
        )}
      </div>
    </div>
  );
}
