export type NativeBridgeMessageType =
  | 'PUSH_TOKEN_REQUEST'
  | 'PUSH_TOKEN_RESPONSE'
  | 'NAVIGATION'
  | 'HAPTIC_FEEDBACK'
  | 'SHARE'
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

export function postToNative(type: NativeBridgeMessageType, payload?: unknown): void {
  const bridge = getReactNativeWebView();
  if (!bridge) return;
  bridge.postMessage(JSON.stringify({ type, payload }));
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

export async function savePushTokenToUser(uuid: string, token: string): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem('expoPushToken', token);

  const { saveExpoPushToken } = await import('@/utils/member-profile-service');
  await saveExpoPushToken(uuid, token);
}
