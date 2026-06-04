/**
 * 모든 앱 화면을 430×932 뷰포트(고정)로 캡처합니다. Next.js N 버튼 숨김.
 * 사용: BASE_URL=http://localhost:3000 node scripts/capture-all-screenshots.mjs
 */
import { chromium } from 'playwright';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT, 'screenshots-430x932');
const WIDTH = 430;
const HEIGHT = 932;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LOGIN_NAME = '홍길동';
const LOGIN_DOB = '900301';
const USER_UUID = '75da8b26-9ed9-5485-abdf-5da2a47013bc';

function loadEnv() {
  const envText = readFileSync(join(ROOT, '.env.local'), 'utf8');
  return Object.fromEntries(
    envText
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [
          l.slice(0, i).trim(),
          l.slice(i + 1).trim().replace(/^["']|["']$/g, ''),
        ];
      }),
  );
}

async function fetchDynamicIds() {
  const env = loadEnv();
  const app = initializeApp({
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  const db = getFirestore(app);

  const gamesSnap = await getDocs(
    query(collection(db, 'games'), orderBy('display_order', 'asc')),
  );
  const gameIds = gamesSnap.docs.map((d) => d.id);

  const tripsSnap = await getDocs(
    query(collection(db, 'tripGuides'), orderBy('date', 'desc'), limit(5)),
  );
  const tripIds = tripsSnap.docs.map((d) => d.id);

  const productsSnap = await getDocs(collection(db, 'pointMallProducts'));
  const productIds = productsSnap.docs.slice(0, 3).map((d) => d.id);

  const photosSnap = await getDocs(
    query(collection(db, 'communityPhotos'), orderBy('uploadedAt', 'desc'), limit(3)),
  );
  const photoIds = photosSnap.docs.map((d) => d.id);

  const usersSnap = await getDocs(
    query(collection(db, 'users'), orderBy('totalPoint', 'desc'), limit(5)),
  );
  const otherUserIds = usersSnap.docs
    .map((d) => d.id)
    .filter((id) => id !== USER_UUID);

  return { gameIds, tripIds, productIds, photoIds, otherUserIds };
}

function pathToFilename(routePath) {
  const [pathname, query = ''] = routePath.split('?');
  let safe = pathname
    .replace(/^\//, '')
    .replace(/\//g, '__')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (query) {
    const hash = createHash('sha256').update(query).digest('hex').slice(0, 8);
    safe += `__${hash}`;
  }
  if (safe.length > 200) safe = safe.slice(0, 200);
  return (safe || 'root') + '.png';
}

const DEV_OVERLAY_HIDE_SCRIPT = () => {
  const css = `
    nextjs-portal,
    #__next-build-watcher,
    [data-nextjs-toast],
    [data-nextjs-dialog-overlay],
    [data-nextjs-dev-tools-button] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  const inject = () => {
    if (!document.getElementById('screenshot-hide-devtools')) {
      const style = document.createElement('style');
      style.id = 'screenshot-hide-devtools';
      style.textContent = css;
      document.head.appendChild(style);
    }
    document.querySelectorAll('nextjs-portal').forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
    });
  };
  inject();
  new MutationObserver(inject).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
};

function buildRoutes(ctx) {
  const q = (params) =>
    Object.entries(params)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
  const selfQ = q({ uuid: USER_UUID, name: LOGIN_NAME, dob: LOGIN_DOB });
  const adminSelfQ = q({
    uuid: USER_UUID,
    name: LOGIN_NAME,
    dob: LOGIN_DOB,
    fromAdmin: 'true',
  });

  const routes = [
    { path: '/onboarding', guest: true, label: '온보딩' },
    { path: '/login', guest: true, label: '로그인' },
    { path: '/', guest: true, label: '루트(리다이렉트)' },
    { path: '/my-page', label: '마이페이지' },
    { path: '/coupons', label: '쿠폰' },
    { path: `/coupons?${selfQ}`, label: '쿠폰(본인쿼리)' },
    { path: '/stamp', label: '스탬프' },
    { path: `/stamp?${adminSelfQ}`, label: '스탬프(관리자쿼리)' },
    { path: `/stamp-history?${q({ uuid: USER_UUID, name: LOGIN_NAME })}`, label: '스탬프 이력' },
    { path: `/logs?${q({ uuid: USER_UUID, name: LOGIN_NAME })}`, label: '로그' },
    { path: `/memo?${q({ uuid: USER_UUID, name: LOGIN_NAME })}`, label: '메모' },
    {
      path: `/memo/edit?${q({ uuid: USER_UUID, name: LOGIN_NAME, memoId: 'sample', content: '샘플 메모' })}`,
      label: '메모 수정',
    },
    { path: '/mini-games', label: '미니게임 목록' },
    { path: '/mini-games/ranking', label: '미니게임 랭킹' },
    { path: '/mini-games/ranking/tournament', label: '토너먼트 랭킹' },
    { path: '/point-mall', label: '포인트몰' },
    { path: '/point-mall?filter=bait', label: '포인트몰(미끼)' },
    { path: '/point-mall/orders', label: '포인트몰 주문' },
    { path: '/community', label: '커뮤니티' },
    { path: '/community/photos', label: '커뮤니티 사진' },
    { path: '/community/trip-guide', label: '출조 일정' },
    { path: '/my-reservations', label: '내 예약' },
    { path: '/today-roster', label: '오늘 명부' },
    { path: '/boarding-form', label: '승선 신청서' },
    {
      path: `/member-detail?${q({ uuid: USER_UUID, name: LOGIN_NAME, dob: LOGIN_DOB })}`,
      label: '회원 상세',
    },
    { path: '/notification-history', label: '알림 내역' },
    { path: `/qr-scan?${selfQ}`, label: 'QR 스캔' },
    { path: '/closed-mall', label: '폐쇄몰' },
    { path: '/roster-member-search', label: '명부 회원 검색' },
    {
      path: `/roster-list?${q({ date: '2025-09-24', dateDisplay: '2025년 9월 24일', tripNumber: '1' })}`,
      label: '명부 목록',
    },
    {
      path: `/roster-preview?${q({
        imageUri:
          'https://firebasestorage.googleapis.com/v0/b/ohgo-dev-bc602.firebasestorage.app/o/rosters%2F2025-09-24%2Ftrip1.jpg?alt=media&token=c1d9e30c-8871-4b6e-8390-8128733ba68a',
        date: '2025-09-24',
        tripNumber: '1',
      })}`,
      file: 'roster-preview.png',
      label: '명부 미리보기',
      waitMs: 3000,
    },
    {
      path: `/location-time-selection?${q({
        date: '2025-09-24',
        dateDisplay: '2025년 9월 24일',
        dateYear: '2025',
        dateMonth: '9',
        dateDay: '24',
        tripNumber: '1',
        rosterItems: JSON.stringify([
          {
            id: '1',
            name: LOGIN_NAME,
            birth: LOGIN_DOB,
            gender: 'M',
            phone: '01000000000',
            emergency: '01000000000',
            address: '서울',
            hasRoster: true,
          },
        ]),
      })}`,
      file: 'location-time-selection.png',
      label: '픽업 시간·장소 선택',
      waitMs: 3500,
    },
    { path: '/admin-main', label: '관리자 메인(비관리자→리다이렉트)' },
    { path: '/admin', label: '관리자 회원관리' },
    { path: '/admin-reservations', label: '관리자 예약' },
    { path: '/admin-trip-guide', label: '관리자 출조일정' },
    { path: '/admin-trip-guide/form', label: '관리자 출조일정 등록' },
    { path: '/admin-point-mall', label: '관리자 포인트몰' },
    { path: '/admin-point-mall/form', label: '관리자 상품 등록' },
    { path: '/admin-game-settings', label: '관리자 게임설정' },
    { path: '/admin-community', label: '관리자 커뮤니티' },
    { path: '/admin-photos', label: '관리자 사진' },
    { path: '/admin-site-settings', label: '관리자 사이트설정' },
    { path: '/admin-site-settings/menu/form', label: '관리자 메뉴 등록' },
    { path: '/admin-push', label: '관리자 푸시' },
  ];

  for (const gameId of ctx.gameIds) {
    routes.push({ path: `/mini-games/${gameId}`, label: `미니게임 ${gameId}`, waitMs: 4000 });
  }

  if (ctx.otherUserIds[0]) {
    routes.push({
      path: `/mini-games/ranking/${ctx.otherUserIds[0]}`,
      label: '랭킹 사용자 상세',
    });
  }

  if (ctx.tripIds[0]) {
    routes.push({
      path: `/trip-reservation?tripId=${encodeURIComponent(ctx.tripIds[0])}`,
      label: '출조 예약',
    });
  }

  for (const productId of ctx.productIds) {
    routes.push({
      path: `/point-mall/product?id=${encodeURIComponent(productId)}`,
      label: `상품 ${productId}`,
    });
  }

  if (ctx.tripIds[0]) {
    routes.push({
      path: `/admin-trip-guide/form?id=${encodeURIComponent(ctx.tripIds[0])}`,
      label: '관리자 출조 수정',
    });
  }

  if (ctx.productIds[0]) {
    routes.push({
      path: `/admin-point-mall/form?id=${encodeURIComponent(ctx.productIds[0])}`,
      label: '관리자 상품 수정',
    });
  }

  if (ctx.gameIds[0]) {
    routes.push({
      path: `/admin-game-settings/${ctx.gameIds[0]}`,
      label: '관리자 게임 상세',
    });
  }

  for (const photoId of ctx.photoIds) {
    routes.push({ path: `/community/${photoId}`, label: `사진 상세 ${photoId}` });
    routes.push({
      path: `/admin-photos?view=edit&photoId=${encodeURIComponent(photoId)}`,
      label: `관리자 사진 수정 ${photoId}`,
    });
  }

  routes.push(
    { path: '/admin-community?view=template-form', label: '관리자 템플릿 폼' },
    { path: '/admin-community?view=emoji-form', label: '관리자 이모지 폼' },
    { path: '/admin-photos?view=upload', label: '관리자 사진 업로드' },
  );

  return routes;
}

/** Next.js 개발 모드 플로팅 N 버튼(nextjs-portal) 숨김 */
async function hideDevOverlay(page) {
  await page.evaluate(() => {
    const css = `
      nextjs-portal,
      #__next-build-watcher,
      [data-nextjs-toast],
      [data-nextjs-dialog-overlay],
      [data-nextjs-dev-tools-button] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    let style = document.getElementById('screenshot-hide-devtools');
    if (!style) {
      style = document.createElement('style');
      style.id = 'screenshot-hide-devtools';
      style.textContent = css;
      document.head.appendChild(style);
    }
    document.querySelectorAll('nextjs-portal').forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
    });
  });
}

/** 메인: 430×932 뷰포트 단위로 스크롤하며 캡처 (상단·중간·하단) */
async function captureMainScrollViews(page, manifest) {
  try {
    await page.goto(`${BASE_URL}/main`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await page
      .waitForFunction(
        () => !document.querySelector('.min-vh-100 .spinner-border'),
        { timeout: 45000 },
      )
      .catch(() => {});
    await page.waitForTimeout(2000);
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {
      /* ignore */
    }

    const scrollPositions = await page.evaluate((vh) => {
      const max = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const positions = [0];
      for (let y = vh; y < max; y += vh) positions.push(y);
      if (max > 0 && positions[positions.length - 1] !== max) {
        positions.push(max);
      }
      return positions;
    }, HEIGHT);

    for (let i = 0; i < scrollPositions.length; i++) {
      const scrollY = scrollPositions[i];
      const isFirst = i === 0;
      const isLast = i === scrollPositions.length - 1;
      const file = isFirst
        ? 'main.png'
        : isLast
          ? 'main__scroll-bottom.png'
          : `main__scroll-${i}.png`;
      const label = isFirst
        ? '메인 (상단)'
        : isLast
          ? '메인 (하단)'
          : `메인 (스크롤 ${i})`;

      await page.evaluate((y) => {
        window.scrollTo({ top: y, left: 0, behavior: 'instant' });
      }, scrollY);
      await page.waitForTimeout(500);
      await hideDevOverlay(page);
      await page.screenshot({
        path: join(OUTPUT_DIR, file),
        fullPage: false,
      });
      manifest.push({
        file,
        label,
        requested: `/main#scrollY=${scrollY}`,
        finalUrl: '/main',
        redirected: false,
      });
      console.log(`✓ ${file} ← /main scrollY=${scrollY}`);
    }
  } catch (err) {
    manifest.push({
      file: 'main.png',
      label: '메인 (스크롤 캡처)',
      requested: '/main',
      error: String(err),
    });
    console.error('✗ /main scroll captures:', err.message);
  }
}

async function capturePage(page, route, manifest) {
  const filename = route.file ?? pathToFilename(route.path);
  const filepath = join(OUTPUT_DIR, filename);
  const waitMs = route.waitMs ?? 2000;

  try {
    await page.goto(`${BASE_URL}${route.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await page.waitForTimeout(waitMs);
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {
      /* 일부 페이지는 장시간 폴링 */
    }
    await hideDevOverlay(page);
    await page.screenshot({ path: filepath, fullPage: false });
    const pathname = new URL(page.url()).pathname;
    const search = new URL(page.url()).search;
    manifest.push({
      file: filename,
      label: route.label,
      requested: route.path,
      finalUrl: pathname + search,
      redirected: route.path.split('?')[0] !== pathname && !route.path.startsWith(pathname),
    });
    console.log(`✓ ${filename} ← ${route.path}`);
  } catch (err) {
    manifest.push({
      file: filename,
      label: route.label,
      requested: route.path,
      error: String(err),
    });
    console.error(`✗ ${route.path}:`, err.message);
  }
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="이름"]', { timeout: 30000 });
  await page.fill('input[placeholder="이름"]', LOGIN_NAME);
  await page.fill('input[placeholder="생년월일 (예: 720610)"]', LOGIN_DOB);
  await page.check('#agree');
  await page.click('button:has-text("로그인")');
  await page.waitForURL((url) => url.pathname === '/main', { timeout: 60000 });
  console.log('로그인 완료 → /main');
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log('Firestore에서 동적 ID 조회…');
  const dynamicCtx = await fetchDynamicIds();
  const routes = buildRoutes(dynamicCtx);
  console.log(`캡처 대상 ${routes.length}개, 출력: ${OUTPUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const manifest = [];

  const contextOptions = {
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  };

  const guestContext = await browser.newContext(contextOptions);
  await guestContext.addInitScript(DEV_OVERLAY_HIDE_SCRIPT);
  const guestPage = await guestContext.newPage();
  guestPage.on('dialog', (d) => d.accept());

  for (const route of routes.filter((r) => r.guest)) {
    await guestContext.clearCookies();
    await guestPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await guestPage.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await capturePage(guestPage, route, manifest);
  }
  await guestContext.close();

  const authContext = await browser.newContext(contextOptions);
  await authContext.addInitScript(DEV_OVERLAY_HIDE_SCRIPT);
  const authPage = await authContext.newPage();
  authPage.on('dialog', (d) => d.accept());

  await authPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await authPage.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ohgo_onboarded', '1');
  });
  await login(authPage);

  await captureMainScrollViews(authPage, manifest);

  for (const route of routes.filter((r) => !r.guest)) {
    await capturePage(authPage, route, manifest);
  }

  await authContext.close();
  await browser.close();

  const readme = `# 화면 캡처 (${WIDTH}×${HEIGHT})

- 로그인: ${LOGIN_NAME} / ${LOGIN_DOB}
- UUID: ${USER_UUID}
- 뷰포트: ${WIDTH}×${HEIGHT}px (고정, viewport 캡처)
- Next.js N 버튼: 숨김 (devIndicators + CSS)
- 생성: ${new Date().toISOString()}

> 홍길동 계정은 \`isAdmin: false\` 입니다. \`/admin-*\` 경로는 \`/main\` 등으로 리다이렉트된 화면이 포함될 수 있습니다.

## 파일 목록

| 파일 | 화면 | 요청 경로 | 최종 URL |
|------|------|-----------|----------|
${manifest
  .map((m) =>
    m.error
      ? `| ${m.file} | ${m.label} | ${m.requested} | ERROR |`
      : `| ${m.file} | ${m.label} | \`${m.requested}\` | \`${m.finalUrl}\` |`,
  )
  .join('\n')}
`;

  writeFileSync(join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(OUTPUT_DIR, 'README.md'), readme);
  console.log(`\n완료: ${manifest.filter((m) => !m.error).length}/${manifest.length}장`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
