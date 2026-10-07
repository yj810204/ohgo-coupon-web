import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { normalizeApiPost, normalizeDomSnapshot } from '../src/normalize.mts';
import { assertSafeHtml, formattedBody, normalizeEditorHtml, paletteColor, parseRichContent } from '../src/rich-text.mts';
import type { RawContent } from '../src/rich-text.mts';

const band = (html: string): RawContent => ({ format: 'band', html });
const dom = (html: string): RawContent => ({ format: 'dom', html });
const html = (raw: RawContent, titles: string[] = []) => formattedBody(raw, titles).html;

// ---------- Band 마크업(API content) ----------
const BAND = [
  '오늘 감성돔 조황입니다',
  '<band:color value="color02">감성돔 4수</band:color> <b>대박</b> 났습니다',
  '<band:attachment type="photo" id="P1" />',
  '<band:color value="color07"><b>굵은 파랑</b></band:color> 그리고 <band:size value="xl">큰 글씨</band:size>',
  '',
  '',
  '',
  '<i>기울임</i> <u>밑줄</u> <band:refer user_no="1">@선장</band:refer>',
  '<band:attachment type="video" id="V1" />',
  '<band:hashtag id="1">#낫개</band:hashtag> <band:hashtag id="2">#감성돔</band:hashtag>',
].join('\n');
assert.equal(
  html(band(BAND), ['오늘 감성돔 조황입니다']),
  [
    '<p><span style="color:#ff3445;">감성돔 4수</span> <strong>대박</strong> 났습니다</p>',
    '<p><span style="color:#18b2fa;"><strong>굵은 파랑</strong></span> 그리고 <span style="font-size:22px;">큰 글씨</span></p>',
    '<p>&nbsp;</p>',
    '<p><i>기울임</i> <u>밑줄</u> @선장</p>',
    '<p>#낫개 #감성돔</p>',
  ].join(''),
  '첨부는 줄과 함께 없애고, 빈 줄은 하나로, 해시태그는 글자로, 크기와 기울임과 밑줄은 CKEditor 태그로',
);
assert.equal(formattedBody(band(BAND), ['오늘 감성돔 조황입니다']).text, '감성돔 4수 대박 났습니다\n굵은 파랑 그리고 큰 글씨\n\n기울임 밑줄 @선장\n#낫개 #감성돔');
assert.ok(html(band(BAND))!.startsWith('<p>오늘 감성돔 조황입니다</p>'), '제목과 다르면 첫 줄을 남긴다');
assert.equal(html(band('<band:color value="color12">기본색</band:color> <b>x</b>')), '<p>기본색 <strong>x</strong></p>', 'color12는 기본색');
assert.equal(html(band('<band:color value="color99">모르는 색</band:color> <b>x</b>')), '<p>모르는 색 <strong>x</strong></p>', '모르는 값은 색 없이');
assert.equal(html(band('<band:color value="COLOR05">초록</band:color>')), '<p><span style="color:#00c73c;">초록</span></p>');
assert.equal(html(band('<band:color value="color01">바깥 <band:color value="color08">안쪽</band:color> 다시</band:color>')), '<p><span style="color:#ff3692;">바깥 </span><span style="color:#4f77fd;">안쪽</span><span style="color:#ff3692;"> 다시</span></p>');
assert.equal(html(band('<b>굵게<band:color value="color03">주황</band:color></b>')), '<p><strong>굵게</strong><span style="color:#ff540b;"><strong>주황</strong></span></p>');
assert.equal(html(band('그냥 글\n#해시')), null, '서식이 없으면 content를 쓰지 않는다');
assert.equal(html(band('<b>  </b>글')), null, '공백만 굵게면 서식 없음');
assert.equal(html(band('A &amp; B &lt;3 <b>x</b>')), '<p>A &amp; B &lt;3 <strong>x</strong></p>', '글자는 다시 이스케이프');
assert.equal(html(band('<b>줄\n바꿈</b>')), '<p><strong>줄</strong></p><p><strong>바꿈</strong></p>');
assert.equal(html(band('사진 앞<band:attachment type="photo" id="P2"/>사진 뒤 <b>x</b>')), '<p>사진 앞사진 뒤 <strong>x</strong></p>');
assert.equal(html(band('<i>기울임</i> <em>또</em>')), '<p><i>기울임</i> <i>또</i></p>');
assert.equal(html(band('<del>취소</del> <strike>선</strike> <s>s</s>')), '<p><s>취소</s> <s>선</s> <s>s</s></p>');
assert.equal(html(band('<band:size value="L">크게</band:size> <band:size value="M">보통</band:size> <band:size value="xl">더</band:size>')), '<p><span style="font-size:18px;">크게</span> 보통 <span style="font-size:22px;">더</span></p>');
assert.equal(html(band('<band:bgcolor value="color04"><band:color value="color02"><b><i><u><del>모두</del></u></i></b></band:color></band:bgcolor>')), '<p><span style="background-color:#ff9900;color:#ff3445;"><i><s><strong><u>모두</u></strong></s></i></span></p>');
assert.equal(html(band('<band:bgcolor value="color99">x</band:bgcolor><b>y</b>')), '<p>x<strong>y</strong></p>', '모르는 배경색은 버린다');

// ---------- 화면(DOM) innerHTML ----------
const DOM = [
  '오늘 조황<br>',
  '<span style="color: rgb(255, 54, 146);">분홍 글씨</span><br>',
  '<strong>굵게</strong> <b>또 굵게</b><br>',
  '<span style="color:#123456">팔레트 밖 색</span><br>',
  '<span style="font-size:22px">큰 글씨</span><br><br><br>',
  '<a href="/band/88348442/hashtag/낫개" class="hashtag">#낫개</a>\n',
  '<div class="dPostAttach"><img src="https://x/a.jpg"></div>',
].join('');
assert.equal(
  html(dom(DOM), ['오늘 조황']),
  [
    '<p><span style="color:#ff3692;">분홍 글씨</span></p>',
    '<p><strong>굵게</strong> <strong>또 굵게</strong></p>',
    '<p>팔레트 밖 색</p>',
    '<p><span style="font-size:22px;">큰 글씨</span></p>',
    '<p>&nbsp;</p>',
    '<p>#낫개</p>',
  ].join(''),
);
assert.equal(html(dom('<p>첫 문단 <b>굵게</b></p><p>둘째 문단</p>')), '<p>첫 문단 <strong>굵게</strong></p><p>둘째 문단</p>');
assert.equal(html(dom('줄바꿈이\n글자로만 <b>있는</b> 화면')), '<p>줄바꿈이</p><p>글자로만 <strong>있는</strong> 화면</p>', '<br>이 없으면 줄바꿈 문자를 쓴다');
assert.equal(html(dom('태그 사이\n<br>줄바꿈 <b>x</b>')), '<p>태그 사이</p><p>줄바꿈 <strong>x</strong></p>', '<br>이 있으면 태그 사이 줄바꿈 문자는 빈칸');
assert.equal(html(dom('<span style="background-color: rgb(255, 153, 0); font-style: italic; text-decoration: underline line-through;">형광</span>')), '<p><span style="background-color:#ff9900;"><i><s><u>형광</u></s></i></span></p>');
assert.equal(html(dom('<span style="font-size:18px">열여덟</span> <span style="font-size:14px">버림</span>')), '<p><span style="font-size:18px;">열여덟</span> 버림</p>');
assert.equal(paletteColor('rgb(0, 199, 60)'), '#00c73c');
assert.equal(paletteColor('#4F77FD'), '#4f77fd');
assert.equal(paletteColor('rgba(0, 199, 60, 0.5)'), null, '반투명은 다른 색');
assert.equal(paletteColor('red'), null);

// ---------- XSS ----------
const ATTACKS = [
  '<script>alert(1)</script><b>굵게</b>',
  '<SCRIPT type="text/javascript">document.cookie</SCRIPT><b>x</b>',
  '<img src=x onerror=alert(1)><b>x</b>',
  '<img src="x" onerror="alert(1)"/><b>x</b>',
  '<a href="javascript:alert(1)">눌러</a><b>x</b>',
  '<a href="java&#115;cript:alert(1)" onclick="alert(2)">눌러</a><b>x</b>',
  '<b onclick="alert(1)" style="x:expression(alert(1))">x</b>',
  '<band:color value=\'color01" onmouseover="alert(1)\'>x</band:color><b>y</b>',
  '<band:color value="color01" onmouseover="alert(1)">x</band:color>',
  '<span style="color:#ff3692;background:url(javascript:alert(1))">x</span>',
  '<span style="color:#ff3692&quot; onmouseover=&quot;alert(1)">x</span><b>y</b>',
  '<span style="color:expression(alert(1))">x</span><b>y</b>',
  '&lt;script&gt;alert(1)&lt;/script&gt;<b>x</b>',
  '&#60;img src=x onerror=alert(1)&#62;<b>x</b>',
  '<scr<script>ipt>alert(1)</scr</script>ipt><b>x</b>',
  '<img src=x onerror=alert(1)//<b>x</b>',
  '<<b>>x</b>',
  '<svg><script>alert(1)</script></svg><b>x</b>',
  '<svg onload=alert(1)><b>x</b>',
  '<iframe src="javascript:alert(1)"></iframe><b>x</b>',
  '<style>*{background:url(javascript:alert(1))}</style><b>x</b>',
  '<!--<img src=x onerror=alert(1)>--><b>x</b>',
  '<b>"\'`=</b><b>x</b>',
  '<textarea><img src=x onerror=alert(1)></textarea><b>x</b>',
  '<b>x</b><img src=x onerror=alert(1)',
  '<a href="data:text/html,<script>alert(1)</script>">x</a><b>y</b>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math><b>y</b>',
  '<form action="javascript:alert(1)"><input type=submit></form><b>y</b>',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)"><b>y</b>',
  '<base href="javascript:alert(1)//"><b>y</b>',
  '<b>&#0;&#xD800;&#x110000;</b>',
];
for (const attack of ATTACKS) {
  for (const raw of [band(attack), dom(attack)]) {
    const out = formattedBody(raw, []).html ?? '';
    assert.doesNotThrow(() => assertSafeHtml(out), attack);
    assert.ok(!/<(?!\/?(?:p|strong|i|u|s)>|\/span>|span style="(?:background-color:#[0-9a-f]{6};)?(?:color:#[0-9a-f]{6};)?(?:font-size:(?:18|22)px;)?")/.test(out), `${attack} → ${out}`);
    for (const tag of out.match(/<[^>]*>/g) ?? []) assert.ok(!/javascript:|\bon\w+|expression\(|url\(/i.test(tag), `태그 안에 위험한 값 없음: ${tag}`);
  }
}
assert.equal(html(band('<script>alert(1)</script><b>굵게</b>')), '<p><strong>굵게</strong></p>', 'script는 글자까지 버린다');
assert.equal(html(band('<a href="javascript:alert(1)">눌러</a><b>x</b>')), '<p>눌러<strong>x</strong></p>', '링크는 글자만');
assert.equal(html(band('&lt;script&gt;alert(1)&lt;/script&gt;<b>x</b>')), '<p>&lt;script&gt;alert(1)&lt;/script&gt;<strong>x</strong></p>', '글자로 쓴 태그는 글자로');
assert.equal(html(band('<span style="color:#ff3692;background:url(javascript:alert(1))">x</span>')), '<p><span style="color:#ff3692;">x</span></p>', '색만 남긴다');
assert.equal(html(band('<band:color value=\'color01" onmouseover="alert(1)\'>x</band:color><b>y</b>')), '<p>x<strong>y</strong></p>');
assert.equal(html(band('<b>x</b><img src=x onerror=alert(1)')), '<p><strong>x</strong>&lt;img src=x onerror=alert(1)</p>', '닫히지 않은 태그는 글자로');
assert.throws(() => assertSafeHtml('<img src=x>'), /안전하지 않습니다/);
assert.throws(() => assertSafeHtml('<span style="color:#123456;">x</span>'), /안전하지 않습니다/);
assert.throws(() => assertSafeHtml('<b onclick=x>'), /안전하지 않습니다/);
assert.throws(() => assertSafeHtml('<span style="color:#ff3692">x</span>'), /안전하지 않습니다/);
assert.throws(() => assertSafeHtml('<span style="color:#ff3692;background:url(javascript:alert(1));">x</span>'), /안전하지 않습니다/);
assert.equal(assertSafeHtml('<p><strong>x</strong></p><p><span style="color:#ff3692;">y</span></p>'), '<p><strong>x</strong></p><p><span style="color:#ff3692;">y</span></p>');

assert.equal(normalizeEditorHtml('<span style="color:#4f77fd"><b>감성돔</b></span><div>다음 줄</div>').html, '<p><span style="color:#4f77fd;"><strong>감성돔</strong></span></p><p>다음 줄</p>');
assert.equal(normalizeEditorHtml('<font color="#ff3445">빨강</font>').html, '<p><span style="color:#ff3445;">빨강</span></p>');
assert.equal(normalizeEditorHtml('<span style="color:#4f77fd">바깥 <font color="#1a1d1f">색 없음</font></span>').html, '<p><span style="color:#4f77fd;">바깥 </span>색 없음</p>');
assert.equal(normalizeEditorHtml('<img src=x onerror=alert(1)>안녕<script>bad</script>').html, null);
assert.equal(normalizeEditorHtml('<img src=x onerror=alert(1)>안녕<script>bad</script>').text, '안녕');

// 아무렇게나 섞은 조각으로도 허용한 태그 밖의 것이 나오지 않는다
const PIECES = ['<', '>', '"', "'", '=', '/', 'b', 'i', 'u', 'del', 'span', 'script', 'img', ' onerror=', 'style=', 'color:#ff3692', 'background-color:#ff9900', 'javascript:', '&lt;', '&#60;', '<b>', '</b>', '<band:color value="color01">', '</band:color>', '<band:bgcolor value="color04">', '<band:size value="xl">', '<br>', '\n', '가', '<!--', '-->'];
let seed = 7;
const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
const fuzz: string[] = [];
for (let i = 0; i < 3000; i++) {
  const s = Array.from({ length: 1 + rand(14) }, () => PIECES[rand(PIECES.length)]).join('') + '<b>x</b>';
  fuzz.push(s);
  for (const raw of [band(s), dom(s)]) assert.doesNotThrow(() => formattedBody(raw, []), s);
}

// ---------- 실제 브라우저에서 그려 보면 허용한 태그 말고는 생기지 않는다 ----------
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const outputs = [...ATTACKS, ...fuzz.slice(0, 500), BAND, DOM].flatMap((a) => [band(a), dom(a)]).map((raw) => formattedBody(raw, []).html ?? '');
  const bad = await page.evaluate((outputs) => {
    const found: string[] = [];
    const styleOk = /^(?:background-color:#[0-9a-f]{6};)?(?:color:#[0-9a-f]{6};)?(?:font-size:(?:18|22)px;)?$/;
    for (const h of outputs) {
      const div = document.createElement('div');
      div.innerHTML = h;
      for (const el of Array.from(div.querySelectorAll('*'))) {
        const tag = el.tagName;
        const attrs = Array.from(el.attributes).map((a) => `${a.name}=${a.value}`);
        const style = el.getAttribute('style') ?? '';
        const ok = (['P', 'STRONG', 'I', 'U', 'S'].includes(tag) && attrs.length === 0) || (tag === 'SPAN' && attrs.length === 1 && styleOk.test(style) && style !== '');
        if (!ok) found.push(`${h} → <${tag} ${attrs.join(' ')}>`);
      }
    }
    return found;
  }, outputs);
  assert.deepEqual(bad, []);

  // 앱과 같은 classic 빌드, 그리고 글자색 플러그인이 있는 41.4.2 빌드에 넣어 getData()로 확인한다
  const roundTrip = async (script: string, globalName: string, html: string, config: Record<string, unknown>) => {
    const editorPage = await browser.newPage();
    await editorPage.addScriptTag({ path: script });
    const data = await editorPage.evaluate(
      async ({ html, globalName, config }) => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        const Editor = (window as unknown as Record<string, { create: (el: HTMLElement, config: unknown) => Promise<{ setData: (html: string) => void; getData: () => string; destroy: () => Promise<void> }> }>)[globalName];
        const editor = await Editor.create(el, config);
        editor.setData(html);
        const out = editor.getData();
        await editor.destroy();
        return out;
      },
      { html, globalName, config },
    );
    await editorPage.close();
    return data;
  };
  const styled = html(band('<band:bgcolor value="color04"><band:color value="color02"><b><i><u><del>모두</del></u></i></b></band:color></band:bgcolor>\n<band:size value="l">큰글</band:size>\n\n보통 <i>기울임</i>'))!;
  const root = new URL('../../../', import.meta.url);
  const classic = new URL('node_modules/@ckeditor/ckeditor5-build-classic/build/ckeditor.js', root).pathname;
  const documentEditor = new URL('node_modules/@ckeditor/ckeditor5-build-decoupled-document/build/ckeditor.js', root).pathname;
  assert.equal(
    await roundTrip(classic, 'ClassicEditor', styled, {}),
    '<p><i><strong>모두</strong></i></p><p>큰글</p><p>&nbsp;</p><p>보통 <i>기울임</i></p>',
    '앱 classic 빌드는 굵게와 기울임, 문단만 남긴다',
  );
  assert.equal(
    await roundTrip(documentEditor, 'DecoupledEditor', styled, { fontSize: { options: [18, 22] } }),
    styled,
    '글자색, 배경색, 밑줄, 취소선, 글자 크기 플러그인이 있으면 getData()가 그대로다',
  );
} finally {
  await browser.close();
}

// ---------- 가져오기 결과에 원래 본문을 남긴다 ----------
const api = normalizeApiPost({ post_no: 1, content: '<b>굵게</b>\n<band:attachment type="photo" id="P1" />', attachment: {} });
assert.deepEqual(api.rawContent, { format: 'band', html: '<b>굵게</b>\n<band:attachment type="photo" id="P1" />' });
assert.equal(api.body, '굵게', '분류와 일정 읽기에 쓰는 평문은 그대로');
const fromDom = normalizeDomSnapshot({ author: null, createdText: null, bodyText: '굵게', bodyHtml: '<b>굵게</b>', imageUrls: [] });
assert.deepEqual(fromDom.rawContent, { format: 'dom', html: '<b>굵게</b>' });
assert.equal(normalizeDomSnapshot({ author: null, createdText: null, bodyText: 'x', imageUrls: [] }).rawContent, null);
assert.equal(parseRichContent(band('')).length, 0);

console.log('band-import rich text tests passed');
