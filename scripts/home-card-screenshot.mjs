import { chromium, webkit } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PICKER_BASE_URL || 'http://127.0.0.1:3457';
const phase = process.argv[2] || 'before';
const mode = process.argv[3] || 'stamp';

if (mode === 'holiday') {
  const outDir = '/opt/cursor/artifacts/holiday-widget';
  const dates = [
    ['holiday', '2026-10-09'],
    ['weekday', '2026-10-14'],
  ];
  await mkdir(outDir, { recursive: true });
  const browser = await webkit.launch({ headless: true });
  for (const [label, date] of dates) {
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    await page.goto(`${base}/samples/home-cards?date=${date}`, { waitUntil: 'networkidle' });
    const month = Number(date.slice(5, 7));
    const day = Number(date.slice(8, 10));
    await page.getByText(`${month}월 ${day}일`).first().waitFor();
    await page.locator('[data-shot="tide"]').screenshot({ path: `${outDir}/${phase}-tide-${label}.png` });
    await page.locator('[data-shot="wind"]').screenshot({ path: `${outDir}/${phase}-wind-${label}.png` });
    await page.screenshot({ path: `${outDir}/${phase}-page-${label}.png` });
    await page.close();
    console.log(phase, label, 'ok');
  }
  await browser.close();
} else {
  const outDir = '/opt/cursor/artifacts/home-card';
  await mkdir(outDir, { recursive: true });
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    await page.goto(`${base}/samples/main`, { waitUntil: 'networkidle' });
    await page.getByText('QR 스캔으로 스탬프 적립').waitFor();
    const card = page.locator('text=QR 스캔으로 스탬프 적립').locator('xpath=ancestor::div[contains(@style,"linear-gradient")]').first();
    await card.screenshot({ path: `${outDir}/${phase}-${name}.png` });
    await page.screenshot({ path: `${outDir}/${phase}-${name}-page.png` });
    await browser.close();
    console.log(phase, name, 'ok');
  }
}
