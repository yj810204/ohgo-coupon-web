/**
 * 스탬프 도장 칸이 정사각형인지, 도장 글자가 원 안에 들어가는지 확인한다.
 * 앱과 같은 여백으로 320px, 390px 폭을 재고 스크린샷을 남긴다.
 *
 *   node scripts/stamp-seal-layout.mjs
 */
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium, webkit } from 'playwright';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const marker = '/* 스탬프 10칸 요약 카드 */';
const stampCss = css.slice(css.indexOf(marker));
if (!stampCss.startsWith(marker)) throw new Error('stamp css marker missing');

const outDir = process.env.STAMP_SEAL_OUT || '/opt/cursor/artifacts/stamp-seal';

function boardHtml(filled) {
  const cells = [];
  for (let i = 1; i <= 10; i += 1) {
    const on = i <= filled;
    const isGoal = i === 10;
    const isHalf = i === 5;
    const cls = [
      'ohgo-stamp-board__cell',
      on ? 'is-on' : '',
      isGoal ? 'is-goal' : '',
      isHalf ? 'is-half' : '',
    ]
      .filter(Boolean)
      .join(' ');
    let inner;
    if (on && isHalf) {
      inner = '<span class="ohgo-stamp-board__seal is-mark"><span>50%</span></span>';
    } else if (on) {
      inner =
        '<span class="ohgo-stamp-board__seal is-two"><span>오고</span><span>피씽</span></span>';
    } else if (isGoal) {
      inner =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5h18v9H3z"/></svg>';
    } else if (isHalf) {
      inner = '<span class="ohgo-stamp-board__half">50%</span>';
    } else {
      inner = String(i);
    }
    cells.push(
      `<span class="${cls}"><span class="ohgo-stamp-board__face">${inner}</span></span>`,
    );
  }
  return `<div class="ohgo-stamp-sum" data-board>
    <span class="ohgo-stamp-sum__label">모은 스탬프</span>
    <strong>6<small>/ 10개</small></strong>
    <div class="ohgo-stamp-board" style="--cols: 5">${cells.join('')}</div>
  </div>`;
}

const pageHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <style>
    @font-face {
      font-family: 'ONE Mobile';
      src: url('/fonts/onemobile/ONEMobile-Bold.woff2') format('woff2');
      font-weight: 600 800;
      font-style: normal;
    }
    @font-face {
      font-family: 'Nanum Myeongjo';
      src: url('/fonts/onemobile/ONEMobile-Bold.woff2') format('woff2');
      font-weight: 800;
      font-style: normal;
    }
    :root { --font-ohgo: 'ONE Mobile', sans-serif; }
    body { margin: 0; background: #e8eef8; }
    .frame { box-sizing: border-box; padding: 12px; }
    ${stampCss}
  </style>
</head>
<body>
  <div class="frame" id="narrow" style="width:320px">${boardHtml(6)}</div>
  <div class="frame" id="normal" style="width:390px">${boardHtml(6)}</div>
  <div class="frame" id="wide" style="width:480px">${boardHtml(6)}</div>
  <div class="frame" id="half" style="width:320px">${boardHtml(4)}</div>
</body>
</html>`;

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = req.url || '/';
      if (url === '/' || url.startsWith('/index')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(pageHtml);
        return;
      }
      if (url.startsWith('/fonts/')) {
        const file = new URL(`../public${url}`, import.meta.url);
        const buf = readFileSync(file);
        res.writeHead(200, { 'content-type': 'font/woff2' });
        res.end(buf);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const server = await startServer();
const { port } = server.address();
const engineName = process.env.STAMP_SEAL_ENGINE || 'chromium';
const engine = engineName === 'webkit' ? webkit : chromium;
const browser = await engine.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 520, height: 1400 }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await mkdir(outDir, { recursive: true });

const report = await page.evaluate(() => {
  function measure(root) {
    const cells = [...root.querySelectorAll('.ohgo-stamp-board__cell')];
    const squares = cells.map((cell) => {
      const face = cell.querySelector('.ohgo-stamp-board__face');
      return {
        w: cell.offsetWidth,
        h: cell.offsetHeight,
        faceW: face.offsetWidth,
        faceH: face.offsetHeight,
      };
    });
    const lines = [...root.querySelectorAll('.ohgo-stamp-board__seal span, .ohgo-stamp-board__half')].map(
      (el) => {
        const seal = el.closest('.ohgo-stamp-board__seal') || el.parentElement;
        const box = seal.getBoundingClientRect();
        const style = getComputedStyle(seal);
        const border = parseFloat(style.borderTopWidth) || 0;
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const radius = Math.min(box.width, box.height) / 2 - border;
        const text = el.getBoundingClientRect();
        const corners = [
          [text.left, text.top],
          [text.right, text.top],
          [text.left, text.bottom],
          [text.right, text.bottom],
        ];
        const overflow = Math.max(
          ...corners.map(([x, y]) => Math.hypot(x - cx, y - cy) - radius),
        );
        return {
          text: el.textContent,
          fontSize: parseFloat(getComputedStyle(el).fontSize),
          overflow,
          hasSeal: Boolean(el.closest('.ohgo-stamp-board__seal')),
          sealOverflow: getComputedStyle(seal).overflow,
          faceOverflow: getComputedStyle(el.closest('.ohgo-stamp-board__face')).overflow,
        };
      },
    );
    return { squares, lines };
  }
  return {
    narrow: measure(document.getElementById('narrow')),
    normal: measure(document.getElementById('normal')),
    wide: measure(document.getElementById('wide')),
    half: measure(document.getElementById('half')),
  };
});

await page.locator('#narrow').screenshot({ path: `${outDir}/stamp-320.png` });
await page.locator('#normal').screenshot({ path: `${outDir}/stamp-390.png` });
await page.locator('#wide').screenshot({ path: `${outDir}/stamp-480.png` });
await browser.close();
server.close();

const failures = [];
for (const [name, data] of Object.entries(report)) {
  for (const sq of data.squares) {
    if (Math.abs(sq.w - sq.h) > 1) failures.push(`${name} cell ${sq.w}x${sq.h}`);
    if (Math.abs(sq.faceW - sq.faceH) > 1) failures.push(`${name} face ${sq.faceW}x${sq.faceH}`);
    if (sq.w < 8) failures.push(`${name} cell collapsed ${sq.w}`);
  }
  for (const line of data.lines) {
    if (line.overflow > 0.75) {
      failures.push(`${name} "${line.text}" overflow ${line.overflow.toFixed(2)}px font ${line.fontSize}`);
    }
    if (line.faceOverflow !== 'hidden') failures.push(`${name} face overflow ${line.faceOverflow}`);
    if (line.hasSeal && line.sealOverflow !== 'hidden') {
      failures.push(`${name} seal overflow ${line.sealOverflow}`);
    }
  }
}

const twoNarrow = report.narrow.lines.find((l) => l.text === '오고');
const twoNormal = report.normal.lines.find((l) => l.text === '오고');
const twoWide = report.wide.lines.find((l) => l.text === '오고');
if (!(twoNarrow.fontSize < twoNormal.fontSize && twoNormal.fontSize < twoWide.fontSize)) {
  failures.push(
    `seal font did not scale ${twoNarrow.fontSize} / ${twoNormal.fontSize} / ${twoWide.fontSize}`,
  );
}
const widthRatio = report.normal.squares[0].w / report.narrow.squares[0].w;
const fontRatio = twoNormal.fontSize / twoNarrow.fontSize;
if (Math.abs(fontRatio - widthRatio) > 0.08) {
  failures.push(`font ratio ${fontRatio.toFixed(3)} vs cell ratio ${widthRatio.toFixed(3)}`);
}

const summary = {
  cell320: report.narrow.squares[0],
  cell390: report.normal.squares[0],
  cell480: report.wide.squares[0],
  font320: twoNarrow.fontSize,
  font390: twoNormal.fontSize,
  font480: twoWide.fontSize,
  maxOverflow: Math.max(
    ...Object.values(report).flatMap((d) => d.lines.map((l) => l.overflow)),
  ),
};
console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('stamp seal layout ok');
