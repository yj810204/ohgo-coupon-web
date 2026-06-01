'use client';

import { useEffect } from 'react';
import { initNativeBridge, isNativeApp, onNativeMessage, requestPushTokenFromNative, savePushTokenToUser } from '@/lib/native-bridge';
import { getUser } from '@/lib/storage';

export default function NativeBridgeInit() {
  useEffect(() => {
    initNativeBridge();

    if (!isNativeApp()) return;

    document.body.setAttribute('data-native-app', 'true');

    const syncPushToken = async () => {
      const user = await getUser();
      if (!user?.uuid) return;

      const token = await requestPushTokenFromNative();
      if (token) {
        await savePushTokenToUser(user.uuid, token);
      }
    };

    void syncPushToken();

    const unsub = onNativeMessage((msg) => {
      if (msg.type === 'NATIVE_READY') {
        void syncPushToken();
      }
    });

    return () => unsub();
  }, []);

  return null;
}
