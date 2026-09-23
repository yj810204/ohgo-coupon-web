export interface MenuItem {
  id: string;
  label: string;
  path: string;
  iconName: string;
  color: string;
  order: number;
  isActive: boolean;
}

export type ReservationApprovalMode = 'auto' | 'manual';

export type HomeSectionId =
  | 'stampCoupon'
  | 'weeklyTrip'
  | 'tide'
  | 'wind'
  | 'myPhotos'
  | 'community'
  | 'miniGames'
  | 'market';

export type HomeSectionVisibility = Record<HomeSectionId, boolean>;

export const DEFAULT_HOME_SECTIONS: HomeSectionVisibility = {
  stampCoupon: true,
  weeklyTrip: true,
  tide: true,
  wind: true,
  myPhotos: true,
  community: true,
  miniGames: true,
  market: true,
};

export const DEFAULT_HOME_SECTION_ORDER: HomeSectionId[] = [
  'stampCoupon',
  'weeklyTrip',
  'tide',
  'wind',
  'myPhotos',
  'community',
  'miniGames',
  'market',
];

export const HOME_SECTION_OPTIONS: Array<{
  id: HomeSectionId;
  label: string;
  hint: string;
}> = [
  { id: 'stampCoupon', label: '스탬프·쿠폰', hint: '스탬프·쿠폰 현황과 QR 스캔 버튼을 표시합니다.' },
  { id: 'weeklyTrip', label: '이번 주 출조', hint: '이번 주 출조 일정을 표시합니다.' },
  { id: 'tide', label: '오늘의 물때', hint: '몇물·물흐름·만조/간조를 표시합니다. 지역은 아래 물때 지역에서 고릅니다.' },
  { id: 'wind', label: '바람', hint: '오늘의 시간별 풍속·돌풍을 표시합니다. 더보기는 물때·날씨 화면으로 이동합니다.' },
  { id: 'myPhotos', label: '내 조황 사진', hint: '선장이 태그한 내 조황 사진을 표시합니다. 사진이 있을 때만 나타납니다.' },
  { id: 'community', label: '커뮤니티', hint: '조황 사진, 낚시 팁, Q&A를 표시합니다.' },
  { id: 'miniGames', label: '미니게임', hint: '진행 중인 미니게임을 표시합니다.' },
  { id: 'market', label: '중고장터', hint: '최근 중고장터 판매글을 표시합니다.' },
];

export function normalizeHomeSections(value: unknown): HomeSectionVisibility {
  const src = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    stampCoupon: src.stampCoupon !== false,
    weeklyTrip: src.weeklyTrip !== false,
    tide: src.tide !== false,
    wind: src.wind !== false,
    myPhotos: src.myPhotos !== false,
    community: src.community !== false,
    miniGames: src.miniGames !== false,
    market: src.market !== false,
  };
}

export function normalizeHomeSectionOrder(value: unknown): HomeSectionId[] {
  const valid = new Set<HomeSectionId>(DEFAULT_HOME_SECTION_ORDER);
  const incoming = Array.isArray(value)
    ? value.filter((id): id is HomeSectionId => typeof id === 'string' && valid.has(id as HomeSectionId))
    : [];
  const seen = new Set<HomeSectionId>();
  const ordered: HomeSectionId[] = [];
  for (const id of incoming) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  for (const id of DEFAULT_HOME_SECTION_ORDER) {
    if (seen.has(id)) continue;
    if (id === 'tide') {
      const weeklyIdx = ordered.indexOf('weeklyTrip');
      if (weeklyIdx >= 0) {
        ordered.splice(weeklyIdx + 1, 0, id);
        seen.add(id);
        continue;
      }
    }
    if (id === 'wind') {
      const tideIdx = ordered.indexOf('tide');
      if (tideIdx >= 0) {
        ordered.splice(tideIdx + 1, 0, id);
        seen.add(id);
        continue;
      }
    }
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

export interface AppPopupSettings {
  enabled: boolean;
  title: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaPath: string;
  version: number;
}

export const DEFAULT_APP_POPUP: AppPopupSettings = {
  enabled: false,
  title: '',
  body: '',
  imageUrl: '',
  ctaLabel: '',
  ctaPath: '',
  version: 0,
};

export function normalizeAppPopup(value: unknown): AppPopupSettings {
  const src = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const version = Number(src.version);
  return {
    enabled: src.enabled === true,
    title: typeof src.title === 'string' ? src.title : '',
    body: typeof src.body === 'string' ? src.body : '',
    imageUrl: typeof src.imageUrl === 'string' ? src.imageUrl : '',
    ctaLabel: typeof src.ctaLabel === 'string' ? src.ctaLabel : '',
    ctaPath: typeof src.ctaPath === 'string' ? src.ctaPath : '',
    version: Number.isFinite(version) && version > 0 ? version : 0,
  };
}

export function isAppPopupContentReady(popup: AppPopupSettings): boolean {
  return Boolean(popup.title.trim() || popup.body.trim() || popup.imageUrl.trim());
}

export function normalizeAdminGateEnabled(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
}

export interface SiteSettings {
  siteName: string;
  userMenuItems: MenuItem[];
  bottomTabMenuIds?: string[];
  reservationEnabled?: boolean;
  reservationApprovalMode?: ReservationApprovalMode;
  homeSections: HomeSectionVisibility;
  homeSectionOrder: HomeSectionId[];
  appPopup: AppPopupSettings;
  /** 이번 주 출조 리스트에 표시할 물때 지역 */
  tideRegionId?: string;
  /** 관리자 메뉴 2차 확인. 저장 전이면 undefined → 서버는 .env ADMIN_GATE 값을 씀 */
  adminGateEnabled?: boolean;
  updatedAt: Date | string;
}

export const DEFAULT_SITE_NAME = '오고피씽';

export const TRAVELIA_BOTTOM_TAB_IDS = ['home', 'community', 'stamp', 'market', 'my-page'];

export const DEFAULT_MENU_ITEMS: MenuItem[] = [
  { id: 'home', label: '홈', path: '/main', iconName: 'IoHomeOutline', color: '#1B6FF5', order: -1, isActive: true },
  { id: 'coupons', label: '쿠폰', path: '/coupons', iconName: 'FiGift', color: '#1B6FF5', order: 0, isActive: true },
  { id: 'stamp', label: '스탬프', path: '/stamp', iconName: 'FiClipboard', color: '#1B6FF5', order: 1, isActive: true },
  { id: 'notifications', label: '알림', path: '/notification-history', iconName: 'IoNotificationsOutline', color: '#1B6FF5', order: 2, isActive: true },
  { id: 'my-page', label: '마이', path: '/my-page', iconName: 'IoPersonOutline', color: '#1B6FF5', order: 3, isActive: true },
  { id: 'mini-games', label: '미니 게임', path: '/mini-games', iconName: 'IoGameControllerOutline', color: '#FF3B30', order: 4, isActive: true },
  { id: 'boarding-form', label: '명부 작성', path: '/boarding-form', iconName: 'IoBoatOutline', color: '#007AFF', order: 5, isActive: true },
  { id: 'community', label: '커뮤니티', path: '/community', iconName: 'IoChatbubblesOutline', color: '#00BCD4', order: 6, isActive: true },
  { id: 'market', label: '중고장터', path: '/market', iconName: 'IoStorefrontOutline', color: '#9C27B0', order: 7, isActive: true },
];

export function normalizeMenuItem(item: MenuItem): MenuItem {
  if (item.id === 'closed-mall' || item.path === '/closed-mall') {
    return {
      ...item,
      id: 'market',
      path: '/market',
      label: item.label === '피씽몰' ? '중고장터' : item.label,
    };
  }
  return item;
}

export function normalizeBottomTabIds(ids: string[]): string[] {
  const mapped = ids.map((id) => (id === 'closed-mall' ? 'market' : id));
  return [...new Set(mapped)];
}

export const homeMenuItem: MenuItem = {
  id: 'home',
  label: '홈',
  path: '/main',
  iconName: 'IoHomeOutline',
  color: '#1E88E5',
  order: -1,
  isActive: true,
};
