# Firebase(구앱) → Supabase(신규 앱) 데이터 재사용

> **전환기 병행 운영** (손님=구앱, 선장=신앱, Firestore 공용):  
> [`docs/FIREBASE_TRANSITION.md`](../docs/FIREBASE_TRANSITION.md)  
> `NEXT_PUBLIC_DATA_SOURCE=firebase` 로 웹을 배포하면 신앱도 Firestore를 읽고 쓴다.  
> **미끼도 변환하지 않는다.** 구앱 `users.baitCoupons` = 신앱 미니게임 보유 미끼.  
> 아래 import 스크립트는 **Phase 3 Supabase 컷오버** 시점에만 `--cutover` 로 사용한다.

## 로그인 UX 확정 (confirm-auth-ux)

**확정: 기등록 회원은 이름+생년월일 로그인 + (신규) Google/Apple OAuth.**

- 로그인 화면에서 구앱과 동일하게 이름·생년월일 로그인 가능 (`/api/auth/legacy-login`).
- `guest_profiles` 또는 `profiles.legacy_uuid`가 있는 회원만 허용 (기등록).
- OAuth 신규 가입 후 `/profile-setup`에서 이름·생년월일 병합도 계속 지원.
- UUID v5 네임스페이스는 구앱과 동일 (`lib/legacy-uuid.ts`).

## FK 전략 (fk-strategy)

`stamps` / `coupons` / `stamp_history`의 `user_id`는 `profiles(id)` FK라 게스트 UUID로는 insert 불가.

1. Firestore 데이터를 **`legacy_*` staging 테이블**에 적재 (`legacy_uuid` = 구앱 uuidv5, FK 없음)
2. 이미 `profiles.legacy_uuid`가 있으면 스크립트가 즉시 live 테이블로 apply
3. 아직 미연결이면 staging만 유지 → OAuth 병합 시 `merge-legacy`가 staging → live 적용

멱등: staging `(legacy_uuid, firestore_id)` UNIQUE. 이미 `applied_profile_id`가 있으면 skip.

## 스크립트

```bash
# 1) 회원·승선정보 → guest_profiles
npm run import:firebase-guests

# 2) 스탬프·쿠폰·이력 → staging (+ 병합된 유저는 live 반영)
# 구앱 병행 중 실기록 금지. dry-run만 허용.
npm run import:firebase-stamps -- --dry-run --limit 5
npm run import:firebase-stamps -- --cutover --limit 5          # 전원 신앱 이후 파일럿
npm run import:firebase-stamps -- --cutover                    # 전원 신앱 이후 전량
npm run import:firebase-stamps -- --cutover --legacy-uuid=<uuidv5>
```

필요 env (`.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Firebase `NEXT_PUBLIC_FIREBASE_*` (구앱 `ohgo-dev-bc602`와 동일)

사전: Supabase에 `016_legacy_firebase_staging.sql` 적용.

## 운영 주의 (pilot-migrate)

- dry-run으로 건수·샘플을 확인한 뒤 파일럿(`--limit`) → 전량 순으로 진행한다.
- **이관 후 구앱·신앱 동시 적립은 이중 데이터가 생길 수 있다.**  
  전량 이관 뒤에는 구앱(Firebase) 쓰기를 중단하거나 Firebase를 read-only로 둔다.
- **미끼:** `--cutover` 시에만 `baitCoupons` → `profiles.bait_coupons` 반영. 그 전에는 Firestore 한곳만 쓴다.
- 런타임 `tryImportGuestFromFirebase`는 사용하지 않는다. 이관은 **offline 배치만**.

### 파일럿 dry-run 결과 (2026-08-04)

```bash
npm run import:firebase-stamps -- --dry-run --limit 5
```

| 항목 | 결과 |
|------|------|
| users | 5 |
| stamps | 1 |
| coupons | 1 |
| history | 7 |
| errors | 0 |

샘플: 박정식, 이성현(스탬프1/이력1), 황상헌(쿠폰1/이력6), 윤성근, 박충욱.

### 전량 이관 체크리스트

1. [ ] Dashboard SQL Editor에서 `016_legacy_firebase_staging.sql` 실행  
   (또는 `DATABASE_URL` 설정 후 `node scripts/apply-legacy-staging-migration.mjs`)
2. [ ] `npm run import:firebase-guests`
3. [ ] `npm run import:firebase-stamps -- --cutover --limit 5` 로 실제 staging 적재 검증
4. [ ] OAuth 테스트 계정으로 profile-setup 병합 → 스탬프/쿠폰 표시 확인
5. [ ] `npm run import:firebase-stamps -- --cutover` 전량
6. [ ] **결정: 구앱 Firebase 쓰기 중단** (동시 사용 시 이중 적립)

### 동시사용 중단 결정 (권장)

전량 이관 완료 시점으로 **구앱 배포/Firebase 쓰기를 중단**한다.  
신규 앱만 적립·쿠폰 사용의 source of truth로 둔다.