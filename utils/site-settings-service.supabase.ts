import { cachedFetch, invalidateCache, peekCache } from '@/lib/query-cache';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isDevAuthBypass } from '@/lib/dev-auth';
import {
  DEFAULT_MENU_ITEMS,
  DEFAULT_SITE_NAME,
  TRAVELIA_BOTTOM_TAB_IDS,
  homeMenuItem,
  type MenuItem,
  type SiteSettings,
} from './site-settings-shared';

const SETTINGS_KEY = 'main';
const CACHE_KEY = 'site:settings';
const CACHE_TTL_MS = 300_000;

function mapSettings(value: Record<string, unknown> | null): SiteSettings {
  if (!value) {
    return {
      siteName: DEFAULT_SITE_NAME,
      userMenuItems: DEFAULT_MENU_ITEMS,
      bottomTabMenuIds: [...TRAVELIA_BOTTOM_TAB_IDS],
      reservationEnabled: false,
      reservationApprovalMode: 'manual',
      updatedAt: new Date(),
    };
  }

  return {
    siteName: (value.siteName as string) || DEFAULT_SITE_NAME,
    userMenuItems: (value.userMenuItems as MenuItem[]) || DEFAULT_MENU_ITEMS,
    bottomTabMenuIds: (value.bottomTabMenuIds as string[]) || [],
    reservationEnabled: Boolean(value.reservationEnabled),
    reservationApprovalMode: value.reservationApprovalMode === 'auto' ? 'auto' : 'manual',
    updatedAt: (value.updatedAt as string) || new Date().toISOString(),
  };
}

/** 캐시 우회 — 쓰기(read-modify-write) 경로 전용 */
async function fetchSiteSettingsFresh(): Promise<SiteSettings> {
  if (isDevAuthBypass()) {
    return mapSettings(null);
  }

  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      console.warn(
        'Error getting site settings:',
        error.message || error.code || error
      );
      return mapSettings(null);
    }

    return mapSettings((data?.value as Record<string, unknown>) ?? null);
  } catch (e) {
    console.warn('Error getting site settings:', e instanceof Error ? e.message : e);
    return mapSettings(null);
  }
}

export async function getSiteSettingsFresh(): Promise<SiteSettings> {
  return fetchSiteSettingsFresh();
}

export async function getSiteSettings(): Promise<SiteSettings> {
  if (isDevAuthBypass()) {
    return mapSettings(null);
  }
  return cachedFetch(CACHE_KEY, CACHE_TTL_MS, fetchSiteSettingsFresh);
}

export async function saveSiteSettings(settings: Partial<SiteSettings>): Promise<void> {
  // 캐시된 값으로 병합하면 다른 관리자 변경을 덮어쓸 수 있으므로 항상 서버에서 읽음
  const current = await getSiteSettingsFresh();
  const updated = {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString(),
  };

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('site_settings').upsert({
    key: SETTINGS_KEY,
    value: updated,
  });

  if (error) throw error;
  invalidateCache(CACHE_KEY);
}

export async function getSiteName(): Promise<string> {
  const settings = await getSiteSettings();
  return settings.siteName;
}

export async function getUserMenuItems(): Promise<MenuItem[]> {
  const settings = await getSiteSettings();
  return settings.userMenuItems
    .filter((item) => item.isActive)
    .sort((a, b) => a.order - b.order);
}

export async function getBottomTabMenuItems(): Promise<MenuItem[]> {
  const settings = await getSiteSettings();
  const bottomTabMenuIds = settings.bottomTabMenuIds || [];
  const activeMenuItems = settings.userMenuItems.filter((item) => item.isActive);

  if (bottomTabMenuIds.length === 0) {
    return TRAVELIA_BOTTOM_TAB_IDS.map((id) => {
      if (id === 'home') return homeMenuItem;
      return (
        activeMenuItems.find((item) => item.id === id) ??
        DEFAULT_MENU_ITEMS.find((m) => m.id === id)
      );
    }).filter((item): item is MenuItem => item !== undefined);
  }

  return bottomTabMenuIds
    .map((id) => {
      if (id === 'home') return homeMenuItem;
      return (
        activeMenuItems.find((item) => item.id === id) ??
        DEFAULT_MENU_ITEMS.find((m) => m.id === id)
      );
    })
    .filter((item): item is MenuItem => item !== undefined);
}

/** BottomTabBar 초기 깜빡임 방지용 */
export function peekBottomTabMenuItems(): MenuItem[] | undefined {
  const settings = peekCache<SiteSettings>(CACHE_KEY);
  if (!settings) return undefined;
  const bottomTabMenuIds = settings.bottomTabMenuIds || [];
  const activeMenuItems = settings.userMenuItems.filter((item) => item.isActive);

  if (bottomTabMenuIds.length === 0) {
    return TRAVELIA_BOTTOM_TAB_IDS.map((id) => {
      if (id === 'home') return homeMenuItem;
      return (
        activeMenuItems.find((item) => item.id === id) ??
        DEFAULT_MENU_ITEMS.find((m) => m.id === id)
      );
    }).filter((item): item is MenuItem => item !== undefined);
  }

  return bottomTabMenuIds
    .map((id) => {
      if (id === 'home') return homeMenuItem;
      return (
        activeMenuItems.find((item) => item.id === id) ??
        DEFAULT_MENU_ITEMS.find((m) => m.id === id)
      );
    })
    .filter((item): item is MenuItem => item !== undefined);
}

export type { MenuItem, SiteSettings, ReservationApprovalMode } from './site-settings-shared';
