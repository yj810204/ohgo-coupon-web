'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import PageHeader from '@/components/PageHeader';
import type { PageHeaderAction } from '@/lib/page-header-action';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';

type SubPageFrameProps = {
  title: string;
  children: ReactNode;
  onRefresh?: () => void | Promise<void>;
  showBackButton?: boolean;
  showMyPage?: boolean;
  onBack?: () => void;
  /** 우상단 아이콘. 없으면 마이페이지 */
  headerAction?: PageHeaderAction | null;
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
  headerAction,
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
        headerAction={headerAction}
      />
      <div className="container pb-3" style={{ maxWidth: 'var(--ohgo-app-max-width)' }}>
        {children}
      </div>
    </div>
  );
}
