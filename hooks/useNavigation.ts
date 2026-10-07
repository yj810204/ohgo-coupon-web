'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useCallback, startTransition } from 'react';
import { useLoading } from '@/contexts/LoadingContext';
import { armClientBack, armClientNavigation } from '@/lib/navigation-guard';

/**
 * 앱 내 페이지 이동.
 * 상단 진행 바로 «이동 중» 피드백을 주고, 경로가 바뀌면 자동으로 해제한다.
 */
export function useNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { setLoading } = useLoading();

  const navigate = useCallback(
    (path: string) => {
      if (path === pathname) return;
      if (path.startsWith('/') && typeof window !== 'undefined') {
        armClientNavigation(window.location.pathname, path);
      }
      setLoading(true);
      startTransition(() => {
        router.push(path);
      });
    },
    [router, pathname, setLoading],
  );

  const navigateReplace = useCallback(
    (path: string) => {
      if (path === pathname) return;
      if (path.startsWith('/') && typeof window !== 'undefined') {
        armClientNavigation(window.location.pathname, path);
      }
      setLoading(true);
      startTransition(() => {
        router.replace(path);
      });
    },
    [router, pathname, setLoading],
  );

  const navigateBack = useCallback(() => {
    if (typeof window !== 'undefined') armClientBack(window.location.pathname);
    setLoading(true);
    startTransition(() => {
      router.back();
    });
  }, [router, setLoading]);

  return {
    navigate,
    navigateReplace,
    navigateBack,
    router,
  };
}
