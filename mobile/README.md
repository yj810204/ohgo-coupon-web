# 오고피씽 Mobile (Expo WebView Shell)

Expo SDK 54 기반 Thin Shell 앱입니다. UI/비즈니스 로직은 상위 Next.js 웹앱(`ohgo-coupon-web`)에서 처리하고, 이 앱은 WebView + 푸시 알림 + 카메라 권한만 담당합니다.

## 요구 사항

- Node.js 20+
- 로컬 AAB: JDK 17 (`brew install openjdk@17` 또는 Android Studio) + Android SDK
- 로컬 IPA: Xcode

## 환경 변수

`mobile/.env` (`.env.example` 참고):

| 모드 | 설정 |
|------|------|
| **개발 (기본)** | `EXPO_PUBLIC_USE_HOSTED` 없음 → Expo가 **로컬** `http://<Mac IP>:3000` 로드 |
| 호스팅 테스트 | `EXPO_PUBLIC_USE_HOSTED=true` + `EXPO_PUBLIC_WEB_URL=https://…` |
| 스토어/EAS 빌드 | `EXPO_PUBLIC_WEB_URL=https://ohgo.codejaka.com` |

## 개발: 로컬 웹 → Expo (배포 없이)

```bash
# 터미널 1 — 웹 (LAN 필수)
npm run dev:lan

# 터미널 2 — Expo (env 변경 시 -c)
cd mobile && npx expo start -c
```

로딩 URL이 `http://172.x.x.x:3000/` 형태면 로컬 반영 중입니다.  
`npm run dev`(localhost)만 켜면 폰에서 접속되지 않습니다.

## 호스팅 웹으로 Expo 테스트

`mobile/.env`:

```bash
EXPO_PUBLIC_USE_HOSTED=true
EXPO_PUBLIC_WEB_URL=https://ohgo.codejaka.com
```

```bash
cd mobile && npx expo start -c
```

## 로컬 스토어 빌드 (AAB / IPA)

클라우드 EAS 없이 이 Mac에서 서명·패키징합니다. 빌드 전에 **versionCode / buildNumber가 1 증가**합니다.

현재 기준: Android `10062`, iOS `10057` → 다음 AAB는 `10063`, 다음 IPA는 `10058`.

```bash
cd mobile

# Android AAB (JDK 17 + Android SDK 필요, 기존 Play 업로드 키로 서명)
npm run build:aab

# 빌드만 실패한 뒤 버전을 다시 올리지 않고 재시도
bash scripts/build-android-aab.sh --no-bump

# iOS IPA (Xcode 필요)
npm run build:ipa
```

산출물: `mobile/dist/ohgo-1.6.0-<code>.aab` / `.ipa`

서명 기본값은 **EAS에 저장된 기존 키**입니다. Play에 이미 올라간 `10061`과 같은 업로드 키를 써야 합니다.

키스토어를 파일로 두고 쓰려면:

```bash
cd mobile
cp credentials.json.example credentials.json
# credentials/android/keystore.jks 와 비밀번호·alias 입력
# → 있으면 production-local 프로필(로컬 자격 증명)로 빌드됨
```

키스토어는 `npx eas credentials -p android`에서 기존 키를 내려받으면 됩니다.

## EAS 클라우드 빌드 (선택)

버전은 `app.json`의 `android.versionCode` / `ios.buildNumber`를 사용합니다. 클라우드 빌드 전에 올리려면:

```bash
cd mobile
npm run bump:android   # 또는 bump:ios
npx eas build --profile production --platform android
npx eas build --profile production --platform ios
```

### 내부테스트 제출

```bash
# Android → Play internal track / iOS → TestFlight
npx eas submit --profile production --platform android --path dist/ohgo-1.6.0-10063.aab
npx eas submit --profile production --platform ios --path dist/ohgo-1.6.0-10058.ipa

# APK 직접 설치 테스트만 필요할 때
npx eas build --profile preview --platform android
```

전환기(구앱↔신앱 공용 Firestore) 운영은 [docs/FIREBASE_TRANSITION.md](../docs/FIREBASE_TRANSITION.md) 참고.

### iOS credential 갱신 (프로비저닝 만료 시)

```bash
cd mobile
npx eas credentials -p ios -e production
# → production 선택 → Provisioning Profile 재생성 → Apple ID 로그인
npx eas build --profile production --platform ios
```

### FCM / 푸시

- `mobile/google-services.json` (Android)
- `mobile/GoogleService-Info.plist` (iOS)
- 구앱(`ohgo-coupon`)과 동일 Firebase 프로젝트 파일을 사용한다.
- 스토어 빌드 번호는 `app.json`의 `android.versionCode` / `ios.buildNumber`를 사용한다. 로컬 빌드 스크립트가 자동으로 1 올린다.

## 네이티브 브릿지

웹 ↔ 앱 메시지:

- `PUSH_TOKEN_REQUEST` / `PUSH_TOKEN_RESPONSE` — Expo Push 토큰
- WebView 카메라: QR 스캔(`html5-qrcode`)은 WebView 권한으로 동작

## 앱 식별자

- iOS: `ohgo.mobile`
- Android: `ohgo.mobile`
- Scheme: `ohgocoupon://`
