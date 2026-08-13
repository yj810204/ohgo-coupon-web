'use client';

import { useRouter as useNextRouter, usePathname } from 'next/navigation';
import { useCallback, startTransition, useMemo } from 'react';
import { useLoading } from '@/contexts/LoadingContext';

function splitHref(href: string): { path: string; search: string } {
  const q = href.indexOf('?');
  if (q === -1) return { path: href, search: '' };
  return { path: href.slice(0, q), search: href.slice(q) };
}

function currentLocation(): { path: string; search: string } {
  if (typeof window === 'undefined') return { path: '', search: '' };
  return {
    path: window.location.pathname,
    search: window.location.search || '',
  };
}

/**
 * next/navigation의 useRouter 드롭인 대체.
 * push/replace/back 시 상단 진행 바 + «이동 중» 표시를 켠다.
 * pathname이 같고 query만 다른 경우도 감지한다.
 */
export function useRouter() {
  const router = useNextRouter();
  const pathname = usePathname();
  const { setLoading } = useLoading();

  const shouldShowLoading = useCallback(
    (href: string) => {
      const { path, search } = splitHref(href);
      const current = currentLocation();
      // SSR/hydration 직후 window가 비어 있으면 pathname 훅으로 폴백
      const curPath = current.path || pathname;
      const curSearch = current.path ? current.search : '';
      return path !== curPath || search !== curSearch;
    },
    [pathname]
  );

  const push = useCallback(
    (href: string, options?: Parameters<typeof router.push>[1]) => {
      if (shouldShowLoading(href)) setLoading(true);
      startTransition(() => {
        router.push(href, options);
      });
    },
    [router, setLoading, shouldShowLoading]
  );

  const replace = useCallback(
    (href: string, options?: Parameters<typeof router.replace>[1]) => {
      if (shouldShowLoading(href)) setLoading(true);
      startTransition(() => {
        router.replace(href, options);
      });
    },
    [router, setLoading, shouldShowLoading]
  );

  const back = useCallback(() => {
    setLoading(true);
    startTransition(() => {
      router.back();
    });
  }, [router, setLoading]);

  return useMemo(
    () => ({
      ...router,
      push,
      replace,
      back,
    }),
    [router, push, replace, back]
  );
}
