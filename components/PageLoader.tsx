'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext';

/** 전체 화면 스피너 대신 상단 진행 바 + 작은 «불러오는 중» 표시 */
export default function PageLoader() {
  const { isLoading, setLoading } = useLoading();
  const pathname = usePathname();

  // 경로 변경 직후 바로 끄면 도착 페이지 부트 스피너가 깜빡임 → 짧게 유지
  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 380);
    return () => window.clearTimeout(timer);
  }, [pathname, setLoading]);

  // 같은 경로/실패 등으로 안 풀리는 경우 안전장치
  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setTimeout(() => setLoading(false), 8000);
    return () => window.clearTimeout(timer);
  }, [isLoading, setLoading]);

  if (!isLoading) return null;

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
