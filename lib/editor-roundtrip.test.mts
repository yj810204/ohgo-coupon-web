import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { BAND_EDITOR_COLORS } from './editor-colors.ts';
import { sanitizeRichHtml } from './rich-text.ts';

const IMPORTED = [
  '<p><span style="background-color:#ff9900;color:#ff3445;font-size:18px;"><i><s><strong><u>모두</u></strong></s></i></span></p>',
  '<p><span style="font-size:22px;">큰 글씨</span></p>',
  '<p>&nbsp;</p>',
  '<p>보통 <i>기울임</i> <a href="https://example.com">링크</a></p>',
].join('');

const html = `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<link rel="stylesheet" href="/browser/ckeditor5.css">
<style>body{margin:16px;background:#fff} #post{font-size:14px;line-height:1.6}</style>
</head><body>
<div id="editor"></div>
<div id="post"></div>
<script type="module">
import { ClassicEditor, Essentials, Paragraph, Heading, Bold, Italic, Underline, Strikethrough, Font, Link, List, BlockQuote, Table, TableToolbar } from '/browser/ckeditor5.js';
import ko from '/translations/ko.js';
const colors = ${JSON.stringify(BAND_EDITOR_COLORS)};
const editor = await ClassicEditor.create(document.querySelector('#editor'), {
  licenseKey: 'GPL',
  plugins: [Essentials, Paragraph, Heading, Bold, Italic, Underline, Strikethrough, Font, Link, List, BlockQuote, Table, TableToolbar],
  language: 'ko',
  translations: [ko],
  toolbar: ['heading','|','bold','italic','underline','strikethrough','|','fontSize','fontColor','fontBackgroundColor','|','link','bulletedList','numberedList','|','blockQuote','insertTable','|','undo','redo'],
  fontSize: { options: ['default', { title: '18', model: '18px' }, { title: '22', model: '22px' }] },
  fontColor: { colors, columns: 6, colorPicker: { format: 'hex' } },
  fontBackgroundColor: { colors, columns: 6, colorPicker: { format: 'hex' } },
});
window.__editor = editor;
document.body.dataset.ready = '1';
</script>
</body></html>`;

const root = path.resolve('node_modules/ckeditor5/dist');
const server = createServer(async (req, res) => {
  try {
    const url = (req.url || '/').split('?')[0];
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    const file = path.join(root, decodeURIComponent(url));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const body = await readFile(file);
    const type = file.endsWith('.css') ? 'text/css' : 'text/javascript';
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('서버 주소를 알 수 없습니다');
const base = `http://127.0.0.1:${address.port}/`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
  assert.deepEqual(errors, [], errors.join('\n'));

  const labels = await page.locator('.ck-toolbar .ck-button').evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('data-cke-tooltip-text') || button.getAttribute('aria-label') || button.textContent || '').join('\n'),
  );
  for (const word of ['굵게', '기울임꼴', '밑줄', '취소선', '글자 크기', '글자 색깔']) {
    assert.ok(labels.includes(word), `툴바에 ${word} 없음: ${labels}`);
  }

  const data = await page.evaluate((input) => {
    const editor = (window as unknown as { __editor: { setData: (html: string) => void; getData: () => string } }).__editor;
    editor.setData(input);
    return editor.getData();
  }, IMPORTED);
  assert.equal(data, IMPORTED, '가져온 HTML이 로드 뒤 getData()와 같다');

  const plain = await page.evaluate(() => {
    const editor = (window as unknown as { __editor: { setData: (html: string) => void; getData: () => string } }).__editor;
    editor.setData('<p>예전 글</p>');
    return editor.getData();
  });
  assert.equal(plain, '<p>예전 글</p>');

  const safe = sanitizeRichHtml(`${IMPORTED}<script>window.__hacked=1</script><img src=x onerror="window.__hacked=1">`);
  const rendered = await page.evaluate((input) => {
    const post = document.querySelector('#post') as HTMLDivElement;
    post.innerHTML = input;
    const span = post.querySelector('span') as HTMLElement;
    const styled = getComputedStyle(span);
    const big = post.querySelectorAll('span')[1] as HTMLElement;
    return {
      hacked: (window as unknown as { __hacked?: number }).__hacked ?? 0,
      color: styled.color,
      background: styled.backgroundColor,
      size: styled.fontSize,
      italic: getComputedStyle(post.querySelector('i') as HTMLElement).fontStyle,
      strike: getComputedStyle(post.querySelector('s') as HTMLElement).textDecorationLine,
      underline: getComputedStyle(post.querySelector('u') as HTMLElement).textDecorationLine,
      weight: getComputedStyle(post.querySelector('strong') as HTMLElement).fontWeight,
      big: getComputedStyle(big).fontSize,
      scripts: post.querySelectorAll('script').length,
    };
  }, safe);
  assert.equal(rendered.hacked, 0, '스크립트가 실행되지 않는다');
  assert.equal(rendered.scripts, 0);
  assert.equal(rendered.color, 'rgb(255, 52, 69)');
  assert.equal(rendered.background, 'rgb(255, 153, 0)');
  assert.equal(rendered.size, '18px');
  assert.equal(rendered.big, '22px');
  assert.equal(rendered.italic, 'italic');
  assert.equal(rendered.strike, 'line-through');
  assert.equal(rendered.underline, 'underline');
  assert.ok(Number(rendered.weight) >= 700);

  await page.locator('.ck-toolbar').screenshot({ path: '/opt/cursor/artifacts/screenshots/editor-toolbar.png' });
  await page.locator('[data-cke-tooltip-text="글자 색깔"]').click();
  const colorPanel = page.locator('.ck-dropdown__panel-visible');
  await colorPanel.waitFor();
  await colorPanel.screenshot({ path: '/opt/cursor/artifacts/screenshots/editor-colors.png' });
} finally {
  await browser.close();
  server.close();
}

console.log('editor round-trip tests passed');
