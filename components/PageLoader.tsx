'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext';

/** 이동이 150ms 안에 끝나면 로더를 보여 주지 않는다. */
const SHOW_AFTER_MS = 150;

/** 전체 화면 스피너 대신 상단 진행 바 + 작은 «불러오는 중» 표시 */
export default function PageLoader() {
  const { isLoading, setLoading } = useLoading();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setLoading(false);
  }, [pathname, setLoading]);

  useEffect(() => {
    if (!isLoading) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  // 같은 경로/실패 등으로 안 풀리는 경우 안전장치
  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setTimeout(() => setLoading(false), 8000);
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
