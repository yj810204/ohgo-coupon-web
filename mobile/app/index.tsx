import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppWebView } from '@/components/AppWebView';
import { pathFromPushData } from '@/lib/push';

export default function IndexScreen() {
  const [initialPath, setInitialPath] = useState('/');

  useEffect(() => {
    void (async () => {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last) {
        const data = last.notification.request.content.data as Record<string, unknown>;
        const path = pathFromPushData(data);
        if (path) {
          setInitialPath(path);
          return;
        }
      }

      const url = await Linking.getInitialURL();
      if (url) {
        const parsed = Linking.parse(url);
        const path = parsed.path ? `/${parsed.path}` : '/';
        setInitialPath(path);
      }
    })();

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const path = pathFromPushData(data);
      if (path) {
        setInitialPath(path);
      }
    });

    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top', 'left', 'right', 'bottom']}>
      <AppWebView key={initialPath} initialPath={initialPath} />
    </SafeAreaView>
  );
}
