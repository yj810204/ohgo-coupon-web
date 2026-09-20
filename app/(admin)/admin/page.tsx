'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';
import {
  listAdminMembersActive,
  loadAdminMemberStats,
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
import { getBoardedMemberIds } from '@/utils/roster-service';
import {
  displayNameWithVisibleSpaces,
  nameHasOddWhitespace,
  personIdentityKey,
} from '@/lib/person-name';

const CARD: React.CSSProperties = { ...OHGO_CARD };

function sectionAccent(title: string): string {
  if (title === MISSED_STAMP_TODAY_TITLE) return '#FF9500';
  if (title === '오늘 가입한 회원') return '#FF3B30';
  if (title === '오늘 스탬프 적립') return '#34C759';
  if (title.startsWith('쿠폰')) return '#E65100';
  if (title.startsWith('스탬프')) return '#7C3AED';
  if (title.startsWith('승선')) return '#0F766E';
  return '#1B6FF5';
}

function formatGenderLabel(gender?: string | null): string {
  const raw = String(gender ?? '').trim();
  if (raw === '남' || raw === '여') return raw;
  if (raw === '남성' || raw === 'M' || raw === 'male') return '남';
  if (raw === '여성' || raw === 'F' || raw === 'female') return '여';
  return '';
}

function memberCouponCount(member: Member): number {
  if (member.couponCount != null) return member.couponCount;
  return (member.halfCouponCount ?? 0) + (member.fullCouponCount ?? 0);
}

function MemberKeyStats({ member }: { member: Member }) {
  const statsLoading = member.stampCount === undefined && member.tripCount === undefined;

  if (statsLoading) {
    return (
      <div className="ohgo-member-stat-line" aria-hidden>
        <span className="ohgo-member-stat-chip ohgo-member-stat-chip--ghost">승선</span>
        <span className="ohgo-member-stat-chip ohgo-member-stat-chip--ghost">스탬프</span>
        <span className="ohgo-member-stat-chip ohgo-member-stat-chip--ghost">쿠폰</span>
      </div>
    );
  }

  const items = [
    { key: 'trip', label: '승선', value: member.tripCount ?? 0, tone: 'trip' },
    { key: 'stamp', label: '스탬프', value: member.stampCount ?? 0, tone: 'stamp' },
    { key: 'coupon', label: '쿠폰', value: memberCouponCount(member), tone: 'coupon' },
  ] as const;

  return (
    <div className="ohgo-member-stat-line">
      {items.map((item) => (
        <span key={item.key} className={`ohgo-member-stat-chip ohgo-member-stat-chip--${item.tone}`}>
          {item.label} <em>{item.value}</em>
        </span>
      ))}
    </div>
  );
}

const STORAGE_KEY = 'collapsedSections';
const MEMBERS_CACHE_KEY = 'cachedMembers';
const MEMBER_LIST_QUERY_KEY = 'adminMemberListQuery';
/** 즉시 표시용 캐시 TTL — 만료 전이라도 백그라운드에서 항상 재검증 */
const CACHE_EXPIRY_TIME = 1000 * 60 * 5; // 5 minutes

const MEMBER_LIST_FILTERS: MemberListFilter[] = [
  'all',
  'boarding',
  'coupon',
  'inactive',
  'duplicate',
  'whitespace',
];

type StoredMemberListQuery = {
  keyword: string;
  activeFilter: MemberListFilter;
  activeSort: MemberSort | null;
  inactivePeriod: 3 | 6 | 12;
  filterSectionExpanded: boolean;
  scrollY: number;
};

const DEFAULT_MEMBER_LIST_QUERY: StoredMemberListQuery = {
  keyword: '',
  activeFilter: 'all',
  activeSort: null,
  inactivePeriod: 6,
  filterSectionExpanded: false,
  scrollY: 0,
};

function parseStoredMemberSort(value: unknown): MemberSort | null {
  if (!value || typeof value !== 'object') return null;
  const key = (value as { key?: unknown }).key;
  const dir = (value as { dir?: unknown }).dir;
  if (key !== 'coupon' && key !== 'stamp' && key !== 'trip') return null;
  if (dir !== 'asc' && dir !== 'desc') return null;
  return { key, dir };
}

function readStoredMemberListQuery(): StoredMemberListQuery | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(MEMBER_LIST_QUERY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredMemberListQuery>;
    const activeFilter = MEMBER_LIST_FILTERS.includes(parsed.activeFilter as MemberListFilter)
      ? (parsed.activeFilter as MemberListFilter)
      : 'all';
    const inactivePeriod =
      parsed.inactivePeriod === 3 || parsed.inactivePeriod === 6 || parsed.inactivePeriod === 12
        ? parsed.inactivePeriod
        : 6;
    return {
      keyword: typeof parsed.keyword === 'string' ? parsed.keyword : '',
      activeFilter,
      activeSort: parseStoredMemberSort(parsed.activeSort),
      inactivePeriod,
      filterSectionExpanded: parsed.filterSectionExpanded === true,
      scrollY: typeof parsed.scrollY === 'number' && parsed.scrollY > 0 ? parsed.scrollY : 0,
    };
  } catch {
    return null;
  }
}

function writeStoredMemberListQuery(query: StoredMemberListQuery) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(MEMBER_LIST_QUERY_KEY, JSON.stringify(query));
  } catch {
    // ignore quota / private mode
  }
}

function memberListQueryIsActive(query: StoredMemberListQuery): boolean {
  return (
    query.activeFilter !== 'all' ||
    query.activeSort != null ||
    query.keyword.trim().length > 0
  );
}

import { OHGO_CARD, OHGO_FONT, OHGO_INPUT } from '@/lib/page-styles';

type Member = AdminMember;

type Section = {
  title: string;
  data: Member[];
  collapsed?: boolean;
};

const MISSED_STAMP_TODAY_TITLE = '오늘 스탬프 누락';
const TODAY_SECTION_TITLES = new Set([
  MISSED_STAMP_TODAY_TITLE,
  '오늘 가입한 회원',
  '오늘 스탬프 적립',
]);

function sectionIsCollapsed(title: string, collapsed: Record<string, boolean>): boolean {
  return collapsed[title] ?? !(TODAY_SECTION_TITLES.has(title) || SORT_SECTION_TITLES.has(title));
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

function todayKstDateStr(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function toKstDateStrFromMs(ms: number): string {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function isStampedOnDate(member: Member, dateStr: string): boolean {
  if (!member.lastStampTimeMs) return false;
  return toKstDateStrFromMs(member.lastStampTimeMs) === dateStr;
}

function groupMembersByInitial(users: Member[]): Section[] {
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
      data: grouped[initial].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    }));
}

function memberIdentityKey(member: Member): string {
  return personIdentityKey(member.name, member.dob);
}

type MemberListFilter = 'all' | 'boarding' | 'coupon' | 'inactive' | 'duplicate' | 'whitespace';
type MemberSortKey = 'coupon' | 'stamp' | 'trip';
type MemberSortDir = 'desc' | 'asc';
type MemberSort = { key: MemberSortKey; dir: MemberSortDir };

const MEMBER_SORTS: Array<{
  key: MemberSortKey;
  label: string;
  tone: string;
}> = [
  { key: 'coupon', label: '쿠폰', tone: 'coupon' },
  { key: 'stamp', label: '스탬프', tone: 'stamp' },
  { key: 'trip', label: '승선', tone: 'trip' },
];

function memberSortTitle(sort: MemberSort): string {
  const label = MEMBER_SORTS.find((item) => item.key === sort.key)?.label ?? '';
  return `${label} ${sort.dir === 'desc' ? '많은순' : '적은순'}`;
}

const SORT_SECTION_TITLES = new Set(
  MEMBER_SORTS.flatMap((item) => [`${item.label} 많은순`, `${item.label} 적은순`])
);

function memberSortValue(member: Member, key: MemberSortKey): number {
  if (key === 'coupon') return memberCouponCount(member);
  if (key === 'stamp') return member.stampCount ?? 0;
  return member.tripCount ?? 0;
}

function sortAdminMembers(members: Member[], sort: MemberSort | null): Member[] {
  if (!sort) return members;
  const dir = sort.dir === 'desc' ? -1 : 1;
  const source =
    sort.dir === 'asc' && (sort.key === 'coupon' || sort.key === 'stamp')
      ? members.filter((member) => memberSortValue(member, sort.key) >= 1)
      : members;
  return [...source].sort((a, b) => {
    const diff = memberSortValue(a, sort.key) - memberSortValue(b, sort.key);
    if (diff !== 0) return diff * dir;
    return a.name.localeCompare(b.name, 'ko');
  });
}

function collectDuplicateIdentities(members: Member[]): Set<string> {
  const counts = new Map<string, number>();
  for (const member of members) {
    const key = memberIdentityKey(member);
    if (key.startsWith('|') || key.endsWith('|')) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([key]) => key));
}

function filterAdminMembers(
  members: Member[],
  filterType: MemberListFilter,
  options: {
    keyword: string;
    inactivePeriod: 3 | 6 | 12;
    duplicateIdentities: Set<string>;
  }
): Member[] {
  const keyword = options.keyword.trim().toLowerCase();
  let filtered = keyword
    ? members.filter((member) => member.name.toLowerCase().includes(keyword))
    : members;

  if (filterType === 'boarding') {
    return filtered.filter((member) => member.hasBoarding);
  }
  if (filterType === 'coupon') {
    return filtered.filter((member) => member.couponCount && member.couponCount > 0);
  }
  if (filterType === 'inactive') {
    const today = Date.now();
    const inactiveDays = getDaysFromMonths(options.inactivePeriod);
    return filtered.filter((member) => {
      if (!member.lastStampTimeMs) return true;
      const daysDiff = Math.floor((today - member.lastStampTimeMs) / (1000 * 60 * 60 * 24));
      return daysDiff >= inactiveDays;
    });
  }
  if (filterType === 'duplicate') {
    return filtered.filter((member) => options.duplicateIdentities.has(memberIdentityKey(member)));
  }
  if (filterType === 'whitespace') {
    return filtered.filter((member) => nameHasOddWhitespace(member.name));
  }
  return filtered;
}

function buildVisibleMemberSections(
  members: Member[],
  filterType: MemberListFilter,
  options: {
    keyword: string;
    inactivePeriod: 3 | 6 | 12;
    duplicateIdentities: Set<string>;
    sort: MemberSort | null;
    rosterIds: Set<string>;
    groupByInitial: (users: Member[]) => Section[];
  }
): { todayMembers: Member[]; sections: Section[] } {
  const filtered = filterAdminMembers(members, filterType, options);
  if (options.sort) {
    return {
      todayMembers: members.filter(
        (user) => user.createdAt && toKSTDateStr(user.createdAt) === todayKstDateStr()
      ),
      sections: [
        {
          title: memberSortTitle(options.sort),
          data: sortAdminMembers(filtered, options.sort),
        },
      ],
    };
  }

  if (filterType === 'all' && options.keyword.trim().length === 0) {
    return buildTodayMemberSections(
      members,
      todayKstDateStr(),
      options.rosterIds,
      options.groupByInitial
    );
  }

  return { todayMembers: [], sections: options.groupByInitial(filtered) };
}

function buildTodayMemberSections(
  members: Member[],
  todayDateStr: string,
  rosterIds: Set<string>,
  groupByInitial: (users: Member[]) => Section[]
): { todayMembers: Member[]; sections: Section[] } {
  const joinedToday = members.filter(
    (user) => user.createdAt && toKSTDateStr(user.createdAt) === todayDateStr
  );
  const stampedToday = members.filter((user) => isStampedOnDate(user, todayDateStr));
  const stampedUuids = new Set(stampedToday.map((m) => m.uuid));
  const stampedIdentities = new Set(stampedToday.map(memberIdentityKey));
  const missedStampToday = members.filter((user) => {
    if (user.role === 'captain') return false;
    if (!rosterIds.has(user.uuid)) return false;
    if (stampedUuids.has(user.uuid)) return false;
    if (stampedIdentities.has(memberIdentityKey(user))) return false;
    return !isStampedOnDate(user, todayDateStr);
  });
  const specialUuids = new Set([
    ...missedStampToday.map((m) => m.uuid),
    ...joinedToday.map((m) => m.uuid),
    ...stampedToday.map((m) => m.uuid),
  ]);
  const grouped = groupByInitial(members.filter((user) => !specialUuids.has(user.uuid)));
  const sections: Section[] = [
    ...(missedStampToday.length > 0
      ? [{ title: MISSED_STAMP_TODAY_TITLE, data: missedStampToday }]
      : []),
    ...(joinedToday.length > 0 ? [{ title: '오늘 가입한 회원', data: joinedToday }] : []),
    ...(stampedToday.length > 0 ? [{ title: '오늘 스탬프 적립', data: stampedToday }] : []),
    ...grouped,
  ];
  return { todayMembers: joinedToday, sections };
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false); // 초기 로딩 표시 제거 - 비동기로 조용히 로드
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [todayMembers, setTodayMembers] = useState<Member[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [keyword, setKeyword] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [activeFilter, setActiveFilter] = useState<MemberListFilter>('all');
  const [activeSort, setActiveSort] = useState<MemberSort | null>(null);
  const [inactivePeriod, setInactivePeriod] = useState<3 | 6 | 12>(6);
  const [filterSectionExpanded, setFilterSectionExpanded] = useState(false);
  const [listQueryReady, setListQueryReady] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [statsLoadingProgress, setStatsLoadingProgress] = useState<{ loaded: number; total: number } | null>(null);
  const statsLoadedRef = useRef<Set<string>>(new Set());
  const hasLoadedRef = useRef(false);
  const lastLoadedAtRef = useRef<number>(0);
  const cacheUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapsedSectionsRef = useRef<Record<string, boolean>>({});
  const todayRosterIdsRef = useRef<Set<string>>(new Set());
  const listQueryRef = useRef<StoredMemberListQuery>(DEFAULT_MEMBER_LIST_QUERY);
  const pendingScrollRef = useRef<number | null>(null);
  const skipScrollPersistRef = useRef(true);
  const skipQueryPersistRef = useRef(true);

  const persistMemberListQuery = useCallback((patch?: Partial<StoredMemberListQuery>) => {
    const next = { ...listQueryRef.current, ...patch };
    listQueryRef.current = next;
    writeStoredMemberListQuery(next);
  }, []);

  const restoreMemberListQuery = () => {
    const stored = readStoredMemberListQuery();
    if (!stored) return;
    listQueryRef.current = stored;
    writeStoredMemberListQuery(stored);
    setKeyword(stored.keyword);
    setActiveFilter(stored.activeFilter);
    setActiveSort(stored.activeSort);
    setInactivePeriod(stored.inactivePeriod);
    setFilterSectionExpanded(stored.filterSectionExpanded);
    if (stored.scrollY > 0) {
      pendingScrollRef.current = stored.scrollY;
    }
  };

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
      restoreMemberListQuery();
      setListQueryReady(true);
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
            const query = listQueryRef.current;
            const visible = memberListQueryIsActive(query)
              ? buildVisibleMemberSections(members, query.activeFilter, {
                  keyword: query.keyword,
                  inactivePeriod: query.inactivePeriod,
                  duplicateIdentities: collectDuplicateIdentities(members),
                  sort: query.activeSort,
                  rosterIds: todayRosterIdsRef.current,
                  groupByInitial: groupMembersByInitial,
                }).sections
              : cachedSections;
            setSections(visible);
            hasLoadedRef.current = true;
            lastLoadedAtRef.current = timestamp ?? Date.now();
            if (members.some((m: Member) => m.couponCount === undefined)) {
              void loadStatsInBackground(
                query.activeSort
                  ? members.map((member: Member) => member.uuid)
                  : uuidsInExpandedSections(visible ?? [], collapsedSectionsRef.current)
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

    const todayDateStr = todayKstDateStr();
    const [users, boardedIds] = await Promise.all([
      listAdminMembersActive(),
      getBoardedMemberIds(todayDateStr).catch((e) => {
        console.warn('오늘 승선명부 조회 실패:', e);
        return [] as string[];
      }),
    ]);
    const rosterIds = new Set(boardedIds);
    todayRosterIdsRef.current = rosterIds;

    // 기존 통계는 유지하고 lastStampTime 등 기본 정보만 최신으로 교체
    let mergedMembers: Member[] = users;
    setAllMembers((prev) => {
      const prevMap = new Map(prev.map((m) => [m.uuid, m]));
      mergedMembers = users.map((u) => {
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
      return mergedMembers;
    });

    const query = listQueryRef.current;
    const built = buildVisibleMemberSections(mergedMembers, query.activeFilter, {
      keyword: query.keyword,
      inactivePeriod: query.inactivePeriod,
      duplicateIdentities: collectDuplicateIdentities(mergedMembers),
      sort: query.activeSort,
      rosterIds,
      groupByInitial: groupMembersByInitial,
    });
    setTodayMembers(built.todayMembers);
    setSections(built.sections);
    const fullSections = built.sections;

    hasLoadedRef.current = true;
    lastLoadedAtRef.current = Date.now();
    console.log('✅ Basic member info loaded, starting stats loading in background...');

    setTimeout(() => {
      void loadStatsInBackground(
        query.activeSort
          ? users.map((user) => user.uuid)
          : uuidsInExpandedSections(fullSections, collapsedSectionsRef.current),
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

  const duplicateIdentities = useMemo(
    () => collectDuplicateIdentities(allMembers),
    [allMembers]
  );

  useEffect(() => {
    if (allMembers.length === 0) return;

    const built = buildVisibleMemberSections(allMembers, activeFilter, {
      keyword,
      inactivePeriod,
      duplicateIdentities,
      sort: activeSort,
      rosterIds: todayRosterIdsRef.current,
      groupByInitial: groupMembersByInitial,
    });
    setSections(built.sections);
    if (activeFilter === 'all' && !activeSort && keyword.trim().length === 0) {
      setTodayMembers(built.todayMembers);
    }
  }, [allMembers, keyword, activeFilter, activeSort, inactivePeriod, duplicateIdentities]);

  useEffect(() => {
    if (!listQueryReady) return;
    if (skipQueryPersistRef.current) {
      skipQueryPersistRef.current = false;
      return;
    }
    persistMemberListQuery({
      keyword,
      activeFilter,
      activeSort,
      inactivePeriod,
      filterSectionExpanded,
    });
  }, [
    listQueryReady,
    keyword,
    activeFilter,
    activeSort,
    inactivePeriod,
    filterSectionExpanded,
    persistMemberListQuery,
  ]);

  useEffect(() => {
    if (!listQueryReady) return;
    const y = pendingScrollRef.current;
    if (y == null || y <= 0) {
      skipScrollPersistRef.current = false;
      return;
    }
    if (sections.length === 0) return;
    pendingScrollRef.current = null;
    const timer = window.setTimeout(() => {
      window.scrollTo(0, y);
      skipScrollPersistRef.current = false;
    }, 50);
    return () => window.clearTimeout(timer);
  }, [listQueryReady, sections]);

  useEffect(() => {
    const onScroll = () => {
      if (skipScrollPersistRef.current) return;
      persistMemberListQuery({ scrollY: window.scrollY || 0 });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [persistMemberListQuery]);

  const filterCounts = useMemo(() => {
    const options = { keyword: '', inactivePeriod, duplicateIdentities };
    return {
      boarding: filterAdminMembers(allMembers, 'boarding', options).length,
      coupon: filterAdminMembers(allMembers, 'coupon', options).length,
      inactive: filterAdminMembers(allMembers, 'inactive', options).length,
      duplicate: filterAdminMembers(allMembers, 'duplicate', options).length,
      whitespace: filterAdminMembers(allMembers, 'whitespace', options).length,
    };
  }, [allMembers, inactivePeriod, duplicateIdentities]);

  const handleSearch = (text: string) => {
    setKeyword(text);
  };

  const applyFilter = (filterType: MemberListFilter) => {
    setActiveFilter(filterType);
  };

  const applySort = (next: MemberSort) => {
    const same = activeSort?.key === next.key && activeSort?.dir === next.dir;
    setActiveSort(same ? null : next);
    if (!same) {
      void loadStatsInBackground(allMembers.map((member) => member.uuid));
    }
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
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1B6FF5' }}>({allMembers.length})</span>
            </span>
            {filterSectionExpanded ? (
              <IoChevronUpOutline size={20} color="#6F767E" />
            ) : (
              <IoChevronDownOutline size={20} color="#6F767E" />
            )}
          </button>

          <input
            type="text"
            className="form-control mt-3"
            placeholder="이름으로 검색"
            value={keyword}
            onChange={e => handleSearch(e.target.value)}
            style={OHGO_INPUT}
          />
          {filterSectionExpanded && (
            <>
              <div className="ohgo-member-filters" role="group" aria-label="회원 필터">
                {(
                  [
                    { key: 'boarding', label: '명부', count: filterCounts.boarding, tone: 'boarding' },
                    { key: 'coupon', label: '쿠폰', count: filterCounts.coupon, tone: 'coupon' },
                    { key: 'inactive', label: '미활동', count: filterCounts.inactive, tone: 'inactive' },
                    { key: 'duplicate', label: '중복', count: filterCounts.duplicate, tone: 'duplicate' },
                    { key: 'whitespace', label: '이름 공백', count: filterCounts.whitespace, tone: 'whitespace' },
                  ] as const
                ).map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => applyFilter(activeFilter === filter.key ? 'all' : filter.key)}
                    className={`ohgo-member-filter ohgo-member-filter--${filter.tone}${activeFilter === filter.key ? ' is-active' : ''}`}
                  >
                    <span>{filter.label}</span>
                    <em>{filter.count}</em>
                  </button>
                ))}
              </div>
              {activeFilter === 'inactive' && (
                <div className="ohgo-member-filter-periods" role="group" aria-label="미활동 기간">
                  {[3, 6, 12].map((months) => (
                    <button
                      key={months}
                      type="button"
                      onClick={() => setInactivePeriod(months as 3 | 6 | 12)}
                      className={`ohgo-member-filter-period${inactivePeriod === months ? ' is-active' : ''}`}
                    >
                      {months}개월+
                    </button>
                  ))}
                </div>
              )}
              <div className="ohgo-member-sorts" role="group" aria-label="회원 정렬">
                {MEMBER_SORTS.map((item) => (
                  <div
                    key={item.key}
                    className={`ohgo-member-sort ohgo-member-sort--${item.tone}${
                      activeSort?.key === item.key ? ' is-active' : ''
                    }`}
                  >
                    <span>{item.label}</span>
                    <div className="ohgo-member-sort-dirs">
                      {(
                        [
                          { dir: 'desc', label: '많은순' },
                          { dir: 'asc', label: '적은순' },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.dir}
                          type="button"
                          onClick={() => applySort({ key: item.key, dir: option.dir })}
                          className={`ohgo-member-sort-dir${
                            activeSort?.key === item.key && activeSort.dir === option.dir
                              ? ' is-active'
                              : ''
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
                    {section.data.map((member) => {
                      const dobStr =
                        member.dob?.length === 8
                          ? `${member.dob.slice(2, 4)}-${member.dob.slice(4, 6)}-${member.dob.slice(6, 8)}`
                          : member.dob;
                      const genderLabel = formatGenderLabel(member.gender);
                      const isDuplicate = duplicateIdentities.has(memberIdentityKey(member));

                      return (
                        <button
                          key={member.uuid}
                          type="button"
                          onClick={() => {
                            persistMemberListQuery({ scrollY: window.scrollY || 0 });
                            const guestQuery = member.isGuest ? '&guest=1' : '';
                            router.push(
                              `/member-detail?uuid=${member.uuid}&name=${encodeURIComponent(member.name)}&dob=${member.dob}${guestQuery}`
                            );
                          }}
                          className={`btn w-100 text-start ohgo-list-row${isDuplicate ? ' ohgo-list-row--dup' : ''}`}
                        >
                          <div className="d-flex align-items-center gap-3 ohgo-list-row-inner">
                            <div className="flex-shrink-0">
                              <MemberListAvatar
                                imageUrl={member.profileImageUrl}
                                name={member.name}
                                size={44}
                              />
                            </div>
                            <div className="flex-grow-1 min-w-0 d-flex ohgo-member-row-content">
                              <div className="ohgo-member-row-title">
                                  <span
                                    className={`ohgo-member-row-name${nameHasOddWhitespace(member.name) ? ' ohgo-member-row-name--ws' : ''}`}
                                  >
                                    {nameHasOddWhitespace(member.name)
                                      ? displayNameWithVisibleSpaces(member.name)
                                      : member.name}
                                  </span>
                                  <span className="ohgo-member-row-meta">
                                    {dobStr || '—'}
                                    {genderLabel ? ` (${genderLabel})` : ''}
                                  </span>
                                  {member.isGuest && (
                                    <span className="ohgo-member-guest-badge">기존</span>
                                  )}
                                  {member.hasMemo && (
                                    <IoChatbubbleEllipsesOutline size={14} color="#1B6FF5" className="flex-shrink-0" />
                                  )}
                              </div>
                              <MemberKeyStats member={member} />
                            </div>
                            <IoChevronForwardOutline
                              size={16}
                              color="#D0D5DD"
                              className="flex-shrink-0 align-self-center"
                            />
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
            message="일치하는 회원이 없습니다."
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
