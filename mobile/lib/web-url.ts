import { Platform } from 'react-native';
import Constants from 'expo-constants';

/** 스토어/프로덕션 기본 호스팅 URL (env 누락 시 폴백) */
export const PRODUCTION_WEB_URL = 'https://ohgo.codejaka.com';

/** Expo Metro가 쓰는 개발 머신 호스트 (실기기 LAN IP) */
export function getExpoDevHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost ||
    null;
  if (!hostUri) return null;
  const host = hostUri.split(':')[0]?.trim();
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return host;
}

/**
 * WebView가 로드할 Next.js 베이스 URL.
 *
 * 개발(__DEV__):
 * - 기본 → Expo Metro 호스트 IP:3000 (로컬 `npm run dev:lan`)
 * - EXPO_PUBLIC_USE_HOSTED=true 일 때만 EXPO_PUBLIC_WEB_URL(https) 사용
 *
 * 프로덕션 빌드:
 * - EXPO_PUBLIC_WEB_URL → 없으면 PRODUCTION_WEB_URL
 */
export function getWebBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, '') || '';
  const useHosted =
    process.env.EXPO_PUBLIC_USE_HOSTED === 'true' ||
    process.env.EXPO_PUBLIC_USE_HOSTED === '1';

  if (__DEV__ && !useHosted) {
    const expoHost = getExpoDevHost();
    if (expoHost) {
      return `http://${expoHost}:3000`;
    }
    if (envUrl.startsWith('http://')) {
      return envUrl;
    }
    if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
    return 'http://localhost:3000';
  }

  if (envUrl) return envUrl;
  // 프로덕션/호스팅: env 누락 시에도 스토어 빌드가 localhost로 떨어지지 않게
  return PRODUCTION_WEB_URL;
}
