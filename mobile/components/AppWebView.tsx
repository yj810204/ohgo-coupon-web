import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { useCameraPermissions } from 'expo-camera';
import {
  buildSafeAreaInjectScript,
  NATIVE_INJECT_SCRIPT,
  parseBridgeMessage,
} from '@/lib/bridge';
import { registerForPushNotifications } from '@/lib/push';
import { NativeQRScanner } from './NativeQRScanner';

function getWebBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_WEB_URL;
  if (url) return url.replace(/\/$/, '');
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

type AppWebViewProps = {
  initialPath?: string;
};

export function AppWebView({ initialPath = '/' }: AppWebViewProps) {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const pushTokenRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [gameImmersive, setGameImmersive] = useState(false);
  const canGoBackRef = useRef(false);
  const baseUrl = getWebBaseUrl();
  const initialUri = `${baseUrl}${initialPath.startsWith('/') ? initialPath : `/${initialPath}`}`;

  const [, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    void (async () => {
      pushTokenRef.current = await registerForPushNotifications();
    })();
  }, []);

  const injectSafeArea = useCallback(() => {
    webRef.current?.injectJavaScript(buildSafeAreaInjectScript(insets.top, insets.bottom));
  }, [insets.top, insets.bottom]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackRef.current) {
        webRef.current?.goBack();
        return true;
      }
      Alert.alert(
        '앱 종료',
        '앱을 닫으시겠습니까?',
        [
          { text: '취소', style: 'cancel' },
          { text: '종료', style: 'destructive', onPress: () => BackHandler.exitApp() },
        ],
        { cancelable: true },
      );
      return true;
    });
    return () => handler.remove();
  }, []);

  useEffect(() => {
    if (!loading) {
      injectSafeArea();
    }
  }, [loading, injectSafeArea, gameImmersive, insets.top, insets.bottom]);

  const sendToWeb = useCallback((type: string, payload?: unknown) => {
    const script = `(function(){
      try {
        window.dispatchEvent(new MessageEvent('message', {
          data: ${JSON.stringify(JSON.stringify({ type, payload }))}
        }));
      } catch(e) {}
    })();true;`;
    webRef.current?.injectJavaScript(script);
  }, []);

  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      const msg = parseBridgeMessage(event.nativeEvent.data);
      if (!msg) return;
      switch (msg.type) {
        case 'PUSH_TOKEN_REQUEST': {
          if (!pushTokenRef.current) {
            pushTokenRef.current = await registerForPushNotifications();
          }
          sendToWeb('PUSH_TOKEN_RESPONSE', { token: pushTokenRef.current });
          break;
        }
        case 'CAMERA_PERMISSION_REQUEST': {
          const result = await requestCameraPermission();
          sendToWeb('CAMERA_PERMISSION_RESPONSE', { granted: result.granted });
          break;
        }
        case 'QR_SCAN_REQUEST': {
          setShowQRScanner(true);
          break;
        }
        case 'OPEN_SETTINGS': {
          await Linking.openSettings();
          break;
        }
        case 'GAME_IMMERSIVE': {
          const enabled = !!(msg.payload as { enabled?: boolean } | undefined)?.enabled;
          setGameImmersive(enabled);
          setTimeout(() => injectSafeArea(), 0);
          break;
        }
        default:
          break;
      }
    },
    [sendToWeb, requestCameraPermission, injectSafeArea],
  );

  const handleQRResult = useCallback(
    (data: string) => {
      setShowQRScanner(false);
      sendToWeb('QR_SCAN_RESULT', { data });
    },
    [sendToWeb],
  );

  const handleQRCancel = useCallback(() => {
    setShowQRScanner(false);
    sendToWeb('QR_SCAN_CANCEL', {});
  }, [sendToWeb]);

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      const { url } = request;
      if (url.startsWith(baseUrl) || url.startsWith('http://localhost') || url.startsWith('http://10.0.2.2')) {
        return true;
      }
      if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) {
        return true;
      }
      return false;
    },
    [baseUrl],
  );

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#1B6FF5" />
        </View>
      )}
      <WebView
        ref={webRef}
        source={{ uri: initialUri }}
        style={styles.webview}
        onNavigationStateChange={navState => {
          canGoBackRef.current = navState.canGoBack;
        }}
        onLoadEnd={() => {
          setLoading(false);
          injectSafeArea();
        }}
        onMessage={handleMessage}
        injectedJavaScriptBeforeContentLoaded={NATIVE_INJECT_SCRIPT}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        {...(Platform.OS === 'android'
          ? {
              onPermissionRequest: (event: {
                nativeEvent: { resources: string[]; grant: (r: string[]) => void };
              }) => {
                event.nativeEvent.grant(event.nativeEvent.resources);
              },
            }
          : {})}
        mediaCapturePermissionGrantType="grant"
        setSupportMultipleWindows={false}
        startInLoadingState
        pullToRefreshEnabled
        onRefresh={() => {
          webRef.current?.injectJavaScript(
            `(function(){ window.dispatchEvent(new Event('ohgo-pull-refresh')); })();true;`,
          );
        }}
        bounces
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        contentInsetAdjustmentBehavior="never"
      />

      {/* 네이티브 QR 스캐너 오버레이 */}
      {showQRScanner && (
        <View style={StyleSheet.absoluteFill}>
          <NativeQRScanner onResult={handleQRResult} onCancel={handleQRCancel} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8FA',
    zIndex: 10,
  },
});
