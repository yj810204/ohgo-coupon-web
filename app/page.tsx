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
      console.log('🧪 localStorage user:', localUser);

      if (!localUser?.uuid) {
        console.log('🛑 localUser 없음 → 로그인 화면으로 이동');
        router.replace('/login');
        return;
      }

      const remoteUser = await getUserByUUID(localUser.uuid);
      console.log('🧪 Firestore user:', remoteUser);

      if (remoteUser) {
        console.log('✅ 자동 로그인 성공 →', remoteUser.isAdmin ? '/admin-main' : '/main');
        const route = remoteUser.isAdmin ? '/admin-main' : '/main';
        router.replace(route);
      } else {
        console.log('🛑 Firestore에 사용자 없음 → 로그인 화면으로 이동');
        router.replace('/login');
      }
    };

    checkUser();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">자동 로그인 중...</p>
      </div>
    </div>
  );
}
