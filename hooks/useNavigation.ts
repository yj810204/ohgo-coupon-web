'use client';

import { useRouter } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext';
import { useCallback } from 'react';

export function useNavigation() {
  const router = useRouter();
  const { setLoading } = useLoading();

  const navigate = useCallback((path: string) => {
    setLoading(true);
    // 약간의 지연을 주어 로딩 상태가 보이도록 함
    setTimeout(() => {
      router.push(path);
      // 페이지 이동 후 약간의 지연 후 로딩 해제
      setTimeout(() => {
        setLoading(false);
      }, 300);
    }, 100);
  }, [router, setLoading]);

  const navigateReplace = useCallback((path: string) => {
    setLoading(true);
    setTimeout(() => {
      router.replace(path);
      setTimeout(() => {
        setLoading(false);
      }, 300);
    }, 100);
  }, [router, setLoading]);

  const navigateBack = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      router.back();
      setTimeout(() => {
        setLoading(false);
      }, 300);
    }, 100);
  }, [router, setLoading]);

  return {
    navigate,
    navigateReplace,
    navigateBack,
    router,
  };
}

