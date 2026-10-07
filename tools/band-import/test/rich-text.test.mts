import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { normalizeApiPost, normalizeDomSnapshot } from '../src/normalize.mts';
import { assertSafeHtml, BAND_COLORS, formattedBody, normalizeEditorHtml, paletteColor, parseRichContent } from '../src/rich-text.mts';
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
    '<span style="color:#ff3445">감성돔 4수</span> <b>대박</b> 났습니다',
    '<span style="color:#18b2fa"><b>굵은 파랑</b></span> 그리고 큰 글씨',
    '',
    '기울임 밑줄 @선장',
    '#낫개 #감성돔',
  ].join('<br>'),
  '첨부는 줄과 함께 없애고, 빈 줄은 하나로, 해시태그는 글자로, 크기/기울임/밑줄은 글자만',
);
assert.equal(formattedBody(band(BAND), ['오늘 감성돔 조황입니다']).text, '감성돔 4수 대박 났습니다\n굵은 파랑 그리고 큰 글씨\n\n기울임 밑줄 @선장\n#낫개 #감성돔');
assert.ok(html(band(BAND))!.startsWith('오늘 감성돔 조황입니다<br>'), '제목과 다르면 첫 줄을 남긴다');
assert.equal(html(band('<band:color value="color12">기본색</band:color> <b>x</b>')), '기본색 <b>x</b>', 'color12는 기본색');
assert.equal(html(band('<band:color value="color99">모르는 색</band:color> <b>x</b>')), '모르는 색 <b>x</b>', '모르는 값은 색 없이');
assert.equal(html(band('<band:color value="COLOR05">초록</band:color>')), '<span style="color:#00c73c">초록</span>');
assert.equal(html(band('<band:color value="color01">바깥 <band:color value="color08">안쪽</band:color> 다시</band:color>')), '<span style="color:#ff3692">바깥 </span><span style="color:#4f77fd">안쪽</span><span style="color:#ff3692"> 다시</span>');
assert.equal(html(band('<b>굵게<band:color value="color03">주황</band:color></b>')), '<b>굵게</b><span style="color:#ff540b"><b>주황</b></span>');
assert.equal(html(band('그냥 글\n#해시')), null, '서식이 없으면 content를 쓰지 않는다');
assert.equal(html(band('<b>  </b>글')), null, '공백만 굵게면 서식 없음');
assert.equal(html(band('A &amp; B &lt;3 <b>x</b>')), 'A &amp; B &lt;3 <b>x</b>', '글자는 다시 이스케이프');
assert.equal(html(band('<b>줄\n바꿈</b>')), '<b>줄</b><br><b>바꿈</b>');
assert.equal(html(band('사진 앞<band:attachment type="photo" id="P2"/>사진 뒤 <b>x</b>')), '사진 앞사진 뒤 <b>x</b>');

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
  '<span style="color:#ff3692">분홍 글씨</span><br><b>굵게</b> <b>또 굵게</b><br>팔레트 밖 색<br>큰 글씨<br><br>#낫개',
);
assert.equal(html(dom('<p>첫 문단 <b>굵게</b></p><p>둘째 문단</p>')), '첫 문단 <b>굵게</b><br>둘째 문단');
assert.equal(html(dom('줄바꿈이\n글자로만 <b>있는</b> 화면')), '줄바꿈이<br>글자로만 <b>있는</b> 화면', '<br>이 없으면 줄바꿈 문자를 쓴다');
assert.equal(html(dom('태그 사이\n<br>줄바꿈 <b>x</b>')), '태그 사이<br>줄바꿈 <b>x</b>', '<br>이 있으면 태그 사이 줄바꿈 문자는 빈칸');
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
    assert.ok(!/<(?!\/?b>|br>|\/span>|span style="color:#[0-9a-f]{6}">)/.test(out), `${attack} → ${out}`);
    for (const tag of out.match(/<[^>]*>/g) ?? []) assert.ok(!/javascript:|\bon\w+|expression\(|url\(/i.test(tag), `태그 안에 위험한 값 없음: ${tag}`);
  }
}
assert.equal(html(band('<script>alert(1)</script><b>굵게</b>')), '<b>굵게</b>', 'script는 글자까지 버린다');
assert.equal(html(band('<a href="javascript:alert(1)">눌러</a><b>x</b>')), '눌러<b>x</b>', '링크는 글자만');
assert.equal(html(band('&lt;script&gt;alert(1)&lt;/script&gt;<b>x</b>')), '&lt;script&gt;alert(1)&lt;/script&gt;<b>x</b>', '글자로 쓴 태그는 글자로');
assert.equal(html(band('<span style="color:#ff3692;background:url(javascript:alert(1))">x</span>')), '<span style="color:#ff3692">x</span>', '색만 남긴다');
assert.equal(html(band('<band:color value=\'color01" onmouseover="alert(1)\'>x</band:color><b>y</b>')), 'x<b>y</b>');
assert.equal(html(band('<b>x</b><img src=x onerror=alert(1)')), '<b>x</b>&lt;img src=x onerror=alert(1)', '닫히지 않은 태그는 글자로');
assert.throws(() => assertSafeHtml('<img src=x>'), /안전하지 않습니다/);
assert.throws(() => assertSafeHtml('<span style="color:#123456">x</span>'), /안전하지 않습니다/);
assert.throws(() => assertSafeHtml('<b onclick=x>'), /안전하지 않습니다/);
assert.equal(assertSafeHtml('<b>x</b><br><span style="color:#ff3692">y</span>'), '<b>x</b><br><span style="color:#ff3692">y</span>');

assert.equal(normalizeEditorHtml('<span style="color:#4f77fd"><b>감성돔</b></span><div>다음 줄</div>').html, '<span style="color:#4f77fd"><b>감성돔</b></span><br>다음 줄');
assert.equal(normalizeEditorHtml('<font color="#ff3445">빨강</font>').html, '<span style="color:#ff3445">빨강</span>');
assert.equal(normalizeEditorHtml('<span style="color:#4f77fd">바깥 <font color="#1a1d1f">색 없음</font></span>').html, '<span style="color:#4f77fd">바깥 </span>색 없음');
assert.equal(normalizeEditorHtml('<img src=x onerror=alert(1)>안녕<script>bad</script>').html, null);
assert.equal(normalizeEditorHtml('<img src=x onerror=alert(1)>안녕<script>bad</script>').text, '안녕');

// 아무렇게나 섞은 조각으로도 허용한 태그 밖의 것이 나오지 않는다
const PIECES = ['<', '>', '"', "'", '=', '/', 'b', 'span', 'script', 'img', ' onerror=', 'style=', 'color:#ff3692', 'javascript:', '&lt;', '&#60;', '<b>', '</b>', '<band:color value="color01">', '</band:color>', '<br>', '\n', '가', '<!--', '-->'];
let seed = 7;
const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
const fuzz: string[] = [];
for (let i = 0; i < 3000; i++) {
  const s = Array.from({ length: 1 + rand(14) }, () => PIECES[rand(PIECES.length)]).join('') + '<b>x</b>';
  fuzz.push(s);
  for (const raw of [band(s), dom(s)]) assert.doesNotThrow(() => formattedBody(raw, []), s);
}

// ---------- 실제 브라우저에서 그려 보면 b, br, 색 span 말고는 생기지 않는다 ----------
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const outputs = [...ATTACKS, ...fuzz.slice(0, 500), BAND, DOM].flatMap((a) => [band(a), dom(a)]).map((raw) => formattedBody(raw, []).html ?? '');
  const palette = Object.values(BAND_COLORS);
  const bad = await page.evaluate(
    ({ outputs, palette }) => {
      const found: string[] = [];
      const allowed = palette.map((hex) => `color: rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)});`);
      for (const h of outputs) {
        const div = document.createElement('div');
        div.innerHTML = h;
        for (const el of Array.from(div.querySelectorAll('*'))) {
          const tag = el.tagName;
          const attrs = Array.from(el.attributes).map((a) => a.name);
          const ok =
            ((tag === 'B' || tag === 'BR') && attrs.length === 0) ||
            (tag === 'SPAN' && attrs.length === 1 && attrs[0] === 'style' && allowed.includes((el as HTMLElement).style.cssText));
          if (!ok) found.push(`${h} → <${tag} ${attrs.join(' ')}> ${(el as HTMLElement).style?.cssText ?? ''}`);
        }
      }
      return found;
    },
    { outputs, palette },
  );
  assert.deepEqual(bad, []);
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
