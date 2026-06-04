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

export interface SiteSettings {
  siteName: string;
  userMenuItems: MenuItem[];
  bottomTabMenuIds?: string[];
  reservationEnabled?: boolean;
  reservationApprovalMode?: ReservationApprovalMode;
  updatedAt: Date | string;
}

export const DEFAULT_SITE_NAME = '오고피씽';

export const TRAVELIA_BOTTOM_TAB_IDS = ['home', 'community', 'stamp', 'closed-mall', 'my-page'];

export const DEFAULT_MENU_ITEMS: MenuItem[] = [
  { id: 'home', label: '홈', path: '/main', iconName: 'IoHomeOutline', color: '#1B6FF5', order: -1, isActive: true },
  { id: 'coupons', label: '쿠폰', path: '/coupons', iconName: 'FiGift', color: '#1B6FF5', order: 0, isActive: true },
  { id: 'stamp', label: '스탬프', path: '/stamp', iconName: 'FiClipboard', color: '#1B6FF5', order: 1, isActive: true },
  { id: 'notifications', label: '알림', path: '/notification-history', iconName: 'IoNotificationsOutline', color: '#1B6FF5', order: 2, isActive: true },
  { id: 'my-page', label: '마이', path: '/my-page', iconName: 'IoPersonOutline', color: '#1B6FF5', order: 3, isActive: true },
  { id: 'mini-games', label: '미니 게임', path: '/mini-games', iconName: 'IoGameControllerOutline', color: '#FF3B30', order: 4, isActive: true },
  { id: 'boarding-form', label: '명부 작성', path: '/boarding-form', iconName: 'IoBoatOutline', color: '#007AFF', order: 5, isActive: true },
  { id: 'community', label: '커뮤니티', path: '/community', iconName: 'IoChatbubblesOutline', color: '#00BCD4', order: 6, isActive: true },
  { id: 'closed-mall', label: '피씽몰', path: '/closed-mall', iconName: 'IoStorefrontOutline', color: '#9C27B0', order: 7, isActive: true },
];

export const homeMenuItem: MenuItem = {
  id: 'home',
  label: '홈',
  path: '/main',
  iconName: 'IoHomeOutline',
  color: '#1E88E5',
  order: -1,
  isActive: true,
};
