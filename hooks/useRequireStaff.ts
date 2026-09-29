'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';

export function useRequireStaff() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ uuid: string; name: string; isAdmin: boolean; isCaptain: boolean } | null>(
    null
  );

  useEffect(() => {
    const check = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }
      if (!appUser.isAdmin && !appUser.isCaptain) {
        router.replace('/main');
        return;
      }
      setUser({
        uuid: appUser.uuid,
        name: appUser.name || (appUser.isAdmin ? '관리자' : '선장'),
        isAdmin: appUser.isAdmin,
        isCaptain: Boolean(appUser.isCaptain),
      });
      setReady(true);
    };
    void check();
  }, [router]);

  return { ready, user };
}
