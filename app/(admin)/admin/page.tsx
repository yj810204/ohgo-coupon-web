'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';
import {
  listAdminMembers,
  listAdminGuests,
  loadAdminMemberStats,
  loadAdminGuestStats,
  invalidateAdminMemberStatsCache,
  type AdminMember,
} from '@/utils/admin-member-service';
import {
  IoChevronDownOutline,
  IoChevronUpOutline,
  IoChevronForwardOutline,
  IoChatbubbleEllipsesOutline,
  IoPeopleOutline,
} from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import MemberListAvatar from '@/components/MemberListAvatar';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';

const CARD: React.CSSProperties = { ...OHGO_CARD };

function sectionAccent(title: string): string {
  if (title === '오늘 가입한 회원') return '#FF3B30';
  if (title === '오늘 스탬프 적립') return '#34C759';
  return '#1B6FF5';
}

const MEMBER_STAT_CELL_WIDTH = 44;

type MemberStatCell = {
  key: string;
  label: string;
  value: number;
  valueColor: string;
};

function buildMemberStatCells(member: Member): MemberStatCell[] {
  const cells: MemberStatCell[] = [];
  if ((member.tripCount ?? 0) > 0) {
    cells.push({
      key: 'trip',
      label: '승선',
      value: member.tripCount as number,
      valueColor: '#1A1D1F',
    });
  }
  if ((member.stampCount ?? 0) > 0) {
    cells.push({
      key: 'stamp',
      label: '스탬프',
      value: member.stampCount as number,
      valueColor: '#1B6FF5',
    });
  }
  if ((member.halfCouponCount ?? 0) > 0) {
    cells.push({
      key: 'half',
      label: '50%',
      value: member.halfCouponCount as number,
      valueColor: '#E65100',
    });
  }
  if ((member.fullCouponCount ?? 0) > 0) {
    cells.push({
      key: 'full',
      label: '쿠폰',
      value: member.fullCouponCount as number,
      valueColor: '#E65100',
    });
  }
  return cells;
}

function MemberKeyStats({ member }: { member: Member }) {
  const statsLoading =
    member.stampCount === undefined ||
    member.tripCount === undefined ||
    member.halfCouponCount === undefined ||
    member.fullCouponCount === undefined;

  if (statsLoading) {
    return (
      <span
        className="flex-shrink-0 align-self-center"
        style={{ fontSize: 10, color: '#ABABAB', fontFamily: OHGO_FONT }}
        aria-hidden
      >
        …
      </span>
    );
  }

  const cells = buildMemberStatCells(member);
  if (cells.length === 0) return null;

  const cellBase: React.CSSProperties = {
    width: MEMBER_STAT_CELL_WIDTH,
    minWidth: MEMBER_STAT_CELL_WIDTH,
    padding: '2px 4px',
    textAlign: 'center',
    fontFamily: OHGO_FONT,
    lineHeight: 1.2,
  };

  return (
    <div
      className="ohgo-member-stat-group d-flex flex-shrink-0 overflow-hidden align-self-center"
      style={{
        borderRadius: 8,
        border: '1px solid #E0E4EA',
        backgroundColor: '#FFFFFF',
      }}
    >
      {cells.map((cell, index) => (
        <div
          key={cell.key}
          style={{
            ...cellBase,
            borderRight: index < cells.length - 1 ? '1px solid #EEF0F2' : undefined,
          }}
        >
          <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 500 }}>{cell.label}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: cell.valueColor, marginTop: 1 }}>
            {cell.value}
          </div>
        </div>
      ))}
    </div>
  );
}

const STORAGE_KEY = 'collapsedSections';
const MEMBERS_CACHE_KEY = 'cachedMembers';
/** 즉시 표시용 캐시 TTL — 만료 전이라도 백그라운드에서 항상 재검증 */
const CACHE_EXPIRY_TIME = 1000 * 60 * 5; // 5 minutes

import { OHGO_CARD, OHGO_FONT, OHGO_INPUT } from '@/lib/page-styles';

type Member = AdminMember;

type Section = {
  title: string;
  data: Member[];
  collapsed?: boolean;
};

const TODAY_SECTION_TITLES = new Set(['오늘 가입한 회원', '오늘 스탬프 적립']);

function sectionIsCollapsed(title: string, collapsed: Record<string, boolean>): boolean {
  return collapsed[title] ?? !TODAY_SECTION_TITLES.has(title);
}

function uuidsInExpandedSections(
  secs: Section[],
  collapsed: Record<string, boolean>
): string[] {
  return secs
    .filter((s) => !sectionIsCollapsed(s.title, collapsed))
    .flatMap((s) => s.data.map((m) => m.uuid));
}

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
  const [loading, setLoading] = useState(false); // 초기 로딩 표시 제거 - 비동기로 조용히 로드
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [todayMembers, setTodayMembers] = useState<Member[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [keyword, setKeyword] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [activeFilter, setActiveFilter] = useState<'all' | 'boarding' | 'coupon' | 'inactive'>('all');
  const [memberViewMode, setMemberViewMode] = useState<'members' | 'guests'>('members');
  const [guestMembers, setGuestMembers] = useState<Member[]>([]);
  const [inactivePeriod, setInactivePeriod] = useState<3 | 6 | 12>(6);
  const [filterSectionExpanded, setFilterSectionExpanded] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [statsLoadingProgress, setStatsLoadingProgress] = useState<{ loaded: number; total: number } | null>(null);
  const statsLoadedRef = useRef<Set<string>>(new Set());
  const hasLoadedRef = useRef(false);
  const lastLoadedAtRef = useRef<number>(0);
  const cacheUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapsedSectionsRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const checkAuth = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }

      if (!appUser.isAdmin && !appUser.isCaptain) {
        router.replace('/main');
        return;
      }

      restoreCollapsedState();
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

  const restoreCollapsedState = () => {
    try {
      if (typeof window !== 'undefined') {
        const json = localStorage.getItem(STORAGE_KEY);
        if (json) {
          const parsed = JSON.parse(json) as Record<string, boolean>;
          setCollapsedSections(parsed);
          collapsedSectionsRef.current = parsed;
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

  const loadStatsInBackground = async (uuids: string[], options?: { reset?: boolean }) => {
    if (options?.reset) {
      statsLoadedRef.current.clear();
    }

    const uniqueUuids = [...new Set(uuids.filter((uuid) => uuid && typeof uuid === 'string'))];
    const pendingUuids = uniqueUuids.filter((uuid) => !statsLoadedRef.current.has(uuid));
    const totalCount = pendingUuids.length;

    if (totalCount === 0) {
      setStatsLoadingProgress(null);
      return;
    }

    setIsLoadingStats(true);
    setStatsLoadingProgress({ loaded: 0, total: totalCount });

    const BATCH_SIZE = 25;
    const BATCH_DELAY = 50;

    let loadedCount = 0;

    for (let i = 0; i < pendingUuids.length; i += BATCH_SIZE) {
      const batch = pendingUuids.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map((uuid) =>
        (async () => {
          try {
            const stats = await loadAdminMemberStats(uuid);
            statsLoadedRef.current.add(uuid);
            loadedCount++;

            if (loadedCount % BATCH_SIZE === 0 || loadedCount === totalCount) {
              setStatsLoadingProgress({ loaded: loadedCount, total: totalCount });
            }

            setAllMembers((prev) =>
              prev.map((member) =>
                member.uuid === uuid
                  ? {
                      ...member,
                      couponCount: stats.couponCount,
                      halfCouponCount: stats.halfCouponCount,
                      fullCouponCount: stats.fullCouponCount,
                      stampCount: stats.stampCount,
                      hasMemo: stats.hasMemo,
                      hasBoarding: stats.hasBoarding,
                      gender: stats.gender,
                      tripCount: stats.tripCount,
                    }
                  : member
              )
            );
          } catch (error) {
            console.error(`❗ Error loading stats for ${uuid}:`, error);
            loadedCount++;
            if (loadedCount % BATCH_SIZE === 0 || loadedCount === totalCount) {
              setStatsLoadingProgress({ loaded: loadedCount, total: totalCount });
            }
          }
        })()
      );

      await Promise.all(batchPromises);

      if (i + BATCH_SIZE < pendingUuids.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
      }
    }

    setIsLoadingStats(false);
    setStatsLoadingProgress(null);
  };

  const loadGuestStatsInBackground = async (uuids: string[]) => {
    const uniqueUuids = [...new Set(uuids.filter((uuid) => uuid && typeof uuid === 'string'))];
    if (uniqueUuids.length === 0) return;

    const BATCH_SIZE = 25;
    for (let i = 0; i < uniqueUuids.length; i += BATCH_SIZE) {
      const batch = uniqueUuids.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (uuid) => {
          try {
            const stats = await loadAdminGuestStats(uuid);
            setGuestMembers((prev) =>
              prev.map((member) =>
                member.uuid === uuid
                  ? {
                      ...member,
                      couponCount: stats.couponCount,
                      halfCouponCount: stats.halfCouponCount,
                      fullCouponCount: stats.fullCouponCount,
                      stampCount: stats.stampCount,
                      hasBoarding: stats.hasBoarding,
                      gender: stats.gender,
                      tripCount: 0,
                    }
                  : member
              )
            );
          } catch (error) {
            console.error(`❗ Error loading guest stats for ${uuid}:`, error);
          }
        })
      );
    }
  };

  const fetchMembers = async (forceRefresh = false) => {
    // stale-while-revalidate: 캐시가 있으면 즉시 표시하되, 항상 서버에서 재검증
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedData = localStorage.getItem(MEMBERS_CACHE_KEY);
        if (cachedData) {
          const {
            timestamp,
            members,
            todayMembers: cachedTodayMembers,
            sections: cachedSections,
          } = JSON.parse(cachedData);

          if (Date.now() - timestamp < CACHE_EXPIRY_TIME) {
            setAllMembers(members);
            setTodayMembers(cachedTodayMembers);
            setSections(cachedSections);
            hasLoadedRef.current = true;
            lastLoadedAtRef.current = timestamp ?? Date.now();
            if (members.some((m: Member) => m.couponCount === undefined)) {
              const cachedSecs: Section[] = cachedSections ?? [];
              void loadStatsInBackground(
                uuidsInExpandedSections(cachedSecs, collapsedSectionsRef.current)
              );
            }
          }
        }
      } catch (error) {
        console.error('❗ Error loading cached members:', error);
      }
    }

    if (forceRefresh) {
      statsLoadedRef.current.clear();
      invalidateAdminMemberStatsCache();
    }

    console.log('📥 Loading basic member info...');

    const users = await listAdminMembers();
    const guests = await listAdminGuests();
    setGuestMembers(guests);
    void loadGuestStatsInBackground(guests.map((g) => g.uuid));

    // 기존 통계는 유지하고 lastStampTime 등 기본 정보만 최신으로 교체
    setAllMembers((prev) => {
      const prevMap = new Map(prev.map((m) => [m.uuid, m]));
      return users.map((u) => {
        const old = prevMap.get(u.uuid);
        if (!old || old.stampCount === undefined) return u;
        return {
          ...u,
          couponCount: old.couponCount,
          halfCouponCount: old.halfCouponCount,
          fullCouponCount: old.fullCouponCount,
          stampCount: old.stampCount,
          hasMemo: old.hasMemo,
          hasBoarding: old.hasBoarding,
          gender: old.gender,
          tripCount: old.tripCount,
        };
      });
    });

    const todayKST = new Date();
    todayKST.setHours(todayKST.getHours() + 9);
    const todayDateStr = todayKST.toISOString().split('T')[0];

    const joinedToday = users.filter(
      (user) => user.createdAt && toKSTDateStr(user.createdAt) === todayDateStr
    );

    const stampedToday = users.filter((user) => {
      if (!user.lastStampTimeMs) return false;
      const kst = new Date(user.lastStampTimeMs);
      kst.setHours(kst.getHours() + 9);
      const stampDate = kst.toISOString().split('T')[0];
      return stampDate === todayDateStr;
    });

    const grouped = groupByInitial(
      users.filter((user) => !joinedToday.includes(user) && !stampedToday.includes(user))
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
    setTodayMembers(joinedToday);
    setSections(fullSections);

    hasLoadedRef.current = true;
    lastLoadedAtRef.current = Date.now();
    console.log('✅ Basic member info loaded, starting stats loading in background...');

    setTimeout(() => {
      void loadStatsInBackground(
        uuidsInExpandedSections(fullSections, collapsedSectionsRef.current),
        { reset: forceRefresh }
      );
    }, 100);
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

    const stampedToday = allMembers.filter((user) => {
      if (!user.lastStampTimeMs) return false;
      const kst = new Date(user.lastStampTimeMs);
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
    if (memberViewMode === 'guests') {
      if (text.trim().length === 0) {
        setSections(groupByInitial(guestMembers));
        return;
      }
      const filtered = guestMembers.filter((m) =>
        m.name.toLowerCase().includes(text.toLowerCase()) ||
        (m.phone ?? '').includes(text) ||
        m.uuid.includes(text)
      );
      setSections(groupByInitial(filtered));
      return;
    }
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
      filtered = filtered.filter((member) => {
        if (!member.lastStampTimeMs) return true;
        const lastStampDate = new Date(member.lastStampTimeMs);
        const daysDiff = Math.floor((today.getTime() - lastStampDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff >= inactiveDays;
      });
    }
    
    setSections(groupByInitial(filtered));
  };
  
  const switchMemberView = (mode: 'members' | 'guests') => {
    setMemberViewMode(mode);
    setKeyword('');
    if (mode === 'guests') {
      setSections(groupByInitial(guestMembers));
      setActiveFilter('all');
      return;
    }
    const todayKST = new Date();
    todayKST.setHours(todayKST.getHours() + 9);
    const todayDateStr = todayKST.toISOString().split('T')[0];
    const joinedToday = allMembers.filter(
      (user) => user.createdAt && toKSTDateStr(user.createdAt) === todayDateStr
    );
    const stampedToday = allMembers.filter((user) => {
      if (!user.lastStampTimeMs) return false;
      const kst = new Date(user.lastStampTimeMs);
      kst.setHours(kst.getHours() + 9);
      return kst.toISOString().split('T')[0] === todayDateStr;
    });
    const grouped = groupByInitial(
      allMembers.filter((user) => !joinedToday.includes(user) && !stampedToday.includes(user))
    );
    const todaySections: Section[] = [];
    if (joinedToday.length > 0) todaySections.push({ title: '오늘 가입한 회원', data: joinedToday });
    if (stampedToday.length > 0) todaySections.push({ title: '오늘 스탬프 적립', data: stampedToday });
    setSections([...todaySections, ...grouped]);
  };

  useEffect(() => {
    if (memberViewMode === 'guests' && keyword.trim() === '') {
      setSections(groupByInitial(guestMembers));
    }
  }, [guestMembers, memberViewMode, keyword]);

  const applyFilter = (filterType: 'all' | 'boarding' | 'coupon' | 'inactive') => {
    if (memberViewMode === 'guests') return;
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
      filtered = filtered.filter((member) => {
        if (!member.lastStampTimeMs) return true;
        const lastStampDate = new Date(member.lastStampTimeMs);
        const daysDiff = Math.floor((today.getTime() - lastStampDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff >= inactiveDays;
      });
    }
    
    setSections(groupByInitial(filtered));
  };

  const toggleSection = async (title: string) => {
    const currentlyCollapsed = sectionIsCollapsed(title, collapsedSections);
    const updated = {
      ...collapsedSections,
      [title]: !currentlyCollapsed,
    };
    setCollapsedSections(updated);
    collapsedSectionsRef.current = updated;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    if (currentlyCollapsed) {
      const section = sections.find((s) => s.title === title);
      if (section) {
        void loadStatsInBackground(section.data.map((m) => m.uuid));
      }
    }
  };

  useNativePullToRefresh(() => fetchMembers(true));

  const filterCounts = useMemo(() => {
    const today = new Date();
    const inactiveDays = getDaysFromMonths(inactivePeriod);
    return {
      boarding: allMembers.filter(member => member.hasBoarding).length,
      coupon: allMembers.filter(member => member.couponCount && member.couponCount > 0).length,
      inactive: allMembers.filter((member) => {
        if (!member.lastStampTimeMs) return true;
        const lastStampDate = new Date(member.lastStampTimeMs);
        const daysDiff = Math.floor((today.getTime() - lastStampDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff >= inactiveDays;
      }).length,
    };
  }, [allMembers, inactivePeriod]);

  // 로딩 표시 제거 - 비동기로 조용히 로드
  // if (loading) {
  //   return (
  //     <div className="d-flex min-vh-100 align-items-center justify-content-center">
  //       <div className="text-center">
  //         <div className="spinner-border text-primary mb-3" role="status">
  //           <span className="visually-hidden">Loading...</span>
  //         </div>
  //         <p className="text-muted">로딩 중...</p>
  //       </div>
  //     </div>
  //   );
  // }

  const listCount =
    memberViewMode === 'guests' ? guestMembers.length : allMembers.length;

  return (
    <SubPageFrame title="회원 관리" onRefresh={() => fetchMembers(true)}>
        <div className="p-3 mb-4" style={CARD}>
          <button
            type="button"
            onClick={() => setFilterSectionExpanded(!filterSectionExpanded)}
            className="btn w-100 d-flex justify-content-between align-items-center p-0"
            style={{ border: 'none', background: 'none', fontFamily: OHGO_FONT }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F' }}>
              회원 검색{' '}
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1B6FF5' }}>({listCount})</span>
            </span>
            {filterSectionExpanded ? (
              <IoChevronUpOutline size={20} color="#6F767E" />
            ) : (
              <IoChevronDownOutline size={20} color="#6F767E" />
            )}
          </button>

          <div className="ohgo-filter-group w-100 mt-3" role="group" aria-label="회원 구분">
            <button
              type="button"
              onClick={() => switchMemberView('members')}
              className={`btn btn-sm flex-fill ${memberViewMode === 'members' ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontFamily: OHGO_FONT }}
            >
              신규 회원 ({allMembers.length})
            </button>
            <button
              type="button"
              onClick={() => switchMemberView('guests')}
              className={`btn btn-sm flex-fill ${memberViewMode === 'guests' ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontFamily: OHGO_FONT }}
            >
              기존 회원 ({guestMembers.length})
            </button>
          </div>

          <input
            type="text"
            className="form-control mt-3"
            placeholder={memberViewMode === 'guests' ? '이름·전화번호·UUID 검색' : '이름으로 검색'}
            value={keyword}
            onChange={e => handleSearch(e.target.value)}
            style={OHGO_INPUT}
          />
          {filterSectionExpanded && memberViewMode === 'members' && (
            <>
              <div className="ohgo-filter-group mt-3 pt-3" style={{ borderTop: '1px solid #F7F8FA' }}>
                <button
                  type="button"
                  onClick={() => applyFilter(activeFilter === 'boarding' ? 'all' : 'boarding')}
                  className={`btn btn-sm ${activeFilter === 'boarding' ? 'btn-primary' : 'btn-outline-secondary'}`}
                >
                  명부 ({filterCounts.boarding})
                </button>
                <button
                  type="button"
                  onClick={() => applyFilter(activeFilter === 'coupon' ? 'all' : 'coupon')}
                  className={`btn btn-sm ${activeFilter === 'coupon' ? 'btn-primary' : 'btn-outline-secondary'}`}
                >
                  쿠폰 ({filterCounts.coupon})
                </button>
                <button
                  type="button"
                  onClick={() => applyFilter(activeFilter === 'inactive' ? 'all' : 'inactive')}
                  className={`btn btn-sm ${activeFilter === 'inactive' ? 'btn-primary' : 'btn-outline-secondary'}`}
                >
                  미활동 ({filterCounts.inactive})
                </button>
              </div>
              {activeFilter === 'inactive' && (
                <div className="ohgo-filter-group mt-2">
                  {[3, 6, 12].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setInactivePeriod(m as 3 | 6 | 12)}
                      className={`btn btn-sm ${inactivePeriod === m ? 'btn-primary' : 'btn-outline-secondary'}`}
                    >
                      {m}개월+
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="d-flex flex-column gap-3">
          {sections.map(section => {
            const isCollapsed = sectionIsCollapsed(section.title, collapsedSections);
            const accent = sectionAccent(section.title);

            return (
              <div key={section.title}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  className="btn w-100 d-flex align-items-center justify-content-between mb-2 px-3 py-2"
                  style={{
                    ...CARD,
                    backgroundColor: '#F7F8FA',
                    border: '1px solid #EFEFEF',
                    boxShadow: 'none',
                  }}
                >
                  <div className="d-flex align-items-center gap-2 min-w-0">
                    {isCollapsed ? (
                      <IoChevronDownOutline size={16} color="#6F767E" className="flex-shrink-0" />
                    ) : (
                      <IoChevronUpOutline size={16} color="#6F767E" className="flex-shrink-0" />
                    )}
                    <span
                      className="text-truncate"
                      style={{ fontSize: 14, fontWeight: 700, color: '#1A1D1F', fontFamily: OHGO_FONT }}
                    >
                      {section.title}
                    </span>
                  </div>
                  <span
                    className="badge rounded-pill flex-shrink-0 ms-2"
                    style={{
                      backgroundColor: '#FFFFFF',
                      color: accent,
                      border: `1px solid ${accent}22`,
                      fontSize: 11,
                      fontFamily: OHGO_FONT,
                      fontWeight: 700,
                    }}
                  >
                    {section.data.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div
                    className="ohgo-list-stripe ohgo-list-fixed"
                    style={{
                      borderRadius: 14,
                      border: '1px solid #EFEFEF',
                      overflow: 'hidden',
                      backgroundColor: '#FFFFFF',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}
                  >
                    {section.data.map((member, memberIndex) => {
                      const lastStampDate = member.lastStampTimeMs
                        ? new Date(member.lastStampTimeMs)
                        : null;
                      const today = new Date();
                      const daysDiff = lastStampDate
                        ? Math.floor((today.getTime() - lastStampDate.getTime()) / (1000 * 60 * 60 * 24))
                        : null;
                      const inactiveDays = getDaysFromMonths(inactivePeriod);
                      const isInactive = daysDiff !== null && daysDiff >= inactiveDays;
                      const dobStr =
                        member.dob?.length === 8
                          ? `${member.dob.slice(2, 4)}-${member.dob.slice(4, 6)}-${member.dob.slice(6, 8)}`
                          : member.dob;
                      const footLine = lastStampDate
                        ? `최근 적립 ${toKSTDateStr(lastStampDate.toISOString()).slice(2)}${isInactive ? ` · ${inactivePeriod}개월+ 미활동` : ''}`
                        : '';

                      return (
                        <button
                          key={member.uuid}
                          type="button"
                          onClick={() => {
                            if (member.isGuest) {
                              router.push(
                                `/member-detail?uuid=${member.uuid}&name=${encodeURIComponent(member.name)}&dob=${member.dob}&guest=1`
                              );
                              return;
                            }
                            router.push(
                              `/member-detail?uuid=${member.uuid}&name=${encodeURIComponent(member.name)}&dob=${member.dob}`
                            );
                          }}
                          className="btn w-100 text-start ohgo-list-row"
                        >
                          <div className="d-flex align-items-center gap-3 ohgo-list-row-inner">
                            <MemberListAvatar
                              imageUrl={member.profileImageUrl}
                              name={member.name}
                              size={44}
                            />
                            <div className="flex-grow-1 min-w-0 d-flex align-items-center gap-2 ohgo-member-row-content">
                              <div className="flex-grow-1 min-w-0 ohgo-member-row-lines">
                              <div className="ohgo-member-row-line d-flex align-items-center gap-1 min-w-0">
                                  <span
                                    className="text-truncate"
                                    style={{
                                      fontSize: 15,
                                      fontWeight: 700,
                                      color: '#1A1D1F',
                                      fontFamily: OHGO_FONT,
                                    }}
                                  >
                                    {member.name}
                                  </span>
                                  {member.isGuest && (
                                    <span
                                      className="badge rounded-pill flex-shrink-0"
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        backgroundColor: '#FFF3E0',
                                        color: '#E65100',
                                      }}
                                    >
                                      기존
                                    </span>
                                  )}
                                  {!member.isGuest && member.isLegacyLinked && (
                                    <span
                                      className="badge rounded-pill flex-shrink-0"
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        backgroundColor: '#E8F5E9',
                                        color: '#2E7D32',
                                      }}
                                    >
                                      기존연결
                                    </span>
                                  )}
                                  {member.hasMemo && (
                                    <IoChatbubbleEllipsesOutline size={14} color="#1B6FF5" className="flex-shrink-0" />
                                  )}
                              </div>
                              <div
                                className="ohgo-member-row-line ohgo-member-row-line--meta"
                                style={{ color: '#6F767E', fontFamily: OHGO_FONT }}
                              >
                                {dobStr}
                                {member.isGuest && member.phone ? ` · ${member.phone}` : ''}
                                {!member.isGuest && ` · 가입 ${toKSTDateStr(member.createdAt).slice(2)}`}
                              </div>
                              <div
                                className="ohgo-member-row-line ohgo-member-row-line--foot"
                                style={{
                                  color: isInactive ? '#E65100' : '#9CA3AF',
                                  fontFamily: OHGO_FONT,
                                  fontWeight: isInactive ? 600 : 400,
                                }}
                              >
                                {member.isGuest
                                  ? member.hasBoarding
                                    ? '명부 있음 · 신원 수정 불가 · 스탬프/쿠폰 관리 가능'
                                    : '신원 수정 불가 · 스탬프/쿠폰 관리 가능'
                                  : footLine}
                              </div>
                              </div>
                              <MemberKeyStats member={member} />
                            </div>
                            <IoChevronForwardOutline size={16} color="#D0D5DD" className="flex-shrink-0" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {sections.length === 0 && (
          <EmptyState
            icon={IoPeopleOutline}
            message={memberViewMode === 'guests' ? '등록된 기존 회원이 없습니다.' : '일치하는 회원이 없습니다.'}
            style={CARD}
          />
        )}

        {statsLoadingProgress && statsLoadingProgress.loaded < statsLoadingProgress.total && (
          <div
            className="ohgo-fixed-bottom-bar bg-white border-top p-2"
            style={{ zIndex: 100, boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}
          >
            <div className="d-flex align-items-center justify-content-center gap-2">
              <div className="spinner-border spinner-border-sm text-primary" role="status" style={{ width: '16px', height: '16px' }}>
                <span className="visually-hidden">Loading...</span>
              </div>
              <small className="text-muted">
                통계 로딩 중... ({statsLoadingProgress.loaded}/{statsLoadingProgress.total})
              </small>
            </div>
          </div>
        )}
    </SubPageFrame>
  );
}
