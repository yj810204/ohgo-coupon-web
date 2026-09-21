/**
 * App Store / Google Play 스토어 스크린샷 캡처.
 *
 * 사용: BASE_URL=http://localhost:3000 node scripts/capture-store-screenshots.mjs
 *
 * 출력:
 *   store-screenshots/ios-6.9/      1320×2868 PNG  (iPhone 6.9" 필수)
 *   store-screenshots/ios-ipad-13/  2064×2752 PNG  (iPad 13" — 태블릿 지원 시 필수)
 *   store-screenshots/android-phone/ 1080×2220 JPEG (갤럭시 S26 CSS 360×740 ×3)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_ROOT = join(ROOT, 'store-screenshots', 'raw');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LOGIN_NAME = process.env.LOGIN_NAME || '홍길동';
const LOGIN_DOB = process.env.LOGIN_DOB || '900301';
const SCREEN_FILTER = new Set(
  (process.env.SCREENS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const TARGET_FILTER = new Set(
  (process.env.TARGETS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

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
    html, body { scrollbar-width: none !important; }
    *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
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

async function waitTripsLoaded(page) {
  await page
    .waitForFunction(() => !document.querySelector('.spinner-border'), { timeout: 20000 })
    .catch(() => {});
  await sleep(700);
}

async function prepareTripGuide(page) {
  const expand = page.getByRole('button', { name: '달력 펼치기' });
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
    await waitTripsLoaded(page);
  }

  const pickTripDay = async () => {
    const badges = page.locator('span[title^="출조"]');
    const n = await badges.count();
    if (n === 0) return false;
    await badges.nth(n - 1).click();
    await sleep(700);
    return true;
  };

  if (await pickTripDay()) return;

  for (let i = 0; i < 8; i++) {
    const prevMonth = page.getByRole('button', { name: '이전 달' });
    if (!(await prevMonth.isVisible().catch(() => false))) break;
    await prevMonth.click();
    await waitTripsLoaded(page);
    if (await pickTripDay()) return;
  }
}

async function prepareQrScan(page) {
  await page
    .getByText(/QR 코드를 스캔하세요|카메라 권한이 필요합니다/)
    .waitFor({ timeout: 15000 })
    .catch(() => {});
  await sleep(800);
}

/** 스토어 업로드 순서. Play는 최대 8장, iOS는 최대 10장. */
const SCREENS = [
  { id: '01-onboarding', path: '/onboarding', label: '안내', guest: true, waitMs: 1500 },
  { id: '02-home', path: '/main', label: '메인 홈', waitMs: 2500 },
  { id: '03-stamp', path: '/stamp', label: '스탬프', waitMs: 2000 },
  {
    id: '04-qr-scan',
    path: '/qr-scan',
    label: 'QR 리더',
    waitMs: 2500,
    prepare: prepareQrScan,
  },
  { id: '05-coupons', path: '/coupons', label: '쿠폰', waitMs: 2000 },
  { id: '06-community', path: '/community', label: '커뮤니티', waitMs: 2000 },
  {
    id: '07-trip-guide',
    path: '/community/trip-guide',
    label: '출조 안내',
    waitMs: 2500,
    prepare: prepareTripGuide,
  },
  { id: '08-point-mall', path: '/point-mall', label: '포인트몰', waitMs: 3000 },
  { id: '09-market', path: '/market', label: '중고장터', waitMs: 3000 },
];

const TARGETS = [
  {
    key: 'ios-6.9',
    label: 'iPhone 6.9" (App Store 필수)',
    spec: '1320×2868 PNG',
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    screenshot: { type: 'png' },
    ext: 'png',
  },
  {
    key: 'ios-ipad-13',
    label: 'iPad 13" (태블릿 지원 시 App Store 필수)',
    spec: '2064×2752 PNG',
    viewport: { width: 1032, height: 1376 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    screenshot: { type: 'png' },
    ext: 'png',
  },
  {
    key: 'android-phone',
    label: 'Galaxy S26 (360×740)',
    spec: '1080×2220 JPEG',
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    screenshot: { type: 'jpeg', quality: 92 },
    ext: 'jpg',
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      html, body { scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
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

async function waitForPageReady(page, waitMs) {
  await page
    .waitForFunction(
      () => !document.querySelector('.spinner-border, [role="status"] .spinner-border'),
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page
    .evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all(
        [...document.images].map((img) => {
          if (img.complete) return null;
          return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        }),
      );
    })
    .catch(() => {});
  await sleep(waitMs);
  await hideDevOverlay(page);
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByPlaceholder('홍길동').waitFor({ timeout: 30000 });
  await page.getByPlaceholder('홍길동').fill(LOGIN_NAME);
  await page.getByPlaceholder('YYMMDD 또는 YYYYMMDD').fill(LOGIN_DOB);
  await page.check('#agree');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/main' || url.pathname === '/admin-main', {
    timeout: 60000,
  });
  await waitForPageReady(page, 1500);
}

async function captureScreen(page, target, screen, outDir) {
  const file = `${screen.id}.${target.ext}`;
  const filepath = join(outDir, file);
  await page.goto(`${BASE_URL}${screen.path}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await waitForPageReady(page, screen.waitMs);
  if (typeof screen.prepare === 'function') {
    await screen.prepare(page);
    await waitForPageReady(page, 800);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await sleep(200);
  await hideDevOverlay(page);
  await page.screenshot({
    path: filepath,
    fullPage: false,
    animations: 'disabled',
    ...target.screenshot,
  });
  return { file, label: screen.label, path: screen.path, ok: true };
}

async function captureTarget(browser, target) {
  const outDir = join(OUTPUT_ROOT, target.key);
  mkdirSync(outDir, { recursive: true });

  const context = await browser.newContext({
    viewport: target.viewport,
    deviceScaleFactor: target.deviceScaleFactor,
    isMobile: target.isMobile,
    hasTouch: target.hasTouch,
    userAgent: target.userAgent,
    colorScheme: 'light',
    locale: 'ko-KR',
  });
  await context.grantPermissions(['camera'], { origin: BASE_URL });
  await context.addInitScript(DEV_OVERLAY_HIDE_SCRIPT);
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  const results = [];
  const screens = SCREENS.filter((s) => !SCREEN_FILTER.size || SCREEN_FILTER.has(s.id));
  const guestScreens = screens.filter((s) => s.guest);
  const memberScreens = screens.filter((s) => !s.guest);

  for (const screen of guestScreens) {
    try {
      results.push(await captureScreen(page, target, screen, outDir));
      console.log(`  ✓ ${target.key}/${results.at(-1).file} ← ${screen.path}`);
    } catch (err) {
      results.push({ file: `${screen.id}.${target.ext}`, label: screen.label, path: screen.path, ok: false, error: String(err) });
      console.error(`  ✗ ${target.key}/${screen.id}.${target.ext}:`, err.message);
    }
  }

  if (memberScreens.length) {
    await page.evaluate(() => localStorage.setItem('ohgo_onboarded', '1'));
    await login(page);
    console.log(`  로그인 완료 (${target.key})`);
  }

  for (const screen of memberScreens) {
    try {
      results.push(await captureScreen(page, target, screen, outDir));
      console.log(`  ✓ ${target.key}/${results.at(-1).file} ← ${screen.path}`);
    } catch (err) {
      results.push({ file: `${screen.id}.${target.ext}`, label: screen.label, path: screen.path, ok: false, error: String(err) });
      console.error(`  ✗ ${target.key}/${screen.id}.${target.ext}:`, err.message);
    }
  }

  await context.close();
  return results;
}

function buildReadme(allResults) {
  const rows = SCREENS.map((screen, i) => {
    const ios = `${screen.id}.png`;
    const android = `${screen.id}.jpg`;
    return `| ${i + 1} | ${screen.label} | \`${screen.path}\` | \`${ios}\` / \`${android}\` |`;
  }).join('\n');

  const errors = allResults
    .flatMap(({ target, results }) =>
      results.filter((r) => !r.ok).map((r) => `- ${target}/${r.file}: ${r.error}`),
    )
    .join('\n');

  return `# 스토어 스크린샷

생성: ${new Date().toISOString()}
로그인: ${LOGIN_NAME} / ${LOGIN_DOB}
BASE_URL: ${BASE_URL}

앱 화면 그대로입니다. 소개 문구·배지는 넣지 않았습니다.

재생성: \`TARGETS=ios-6.9,android-phone npm run screenshots:store\`

일부만 다시 찍기 예: \`SCREENS=05-trip-guide npm run screenshots:store\`  
특정 스토어만: \`TARGETS=ios-6.9 npm run screenshots:store\`

## 업로드 규격

| 폴더 | 스토어 | 픽셀 | 형식 | 비고 |
|------|--------|------|------|------|
| \`ios-6.9/\` | App Store Connect → iPhone 6.9" | 1320×2868 | PNG | **필수.** 1~10장. 이 세트가 있으면 더 작은 iPhone 크기는 자동 스케일됩니다. |
| \`ios-ipad-13/\` | App Store Connect → iPad 13" | 2064×2752 | PNG | 앱이 iPad를 지원하면 **필수.** UI는 폰 폭(480px) 기준이라 좌우 여백이 보일 수 있습니다. |
| \`android-phone/\` | Play Console → 휴대전화 | 1080×2220 | JPEG | 갤럭시 S26 CSS(360×740) ×3. 2~8장. |

> iPhone 6.9" PNG(1320×2868)는 가로:세로가 약 1:2.17이라 Play의 “긴 변은 짧은 변의 2배를 넘을 수 없음” 규칙에 걸립니다. Android에는 \`android-phone/\` JPEG만 올리세요.

## 업로드 순서

Play Console은 최대 8장입니다. 9장이면 앞에서 8장을 올리거나 빼고 싶은 장을 빼면 됩니다.

| 순서 | 화면 | 경로 | 파일 |
|------|------|------|------|
${rows}

## App Store Connect

1. 앱 → 배포할 버전 → iPhone 6.9형 디스플레이에 \`ios-6.9/\` 파일을 01부터 순서대로 업로드합니다.
2. iPad를 지원하면 Media Manager에서 13형 디스플레이에 \`ios-ipad-13/\` 를 같은 순서로 업로드합니다.
3. 6.5"/6.3" 등 나머지 iPhone 크기는 비워 두면 6.9"에서 스케일됩니다.

## Google Play Console

1. 출시 → 스토어 설정 → 기본 스토어 등록정보 → 휴대전화 스크린샷에 \`android-phone/\` JPEG를 01부터 업로드합니다. (최대 8장)
2. 추천 노출 조건: 1080px 이상, 9:16 세로 4장 이상. 이 세트가 해당합니다.

${errors ? `## 실패한 캡처\n\n${errors}\n` : ''}
`;
}

async function main() {
  const wipeAll = SCREEN_FILTER.size === 0 && TARGET_FILTER.size === 0;
  if (wipeAll) rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  mkdirSync(OUTPUT_ROOT, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const allResults = [];
  const targets = TARGETS.filter((t) => !TARGET_FILTER.size || TARGET_FILTER.has(t.key));

  for (const target of targets) {
    console.log(`\n▶ ${target.label} (${target.spec})`);
    rmSync(join(OUTPUT_ROOT, target.key), { recursive: true, force: true });
    const results = await captureTarget(browser, target);
    allResults.push({ target: target.key, results });
  }

  await browser.close();

  writeFileSync(join(OUTPUT_ROOT, 'README.md'), buildReadme(allResults));
  writeFileSync(join(OUTPUT_ROOT, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), allResults }, null, 2));

  const storeRoot = join(ROOT, 'store-screenshots');
  for (const target of targets) {
    const from = join(OUTPUT_ROOT, target.key);
    const to = join(storeRoot, target.key);
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
    console.log(`  → ${to}`);
  }
  writeFileSync(join(storeRoot, 'README.md'), buildReadme(allResults));
  writeFileSync(join(storeRoot, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), allResults }, null, 2));

  const ok = allResults.reduce((n, t) => n + t.results.filter((r) => r.ok).length, 0);
  const total = allResults.reduce((n, t) => n + t.results.length, 0);
  console.log(`\n완료: ${ok}/${total}장 → ${storeRoot}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
