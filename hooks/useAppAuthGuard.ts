'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { resolveAppUser } from '@/lib/auth-session';

type Options = {
  /** 프로필 설정 페이지에서는 true */
  allowProfileSetup?: boolean;
  adminOnly?: boolean;
};

/** 로그인·프로필 설정·관리자 권한 공통 가드 */
export function useAppAuthGuard(options?: Options) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const run = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }
      if (appUser.needsProfileSetup && !options?.allowProfileSetup) {
        router.replace('/profile-setup');
        return;
      }
      if (options?.adminOnly && !appUser.isAdmin) {
        router.replace('/main');
      }
    };
    void run();
  }, [router, pathname, options?.allowProfileSetup, options?.adminOnly]);
}
