# 오고피씽 Mobile (Expo WebView Shell)

Expo SDK 54 기반 Thin Shell 앱입니다. UI/비즈니스 로직은 상위 Next.js 웹앱(`ohgo-coupon-web`)에서 처리하고, 이 앱은 WebView + 푸시 알림 + 카메라 권한만 담당합니다.

## 요구 사항

- Node.js 20+
- Expo CLI / EAS CLI (빌드 시)

## 환경 변수

`mobile/.env` (`.env.example` 참고):

```bash
EXPO_PUBLIC_WEB_URL=http://localhost:3000
```

- iOS 시뮬레이터: `http://localhost:3000`
- Android 에뮬레이터: `http://10.0.2.2:3000`
- 실기기: PC IP 주소 (예: `http://192.168.0.10:3000`)
- 프로덕션: Vercel 배포 URL

## 실행

1. 웹앱 실행 (프로젝트 루트):

```bash
npm run dev
```

2. 모바일 앱 실행:

```bash
cd mobile
npm install
npm start
```

## EAS 빌드

```bash
cd mobile
npx eas build --profile preview --platform android
npx eas build --profile production --platform all
```

## 네이티브 브릿지

웹 ↔ 앱 메시지:

- `PUSH_TOKEN_REQUEST` / `PUSH_TOKEN_RESPONSE` — Expo Push 토큰
- WebView 카메라: QR 스캔(`html5-qrcode`)은 WebView 권한으로 동작

## 앱 식별자

- iOS: `ohgo.mobile`
- Android: `ohgo.mobile`
- Scheme: `ohgocoupon://`
