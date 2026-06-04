'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { resolveAppUser, getHomePathForUser } from '@/lib/auth-session';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const appUser = await resolveAppUser();

      if (appUser) {
        router.replace(getHomePathForUser(appUser));
        return;
      }

      let onboarded = false;
      try { onboarded = !!localStorage.getItem('ohgo_onboarded'); } catch {}
      router.replace(onboarded ? '/login' : '/onboarding');
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
