import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PICKER_BASE_URL || 'http://127.0.0.1:3457';
const outDir = '/opt/cursor/artifacts/korean-pickers';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
await mkdir(outDir, { recursive: true });

await page.goto(`${base}/samples/korean-pickers`, { waitUntil: 'networkidle' });
const nativeCount = await page.locator('input[type="date"], input[type="time"], input[type="datetime-local"]').count();
if (nativeCount !== 0) throw new Error(`native date inputs: ${nativeCount}`);

await page.screenshot({ path: `${outDir}/fields.png` });

await page.getByRole('button', { name: '시작일' }).click();
await page.getByRole('dialog', { name: '시작일' }).waitFor();
const weekdays = await page.getByRole('dialog').innerText();
for (const label of ['일', '월', '화', '수', '목', '금', '토']) {
  if (!weekdays.includes(label)) throw new Error(`missing weekday ${label}`);
}
await page.getByRole('gridcell', { name: /2026-10-03/ }).waitFor();
await page.screenshot({ path: `${outDir}/date-sheet.png` });
await page.getByRole('gridcell', { name: '2026-10-09 한글날' }).click();
await page.getByTestId('range-value').waitFor();
const range = await page.getByTestId('range-value').innerText();
if (!range.startsWith('2026-10-09')) throw new Error(`date value ${range}`);

await page.getByRole('button', { name: '입항' }).click();
await page.getByRole('dialog', { name: '입항' }).waitFor();
await page.screenshot({ path: `${outDir}/time-sheet.png` });
await page.getByRole('option', { name: '오후', exact: true }).click();
await page.getByRole('listbox', { name: '시' }).getByRole('option', { name: '2', exact: true }).click();
await page.getByRole('listbox', { name: '분' }).getByRole('option', { name: '05', exact: true }).click();
await page.getByRole('button', { name: '확인' }).click();
const time = await page.getByTestId('time-value').innerText();
if (!time.includes('14:05')) throw new Error(`time value ${time}`);

await page.getByRole('button', { name: '대회 종료' }).click();
await page.getByRole('dialog', { name: '대회 종료' }).waitFor();
await page.screenshot({ path: `${outDir}/datetime-sheet.png` });
await page.getByRole('button', { name: '오늘' }).click();
await page.getByRole('option', { name: '오전', exact: true }).click();
await page.getByRole('listbox', { name: '시' }).getByRole('option', { name: '9', exact: true }).click();
await page.getByRole('listbox', { name: '분' }).getByRole('option', { name: '30', exact: true }).click();
await page.getByRole('button', { name: '확인' }).click();
const stamp = await page.getByTestId('datetime-value').innerText();
if (!/T09:30/.test(stamp)) throw new Error(`datetime value ${stamp}`);

await page.screenshot({ path: `${outDir}/filled.png` });
await browser.close();
console.log('picker screenshots ok');
