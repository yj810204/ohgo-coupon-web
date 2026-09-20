'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { resolveAppUser } from '@/lib/auth-session';
import { isMiniGamePlayRoute } from '@/lib/mini-game-routes';
import {
  DEFAULT_APP_POPUP,
  getSiteSettings,
  isAppPopupContentReady,
  type AppPopupSettings,
} from '@/utils/site-settings-service';
import AppPopupSheet from '@/components/AppPopupSheet';

const DISMISS_KEY = 'ohgo_app_popup_dismissed';
const SESSION_KEY = 'ohgo_app_popup_session';

function shouldSkipPopup(pathname: string | null): boolean {
  if (!pathname) return true;
  return (
    pathname === '/login' ||
    pathname === '/onboarding' ||
    pathname.startsWith('/samples') ||
    pathname.startsWith('/admin-screenshot-studio') ||
    pathname.startsWith('/roster-preview') ||
    pathname.startsWith('/admin-site-settings') ||
    isMiniGamePlayRoute(pathname)
  );
}

function hasVersion(storage: Storage, key: string, version: number): boolean {
  try {
    return storage.getItem(key) === String(version);
  } catch {
    return false;
  }
}

function writeVersion(storage: Storage, key: string, version: number) {
  try {
    storage.setItem(key, String(version));
  } catch {
    /* ignore quota */
  }
}

export default function AppPopupHost() {
  const pathname = usePathname();
  const router = useRouter();
  const [popup, setPopup] = useState<AppPopupSettings>(DEFAULT_APP_POPUP);
  const [open, setOpen] = useState(false);
  const skip = shouldSkipPopup(pathname);

  const closeForSession = useCallback((version: number) => {
    writeVersion(window.sessionStorage, SESSION_KEY, version);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (skip) {
      setOpen(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      const user = await resolveAppUser();
      if (cancelled || !user) return;
      const settings = await getSiteSettings();
      if (cancelled) return;
      const next = settings.appPopup ?? DEFAULT_APP_POPUP;
      if (!next.enabled || !isAppPopupContentReady(next)) return;
      if (
        hasVersion(window.localStorage, DISMISS_KEY, next.version) ||
        hasVersion(window.sessionStorage, SESSION_KEY, next.version)
      ) {
        return;
      }
      setPopup(next);
      setOpen(true);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [skip, pathname]);

  const handleCta = () => {
    const path = (popup.ctaPath ?? '').trim();
    closeForSession(popup.version);
    if (!path) return;
    if (/^https?:\/\//i.test(path)) {
      window.open(path, '_blank', 'noopener,noreferrer');
      return;
    }
    router.push(path.startsWith('/') ? path : `/${path}`);
  };

  return (
    <AppPopupSheet
      open={open}
      popup={popup}
      onClose={() => closeForSession(popup.version)}
      onDismissForever={() => {
        writeVersion(window.localStorage, DISMISS_KEY, popup.version);
        closeForSession(popup.version);
      }}
      onCta={(popup.ctaLabel ?? '').trim() ? handleCta : undefined}
    />
  );
}
