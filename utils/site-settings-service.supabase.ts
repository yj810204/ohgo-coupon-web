import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  DEFAULT_MENU_ITEMS,
  DEFAULT_SITE_NAME,
  TRAVELIA_BOTTOM_TAB_IDS,
  homeMenuItem,
  type MenuItem,
  type SiteSettings,
} from './site-settings-shared';

const SETTINGS_KEY = 'main';

function mapSettings(value: Record<string, unknown> | null): SiteSettings {
  if (!value) {
    return {
      siteName: DEFAULT_SITE_NAME,
      userMenuItems: DEFAULT_MENU_ITEMS,
      bottomTabMenuIds: [],
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

export async function getSiteSettings(): Promise<SiteSettings> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    console.error('Error getting site settings:', error);
    return mapSettings(null);
  }

  return mapSettings((data?.value as Record<string, unknown>) ?? null);
}

export async function saveSiteSettings(settings: Partial<SiteSettings>): Promise<void> {
  const current = await getSiteSettings();
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

export type { MenuItem, SiteSettings, ReservationApprovalMode } from './site-settings-shared';
