import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface MenuItem {
  id: string;
  label: string;
  path: string;
  iconName: string;
  color: string;
  order: number;
  isActive: boolean;
}

export interface SiteSettings {
  siteName: string;
  userMenuItems: MenuItem[];
  bottomTabMenuIds?: string[]; // 하단 탭 메뉴에 표시할 메뉴 항목 ID 배열 (최대 5개)
  updatedAt: Timestamp | Date;
}

// 기본 사이트 이름
const DEFAULT_SITE_NAME = '오고피씽';

// 기본 메뉴 항목 (초기 데이터)
const DEFAULT_MENU_ITEMS: MenuItem[] = [
  { id: 'home', label: '홈', path: '/main', iconName: 'IoHomeOutline', color: '#1E88E5', order: -1, isActive: true },
  { id: 'stamp', label: '스탬프', path: '/stamp', iconName: 'FiClipboard', color: '#FF9500', order: 0, isActive: true },
  { id: 'coupons', label: '쿠폰', path: '/coupons', iconName: 'FiGift', color: '#FF2D55', order: 1, isActive: true },
  { id: 'mini-games', label: '미니 게임', path: '/mini-games', iconName: 'IoGameControllerOutline', color: '#FF3B30', order: 2, isActive: true },
  { id: 'boarding-form', label: '명부 작성', path: '/boarding-form', iconName: 'IoBoatOutline', color: '#007AFF', order: 3, isActive: true },
  { id: 'community', label: '커뮤니티', path: '/community', iconName: 'IoChatbubblesOutline', color: '#00BCD4', order: 4, isActive: true },
  { id: 'my-page', label: '마이페이지', path: '/my-page', iconName: 'IoPersonOutline', color: '#9C27B0', order: 5, isActive: true },
];

/**
 * 전체 사이트 설정 조회
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const settingsRef = doc(db, 'siteSettings', 'main');
    const settingsSnap = await getDoc(settingsRef);
    
    if (settingsSnap.exists()) {
      const data = settingsSnap.data();
      return {
        siteName: data.siteName || DEFAULT_SITE_NAME,
        userMenuItems: data.userMenuItems || DEFAULT_MENU_ITEMS,
        bottomTabMenuIds: data.bottomTabMenuIds || [],
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || new Date(),
      } as SiteSettings;
    }
    
    // 설정이 없으면 기본값 반환
    return {
      siteName: DEFAULT_SITE_NAME,
      userMenuItems: DEFAULT_MENU_ITEMS,
      bottomTabMenuIds: [],
      updatedAt: new Date(),
    };
  } catch (error) {
    console.error('Error getting site settings:', error);
    // 오류 시 기본값 반환
    return {
      siteName: DEFAULT_SITE_NAME,
      userMenuItems: DEFAULT_MENU_ITEMS,
      bottomTabMenuIds: [],
      updatedAt: new Date(),
    };
  }
}

/**
 * 사이트 설정 저장
 */
export async function saveSiteSettings(settings: Partial<SiteSettings>): Promise<void> {
  try {
    const settingsRef = doc(db, 'siteSettings', 'main');
    const currentSettings = await getSiteSettings();
    
    const updatedSettings: any = {
      ...currentSettings,
      ...settings,
      updatedAt: Timestamp.now(),
    };
    
    await setDoc(settingsRef, updatedSettings, { merge: true });
  } catch (error) {
    console.error('Error saving site settings:', error);
    throw error;
  }
}

/**
 * 사이트 이름만 조회
 */
export async function getSiteName(): Promise<string> {
  try {
    const settings = await getSiteSettings();
    return settings.siteName;
  } catch (error) {
    console.error('Error getting site name:', error);
    return DEFAULT_SITE_NAME;
  }
}

/**
 * 활성화된 사용자 메뉴 항목만 순서대로 조회
 */
export async function getUserMenuItems(): Promise<MenuItem[]> {
  try {
    const settings = await getSiteSettings();
    return settings.userMenuItems
      .filter(item => item.isActive)
      .sort((a, b) => a.order - b.order);
  } catch (error) {
    console.error('Error getting user menu items:', error);
    return DEFAULT_MENU_ITEMS.filter(item => item.isActive).sort((a, b) => a.order - b.order);
  }
}

/**
 * 하단 탭 메뉴 항목 조회
 * bottomTabMenuIds에 지정된 메뉴 항목들을 순서대로 반환
 * 설정이 없으면 기본값으로 처음 5개 메뉴 항목 반환
 */
export async function getBottomTabMenuItems(): Promise<MenuItem[]> {
  try {
    const settings = await getSiteSettings();
    const bottomTabMenuIds = settings.bottomTabMenuIds || [];
    
    // 활성화된 메뉴 항목 중에서 bottomTabMenuIds에 포함된 것만 필터링
    const activeMenuItems = settings.userMenuItems.filter(item => item.isActive);
    
    // 홈 메뉴 항목 정의 (하단 탭 메뉴 설정에서만 사용)
    const homeMenuItem: MenuItem = {
      id: 'home',
      label: '홈',
      path: '/main',
      iconName: 'IoHomeOutline',
      color: '#1E88E5',
      order: -1,
      isActive: true,
    };
    
    console.log('getBottomTabMenuItems - bottomTabMenuIds:', bottomTabMenuIds);
    console.log('getBottomTabMenuItems - activeMenuItems:', activeMenuItems);
    
    if (bottomTabMenuIds.length === 0) {
      // 설정이 없으면 기본값으로 처음 5개 활성 메뉴 항목 반환 (홈 포함 여부는 사용자 설정에 따름)
      const sortedItems = activeMenuItems.sort((a, b) => a.order - b.order);
      const defaultItems = sortedItems.slice(0, 5);
      
      console.log('BottomTabMenu: No configuration found, using default items:', defaultItems);
      return defaultItems;
    }
    
    // bottomTabMenuIds 순서대로 정렬
    const bottomTabItems = bottomTabMenuIds
      .map(id => {
        // 홈 메뉴 항목인 경우 별도 처리
        if (id === 'home') {
          return homeMenuItem;
        }
        // 일반 메뉴 항목은 activeMenuItems에서 찾기
        return activeMenuItems.find(item => item.id === id);
      })
      .filter((item): item is MenuItem => item !== undefined);
    
    console.log('BottomTabMenu: Using configured items:', bottomTabItems);
    return bottomTabItems;
  } catch (error) {
    console.error('Error getting bottom tab menu items:', error);
    // 에러 발생 시 기본 메뉴 항목 반환
    const defaultItems = DEFAULT_MENU_ITEMS
      .filter(item => item.isActive)
      .sort((a, b) => a.order - b.order)
      .slice(0, 5);
    console.log('BottomTabMenu: Error occurred, using default items:', defaultItems);
    return defaultItems;
  }
}

