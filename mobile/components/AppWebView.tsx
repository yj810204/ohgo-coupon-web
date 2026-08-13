import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { useCameraPermissions } from 'expo-camera';
import {
  buildSafeAreaInjectScript,
  NATIVE_INJECT_SCRIPT,
  parseBridgeMessage,
} from '@/lib/bridge';
import { registerForPushNotifications } from '@/lib/push';
import { saveImageToLibrary, type SaveImagePayload } from '@/lib/save-image';
import { getWebBaseUrl, PRODUCTION_WEB_URL } from '@/lib/web-url';
import { NativeQRScanner } from './NativeQRScanner';

const LOAD_TIMEOUT_MS = 45000;

type AppWebViewProps = {
  initialPath?: string;
};

export function AppWebView({ initialPath = '/' }: AppWebViewProps) {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const pushTokenRef = useRef<string | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 첫 문서 로드 성공 이후에는 네비게이션마다 전체 로딩 오버레이를 띄우지 않음 */
  const firstLoadDoneRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [gameImmersive, setGameImmersive] = useState(false);
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const canGoBackRef = useRef(false);
  const baseUrl = getWebBaseUrl();
  const initialUri = `${baseUrl}${initialPath.startsWith('/') ? initialPath : `/${initialPath}`}`;

  const [, requestCameraPermission] = useCameraPermissions();

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const startLoadTimeout = useCallback(() => {
    clearLoadTimeout();
    loadTimeoutRef.current = setTimeout(() => {
      if (firstLoadDoneRef.current) return;
      setLoading(false);
      const isHosted = initialUri.startsWith('https://');
      setLoadError(
        isHosted
          ? `웹 서버에 연결하지 못했습니다.\n\n${initialUri}\n\n` +
              '네트워크를 확인한 뒤 다시 시도해 주세요.\n' +
              '브라우저에서 같은 주소가 열리는지 확인해 주세요.\n' +
              '(인증서/서버 문제일 수 있습니다)'
          : `웹 서버에 연결하지 못했습니다.\n\n${initialUri}\n\n` +
              '1) 프로젝트 루트에서 npm run dev:lan 실행\n' +
              '2) 폰과 Mac이 같은 Wi-Fi인지 확인\n' +
              '3) mobile/.env 의 EXPO_PUBLIC_WEB_URL 확인 후 npx expo start -c',
      );
    }, LOAD_TIMEOUT_MS);
  }, [clearLoadTimeout, initialUri]);

  useEffect(() => {
    void (async () => {
      pushTokenRef.current = await registerForPushNotifications();
    })();
  }, []);

  useEffect(() => {
    firstLoadDoneRef.current = false;
    setFirstLoadDone(false);
    setLoading(true);
    setLoadError(null);
    startLoadTimeout();
    return () => clearLoadTimeout();
  }, [reloadKey, initialUri, startLoadTimeout, clearLoadTimeout]);

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
    if (!loading && !loadError) {
      injectSafeArea();
    }
  }, [loading, loadError, injectSafeArea, gameImmersive, insets.top, insets.bottom]);

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
        case 'SAVE_IMAGE': {
          try {
            await saveImageToLibrary((msg.payload || {}) as SaveImagePayload);
            sendToWeb('SAVE_IMAGE_RESULT', { ok: true });
            Alert.alert('저장 완료', '사진 앨범에 명부 이미지를 저장했습니다.');
          } catch (error) {
            const message =
              error instanceof Error ? error.message : '이미지 저장에 실패했습니다.';
            sendToWeb('SAVE_IMAGE_RESULT', { ok: false, message });
            Alert.alert('저장 실패', message);
          }
          break;
        }
        case 'SHARE': {
          const payload = msg.payload as { url?: string; text?: string } | undefined;
          const url = payload?.url;
          if (url) {
            try {
              await Linking.openURL(url);
            } catch {
              Alert.alert('공유 실패', '링크를 열 수 없습니다.');
            }
          }
          break;
        }
        case 'JS_ALERT': {
          const message = String(
            (msg.payload as { message?: string } | undefined)?.message ?? '',
          );
          Alert.alert('오고피씽', message || ' ');
          break;
        }
        case 'JS_CONFIRM': {
          const payload = msg.payload as { message?: string; requestId?: string } | undefined;
          const message = String(payload?.message ?? '');
          const requestId = payload?.requestId;
          Alert.alert('오고피씽', message || ' ', [
            {
              text: '취소',
              style: 'cancel',
              onPress: () => sendToWeb('JS_CONFIRM_RESULT', { requestId, ok: false }),
            },
            {
              text: '확인',
              onPress: () => sendToWeb('JS_CONFIRM_RESULT', { requestId, ok: true }),
            },
          ]);
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

  const isAllowedWebUrl = useCallback(
    (url: string) => {
      if (
        url.startsWith(baseUrl) ||
        url.startsWith('http://localhost') ||
        url.startsWith('http://10.0.2.2') ||
        url.startsWith('http://127.0.0.1') ||
        url.startsWith('http://192.168.') ||
        url.startsWith('http://172.') ||
        url.startsWith('http://10.')
      ) {
        return true;
      }
      if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) {
        return true;
      }
      try {
        const host = new URL(url).hostname;
        if (host === 'ohgo.codejaka.com' || host.endsWith('.ohgo.codejaka.com')) {
          return true;
        }
        if (host === 'codejaka.com' || host.endsWith('.codejaka.com')) {
          return true;
        }
        if (host.endsWith('.supabase.co') || host.endsWith('.supabase.in')) {
          return true;
        }
      } catch {
        /* ignore */
      }
      return false;
    },
    [baseUrl],
  );

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      const { url } = request;
      // 이미지·XHR 등 서브리소스는 외부 호스트(Supabase Storage)여도 허용
      if (request.isTopFrame === false) {
        return true;
      }
      if (isAllowedWebUrl(url)) {
        return true;
      }
      if (url.startsWith('https://') || url.startsWith('http://')) {
        void Linking.openURL(url);
        return false;
      }
      return false;
    },
    [isAllowedWebUrl],
  );

  const handleRetry = () => {
    firstLoadDoneRef.current = false;
    setFirstLoadDone(false);
    setReloadKey((k) => k + 1);
  };

  const showBlockingLoader = loading && !loadError && !firstLoadDone;

  return (
    <View style={styles.container}>
      <WebView
        key={reloadKey}
        ref={webRef}
        source={{ uri: initialUri }}
        style={[styles.webview, showBlockingLoader && styles.webviewHidden]}
        onNavigationStateChange={(navState) => {
          canGoBackRef.current = navState.canGoBack;
          if (!navState.loading && firstLoadDoneRef.current) {
            setLoading(false);
            clearLoadTimeout();
          }
        }}
        onLoadStart={() => {
          // 최초 진입(또는 재시도)에만 전체 화면 로딩/타임아웃 사용
          if (!firstLoadDoneRef.current) {
            setLoading(true);
            setLoadError(null);
            startLoadTimeout();
          }
        }}
        onLoadEnd={() => {
          clearLoadTimeout();
          firstLoadDoneRef.current = true;
          setFirstLoadDone(true);
          setLoading(false);
          setLoadError(null);
          injectSafeArea();
        }}
        onError={(e) => {
          clearLoadTimeout();
          setLoading(false);
          // 이미 화면이 뜬 뒤의 부가 로드 실패는 전체 에러로 덮지 않음
          if (firstLoadDoneRef.current) return;
          const desc = e.nativeEvent.description || '';
          const code = e.nativeEvent.code;
          const sslHint =
            /ssl|cert|trust|ERR_FAILED|ERR_CERT|ERR_CONNECTION/i.test(desc) ||
            code === -11 ||
            code === -2
              ? `\n\n(보안 연결/인증서 오류 가능)\n브라우저에서 ${PRODUCTION_WEB_URL} 접속을 확인해 주세요.`
              : '';
          setLoadError(
            `${desc || '페이지를 불러오지 못했습니다.'}\n${initialUri}${sslHint}`,
          );
        }}
        onHttpError={(e) => {
          if (firstLoadDoneRef.current) return;
          if (e.nativeEvent.statusCode >= 500) {
            clearLoadTimeout();
            setLoading(false);
            setLoadError(`HTTP ${e.nativeEvent.statusCode}\n${initialUri}`);
          }
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
              mixedContentMode: 'always' as const,
              onPermissionRequest: (event: {
                nativeEvent: { resources: string[]; grant: (r: string[]) => void };
              }) => {
                event.nativeEvent.grant(event.nativeEvent.resources);
              },
            }
          : {})}
        mediaCapturePermissionGrantType="grant"
        setSupportMultipleWindows={false}
        scalesPageToFit={false}
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        startInLoadingState
        // iOS 네이티브 PTR은 전체 reload 만 하므로 사용하지 않음.
        // Android는 PTR API가 없음 → 웹 useNativePullToRefresh 제스처 사용.
        bounces
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        contentInsetAdjustmentBehavior="never"
      />

      {showBlockingLoader ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#1B6FF5" />
          <Text style={styles.loaderHint}>웹앱 연결 중…</Text>
          <Text style={styles.loaderUrl} numberOfLines={2}>
            {initialUri}
          </Text>
        </View>
      ) : null}

      {loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>연결 실패</Text>
          <Text style={styles.errorBody}>{loadError}</Text>
          <Pressable style={styles.retryBtn} onPress={handleRetry}>
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}

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
  webviewHidden: {
    opacity: 0,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8FA',
    zIndex: 10,
    paddingHorizontal: 24,
  },
  loaderHint: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1D1F',
  },
  loaderUrl: {
    marginTop: 6,
    fontSize: 11,
    color: '#6F767E',
    textAlign: 'center',
  },
  errorBox: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#F7F8FA',
    zIndex: 11,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1D1F',
    marginBottom: 12,
  },
  errorBody: {
    fontSize: 13,
    lineHeight: 20,
    color: '#6F767E',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: '#1B6FF5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
