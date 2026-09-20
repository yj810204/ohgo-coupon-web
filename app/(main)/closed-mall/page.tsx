'use client';

import { useEffect } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { OhgoPageLoading } from '@/lib/page-styles';

export default function ClosedMallRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/market');
  }, [router]);

  return <OhgoPageLoading />;
}
