'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const localUser = await getUser();

      if (!localUser?.uuid) {
        // 온보딩 완료 여부 확인
        let onboarded = false;
        try { onboarded = !!localStorage.getItem('ohgo_onboarded'); } catch {}
        router.replace(onboarded ? '/login' : '/onboarding');
        return;
      }

      const remoteUser = await getUserByUUID(localUser.uuid);
      if (remoteUser) {
        router.replace(remoteUser.isAdmin ? '/admin-main' : '/main');
      } else {
        let onboarded = false;
        try { onboarded = !!localStorage.getItem('ohgo_onboarded'); } catch {}
        router.replace(onboarded ? '/login' : '/onboarding');
      }
    };

    checkUser();
  }, [router]);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    </div>
  );
}
