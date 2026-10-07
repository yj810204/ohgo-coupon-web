'use client';

import { useEffect, useState } from 'react';
import { useLoading } from '@/contexts/LoadingContext';
import { NAV_FALLBACK_MS, subscribeNav } from '@/lib/navigation-guard';
import { recoverStuckNavigation } from '@/lib/navigation-runtime';

/** 이동이 150ms 안에 끝나면 로더를 보여 주지 않는다. */
const SHOW_AFTER_MS = 150;

/** 전체 화면 스피너 대신 상단 진행 바 + 작은 «불러오는 중» 표시 */
export default function PageLoader() {
  const { isLoading, setLoading } = useLoading();
  const [visible, setVisible] = useState(false);
  if (!isLoading && visible) setVisible(false);

  useEffect(() => {
    return subscribeNav((state) => {
      if (!state.targetPath) setLoading(false);
    });
  }, [setLoading]);

  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  // 같은 경로, 취소, 멈춘 요청이면 로더를 끄고 필요하면 문서를 다시 연다
  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setTimeout(() => {
      recoverStuckNavigation();
      setLoading(false);
    }, NAV_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [isLoading, setLoading]);

  if (!visible) return null;

  return (
    <>
      <div className="ohgo-nav-progress" aria-hidden="true">
        <div className="ohgo-nav-progress__bar" />
      </div>
      <div className="ohgo-nav-toast" role="status" aria-live="polite">
        불러오는 중…
      </div>
    </>
  );
}
