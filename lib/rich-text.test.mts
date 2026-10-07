import assert from 'node:assert/strict';
import { sanitizeRichHtml, storedRichText, toEditorHtml } from './rich-text.ts';

const IMPORTED = [
  '<p><span style="background-color:#ff9900;color:#ff3445;font-size:18px;"><i><s><strong><u>모두</u></strong></s></i></span></p>',
  '<p><span style="font-size:22px;">큰 글씨</span></p>',
  '<p>&nbsp;</p>',
  '<p>보통 <i>기울임</i></p>',
].join('');

assert.equal(sanitizeRichHtml(IMPORTED), IMPORTED, '가져온 서식 HTML은 그대로 남는다');
assert.equal(sanitizeRichHtml('그냥 글\n둘째 줄'), '그냥 글\n둘째 줄', '태그가 없는 예전 글은 그대로');
assert.equal(sanitizeRichHtml('<p>안녕</p>'), '<p>안녕</p>');
assert.equal(sanitizeRichHtml('<p><strong>굵게</strong> <i>기울임</i> <a href="https://ohgo.kr/a">링크</a></p>'), '<p><strong>굵게</strong> <i>기울임</i> <a href="https://ohgo.kr/a">링크</a></p>');
assert.equal(sanitizeRichHtml('<p><b>예전 굵게</b></p>'), '<p><b>예전 굵게</b></p>');

assert.equal(sanitizeRichHtml('<p>글</p><script>alert(1)</script>'), '<p>글</p>', 'script는 글자까지 버린다');
assert.equal(sanitizeRichHtml('<p onclick="alert(1)">글</p>'), '<p>글</p>');
assert.equal(sanitizeRichHtml('<a href="javascript:alert(1)">눌러</a><b>x</b>'), '<a>눌러</a><b>x</b>');
assert.equal(sanitizeRichHtml('<img src=x onerror=alert(1)><p>남음</p>'), '<img><p>남음</p>');
assert.equal(sanitizeRichHtml('<span style="color:#ff3445;background:url(javascript:alert(1))">색</span>'), '<span style="color:#ff3445;">색</span>');
assert.equal(sanitizeRichHtml('<span style="font-size:99px;color:#ff3692;">글</span>'), '<span style="color:#ff3692;">글</span>', '팔레트 밖 크기는 버린다');
assert.equal(sanitizeRichHtml('<iframe src="https://evil.test"></iframe><p>글</p>'), '<p>글</p>');
assert.equal(storedRichText('<script>alert(1)</script>'), '');
assert.equal(toEditorHtml('첫째\n\n둘째'), '<p>첫째</p><p>둘째</p>');
assert.equal(toEditorHtml(IMPORTED), IMPORTED);

console.log('rich text sanitizer tests passed');
