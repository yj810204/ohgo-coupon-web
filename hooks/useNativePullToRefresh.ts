'use client';

import { useEffect, useRef } from 'react';

/** Expo WebView 네이티브 당겨서 새로고침 → ohgo-pull-refresh 이벤트 */
export function useNativePullToRefresh(onRefresh: () => void | Promise<void>) {
  const handlerRef = useRef(onRefresh);
  handlerRef.current = onRefresh;

  useEffect(() => {
    const handler = () => {
      void handlerRef.current();
    };
    window.addEventListener('ohgo-pull-refresh', handler);
    return () => window.removeEventListener('ohgo-pull-refresh', handler);
  }, []);
}
