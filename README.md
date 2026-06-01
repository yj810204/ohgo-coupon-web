# 오고피씽 (ohgo-coupon-web)

낚시 커뮤니티·스탬프·쿠폰·미니게임·폐쇄몰 웹앱 + Expo WebView 모바일 셸.

## 웹앱 (Next.js)

```bash
npm install
npm run dev
```

http://localhost:3000

## 모바일 앱 (Expo SDK 54 WebView)

웹 UI를 그대로 로드하는 Thin Shell 앱입니다. 웹 배포만으로 앱 화면이 갱신됩니다.

```bash
npm run mobile:install
# mobile/.env 에 EXPO_PUBLIC_WEB_URL 설정
npm run dev          # 웹 (터미널 1)
npm run dev:mobile   # Expo (터미널 2)
```

자세한 내용: [mobile/README.md](./mobile/README.md)

## 주요 기능

- QR 스캔 · 스탬프 적립 · 쿠폰 발급
- 커뮤니티(조황 사진)
- 미니게임
- 폐쇄몰 (회원 전용)
- 승선 명부 · 관리자

## 백엔드

Firebase Firestore / Storage

## UI

[Travelia UI Kit](https://www.figma.com/design/g1kWumlVq6GAwpoIvU1229) 스타일 참고 (Urbanist, 카드형 홈)
