import { chromium, webkit } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PICKER_BASE_URL || 'http://127.0.0.1:3457';
const phase = process.argv[2] || 'before';
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
