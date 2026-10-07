'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  invalidateAppUserCache,
  peekStoredAppUser,
  resolveAppUser,
  AUTH_WAIT_MS,
  type AppUser,
} from '@/lib/auth-session';
import { resumeAuthSession, visibilityIntent } from '@/lib/resume-session';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { withTimeoutFallback } from '@/lib/with-timeout';
import type { AuthChangeEvent } from '@supabase/supabase-js';

type AuthContextValue = {
  user: AppUser | null;
  ready: boolean;
  refresh: () => Promise<AppUser | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

if (typeof window !== 'undefined') {
  void resolveAppUser();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => (typeof window === 'undefined' ? null : peekStoredAppUser()));
  const [ready, setReady] = useState(() => (typeof window === 'undefined' ? false : peekStoredAppUser() != null));

  useEffect(() => {
    let cancelled = false;
    const cached = peekStoredAppUser();

    void withTimeoutFallback(resolveAppUser(cached ? { force: true } : undefined), AUTH_WAIT_MS, cached)
      .then((next) => {
        if (cancelled) return;
        if (next) setUser(next);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });

    if (!isSupabaseConfigured()) {
      return () => {
        cancelled = true;
      };
    }

    const supabase = getSupabaseBrowserClient();

    const refreshOnResume = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      void resumeAuthSession(supabase.auth, nowSec).then((result) => {
        if (cancelled) return;
        if (result === 'signed-out') {
          invalidateAppUserCache();
          setUser(null);
          setReady(true);
          return;
        }
        setReady(true);
        if (result === 'refreshed') {
          void withTimeoutFallback(resolveAppUser({ force: true }), AUTH_WAIT_MS, peekStoredAppUser()).then((next) => {
            if (!cancelled && next) setUser(next);
          });
        }
      });
    };

    const onVisibility = () => {
      const intent = visibilityIntent(document.visibilityState === 'hidden' ? 'hidden' : 'visible');
      if (intent === 'pause') {
        supabase.auth.stopAutoRefresh?.();
        return;
      }
      refreshOnResume();
    };

    const onPageShow = (event: Event) => {
      const shown = event as PageTransitionEvent;
      if (!shown.persisted) return;
      refreshOnResume();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);

    const { data } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
      if (event === 'SIGNED_OUT') {
        invalidateAppUserCache();
        setUser(null);
        setReady(true);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void withTimeoutFallback(resolveAppUser({ force: true }), AUTH_WAIT_MS, peekStoredAppUser()).then((next) => {
          if (!cancelled && next) setUser(next);
        });
      }
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      refresh: async () => {
        const next = await withTimeoutFallback(resolveAppUser({ force: true }), AUTH_WAIT_MS, peekStoredAppUser());
        setUser(next);
        setReady(true);
        return next;
      },
    }),
    [user, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있습니다.');
  }
  return context;
}
