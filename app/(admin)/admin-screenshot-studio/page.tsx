'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';
import StoreScreenshotStudio from '@/components/screenshot-studio/StoreScreenshotStudio';

export default function AdminScreenshotStudioPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const run = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }
      if (!appUser.isAdmin) {
        router.replace('/main');
        return;
      }
      setReady(true);
    };
    void run();
  }, [router]);

  if (!ready) {
    return (
      <div
        className="min-vh-100 d-flex align-items-center justify-content-center"
        style={{ backgroundColor: '#F7F8FA' }}
      >
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return <StoreScreenshotStudio backHref="/admin-main" />;
}
