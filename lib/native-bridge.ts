export type NativeBridgeMessageType =
  | 'PUSH_TOKEN_REQUEST'
  | 'PUSH_TOKEN_RESPONSE'
  | 'NAVIGATION'
  | 'HAPTIC_FEEDBACK'
  | 'SHARE'
  | 'SAVE_IMAGE'
  | 'SAVE_IMAGE_RESULT'
  | 'JS_ALERT'
  | 'JS_CONFIRM'
  | 'JS_CONFIRM_RESULT'
  | 'NATIVE_READY'
  | 'GAME_IMMERSIVE';

export interface NativeBridgeMessage<T = unknown> {
  type: NativeBridgeMessageType;
  payload?: T;
}

type NativeMessageHandler = (message: NativeBridgeMessage) => void;

const handlers = new Set<NativeMessageHandler>();

function getReactNativeWebView(): { postMessage: (data: string) => void } | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { ReactNativeWebView?: { postMessage: (data: string) => void } })
    .ReactNativeWebView;
}

export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as Window & { __OHGO_NATIVE_APP__?: boolean }).__OHGO_NATIVE_APP__;
}

/** 공용폰에서 계정 전환 후 푸시 토큰을 현재 회원에 다시 묶을 때 사용 */
export const USER_CHANGED_EVENT = 'ohgo-user-changed';

export function notifyUserChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(USER_CHANGED_EVENT));
}

export function postToNative(type: NativeBridgeMessageType, payload?: unknown): void {
  const bridge = getReactNativeWebView();
  if (!bridge) return;
  bridge.postMessage(JSON.stringify({ type, payload }));
}

/** 전화번호를 `tel:` URL로 정규화. 유효하지 않으면 null. */
export function toTelUrl(phone: string): string | null {
  const tel = phone.replace(/[^\d+]/g, '');
  if (!tel) return null;
  return `tel:${tel}`;
}

/**
 * 전화 앱(다이얼러)을 연다.
 * WebView는 `<a href="tel:">` / `location.href`를 무시하는 경우가 있어,
 * 이미 배포된 앱의 SHARE 핸들러(`Linking.openURL`)를 사용한다.
 */
export function openPhoneDialer(phone: string): boolean {
  const url = toTelUrl(phone);
  if (!url) return false;
  const bridge = getReactNativeWebView();
  if (bridge) {
    bridge.postMessage(JSON.stringify({ type: 'SHARE', payload: { url } }));
    return true;
  }
  window.location.href = url;
  return true;
}

export function onNativeMessage(handler: NativeMessageHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

function dispatchNativeMessage(raw: string) {
  try {
    const message = JSON.parse(raw) as NativeBridgeMessage;
    if (!message?.type) return;
    handlers.forEach((h) => h(message));
  } catch {
    // ignore
  }
}

export function initNativeBridge(): void {
  if (typeof window === 'undefined') return;

  const onMessage = (event: MessageEvent) => {
    const data = typeof event.data === 'string' ? event.data : '';
    if (data) dispatchNativeMessage(data);
  };

  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage as EventListener);

  window.addEventListener('ohgo-native-ready', () => {
    handlers.forEach((h) => h({ type: 'NATIVE_READY' }));
  });
}

export async function requestPushTokenFromNative(): Promise<string | null> {
  if (!isNativeApp()) return null;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 8000);

    const unsubscribe = onNativeMessage((msg) => {
      if (msg.type === 'PUSH_TOKEN_RESPONSE') {
        clearTimeout(timeout);
        unsubscribe();
        const token = (msg.payload as { token?: string | null })?.token ?? null;
        resolve(token);
      }
    });

    postToNative('PUSH_TOKEN_REQUEST');
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * 네이티브 앱에서 이미지를 기기 사진 앨범에 저장.
 * WebView에서는 `<a download>`가 동작하지 않으므로 브리지를 사용한다.
 */
export async function saveImageToDevice(options: {
  imageUri: string;
  filename: string;
}): Promise<void> {
  if (!isNativeApp()) {
    throw new Error('네이티브 앱에서만 사용할 수 있습니다.');
  }

  const { imageUri, filename } = options;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('이미지 저장 시간이 초과되었습니다.'));
    }, 45000);

    const unsubscribe = onNativeMessage((msg) => {
      if (msg.type !== 'SAVE_IMAGE_RESULT') return;
      clearTimeout(timeout);
      unsubscribe();
      const payload = msg.payload as { ok?: boolean; message?: string } | undefined;
      if (payload?.ok) resolve();
      else reject(new Error(payload?.message || '이미지 저장에 실패했습니다.'));
    });

    void (async () => {
      try {
        if (/^https?:\/\//i.test(imageUri)) {
          postToNative('SAVE_IMAGE', { uri: imageUri, filename });
          return;
        }

        const response = await fetch(imageUri);
        if (!response.ok) throw new Error('이미지를 불러오지 못했습니다.');
        const blob = await response.blob();
        const base64 = await blobToBase64(blob);
        postToNative('SAVE_IMAGE', {
          base64,
          filename,
          mimeType: blob.type || 'image/jpeg',
        });
      } catch (error) {
        clearTimeout(timeout);
        unsubscribe();
        reject(error instanceof Error ? error : new Error('이미지 저장에 실패했습니다.'));
      }
    })();
  });
}

export async function savePushTokenToUser(uuid: string, token: string): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem('expoPushToken', token);

  const { saveExpoPushToken } = await import('@/utils/member-profile-service');
  await saveExpoPushToken(uuid, token);
}
