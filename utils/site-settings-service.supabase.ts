import { cachedFetch, invalidateCache, peekCache } from '@/lib/query-cache';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isDevAuthBypass } from '@/lib/dev-auth';
import { DEFAULT_TIDE_REGION_ID, normalizeTideRegionId } from '@/lib/dadaepo-tide';
import {
  DEFAULT_APP_POPUP,
  DEFAULT_HOME_SECTIONS,
  DEFAULT_HOME_SECTION_ORDER,
  DEFAULT_MENU_ITEMS,
  DEFAULT_SITE_NAME,
  TRAVELIA_BOTTOM_TAB_IDS,
  homeMenuItem,
  normalizeAdminGateEnabled,
  normalizeAppPopup,
  normalizeBottomTabIds,
  normalizeHomeSectionOrder,
  normalizeHomeSections,
  normalizeMenuItem,
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
      homeSections: { ...DEFAULT_HOME_SECTIONS },
      homeSectionOrder: [...DEFAULT_HOME_SECTION_ORDER],
      appPopup: { ...DEFAULT_APP_POPUP },
      tideRegionId: DEFAULT_TIDE_REGION_ID,
      adminGateEnabled: undefined,
      updatedAt: new Date(),
    };
  }

  return {
    siteName: (value.siteName as string) || DEFAULT_SITE_NAME,
    userMenuItems: ((value.userMenuItems as MenuItem[]) || DEFAULT_MENU_ITEMS).map(normalizeMenuItem),
    bottomTabMenuIds: normalizeBottomTabIds((value.bottomTabMenuIds as string[]) || []),
    reservationEnabled: Boolean(value.reservationEnabled),
    reservationApprovalMode: value.reservationApprovalMode === 'auto' ? 'auto' : 'manual',
    homeSections: normalizeHomeSections(value.homeSections),
    homeSectionOrder: normalizeHomeSectionOrder(value.homeSectionOrder),
    appPopup: normalizeAppPopup(value.appPopup),
    tideRegionId: normalizeTideRegionId(value.tideRegionId),
    adminGateEnabled: normalizeAdminGateEnabled(value.adminGateEnabled),
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
  const settings = await cachedFetch(CACHE_KEY, CACHE_TTL_MS, fetchSiteSettingsFresh);
  return {
    ...settings,
    homeSections: normalizeHomeSections(settings.homeSections),
    homeSectionOrder: normalizeHomeSectionOrder(settings.homeSectionOrder),
    appPopup: normalizeAppPopup(settings.appPopup),
    tideRegionId: normalizeTideRegionId(settings.tideRegionId),
    adminGateEnabled: normalizeAdminGateEnabled(settings.adminGateEnabled),
  };
}

export async function saveSiteSettings(settings: Partial<SiteSettings>): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data, error: readError } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (readError) throw readError;

  const raw =
    data?.value && typeof data.value === 'object'
      ? (data.value as Record<string, unknown>)
      : {};
  const current = mapSettings(raw);
  const preservedHash =
    typeof raw.adminGatePasswordHash === 'string' ? raw.adminGatePasswordHash : undefined;
  const updated: Record<string, unknown> = {
    ...raw,
    ...current,
    ...settings,
    homeSections: normalizeHomeSections({
      ...current.homeSections,
      ...(settings.homeSections ?? {}),
    }),
    homeSectionOrder: normalizeHomeSectionOrder(
      settings.homeSectionOrder ?? current.homeSectionOrder
    ),
    appPopup: normalizeAppPopup(settings.appPopup ?? current.appPopup),
    tideRegionId: normalizeTideRegionId(settings.tideRegionId ?? current.tideRegionId),
    updatedAt: new Date().toISOString(),
  };
  delete updated.adminGatePassword;
  if (preservedHash) updated.adminGatePasswordHash = preservedHash;

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

export async function uploadPopupImage(file: File): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `popups/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const { error } = await supabase.storage.from('photos').upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw error;
  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}

export type {
  MenuItem,
  SiteSettings,
  ReservationApprovalMode,
  HomeSectionId,
  HomeSectionVisibility,
  AppPopupSettings,
} from './site-settings-shared';
