'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';

export function useRequireAdmin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ uuid: string; name: string } | null>(null);

  useEffect(() => {
    const check = async () => {
      const u = await getUser();
      if (!u?.uuid) {
        router.replace('/login');
        return;
      }
      const remote = await getUserByUUID(u.uuid);
      if (!remote?.isAdmin) {
        router.replace('/main');
        return;
      }
      setUser({ uuid: u.uuid, name: u.name || remote.name || '관리자' });
      setReady(true);
    };
    void check();
  }, [router]);

  return { ready, user };
}
