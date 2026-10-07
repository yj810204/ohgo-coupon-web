'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext';
import { subscribeNav, tickNav } from '@/lib/navigation-guard';
import {
  isChunkFailureEvent,
  noteLanded,
  probeDeployedChunks,
  recoverOnlineNavigation,
  recoverStuckNavigation,
  reloadToPendingOrHere,
} from '@/lib/navigation-runtime';

/** 잠자기, 배포로 사라진 청크, 끝나지 않는 이동을 전체 로드로 풀어 준다. */
export default function NavigationRecovery() {
  const pathname = usePathname();
  const { setLoading } = useLoading();

  useEffect(() => {
    noteLanded(pathname);
  }, [pathname]);

  useEffect(() => {
    return subscribeNav((state) => {
      if (!state.targetPath) setLoading(false);
    });
  }, [setLoading]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      tickNav(window.location.pathname);
      if (recoverStuckNavigation()) setLoading(false);
    }, 250);

    const onError = (event: ErrorEvent) => {
      if (!isChunkFailureEvent(event.message || '', event.target)) return;
      setLoading(false);
      reloadToPendingOrHere();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { name?: string; message?: string } | undefined;
      const message = `${reason?.name || ''} ${reason?.message || ''}`;
      if (!isChunkFailureEvent(message, null)) return;
      setLoading(false);
      reloadToPendingOrHere();
    };

    const onOnline = () => {
      if (recoverOnlineNavigation()) setLoading(false);
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (recoverStuckNavigation()) setLoading(false);
      void probeDeployedChunks();
    };

    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [setLoading]);

  return null;
}
