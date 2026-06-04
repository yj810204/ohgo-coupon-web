'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { saveUser } from '@/lib/storage';
import { getHomePathForUser } from '@/lib/auth-session';
import { resetSupabaseBrowserClient } from '@/lib/supabase/client';

type AuthCompleteClientProps = {
  profile: {
    id: string;
    name: string;
    dob: string;
    isAdmin: boolean;
  };
};

export default function AuthCompleteClient({ profile }: AuthCompleteClientProps) {
  const router = useRouter();

  useEffect(() => {
    const complete = async () => {
      resetSupabaseBrowserClient();
      await saveUser({
        uuid: profile.id,
        name: profile.name,
        dob: profile.dob,
        isAdmin: profile.isAdmin,
      });
      router.replace(
        getHomePathForUser({
          uuid: profile.id,
          name: profile.name,
          dob: profile.dob,
          isAdmin: profile.isAdmin,
        })
      );
    };
    void complete();
  }, [profile, router]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F7F8FA',
      }}
    >
      <div className="spinner-border text-primary" role="status" />
    </div>
  );
}
