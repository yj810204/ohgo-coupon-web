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
};

export default function SubPageFrame({
  title,
  children,
  onRefresh,
  showBackButton,
  showMyPage,
  onBack,
}: SubPageFrameProps) {
  const router = useRouter();
  const handleRefresh = onRefresh ?? (() => {
    router.refresh();
  });

  useNativePullToRefresh(handleRefresh);

  return (
    <div className="ohgo-subpage min-vh-100 pb-4">
      <PageHeader
        title={title}
        showBackButton={showBackButton}
        showMyPage={showMyPage}
        onBack={onBack}
      />
      <div className="container pb-3" style={{ maxWidth: 480 }}>
        {children}
      </div>
    </div>
  );
}
