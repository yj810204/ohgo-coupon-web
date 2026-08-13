'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import PageHeader from '@/components/PageHeader';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';

type SubPageFrameProps = {
  title: string;
  children: ReactNode;
  onRefresh?: () => void | Promise<void>;
  showBackButton?: boolean;
  showMyPage?: boolean;
  onBack?: () => void;
  /** true면 헤더↔본문 상단 여백을 줄임 (명부 등 밀집 화면) */
  dense?: boolean;
};

export default function SubPageFrame({
  title,
  children,
  onRefresh,
  showBackButton,
  showMyPage,
  onBack,
  dense = false,
}: SubPageFrameProps) {
  const router = useRouter();
  const handleRefresh = onRefresh ?? (() => {
    router.refresh();
  });

  useNativePullToRefresh(handleRefresh);

  return (
    <div className={`ohgo-subpage min-vh-100 pb-4${dense ? ' ohgo-subpage--dense' : ''}`}>
      <PageHeader
        title={title}
        showBackButton={showBackButton}
        showMyPage={showMyPage}
        onBack={onBack}
      />
      <div className="container pb-3" style={{ maxWidth: 'var(--ohgo-app-max-width)' }}>
        {children}
      </div>
    </div>
  );
}
