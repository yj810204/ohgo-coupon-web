'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  invalidateAppUserCache,
  peekAppUser,
  resolveAppUser,
  type AppUser,
} from '@/lib/auth-session';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';
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
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const seeded = peekAppUser();
    if (seeded) setUser(seeded);

    void resolveAppUser()
      .then((next) => {
        if (cancelled) return;
        setUser(next);
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
    const { data } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
      if (event === 'SIGNED_OUT') {
        invalidateAppUserCache();
        setUser(null);
        setReady(true);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void resolveAppUser({ force: true }).then((next) => {
          if (!cancelled) setUser(next);
        });
      }
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      refresh: async () => {
        const next = await resolveAppUser({ force: true });
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
