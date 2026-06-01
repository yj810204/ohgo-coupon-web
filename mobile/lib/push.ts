import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push permission not granted');
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId as string | undefined,
    });
    return tokenData.data;
  } catch (e) {
    console.warn('Failed to get Expo push token:', e);
    return null;
  }
}

export type PushDeepLink = {
  screen?: string;
  uuid?: string;
  name?: string;
  dob?: string;
};

export function pathFromPushData(data: Record<string, unknown> | undefined): string | null {
  if (!data?.screen || typeof data.screen !== 'string') return null;

  const screen = data.screen;
  const uuid = typeof data.uuid === 'string' ? data.uuid : '';
  const name = typeof data.name === 'string' ? data.name : '';
  const dob =
    typeof data.dob === 'string' || typeof data.dob === 'number'
      ? String(data.dob)
      : '';

  const params = new URLSearchParams();
  if (uuid) params.set('uuid', uuid);
  if (name) params.set('name', name);
  if (dob) params.set('dob', dob);
  const qs = params.toString();

  const pathMap: Record<string, string> = {
    main: '/main',
    stamp: '/stamp',
    coupons: '/coupons',
    'member-detail': '/member-detail',
    'admin-main': '/admin-main',
    'notification-history': '/notification-history',
    community: '/community',
    'mini-games': '/mini-games',
  };

  const base = pathMap[screen];
  if (!base) return null;
  return qs ? `${base}?${qs}` : base;
}
