# 스토어 스크린샷

생성: 2026-09-20T13:38:00.365Z
로그인: 홍길동 / 900301
BASE_URL: http://localhost:3000

앱 화면 그대로입니다. 소개 문구·배지는 넣지 않았습니다.

재생성: `TARGETS=ios-6.9,android-phone npm run screenshots:store`

일부만 다시 찍기 예: `SCREENS=05-trip-guide npm run screenshots:store`  
특정 스토어만: `TARGETS=ios-6.9 npm run screenshots:store`

## 업로드 규격

| 폴더 | 스토어 | 픽셀 | 형식 | 비고 |
|------|--------|------|------|------|
| `ios-6.9/` | App Store Connect → iPhone 6.9" | 1320×2868 | PNG | **필수.** 1~10장. 이 세트가 있으면 더 작은 iPhone 크기는 자동 스케일됩니다. |
| `ios-ipad-13/` | App Store Connect → iPad 13" | 2064×2752 | PNG | 앱이 iPad를 지원하면 **필수.** UI는 폰 폭(480px) 기준이라 좌우 여백이 보일 수 있습니다. |
| `android-phone/` | Play Console → 휴대전화 | 1080×1920 | JPEG | **권장 9:16.** 2~8장. JPEG라 알파 채널이 없어 Play 규격(24-bit PNG/JPEG, 긴 변 ≤ 짧은 변×2)을 만족합니다. |

> iPhone 6.9" PNG(1320×2868)는 가로:세로가 약 1:2.17이라 Play의 “긴 변은 짧은 변의 2배를 넘을 수 없음” 규칙에 걸립니다. Android에는 `android-phone/` JPEG만 올리세요.

## 업로드 순서

Play Console은 최대 8장입니다. 9장이면 앞에서 8장을 올리거나 빼고 싶은 장을 빼면 됩니다.

| 순서 | 화면 | 경로 | 파일 |
|------|------|------|------|
| 1 | 안내 | `/onboarding` | `01-onboarding.png` / `01-onboarding.jpg` |
| 2 | 메인 홈 | `/main` | `02-home.png` / `02-home.jpg` |
| 3 | 스탬프 | `/stamp` | `03-stamp.png` / `03-stamp.jpg` |
| 4 | QR 리더 | `/qr-scan` | `04-qr-scan.png` / `04-qr-scan.jpg` |
| 5 | 쿠폰 | `/coupons` | `05-coupons.png` / `05-coupons.jpg` |
| 6 | 커뮤니티 | `/community` | `06-community.png` / `06-community.jpg` |
| 7 | 출조 안내 | `/community/trip-guide` | `07-trip-guide.png` / `07-trip-guide.jpg` |
| 8 | 포인트몰 | `/point-mall` | `08-point-mall.png` / `08-point-mall.jpg` |
| 9 | 중고장터 | `/market` | `09-market.png` / `09-market.jpg` |

## App Store Connect

1. 앱 → 배포할 버전 → iPhone 6.9형 디스플레이에 `ios-6.9/` 파일을 01부터 순서대로 업로드합니다.
2. iPad를 지원하면 Media Manager에서 13형 디스플레이에 `ios-ipad-13/` 를 같은 순서로 업로드합니다.
3. 6.5"/6.3" 등 나머지 iPhone 크기는 비워 두면 6.9"에서 스케일됩니다.

## Google Play Console

1. 출시 → 스토어 설정 → 기본 스토어 등록정보 → 휴대전화 스크린샷에 `android-phone/` JPEG를 01부터 업로드합니다. (최대 8장)
2. 추천 노출 조건: 1080px 이상, 9:16 세로 4장 이상. 이 세트가 해당합니다.


