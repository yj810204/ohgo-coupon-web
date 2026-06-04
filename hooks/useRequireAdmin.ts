'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resolveAppUser } from '@/lib/auth-session';

export function useRequireAdmin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ uuid: string; name: string } | null>(null);

  useEffect(() => {
    const check = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }
      if (!appUser.isAdmin) {
        router.replace('/main');
        return;
      }
      setUser({ uuid: appUser.uuid, name: appUser.name || '관리자' });
      setReady(true);
    };
    void check();
  }, [router]);

  return { ready, user };
}
