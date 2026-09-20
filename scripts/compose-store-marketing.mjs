/**
 * 스토어용 소개형(마케팅) 스크린샷 합성.
 * 원본 캡처: store-screenshots/raw/
 * 결과물: store-screenshots/{ios-6.9,android-phone,ios-ipad-13}/
 *
 * 사용: node scripts/compose-store-marketing.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW_DIR = join(ROOT, 'store-screenshots', 'raw');
const OUTPUT_ROOT = join(ROOT, 'store-screenshots');
const FONT_DIR = join(ROOT, 'public', 'fonts', 'scdream');

function dataUri(filePath, mime) {
  return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`;
}

const fontUrl = (file) => dataUri(join(FONT_DIR, file), 'font/woff');

const SLIDES = [
  {
    id: '01-home',
    source: '01-home.png',
    title: '오고피씽 홈',
    line1: '스탬프 · 쿠폰 · 출조 일정을',
    accent: '한눈에',
    line2After: ' 확인하세요!',
  },
  {
    id: '02-stamp',
    source: '02-stamp.png',
    badge: 'NEW',
    title: 'QR 스탬프 적립',
    line1: 'QR 스캔 기능이 추가되었어요',
    accent: '스탬프 적립',
    line2Before: '이제 앱 하나로 ',
    line2After: '까지 간편하게!',
  },
  {
    id: '03-coupons',
    source: '03-coupons.png',
    title: '출조 할인 쿠폰',
    line1: '모은 스탬프로 쿠폰을 받고',
    accent: '더 저렴하게',
    line2Before: '다음 출조를 ',
    line2After: '!',
  },
  {
    id: '04-community',
    source: '04-community.png',
    title: '낚시 커뮤니티',
    line1: '조황 사진 · FAQ · Q&A',
    accent: '정보를 나눠요',
    line2Before: '선원들과 ',
    line2After: '!',
  },
  {
    id: '05-trip-guide',
    source: '05-trip-guide.png',
    title: '출조 일정 안내',
    line1: '달력에서 출조를 확인하고',
    accent: '바로 예약',
    line2Before: '원하는 날 ',
    line2After: '하세요!',
  },
  {
    id: '06-point-mall',
    source: '06-point-mall.png',
    title: '포인트몰',
    line1: '게임하고 활동해서 모은 포인트로',
    accent: '구매하세요',
    line2Before: '낚시 용품을 ',
    line2After: '!',
  },
  {
    id: '07-market',
    source: '07-market.png',
    badge: 'NEW',
    title: '중고장터',
    line1: '선원끼리 안전하게',
    accent: '직거래',
    line2Before: '중고 장비를 ',
    line2After: '하세요!',
  },
  {
    id: '08-mini-games',
    source: '08-mini-games.png',
    title: '미니게임',
    line1: '틈날 때 게임하고 포인트 모아',
    accent: '바꿔보세요',
    line2Before: '상품으로 ',
    line2After: '!',
  },
];

const TARGETS = [
  {
    key: 'ios-6.9',
    width: 1320,
    height: 2868,
    variant: 'tall',
    ext: 'png',
    screenshot: { type: 'png' },
  },
  {
    key: 'ios-ipad-13',
    width: 2064,
    height: 2752,
    variant: 'wide',
    ext: 'png',
    screenshot: { type: 'png' },
  },
  {
    key: 'android-phone',
    width: 1080,
    height: 1920,
    variant: 'short',
    ext: 'jpg',
    screenshot: { type: 'jpeg', quality: 92 },
  },
];

function sourceUrl(filename) {
  const p = join(RAW_DIR, 'ios-6.9', filename);
  if (!existsSync(p)) {
    throw new Error(`원본 캡처가 없습니다: ${p}`);
  }
  return dataUri(p, 'image/png');
}

function buildHtml(slide, target) {
  const shot = sourceUrl(slide.source);
  const line2Before = slide.line2Before ?? '';
  const line2After = slide.line2After ?? '';
  const badge = slide.badge
    ? `<div class="badge">NEW</div>`
    : '';

  const type = {
    short: {
      heroPad: '9% 8% 5%',
      badge: '40px',
      title: '108px',
      sub: '42px',
      radius: '28px',
    },
    wide: {
      heroPad: '8% 10% 4%',
      badge: '48px',
      title: '128px',
      sub: '48px',
      radius: '32px',
    },
    tall: {
      heroPad: '11% 8% 6%',
      badge: '52px',
      title: '140px',
      sub: '52px',
      radius: '36px',
    },
  }[target.variant];

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<style>
@font-face {
  font-family: 'SCDream';
  src: url('${fontUrl('S-CoreDream-4Regular.woff')}') format('woff');
  font-weight: 400;
}
@font-face {
  font-family: 'SCDream';
  src: url('${fontUrl('S-CoreDream-6Bold.woff')}') format('woff');
  font-weight: 600;
}
@font-face {
  font-family: 'SCDream';
  src: url('${fontUrl('S-CoreDream-8Heavy.woff')}') format('woff');
  font-weight: 800;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: ${target.width}px;
  height: ${target.height}px;
  overflow: hidden;
  background: #F4F5F7;
  font-family: 'SCDream', sans-serif;
}
.canvas {
  display: flex;
  flex-direction: column;
  width: ${target.width}px;
  height: ${target.height}px;
  background: linear-gradient(180deg, #FFFFFF 0%, #F3F4F6 42%, #E8EAED 100%);
  overflow: hidden;
}
.hero {
  flex: 0 0 auto;
  text-align: center;
  padding: ${type.heroPad};
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #1B6FF5;
  color: #fff;
  font-weight: 800;
  letter-spacing: 0.14em;
  font-size: ${type.badge};
  padding: 0.22em 0.7em 0.28em;
  border-radius: 999px;
  margin-bottom: 0.45em;
}
.title {
  font-weight: 800;
  letter-spacing: -0.05em;
  line-height: 1.18;
  font-size: ${type.title};
  color: #111827;
  margin-bottom: 0.28em;
}
.sub {
  font-weight: 600;
  font-size: ${type.sub};
  line-height: 1.45;
  color: #4B5563;
}
.sub .accent {
  color: #1B6FF5;
  border-bottom: 8px solid #1B6FF5;
  padding-bottom: 2px;
  font-weight: 800;
}
.shot-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 0 7%;
  overflow: hidden;
}
.shot {
  display: block;
  width: 100%;
  max-width: ${target.variant === 'wide' ? '920px' : '100%'};
  height: auto;
  border-radius: ${type.radius};
  box-shadow: 0 18px 48px rgba(17, 24, 39, 0.12);
  background: #fff;
}
</style>
</head>
<body>
  <div class="canvas">
    <div class="hero">
      ${badge}
      <div class="title">${slide.title}</div>
      <div class="sub">
        <div>${slide.line1}</div>
        <div>${line2Before}<span class="accent">${slide.accent}</span>${line2After}</div>
      </div>
    </div>
    <div class="shot-wrap">
      <img class="shot" src="${shot}" alt="" />
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  if (!existsSync(join(RAW_DIR, 'ios-6.9', '01-home.png'))) {
    throw new Error('store-screenshots/raw/ios-6.9 원본이 없습니다. 먼저 npm run screenshots:store 를 실행하세요.');
  }

  const browser = await chromium.launch({ headless: true });

  for (const target of TARGETS) {
    const outDir = join(OUTPUT_ROOT, target.key);
    mkdirSync(outDir, { recursive: true });
    console.log(`\n▶ ${target.key} ${target.width}×${target.height}`);

    const page = await browser.newPage({
      viewport: { width: target.width, height: target.height },
      deviceScaleFactor: 1,
    });

    for (const slide of SLIDES) {
      const html = buildHtml(slide, target);
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(async () => {
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
      });
      await page.waitForTimeout(200);
      const file = `${slide.id}.${target.ext}`;
      await page.screenshot({
        path: join(outDir, file),
        fullPage: false,
        animations: 'disabled',
        ...target.screenshot,
      });
      console.log(`  ✓ ${target.key}/${file}`);
    }
    await page.close();
  }

  await browser.close();

  const rows = SLIDES.map(
    (s, i) =>
      `| ${i + 1} | ${s.title} | \`${s.id}.png\` / \`${s.id}.jpg\` | ${s.badge ? 'NEW' : ''} |`,
  ).join('\n');

  const readme = `# 스토어 스크린샷 (소개형)

생성: ${new Date().toISOString()}

원본 캡처는 \`raw/\` 에 보관하고, 스토어에 올릴 파일은 아래 폴더의 소개형 합성본입니다.

재생성:
- 화면 다시 찍기: \`npm run screenshots:store\` (결과는 \`raw/\` 로 옮긴 뒤 합성)
- 소개 프레임만 다시 합성: \`npm run screenshots:store:marketing\`

## 업로드 규격

| 폴더 | 스토어 | 픽셀 | 형식 |
|------|--------|------|------|
| \`ios-6.9/\` | App Store iPhone 6.9" | 1320×2868 | PNG |
| \`ios-ipad-13/\` | App Store iPad 13" | 2064×2752 | PNG |
| \`android-phone/\` | Play 휴대전화 | 1080×1920 | JPEG |

> Android에는 \`android-phone/\` JPEG만 올리세요. iPhone 6.9" PNG는 Play 가로세로 비율 제한(2:1)에 걸립니다.

## 업로드 순서 (8장)

| 순서 | 소개 카피 | 파일 | 배지 |
|------|-----------|------|------|
${rows}
`;

  writeFileSync(join(OUTPUT_ROOT, 'README.md'), readme);
  writeFileSync(
    join(OUTPUT_ROOT, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), type: 'marketing', slides: SLIDES.map((s) => s.id) }, null, 2),
  );
  console.log(`\n완료 → ${OUTPUT_ROOT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
