# 포트폴리오 샘플 (`/samples`)

로그인·Supabase 없이 더미 데이터로 렌더되는 캡처용 화면입니다.

- `lib/samples/mock-data.ts` — 정적 목 데이터
- `robots: noindex` — 검색 노출 방지
- 전역 `BottomTabBar` 대신 `SampleTabBar` 사용
- `/samples/game` — 실제 match3 플레이 스샷(`public/games/match3/thumbnail.png`)
- 정적 이미지는 `public/sample-assets/` 또는 `public/games/*/thumbnail.png`만 사용
  (`public/samples/`는 App Router와 충돌하므로 쓰지 않음)

포트폴리오 캡처: portfolio-studio에서 `pnpm capture --project ohgo-coupon`
