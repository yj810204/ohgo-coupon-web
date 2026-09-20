# 전환기 Firebase 공용 소스 운영 가이드

손님은 구앱(v1.5.5, Firestore), 선장은 신앱(WebView, `NEXT_PUBLIC_DATA_SOURCE=firebase`)으로 같은 Firestore를 쓰다가, 전원 업데이트 후 Supabase로 컷오버한다.

## Phase 1 — 선장 단독 검증

### 웹 배포

1. 프로덕션 환경 변수에 설정:
   - `NEXT_PUBLIC_DATA_SOURCE=firebase`
   - `NEXT_PUBLIC_FIREBASE_*` (구앱 `ohgo-dev-bc602`와 동일 — `.env.example` 참고)
2. `https://ohgo.codejaka.com` 재배포

### 모바일 내부테스트 빌드

```bash
cd mobile
# iOS buildNumber / Android versionCode 가 스토어(10055)보다 커야 함
# TestFlight / Play 내부테스트는 production 프로필 (preview는 Ad Hoc / APK)
npx eas build --profile production --platform ios
npx eas submit --profile production --platform ios
npx eas build --profile production --platform android
npx eas submit --profile production --platform android
```

- TestFlight / Android 내부 테스트에 업로드
- 선장 기기에 설치 (동일 bundle `ohgo.mobile` → 스토어 구앱을 덮어씀)
- 이름+생년월일 로그인 (Firestore `users/{uuidv5}` 존재 필요)

### Phase 1 검증 체크리스트

구앱 손님 계정 1개 + 신앱 선장 계정 1개로 양방향 확인:

- [ ] 손님이 구앱에서 QR 스캔 → 선장 신앱 회원상세에 즉시 반영
- [ ] 선장이 신앱에서 스탬프 +/- → 손님 구앱에 즉시 반영
- [ ] 10개 도달 시 쿠폰 자동 발급 + 스탬프 초기화가 양쪽에서 동일
- [ ] 손님이 구앱에서 5번째 스탬프 탭 → 50% 쿠폰, 선장 신앱에서 `Y`로 인식
- [ ] 손님 쿠폰 사용 요청 푸시 → 선장 신앱에서 비밀번호 입력 후 사용 → 구앱에 `used` 반영
- [ ] 미끼 교환권 ±, 일일 사용량이 양쪽 동일
- [ ] 구앱 보유 미끼 수 = 신앱 미니게임 보유 미끼 (같은 Firestore `baitCoupons`)
- [ ] 신앱에서 게임 1회 → 구앱 미끼 −1 (반대도)
- [ ] 승선명부 작성(구앱) → 선장 신앱 명부·오늘 출조에 표시 (반대도)
- [ ] 출조 확정·명부 이미지가 구앱에서 열림
- [ ] 메모·활동로그가 양방향 표시
- [ ] 푸시: 선장↔손님 양방향 도달

### 선행 확인

- Firebase Console → Firestore Rules: 웹 도메인 클라이언트 읽기/쓰기 가능해야 함 (구앱과 동일 프로젝트)
- 규칙이 막혀 있으면 Admin SDK + 서비스 계정 서버 경로로 전환 필요

## Phase 2 — 전원 스토어 전환

1. `eas build --profile production` + 스토어 제출 (version `1.6.0+`)
2. 심사 통과 후 Firestore `config/appVersion` 문서 갱신:
   ```json
   {
     "minRequired": "1.6.0",
     "iosUrl": "<App Store URL>",
     "androidUrl": "<Play Store URL>"
   }
   ```
3. 구앱이 강제 업데이트 알림을 띄움 → 전원이 신앱으로 이동
4. **여전히 `DATA_SOURCE=firebase`** 유지 (데이터 분기 없음)

## Phase 3 — Supabase 컷오버 런북

점검 시간(짧은 유지보수 창)에 실행:

1. 구앱 잔존 사용자 ≈ 0 확인 (강제 업데이트 이후 며칠)
2. 웹을 일시 점검 모드로 두거나 쓰기 중단을 안내
3. 최종 이관:
   ```bash
   npm run import:firebase-guests
   npm run import:firebase-stamps -- --cutover
   ```
   (`baitCoupons` → `profiles.bait_coupons` 포함. 구앱 잔존 사용자가 있을 때는 `--cutover` 금지)
4. 환경 변수: `NEXT_PUBLIC_DATA_SOURCE=supabase` 로 변경 후 웹 재배포  
   (앱 재배포 불필요 — WebView가 호스팅 URL만 로드)
5. 사후 정합성:
   - 스탬프/쿠폰 수 샘플 대조
   - 선장·손님 로그인
   - QR 적립·쿠폰 사용 1회 smoke test
6. Firestore는 read-only 또는 보관용으로 유지 (즉시 삭제하지 않음)

## 롤백

- `NEXT_PUBLIC_DATA_SOURCE=firebase` 로 웹만 재배포하면 즉시 Firestore 원본으로 복귀
- 앱 롤백이 필요하면 스토어 이전 빌드 재설치 (동일 bundle)

## 관련 코드

| 영역 | 경로 |
|------|------|
| 스위치 | `lib/data-source.ts` |
| Firebase 클라이언트 | `lib/firebase/client.ts` |
| Facade | `utils/*-service.ts` → `*.firebase.ts` / `*.supabase.ts` |
| 게임·랭킹 | `lib/game-service.ts`, `lib/ranking.ts` → Firebase `games` / `users` / `gameSettings` / `config/bait` |
| 레거시 로그인 | `lib/legacy-login.ts` |
| QR 서버 적립 | `lib/stamps/process-qr-stamp.ts` |
| 미끼 조회·소비 | `getUserBaitCoupons`, `/api/games/use-bait` — `resolveFirestoreUserId`로 구앱 `users/{uuidv5}.baitCoupons` 공유 |

## 미끼 (구앱 병행)

구앱 미끼와 신앱 미니게임 보유 미끼는 **같은 필드**다. 별도 변환·복사하지 않는다.

- 저장: Firestore `users/{uuidv5}.baitCoupons`, 일일 사용 `users/{id}/baitUsage/{date}`
- 신앱 세션 `uuid`는 Supabase `profiles.id`일 수 있으므로 Firestore 문서 ID로 해석한 뒤 읽기/차감한다
- 전원 신앱 전까지 `NEXT_PUBLIC_DATA_SOURCE=firebase` 유지
- Supabase `profiles.bait_coupons` 편입은 Phase 3 `--cutover` 한 번만

### Firebase 모드에서 Firestore를 쓰는 영역

- 스탬프·쿠폰·회원·명부·메모·로그·미끼 잔액
- 게임 점수 → `users.totalPoint` + `users/{id}/points`
- 랭킹·대회·메달 수 → `users` / `gameSettings/tournament` / `gameSettings/fishing`
- 미끼 설정 → `config/bait`
- 게임 목록·활성·포인트율 → `games`
