'use client';

import { useEffect } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { getUser } from '@/lib/storage';
import SubPageFrame from '@/components/SubPageFrame';
import TideCalendarScreen from '@/components/trip/TideCalendarScreen';

export default function TidePage() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) router.replace('/login');
    };
    void checkAuth();
  }, [router]);

  return (
    <SubPageFrame title="물때" dense>
      <TideCalendarScreen />
    </SubPageFrame>
  );
}
