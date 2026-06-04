# ohgo-coupon-web 구현 실행 플랜

> 작성일: 2026-06-04
> 기반: ohgo-coupon-web_개선_플랜_00e73952.plan.md + 프로젝트 현황 분석
> **목표: Phase 0~4 전체 구현 완료 (사업 선정 심사 시점까지 작동하는 완성품 제출)**

---

## 구현 목표 및 전략

### 핵심 목표
**사업 선정 심사 시 Phase 4(AI)까지 모두 작동하는 완성된 앱을 시연**할 수 있어야 함.
"계획"이 아닌 "실행 증명"이 심사의 핵심 가점이므로, 전 Phase를 구현 완료한다.

### 디자인 원칙

**기존 UI 유지 + Figma 참조 신규 페이지 디자인**

- **기존 페이지**: 현재 UI/UX를 그대로 유지 (Bootstrap 5 + Tailwind 4 혼합 스타일)
- **신규 페이지**: Figma 디자인 시스템을 참조하여 일관된 스타일 적용
- **Figma 참조**: [Travelia - Travel App UI Kit (Community)](https://www.figma.com/design/g1kWumlVq6GAwpoIvU1229/Travelia---Travel-App-UI-Kit--Community---%EB%B3%B5%EC%82%AC-?m=dev)
  - File Key: `g1kWumlVq6GAwpoIvU1229`
  - 페이지 구성: `👀 Design Preview` (440px 모바일 화면), `🎨 Design System` (컴포넌트/토큰)

**Figma 디자인 시스템 활용 가이드:**

| 구성요소 | Figma 참조 | 적용 대상 |
|---------|-----------|----------|
| Navbar (Light/Dark) | Design System → Elements → Navbar | 신규 페이지 상단 네비게이션 |
| Menu Bar (5탭) | Design System → Elements → Menu Bar | 하단 탭 바 (기존 BottomTabBar와 통일) |
| Card / List Item | Design Preview → 각 화면 | 직판 상품, 식당 리스트, AI 결과 카드 |
| Button / Chips | Design System → Elements | CTA 버튼, 필터 칩 |
| Typography | Design System 텍스트 스타일 | 제목/본문/캡션 계층 |
| Color Token | Design System 컬러 팔레트 | 기존 `--ohgo-*` CSS 변수와 조합 |
| Shadow / Radius | Design System → Shadow | 카드 그림자, 라운드 |

**구현 시 디자인 참조 방법:**
```
1. 신규 페이지 구현 전 → get_design_context(nodeId, fileKey) 호출
2. 해당 화면과 유사한 Figma Preview 화면을 참조
3. 기존 프로젝트의 components/ 패턴 + Figma 스타일 조합
4. 기존 CSS 변수(--ohgo-*) + Figma 토큰 매핑
```

**변경하지 않는 것:**
- 기존 49개 페이지의 레이아웃/스타일
- `components/` 기존 컴포넌트 구조
- `constants/theme.ts` 기존 테마 토큰
- BottomTabBar, PageHeader 등 공용 레이아웃

### 전략: 병렬 실행 + 외부 심사 의존 기능은 MVP

**핵심 원칙:**
1. Phase 0~4를 **가능한 한 동시에 병렬 진행**
2. 외부 심사/승인이 필요한 기능(PG결제, SNS API)은 **MVP로 축소** 구현
3. 심사 대기 중에도 다른 Phase 작업을 멈추지 않음

```
Week 1~3: ┃ Phase 0 (Supabase 전환) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ┃
Week 2~4: ┃ Phase 1 (조업일지 + 조황사진) ━━━━━━━━━━━━━━━━━━━━━━━━━━ ┃
Week 3~5: ┃ Phase 2 (직판 + 가공 + 식당) ━━━━━━━━━━━━━━━━━━━━━━━━━━ ┃
Week 3~5: ┃ Phase 3 (CRM + 메인 재배치) ━━━━━━━━━━━━━━━━━━━━━━━━━━━ ┃
Week 4~6: ┃ Phase 4 (AI 인식 + 카피생성 + 포스팅) ━━━━━━━━━━━━━━━━━━ ┃
Week 6~7: ┃ 통합 QA + 시연 준비 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ┃
```
**총 기간: 약 7주**

### 외부 심사 의존 기능 → MVP 전략

| 기능 | 정식 구현 | MVP (심사 불필요) |
|------|----------|-----------------|
| PG 결제 (토스페이먼츠) | 실결제 연동 | **테스트 모드 결제** (가맹점 심사 없이 즉시 사용) |
| Instagram 포스팅 | Graph API 연동 | **클립보드 복사 + 딥링크로 인스타 앱 열기** |
| 카카오톡 포스팅 | 채널 메시지 API | **카카오 공유 SDK** (심사 불필요, JS SDK) |
| 네이버 밴드 포스팅 | Open API 포스팅 | **밴드 앱 공유 딥링크** (심사 불필요) |

→ 외부 심사 대기 **0건**, 모든 기능을 즉시 구현 가능

### Phase별 완성 정의 (병렬 진행, MVP 우선)

| Phase | Week | "완성"의 의미 | MVP 적용 | 심사 시연 시나리오 |
|-------|------|-------------|---------|------------------|
| 0 | 1~3 | Supabase 전환 + Google OAuth 작동 | - | "보안 강화된 인증 체계" 시연 |
| 1 | 2~4 | 조업일지 CRUD + 조황사진 태깅/공유 | - | "1차 산업 디지털화 + 모객 자동화" 시연 |
| 2 | 3~5 | 직판 주문+결제 + 가공이력 + 식당매칭 | PG 테스트모드 | "6차 산업 파이프라인 전체 시연" |
| 3 | 3~5 | CRM 통계 + 포인트몰 + 개인이력 + 메인재배치 | - | "재방문 유도 시스템" 시연 |
| 4 | 4~6 | AI 어종인식 + 카피생성 + 멀티공유 | SNS 딥링크/SDK | "AI 기술 융합" 라이브 시연 |

---

## 현재 프로젝트 현황 분석

### 기술 스택
| 항목 | 현재 상태 |
|------|----------|
| 프레임워크 | Next.js 16 + React 19 |
| 스타일링 | Tailwind CSS 4 |
| DB/백엔드 | Firebase (Firestore + Storage) |
| 인증 | 없음 (이름+생년월일 → UUID v5 해시) |
| 모바일 | Expo SDK 54 WebView + Native Bridge |
| 배포 | 미확인 (Vercel 추정) |

### 코드 규모
| 항목 | 수량 |
|------|------|
| 페이지 (page.tsx) | 49개 |
| - Admin 섹션 | 12개 |
| - Main 섹션 | 37개 |
| 서비스 파일 (utils/*-service.ts) | 10개 |
| API Routes | 7개 (게임/업로드) |
| lib 모듈 | firebase.ts, firebase-auth.ts, native-bridge.ts, game-service.ts, ranking.ts, member-profile.ts, storage.ts |

### 핵심 문제점 (플랜 대비 GAP)
1. **보안 부재**: Security Rules 없이 클라이언트에서 Firestore 직접 호출
2. **인증 취약**: 이름+생년월일만으로 로그인 (타인 정보로 접근 가능)
3. **결제 불가**: 서버사이드 시크릿키 관리 구조 없음
4. **통계 한계**: NoSQL에서 매출/정산 집계 불가
5. **1차 산업 기능 부재**: 조업일지, 어획 기록 등 없음
6. **2차 산업 기능 부재**: 직판, 가공 이력 없음

---

## 실행 일정 (병렬 진행 + MVP)

### 총 일정: 7주

```
Week 1~3: Phase 0 (Supabase 전환) — 기반, 가장 먼저 시작
Week 2~4: Phase 1 (조업일지 + 조황사진 + SNS 공유)
Week 3~5: Phase 2 (직판MVP + 가공 + 식당) — PG는 테스트모드
Week 3~5: Phase 3 (CRM + 포인트몰 + 메인 재배치)
Week 4~6: Phase 4 (AI 인식 + 카피생성 + 공유MVP)
Week 6~7: 통합 QA + 시연 준비
```

### 병렬 진행 조건

| Phase | 시작 조건 | 병렬 가능 이유 |
|-------|----------|--------------|
| 0 | 즉시 | 기반 인프라 — 가장 먼저 |
| 1 | Phase 0의 Sprint 0-2 완료 시점 (Week 2~) | Supabase 클라이언트 + Auth만 있으면 신규 테이블 CRUD 가능 |
| 2 | Phase 0의 Sprint 0-2 완료 시점 (Week 3~) | 결제는 테스트모드로 심사 불필요 |
| 3 | Phase 0의 Sprint 0-3 완료 시점 (Week 3~) | 기존 서비스 전환 완료 후 확장 |
| 4 | Phase 1의 Sprint 1-2 완료 시점 (Week 4~) | 사진 업로드 기능이 있어야 AI 인식 가능 |

### 외부 의존성 제거 (MVP 전략)

**심사가 필요 없는 구현 방식으로 전환:**

| 항목 | 정식 (심사 필요) | MVP (심사 불필요) | 시연 차이 |
|------|----------------|-----------------|----------|
| PG 결제 | 토스페이먼츠 가맹점 | **토스 테스트 키** | 결제 UI 동일, "테스트" 표시만 |
| Instagram | Graph API 앱 심사 | **Web Share API + 딥링크** | 인스타 앱 열림, 텍스트+이미지 전달 |
| 카카오톡 | 채널 메시지 API | **Kakao JS SDK 공유** | 카카오 공유 팝업 표시 |
| 네이버 밴드 | Open API 포스팅 | **밴드 앱 scheme 딥링크** | 밴드 앱 열림 |
| OpenAI | - | **API 키만 발급** (심사 없음) | 즉시 사용 |

→ **외부 심사 대기 0건, 모든 기능 즉시 구현 가능**

---

## Phase 0: Firebase → Supabase 전환 [Week 1~3]

> **목표**: 모든 후속 Phase의 기반 확보. 보안/인증/결제 가능 아키텍처 수립

### Sprint 0-1: 인프라 설정 (2~3일)

| # | 작업 | 산출물 | 비고 |
|---|------|--------|------|
| 1 | Supabase 프로젝트 생성 | 프로젝트 URL + keys | 서울 리전 (ap-northeast-2) |
| 2 | PostgreSQL 스키마 실행 | 23개 테이블 생성 | 플랜의 SQL 그대로 실행 |
| 3 | Google OAuth 설정 | Auth Provider 활성화 | GCP OAuth 클라이언트 ID 필요 |
| 4 | Storage 버킷 생성 | photos, products, processing | RLS 정책 포함 |
| 5 | RLS 정책 작성 | 테이블별 보안 정책 | SELECT/INSERT/UPDATE/DELETE |
| 6 | PostgreSQL 트리거 생성 | enforce_bait_coupon_policy 등 | DB 레벨 안전장치 |
| 7 | 환경변수 설정 | .env.local 업데이트 | SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY |

### Sprint 0-2: 코어 전환 (3~4일)

| # | 작업 | 현재 파일 | 전환 후 |
|---|------|----------|---------|
| 1 | Supabase 클라이언트 생성 | - | `lib/supabase.ts` (브라우저) |
| 2 | Supabase 서버 클라이언트 생성 | - | `lib/supabase-server.ts` (API Route) |
| 3 | OAuth 콜백 라우트 | - | `app/api/auth/callback/route.ts` |
| 4 | 미들웨어 수정 | `middleware.ts` | Supabase Auth 세션 검증 |
| 5 | Firebase 제거 | `lib/firebase.ts` | 삭제 |
| 6 | 인증 전환 | `lib/firebase-auth.ts` | Supabase Auth 기반 재작성 |
| 7 | 로그인 페이지 전환 | `app/(auth)/login/page.tsx` | Google 로그인 버튼 |
| 8 | 온보딩 페이지 전환 | `app/(auth)/onboarding/page.tsx` | 프로필 추가 입력 |
| 9 | 의존성 업데이트 | `package.json` | +supabase, -firebase, -uuid |

### Sprint 0-3: 서비스 파일 전환 (5~7일)

모든 서비스 파일을 Supabase SDK 기반으로 재작성:

| # | 서비스 파일 | Supabase 테이블 | 복잡도 |
|---|-----------|----------------|--------|
| 1 | `utils/stamp-service.ts` (511줄) | stamps, stamp_history | 🔴 높음 |
| 2 | `utils/community-service.ts` | community_photos, comments | 🟡 중간 |
| 3 | `utils/community-point-service.ts` | profiles.community_point | 🟢 낮음 |
| 4 | `utils/point-mall-service.ts` | point_mall_products | 🟡 중간 |
| 5 | `utils/reservation-service.ts` | trip_reservations | 🟡 중간 |
| 6 | `utils/trip-guide-service.ts` | trip_guides | 🟡 중간 |
| 7 | `utils/coupon-utils.ts` | coupons | 🟡 중간 |
| 8 | `utils/memo-service.ts` | (profiles 또는 별도) | 🟢 낮음 |
| 9 | `utils/site-settings-service.ts` | site_settings | 🟢 낮음 |
| 10 | `utils/send-push.ts` | profiles.expo_push_token | 🟢 낮음 |
| 11 | `lib/game-service.ts` | games | 🟡 중간 |
| 12 | `lib/ranking.ts` | points (RPC) | 🟡 중간 |
| 13 | `lib/member-profile.ts` | profiles | 🟡 중간 |
| 14 | `utils/emoji-pack-service.ts` | (Storage 기반) | 🟢 낮음 |
| 15 | `utils/community-template-service.ts` | (별도 테이블 or settings) | 🟢 낮음 |

**전환 순서 (의존성 기반):**
1. `send-push.ts` → 다른 서비스에서 의존
2. `stamp-service.ts` → 가장 복잡, QR 스캔 핵심
3. `community-service.ts` + `community-point-service.ts`
4. `game-service.ts` + `ranking.ts`
5. 나머지 (순서 무관)

### Sprint 0-4: Cloud Functions 통합 (3~4일)

기존 `ohgo-coupon-functions` 4개 함수를 Next.js API Route로 전환:

| # | Cloud Function | 전환 대상 | 역할 |
|---|---------------|----------|------|
| 1 | `processQrScanOnStampCreation_transitional` | `app/api/stamps/process/route.ts` | QR 스탬프 전체 트랜잭션 |
| 2 | `validatePointsOnCreate` | `app/api/points/award/route.ts` | 포인트 적립 검증 |
| 3 | `validateBaitUsageOnWrite` | `app/api/games/use-bait/route.ts` (확장) | 미끼 사용 검증 |
| 4 | `enforceBaitCouponPolicy` | PostgreSQL 트리거 | DB 레벨 자동 보정 |
| 5 | - | `app/api/webhooks/bait-alert/route.ts` | 관리자 알림 웹훅 |

### Sprint 0-5: 페이지 전환 + 통합 테스트 (4~5일)

- 49개 페이지의 Firebase import를 Supabase로 교체
- QR 스캔: Firestore 직접 쓰기 → API Route 호출
- 게임 미끼: Firestore 직접 쓰기 → API Route 호출
- 전체 흐름 E2E 테스트
- `next.config.ts` images 도메인 변경 (firebase → supabase storage)

### Phase 0 완료 기준
- [ ] Firebase 의존성 완전 제거 (`package.json`에서 `firebase` 삭제)
- [ ] 모든 페이지 정상 렌더링
- [ ] Google OAuth 로그인/로그아웃 정상 동작
- [ ] QR 스탬프 적립 → 쿠폰 발급 전체 플로우 정상
- [ ] 미니게임 점수 저장 + 랭킹 정상
- [ ] 커뮤니티 사진 업로드/조회 정상
- [ ] 푸시 알림 발송 정상
- [ ] `ohgo-coupon-functions` 배포 중단 가능

---

## Phase 1: 1차 산업 근거 + 3차 핵심 콘텐츠 [Week 2~4]

> **목표**: 사업계획서의 핵심 — "어업인" 증명 기능 + 조황 콘텐츠 자동 분배
> **시작 조건**: Phase 0 Sprint 0-2 완료 (Supabase 클라이언트 + Auth 작동)

### Sprint 1-1: 조업 관리 기능 (4~5일)

| # | 작업 | 파일 |
|---|------|------|
| 1 | 조업일지 서비스 생성 | `utils/fishing-operation-service.ts` |
| 2 | 조업일지 관리 페이지 (관리자) | `app/(admin)/admin-fishing-log/page.tsx` |
| 3 | 조업일지 작성 폼 | `app/(admin)/admin-fishing-log/form/page.tsx` |
| 4 | 월별/어종별 통계 대시보드 | 같은 페이지 내 탭 또는 별도 섹션 |
| 5 | 위판 기록 수기 입력 | 조업일지 폼에 통합 |

**데이터 모델**: `fishing_logs` 테이블
- 출항/귀항 시간, 해역, 어종(배열), 어획량(kg), 수온, 기상, 매출

### Sprint 1-2: 선장 조황 사진 + 승객 태깅 (4~5일)

| # | 작업 | 파일 |
|---|------|------|
| 1 | 선장 사진 서비스 생성 | `utils/captain-photo-service.ts` |
| 2 | admin-photos 페이지에 태깅 UI 추가 | `app/(admin)/admin-photos/page.tsx` 수정 |
| 3 | 당일 승선명부 기반 승객 선택 모달 | 컴포넌트 |
| 4 | Supabase Storage에 사진 업로드 | captain-photo-service 내 |
| 5 | 태깅 완료 시 승객에게 푸시 발송 | send-push 활용 |

**데이터 모델**: `captain_photos` + `captain_photo_tags`

### Sprint 1-3: 승객 "내 조황 사진" + SNS 공유 (3~4일)

| # | 작업 | 파일 |
|---|------|------|
| 1 | 내 사진 갤러리 페이지 | `app/(main)/my-photos/page.tsx` |
| 2 | 메인 페이지에 "내 조황 사진" 섹션 추가 | `app/(main)/main/page.tsx` 수정 |
| 3 | 사진 상세 뷰 + SNS 공유 버튼 | 모달 or 별도 페이지 |
| 4 | Native Bridge SHARE 연동 | `lib/native-bridge.ts` 활용 |
| 5 | 공유 시 포인트 적립 | `community-point-service.ts` 확장 |
| 6 | 선박 정보 워터마크 자동 삽입 | canvas or 서버사이드 |

### Phase 1 완료 기준
- [ ] 관리자가 조업일지를 작성/조회/통계 확인 가능
- [ ] 선장이 사진 업로드 후 당일 승객을 태깅 가능
- [ ] 태깅된 승객에게 푸시 알림 발송
- [ ] 승객이 "내 사진" 페이지에서 태깅된 사진 조회 가능
- [ ] 원클릭 SNS 공유 → 포인트 적립

---

## Phase 3: 기존 기능 보강 + CRM [Week 3~5]

> **목표**: 기존 앱의 UX 개선 + 재방문 유도 강화
> **시작 조건**: Phase 0 Sprint 0-3 완료 (기존 서비스 전환 완료)

### Sprint 3-1: 승선명부 초상권 동의 (1일)

| # | 작업 | 파일 |
|---|------|------|
| 1 | boarding-form에 동의 체크박스 추가 | `app/(main)/boarding-form/page.tsx` 수정 |
| 2 | boarding_info.photo_consent 업데이트 | 서비스 로직 |

### Sprint 3-2: 포인트몰 방향 전환 (2~3일)

| # | 작업 | 파일 |
|---|------|------|
| 1 | 상품 타입 추가 (discount/badge) | `constants/point-mall.ts` 수정 |
| 2 | 할인 쿠폰 구매 → coupons 자동 INSERT | point-mall-service 확장 |
| 3 | 뱃지/칭호 시스템 UI | 마이페이지 수정 |

### Sprint 3-3: 개인 출조 이력 + 통계 (3~4일)

| # | 작업 | 파일 |
|---|------|------|
| 1 | 개인 출조 이력 페이지 | `app/(main)/my-fishing-log/page.tsx` |
| 2 | stamps SQL 집계 → 통계 카드 | SQL COUNT, MAX, Window Function |
| 3 | 마이페이지에 요약 카드 추가 | `app/(main)/my-page/page.tsx` 수정 |

### Sprint 3-4: 메인 페이지 재배치 (2일)

| # | 작업 | 파일 |
|---|------|------|
| 1 | 섹션 순서 재구성 | `app/(main)/main/page.tsx` 수정 |
| 2 | 미니게임 보조 위치로 이동 | 레이아웃 변경 |
| 3 | 직판/식당 진입점 placeholder | Phase 2 진입점 미리 배치 |

---

## Phase 2: 2차 산업 + 6차 융합 [Week 3~5]

> **목표**: 직판(PG결제) + 가공 이력 + 식당 매칭 = 6차 산업 파이프라인 완성
> **시작 조건**: Phase 0 Sprint 0-2 완료 (Supabase + Storage 작동)
> **PG 결제**: 토스페이먼츠 **테스트 키**로 즉시 구현 (가맹점 심사 불필요)

### Sprint 2-1: 수산물 직판 서비스 (7~10일)

**선장(관리자) 측:**
| # | 작업 | 파일 |
|---|------|------|
| 1 | 직판 서비스 생성 | `utils/direct-sale-service.ts` |
| 2 | 상품 관리 페이지 | `app/(admin)/admin-direct-sale/page.tsx` |
| 3 | 상품 등록/수정 폼 | `app/(admin)/admin-direct-sale/form/page.tsx` |
| 4 | 주문 관리 (상태 변경, 발송 처리) | admin 페이지 내 탭 |

**소비자 측:**
| # | 작업 | 파일 |
|---|------|------|
| 5 | 상품 목록 페이지 | `app/(main)/direct-sale/page.tsx` |
| 6 | 상품 상세 + 주문 접수 | `app/(main)/direct-sale/[saleId]/page.tsx` |
| 7 | PG 결제 연동 (토스페이먼츠) | `app/api/payment/confirm/route.ts` |
| 8 | 결제 웹훅 | `app/api/payment/webhook/route.ts` |
| 9 | 주문 내역 페이지 | `app/(main)/direct-sale/orders/page.tsx` |

### Sprint 2-2: 수산 가공 이력 (4~5일)

| # | 작업 | 파일 |
|---|------|------|
| 1 | 가공 서비스 생성 | `utils/processing-service.ts` |
| 2 | 가공 이력 관리 페이지 | `app/(admin)/admin-processing/page.tsx` |
| 3 | 가공 이력 등록 폼 | `app/(admin)/admin-processing/form/page.tsx` |
| 4 | 가공 상품 → 직판 연동 | product_type: 'processed' + FK |
| 5 | 월별 가공 실적 통계 | SQL 집계 대시보드 |

### Sprint 2-3: 제휴 식당 매칭 (5~7일)

| # | 작업 | 파일 |
|---|------|------|
| 1 | 식당 서비스 생성 | `utils/restaurant-service.ts` |
| 2 | 식당 관리 페이지 (관리자) | `app/(admin)/admin-restaurants/page.tsx` |
| 3 | 식당 등록/수정 폼 | `app/(admin)/admin-restaurants/form/page.tsx` |
| 4 | 식당 리스트 (소비자, 거리순) | `app/(main)/restaurants/page.tsx` |
| 5 | 식당 상세 + 예약 접수 | `app/(main)/restaurants/[restaurantId]/page.tsx` |
| 6 | PostGIS 거리 검색 쿼리 | Supabase RPC |
| 7 | 입항 후 자동 추천 푸시 | 조업일지 연동 |

---

## Phase 4: AI 콘텐츠 자동화 [Week 4~6] — MVP 구현

> **목표**: AI 어종 인식 + 조황 카피 생성 + 멀티채널 공유 **작동 상태**로 완성
> **시작 조건**: Phase 1 Sprint 1-2 완료 (조황 사진 업로드 기능 존재)
> **SNS 포스팅**: 외부 API 심사 없이 **공유 딥링크 + Web Share API** MVP로 구현

### Sprint 4-1: VLM 어종 자동 인식 (3~4일)

| # | 작업 | 파일 | 연동 |
|---|------|------|------|
| 1 | 어종 인식 API Route | `app/api/ai/identify-fish/route.ts` | OpenAI Vision API (gpt-4o) |
| 2 | 인식 결과 DB 저장 | captain_photos.species 자동 업데이트 | Supabase UPDATE |
| 3 | 선장 사진 업로드 시 자동 인식 트리거 | captain-photo-service 확장 | 업로드 후 API 호출 |
| 4 | 인식 결과 UI 표시 | admin-photos 페이지 | 어종명 + 신뢰도 표시 |
| 5 | 수동 교정 UI | 잘못된 인식 시 선장이 수정 | |

**기술 구현:**
```typescript
// app/api/ai/identify-fish/route.ts 핵심 로직
// - Supabase Storage에서 이미지 URL 가져옴
// - OpenAI Vision API 호출 (어종 + 추정 크기 + 신뢰도)
// - 결과를 captain_photos.species에 UPDATE
// - 프롬프트: "한국 연안 낚시에서 잡히는 어종을 식별하세요..."
```

### Sprint 4-2: LLM 조황 카피 자동 생성 (3~4일)

| # | 작업 | 파일 | 연동 |
|---|------|------|------|
| 1 | 카피 생성 API Route | `app/api/ai/generate-copy/route.ts` | OpenAI GPT-4o |
| 2 | 채널별 톤앤매너 템플릿 | `constants/social-templates.ts` | 인스타/밴드/카카오 |
| 3 | 조황 데이터 종합 (어종+물때+수온+위치) | fishing_logs + captain_photos JOIN | |
| 4 | 생성 결과 미리보기 UI | admin 사진/포스팅 페이지 | 수정 가능 |
| 5 | 해시태그 자동 생성 | 어종+지역+시즌 기반 | |

**입력 데이터 조합:**
- 어종 (AI 인식 또는 수동)
- 출조일/출항시간/귀항시간
- 해역/포인트명
- 수온/기상
- 사진 URL
- 선박명/선장명

**출력:**
- 인스타그램용 (감성적, 해시태그 다수)
- 네이버 밴드용 (정보 중심, 출조 안내 포함)
- 카카오톡용 (간결, 예약 유도 CTA)

### Sprint 4-3: 멀티채널 공유 MVP (3~4일)

| # | 작업 | 파일 | 연동 |
|---|------|------|------|
| 1 | 소셜 공유 통합 유틸 | `lib/social/share.ts` | Web Share API + 딥링크 |
| 2 | 카카오 공유 (JS SDK) | `lib/social/kakao.ts` | Kakao JS SDK (심사 불필요) |
| 3 | 인스타그램 공유 (딥링크) | `lib/social/instagram.ts` | `instagram://` scheme + 클립보드 |
| 4 | 네이버 밴드 공유 (딥링크) | `lib/social/naver-band.ts` | `bandapp://` scheme |
| 5 | 선장 대시보드: 원클릭 전체 공유 | `app/(admin)/admin-social/page.tsx` | |
| 6 | 공유 히스토리 관리 | `social_posts` 테이블 | 공유 시도 기록 |

**MVP 방식 (외부 심사 불필요):**
- **카카오**: Kakao JS SDK `Kakao.Share.sendDefault()` — 앱 키만 등록하면 즉시 사용
- **인스타그램**: 이미지 → 클립보드 복사 + `instagram://library` 딥링크 열기
- **네이버 밴드**: `bandapp://create/post?text=...&media=...` scheme
- **웹 일반**: `navigator.share()` Web Share API (모바일 OS 공유 시트)

**추후 정식 전환 (심사 통과 후):**
- Instagram Graph API → 직접 포스팅 (비즈니스 계정)
- 카카오 채널 메시지 API → 대량 발송
- 네이버 밴드 Open API → 자동 포스팅

**추가 DB 스키마:**
```sql
CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captain_id UUID REFERENCES profiles(id),
  photo_id UUID REFERENCES captain_photos(id),
  channel TEXT NOT NULL,  -- instagram / kakao / band
  content TEXT,
  external_post_id TEXT,  -- 플랫폼 반환 ID
  status TEXT DEFAULT 'draft',  -- draft / posted / failed
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Sprint 4-4: AI 통합 + 선장 워크플로우 (2~3일)

| # | 작업 | 설명 |
|---|------|------|
| 1 | 사진 업로드 → 어종 인식 → 카피 생성 → 포스팅 원클릭 파이프라인 | 전체 자동화 |
| 2 | "AI 조황 리포트" 자동 생성 | 일간/주간 조황 요약 |
| 3 | 선장 대시보드에 AI 상태 표시 | 인식 중/완료/실패 |
| 4 | 오류 시 재시도 + 수동 fallback | |

### Phase 4 완료 기준
- [ ] 사진 업로드 시 AI가 어종을 자동 인식 (정확도 무관, 작동 증명)
- [ ] 인식된 어종 + 조업 데이터로 SNS 카피 자동 생성 (3채널 톤앤매너)
- [ ] 원클릭으로 카카오/인스타/밴드에 공유 (MVP: 딥링크 + JS SDK)
- [ ] 공유 히스토리 조회 가능
- [ ] 전체 파이프라인 시연 가능 (사진→인식→카피→공유 30초 내)

---

## 위험 요소 & 완화 방안

| 위험 | 영향도 | 완화 방안 |
|------|--------|----------|
| Phase 0 전환 중 기존 데이터 유실 | 🔴 높음 | Firestore → PostgreSQL 마이그레이션 스크립트 별도 작성, 또는 신규 시작 결정 |
| Google OAuth 전환 시 기존 사용자 재로그인 | 🟡 중간 | 마이그레이션 기간 동안 레거시 UUID 로그인 병행 지원 |
| Expo WebView에서 OAuth 팝업 이슈 | 🟡 중간 | Native Bridge로 인앱 브라우저 호출 또는 딥링크 방식 |
| OpenAI API 비용 | 🟢 낮음 | 시연용 호출 수 제한, 일 100건 캡 설정 |
| Supabase 무료 티어 한계 (500MB) | 🟢 낮음 | 이미지는 Storage에 분리, DB는 텍스트 위주로 충분 |
| 병렬 진행 시 Phase간 충돌 | 🟡 중간 | 파일 레벨 분리 (신규 서비스/페이지는 독립적), Git 브랜치 전략 |
| 7주 일정 초과 | 🟡 중간 | Phase 3 일부(뱃지 시스템)를 후순위로 축소, 핵심 기능에 집중 |

---

## 통합 QA + 시연 준비 [Week 6~7]

> **목표**: 심사위원 앞에서 30분 내에 전체 6차 산업 파이프라인을 라이브 시연
> **전제**: Phase 0~4 병렬 완료

### 시연 시나리오 스크립트

```
[시연 1] 어업인 증명 (1차 산업) — 2분
→ 조업일지 작성 → 어획량/해역/수온 기록 → 월별 통계 대시보드

[시연 2] 승객 관리 (3차 산업) — 3분
→ QR 승선명부 스캔 → 스탬프 자동 적립 → 쿠폰 발급 확인

[시연 3] 조황 콘텐츠 자동화 (AI + 3차) — 5분
→ 선장 사진 업로드 → AI 어종 자동 인식 ("참돔 35cm 추정")
→ LLM 조황 카피 자동 생성 (인스타/밴드/카카오 3버전)
→ 원클릭 멀티채널 포스팅

[시연 4] 승객 참여 유도 (3차) — 2분
→ 승객에게 사진 태깅 푸시 → 내 사진 갤러리 → SNS 공유 → 포인트 적립

[시연 5] 수산물 직거래 (2차 산업) — 3분
→ 오늘 조업한 참돔 직판 등록 → 소비자 앱에서 주문 → PG 결제

[시연 6] 가공 이력 (2차) — 2분
→ 남은 수산물 가공(반건조) 이력 기록 → 가공 상품 직판 연동

[시연 7] 지역 식당 매칭 (6차 융합) — 2분
→ 승객이 잡은 고기 → 제휴 횟집 앱 내 예약 → 조리 대행

[시연 8] CRM + 재방문 — 2분
→ 개인 출조 이력/통계 → 포인트몰 할인쿠폰 교환 → 다음 출조 예약
```

### 데모 데이터 세팅

| 항목 | 수량 | 비고 |
|------|------|------|
| 테스트 사용자 | 10명 | 선장 2, 일반 8 |
| 조업일지 | 30건 | 3개월치 |
| 조황 사진 | 20장 | 실제 낚시 사진 |
| 직판 상품 | 5개 | 참돔/광어/우럭 등 |
| 가공 이력 | 3건 | 반건조/젓갈 |
| 제휴 식당 | 3곳 | 다대포 인근 |
| 스탬프/쿠폰 | 다양 | CRM 시연용 |
| AI 인식 결과 | 10건 | 사전 실행 캐시 |

### QA 체크리스트

- [ ] 전체 페이지 정상 렌더링 (60+ 페이지)
- [ ] Google OAuth 로그인 → 일반/관리자 분기 정상
- [ ] QR 스탬프 → 쿠폰 발급 전체 플로우
- [ ] 조업일지 CRUD + 통계
- [ ] 사진 업로드 → AI 인식 → 카피 생성 → 포스팅
- [ ] 직판 주문 → PG 결제 (테스트 모드)
- [ ] 식당 예약 접수
- [ ] 푸시 알림 수신 (Expo)
- [ ] 모바일 WebView 전체 동작 확인

---

## 즉시 실행 (Week 1 시작)

**Phase 0부터 시작, Week 2부터 Phase 1~4 병렬 착수:**

```
[Week 1] Phase 0 시작
├─ npm install @supabase/supabase-js @supabase/ssr
├─ lib/supabase.ts, lib/supabase-server.ts 생성
├─ .env.local에 Supabase 키 추가
├─ app/api/auth/callback/route.ts 생성
├─ middleware.ts 생성
└─ 로그인/온보딩 페이지 전환

[Week 2] Phase 0 계속 + Phase 1 착수
├─ Phase 0: 서비스 파일 전환 (send-push → stamp → community)
├─ Phase 1: fishing-operation-service.ts + admin-fishing-log 페이지
└─ Phase 1: captain-photo-service.ts + 태깅 UI

[Week 3] Phase 0 마무리 + Phase 2, 3 착수
├─ Phase 0: Cloud Functions 통합 + 페이지 전환 완료
├─ Phase 2: direct-sale-service.ts + 직판 페이지들
├─ Phase 3: boarding-form 초상권 동의 + 포인트몰 타입 추가
└─ OpenAI API 키 발급 (Phase 4 준비)

[Week 4] Phase 1 마무리 + Phase 4 착수
├─ Phase 1: my-photos 페이지 + SNS 공유
├─ Phase 2: 가공 이력 + 식당 매칭
├─ Phase 4: AI 어종 인식 API + 카피 생성
└─ Phase 3: 개인 출조 이력 페이지

[Week 5] Phase 2, 3, 4 마무리
├─ Phase 2: PG 결제(테스트모드) 연동 완료
├─ Phase 3: 메인 페이지 재배치
├─ Phase 4: 멀티채널 공유 MVP + 선장 대시보드
└─ 모든 Phase 코드 완료

[Week 6~7] 통합 QA + 시연 준비
├─ 전체 흐름 E2E 테스트
├─ 데모 데이터 세팅
├─ 시연 시나리오 리허설
└─ npm uninstall firebase uuid (최종 정리)
```

---

## 의존성 변경 요약

**Phase 0 추가:**
- `@supabase/supabase-js` — 클라이언트 SDK
- `@supabase/ssr` — Next.js SSR 지원

**Phase 2 추가:**
- `@portone/browser-sdk` 또는 `@tosspayments/payment-sdk` — PG 결제

**Phase 4 추가:**
- `openai` — OpenAI API SDK (Vision + Chat)
- (선택) `@google/generative-ai` — Gemini Vision 대안

**최종 삭제:**
- `firebase` — Phase 0 완료 후
- `uuid` — Supabase Auth 사용으로 불필요

---

## 사업계획서 연계 — 전체 구현 완료 시 시연 포인트

**Phase 0~4 전체 완성 시 심사위원에게 증명 가능한 항목:**

### 1차 산업 (어업인 증명)
- ✅ "조업일지 디지털화로 어업 데이터 축적" — 라이브 시연
- ✅ "출항/귀항/어획량/해역 기록 → 월별 통계" — 대시보드 시연

### 2차 산업 (가공/유통)
- ✅ "수산물 온라인 직거래, PG 결제 작동" — 주문 플로우 시연
- ✅ "가공 이력 디지털 관리로 식품 안전성 투명화" — 가공 기록 시연
- ✅ "조업→가공→직판 수직 통합 파이프라인" — SQL 연계 시연

### 3차 산업 (ICT/레저)
- ✅ "QR 승선명부 + CRM으로 고객 관리 혁신" — QR 스캔 시연
- ✅ "AI 어종 자동 인식 + 조황 카피 자동 생성" — 라이브 AI 시연
- ✅ "멀티채널 원클릭 포스팅으로 모객 비용 3배 절감" — 실제 포스팅 시연
- ✅ "스탬프/쿠폰/포인트 CRM으로 재방문율 향상" — 플로우 시연

### 6차 산업 융합
- ✅ "지역 식당 매칭으로 어촌 상권 활성화" — 예약 플로우 시연
- ✅ "1차→2차→3차 전체가 하나의 앱에서 연결" — 파이프라인 시연

### 기술 차별점
- ✅ "PostgreSQL 기반 매출 정산/통계 자동화" — SQL 대시보드 시연
- ✅ "Google OAuth 보안 인증" — 로그인 시연
- ✅ "이미 완성된 프로토타입" — **최강 가점**

---

## 최종 산출물 목록 (Phase 4까지 완성 시)

### 페이지 수 변화
| 구분 | 현재 | 완성 후 | 증가 |
|------|------|---------|------|
| Admin 페이지 | 12 | 20+ | +8 |
| Main 페이지 | 37 | 48+ | +11 |
| API Routes | 7 | 20+ | +13 |
| 서비스 파일 | 10 | 20+ | +10 |
| **총 TypeScript 파일** | **~100** | **~160+** | **+60** |

### 신규 파일 전체 목록

**서비스 (utils/):**
- `captain-photo-service.ts`, `fishing-operation-service.ts`
- `direct-sale-service.ts`, `processing-service.ts`, `restaurant-service.ts`

**라이브러리 (lib/):**
- `supabase.ts`, `supabase-server.ts`
- `social/instagram.ts`, `social/kakao.ts`, `social/naver-band.ts`

**API Routes (app/api/):**
- `auth/callback/route.ts`
- `stamps/process/route.ts`, `points/award/route.ts`
- `webhooks/bait-alert/route.ts`
- `payment/confirm/route.ts`, `payment/webhook/route.ts`
- `ai/identify-fish/route.ts`, `ai/generate-copy/route.ts`
- `social/post/route.ts`

**Admin 페이지:**
- `admin-fishing-log/page.tsx`, `admin-fishing-log/form/page.tsx`
- `admin-direct-sale/page.tsx`, `admin-direct-sale/form/page.tsx`
- `admin-processing/page.tsx`, `admin-processing/form/page.tsx`
- `admin-restaurants/page.tsx`, `admin-restaurants/form/page.tsx`
- `admin-social/page.tsx`

**Main 페이지:**
- `my-photos/page.tsx`
- `my-fishing-log/page.tsx`
- `direct-sale/page.tsx`, `direct-sale/[saleId]/page.tsx`, `direct-sale/orders/page.tsx`
- `restaurants/page.tsx`, `restaurants/[restaurantId]/page.tsx`
