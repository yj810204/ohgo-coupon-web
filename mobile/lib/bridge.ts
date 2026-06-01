export type BridgeMessageType =
  | 'PUSH_TOKEN_REQUEST'
  | 'PUSH_TOKEN_RESPONSE'
  | 'NAVIGATION'
  | 'HAPTIC_FEEDBACK'
  | 'SHARE'
  | 'NATIVE_READY'
  | 'CAMERA_PERMISSION_REQUEST'
  | 'CAMERA_PERMISSION_RESPONSE'
  | 'OPEN_SETTINGS'
  | 'QR_SCAN_REQUEST'
  | 'QR_SCAN_RESULT'
  | 'QR_SCAN_CANCEL';

export interface BridgeMessage<T = unknown> {
  type: BridgeMessageType;
  payload?: T;
}

export function parseBridgeMessage(data: string): BridgeMessage | null {
  try {
    const parsed = JSON.parse(data) as BridgeMessage;
    if (parsed && typeof parsed.type === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeBridgeMessage(message: BridgeMessage): string {
  return JSON.stringify(message);
}

/** WebView에 주입할 스크립트 — 네이티브 앱 환경 플래그 */
export const NATIVE_INJECT_SCRIPT = `
(function() {
  window.__OHGO_NATIVE_APP__ = true;
  function applyNative() {
    document.documentElement.classList.add('ohgo-native');
    if (document.body) {
      document.body.setAttribute('data-native-app', 'true');
    }
  }
  if (document.body) {
    applyNative();
  } else {
    document.addEventListener('DOMContentLoaded', applyNative);
  }
  window.dispatchEvent(new CustomEvent('ohgo-native-ready'));
})();
true;
`;

/** 네이티브 앱 플래그 주입 */
export function buildSafeAreaInjectScript(_top: number, _bottom: number): string {
  return `
(function() {
  document.documentElement.classList.add('ohgo-native');
  if (document.body) document.body.setAttribute('data-native-app', 'true');
})();
true;
`;
}
