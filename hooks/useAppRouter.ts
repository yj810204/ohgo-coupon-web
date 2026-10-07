'use client';

import { useRouter as useNextRouter, usePathname } from 'next/navigation';
import { startTransition, useMemo } from 'react';
import { useLoading } from '@/contexts/LoadingContext';
import { armClientBack, armClientNavigation } from '@/lib/navigation-guard';

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

  return useMemo(() => {
    const shouldShowLoading = (href: string) => {
      const { path, search } = splitHref(href);
      const current = currentLocation();
      const curPath = current.path || pathname;
      const curSearch = current.path ? current.search : '';
      return path !== curPath || search !== curSearch;
    };

    const push = (href: string, options?: Parameters<typeof router.push>[1]) => {
      if (shouldShowLoading(href)) {
        if (href.startsWith('/')) armClientNavigation(currentLocation().path || pathname, href);
        setLoading(true);
      }
      startTransition(() => {
        router.push(href, options);
      });
    };

    const replace = (href: string, options?: Parameters<typeof router.replace>[1]) => {
      if (shouldShowLoading(href)) {
        if (href.startsWith('/')) armClientNavigation(currentLocation().path || pathname, href);
        setLoading(true);
      }
      startTransition(() => {
        router.replace(href, options);
      });
    };

    const back = () => {
      armClientBack(currentLocation().path || pathname);
      setLoading(true);
      startTransition(() => {
        router.back();
      });
    };

    return {
      ...router,
      push,
      replace,
      back,
    };
  }, [router, pathname, setLoading]);
}
