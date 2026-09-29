'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';

export type StaffActor = { userId: string; name: string; isAdmin: boolean; isStaff: boolean };

/** 로그인만 요구하고, 선장·관리자인지 함께 알려준다. requireStaff 면 아닌 사람은 돌려보낸다. */
export function useStaffActor(options?: { requireStaff?: boolean }) {
  const router = useRouter();
  const [actor, setActor] = useState<StaffActor | null>(null);
  const requireStaff = Boolean(options?.requireStaff);

  useEffect(() => {
    const run = async () => {
      const user = await resolveAppUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const isStaff = Boolean(user.isAdmin || user.isCaptain);
      if (requireStaff && !isStaff) {
        router.replace('/main');
        return;
      }
      setActor({
        userId: user.uuid,
        name: user.name || (user.isAdmin ? '관리자' : '선장'),
        isAdmin: Boolean(user.isAdmin),
        isStaff,
      });
    };
    void run();
  }, [router, requireStaff]);

  return { ready: actor != null, actor };
}
