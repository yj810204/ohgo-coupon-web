'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  initNativeBridge,
  isNativeApp,
  onNativeMessage,
  isPushOptedOut,
  requestPushTokenFromNative,
  savePushTokenToUser,
  USER_CHANGED_EVENT,
} from '@/lib/native-bridge';
import { releaseBodyScrollIfIdle } from '@/lib/body-scroll-lock';
import { getUser } from '@/lib/storage';

export default function NativeBridgeInit() {
  const pathname = usePathname();

  useEffect(() => {
    releaseBodyScrollIfIdle();
  }, [pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        releaseBodyScrollIfIdle();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, []);

  useEffect(() => {
    initNativeBridge();

    if (!isNativeApp()) return;

    document.body.setAttribute('data-native-app', 'true');

    const syncPushToken = async () => {
      const user = await getUser();
      if (!user?.uuid || isPushOptedOut()) return;

      const token = await requestPushTokenFromNative();
      if (token && !isPushOptedOut()) {
        await savePushTokenToUser(user.uuid, token);
      }
    };

    void syncPushToken();

    const unsub = onNativeMessage((msg) => {
      if (msg.type === 'NATIVE_READY') {
        void syncPushToken();
      }
    });

    const onUserChanged = () => {
      void syncPushToken();
    };
    window.addEventListener(USER_CHANGED_EVENT, onUserChanged);

    return () => {
      unsub();
      window.removeEventListener(USER_CHANGED_EVENT, onUserChanged);
    };
  }, []);

  return null;
}
