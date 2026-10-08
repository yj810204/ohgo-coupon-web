/**
 * Band 본문 서식을 오고피씽 community_photos.content(HTML)로 옮긴다.
 *
 * 앱 상세 화면은 content를 걸러 내지 않고 그대로 innerHTML로 그린다.
 * 여기서 만든 HTML은 CKEditor 5가 같은 서식을 다시 저장할 때 쓰는 모양이다.
 *   <p>, <strong>, <i>, <s>, <u>,
 *   <span style="background-color:#rrggbb;color:#rrggbb;font-size:18px|22px;">
 * 색은 Band 팔레트 11색만, 글자 크기는 18px(l)과 22px(xl)만 둔다.
 * 그 밖의 태그와 속성은 버리고 글자는 모두 이스케이프한다.
 *
 * 앱이 쓰는 classic 빌드(41)는 <p>, <strong>, <i>만 유지한다.
 * 글자색, 배경색, 밑줄, 취소선, 글자 크기는 글 화면에는 보이지만,
 * 수정 화면의 에디터가 플러그인을 갖기 전에는 저장할 때 빠진다.
 */

/**
 * Band 웹(boot.bundle.js 2026-10-07)의 band:color 값 → 화면 색.
 * color12는 기본색(색 없음)이다. 배경색 태그(band:bgcolor)는 이 스크립트에 없고,
 * 화면 HTML의 background-color가 같은 색표에 있을 때만 남긴다.
 */
export const BAND_COLORS: Record<string, string> = {
  color01: '#ff3692',
  color02: '#ff3445',
  color03: '#ff540b',
  color04: '#ff9900',
  color05: '#00c73c',
  color06: '#00c4a1',
  color07: '#18b2fa',
  color08: '#4f77fd',
  color09: '#7e5bff',
  color10: '#909090',
  color11: '#56616a',
};
const PALETTE = new Set(Object.values(BAND_COLORS));

/** band:size value. l은 18px, xl은 22px. M과 그 밖은 기본 크기 */
export const BAND_FONT_SIZE: Record<string, string> = { l: '18px', xl: '22px' };
const SIZES = new Set(Object.values(BAND_FONT_SIZE));

export type RawContent = {
  /** band: API의 content(band:color 같은 Band 마크업), dom: 화면 본문의 innerHTML */
  format: 'band' | 'dom';
  html: string;
};

export type Run = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null;
  background: string | null;
  size: string | null;
};

/** 글자와 함께 버리는 태그 */
const DROP_WITH_CONTENT = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'svg', 'math', 'textarea', 'select', 'title', 'head']);
const BLOCK = new Set(['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre']);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : null;
}

/** "#FF3692", "ff3692", "rgb(255, 54, 146)" → 팔레트에 정확히 있는 색이면 "#ff3692" */
export function paletteColor(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v in BAND_COLORS) return BAND_COLORS[v];
  let hex: string | null = null;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(?:1|1\.0+)\s*)?\)$/.exec(v);
  if (rgb) hex = `#${rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`;
  else if (/^#?[0-9a-f]{6}$/.test(v)) hex = v.startsWith('#') ? v : `#${v}`;
  else if (/^#?[0-9a-f]{3}$/.test(v)) hex = `#${[...v.replace('#', '')].map((c) => c + c).join('')}`;
  return hex && PALETTE.has(hex) ? hex : null;
}

function styleDecl(style: string, prop: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(style);
  return m ? m[1].replace(/!important/i, '').trim() : null;
}

function fontSize(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v in BAND_FONT_SIZE) return BAND_FONT_SIZE[v];
  const px = /^(\d+(?:\.\d+)?)\s*px$/.exec(v);
  const size = px ? `${Number(px[1])}px` : null;
  return size && SIZES.has(size) ? size : null;
}

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;

type Frame = {
  name: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null | undefined;
  background: string | null | undefined;
  size: string | null | undefined;
};

function sameStyle(a: Run, b: Run): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.strike === b.strike && a.color === b.color && a.background === b.background && a.size === b.size;
}

const HANGUL_SYLLABLE = /^[가-힣]$/;

function hasHangul(token: string | undefined): boolean {
  return !!token && /[가-힣]/.test(token);
}

/**
 * 한 글자 한글이 공백 하나로만 이어진 구간을 붙인다.
 * 세 글자 이상은 `사 이 즈` → `사이즈`.
 * 두 글자는 `선 장 010`처럼 앞뒤에 다른 한글 단어가 없을 때만 `선장`으로 붙인다.
 * `팔레트 밖 색`, `수고 많으셨습니다`는 그대로 둔다.
 */
export function collapseHangulTracking(line: string): string {
  const parts = line.split(/(\s+)/);
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    if (!HANGUL_SYLLABLE.test(parts[i] ?? '')) {
      out.push(parts[i] ?? '');
      i += 1;
      continue;
    }
    let j = i;
    const syllables = [parts[j]];
    while (j + 2 < parts.length && parts[j + 1] === ' ' && HANGUL_SYLLABLE.test(parts[j + 2] ?? '')) {
      syllables.push(parts[j + 2]);
      j += 2;
    }
    const prev = i >= 2 ? parts[i - 2] : '';
    const next = j + 2 < parts.length ? parts[j + 2] : '';
    const isolatedPair = syllables.length === 2 && !hasHangul(prev) && !hasHangul(next);
    if (syllables.length >= 3 || isolatedPair) {
      out.push(syllables.join(''));
      i = j + 1;
    } else {
      out.push(parts[i] ?? '');
      i += 1;
    }
  }
  return out.join('');
}

/** 글자마다 나뉜 조각 사이에 낀 공백 하나도 같은 방식으로 붙인다 */
function collapseTrackingRuns(runs: Run[]): Run[] {
  const expanded = runs
    .map((run) => ({ ...run, text: collapseHangulTracking(run.text.replace(/\u00a0/g, ' ')) }))
    .filter((run) => run.text);
  const out: Run[] = [];
  let i = 0;
  while (i < expanded.length) {
    const cur = expanded[i];
    if (!HANGUL_SYLLABLE.test(cur.text)) {
      out.push(cur);
      i += 1;
      continue;
    }
    let j = i;
    const group = [cur];
    while (
      j + 2 < expanded.length &&
      expanded[j + 1].text === ' ' &&
      HANGUL_SYLLABLE.test(expanded[j + 2].text) &&
      sameStyle(cur, expanded[j + 2])
    ) {
      group.push(expanded[j + 2]);
      j += 2;
    }
    const prev = i >= 2 ? expanded[i - 2].text : '';
    const next = j + 2 < expanded.length ? expanded[j + 2].text : '';
    const isolatedPair = group.length === 2 && !hasHangul(prev) && !hasHangul(next);
    if (group.length >= 3 || isolatedPair) {
      out.push({ ...cur, text: group.map((run) => run.text).join('') });
      i = j + 1;
    } else {
      out.push(cur);
      i += 1;
    }
  }
  return out;
}

const HASHTAG_TOKEN = /#([^\s#\[\],]+)/g;

/** 글 안의 `#조황`을 태그 이름으로 빼고, 빈 대괄호와 남은 공백을 정리한다 */
function takeHashtags(text: string): { text: string; hashtags: string[] } {
  if (!text.includes('#')) return { text, hashtags: [] };
  const hashtags: string[] = [];
  const stripped = text.replace(HASHTAG_TOKEN, (_whole, tag: string) => {
    hashtags.push(tag);
    return '';
  });
  if (!hashtags.length) return { text, hashtags: [] };
  return { text: stripped.replace(/\[\s*\]/g, '').replace(/[ \t]{2,}/g, ' '), hashtags };
}

function rememberTags(into: string[], seen: Set<string>, tags: string[]) {
  for (const tag of tags) {
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    into.push(tag);
  }
}

/** 본문에 있는 해시태그를 빼고 태그로 모은다. 같은 줄의 다른 글자는 남긴다 */
export function peelHashtags(text: string): { text: string; hashtags: string[] } {
  const hashtags: string[] = [];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const line of text.split('\n')) {
    const taken = takeHashtags(line);
    rememberTags(hashtags, seen, taken.hashtags);
    if (!taken.hashtags.length) {
      kept.push(line);
      continue;
    }
    const cleaned = taken.text.trim();
    if (cleaned) kept.push(cleaned);
  }
  return { text: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(), hashtags };
}

function splitHashtagLines(lines: Run[][]): { lines: Run[][]; hashtags: string[] } {
  const hashtags: string[] = [];
  const seen = new Set<string>();
  const kept: Run[][] = [];
  for (const line of lines) {
    if (!line.length) {
      kept.push(line);
      continue;
    }
    const next: Run[] = [];
    for (const run of line) {
      const taken = takeHashtags(run.text);
      rememberTags(hashtags, seen, taken.hashtags);
      if (!taken.hashtags.length) {
        next.push(run);
        continue;
      }
      if (taken.text) next.push({ ...run, text: taken.text });
    }
    if (next.length) {
      next[0] = { ...next[0], text: next[0].text.replace(/^[ \t]+/, '') };
      const last = next.length - 1;
      next[last] = { ...next[last], text: next[last].text.replace(/[ \t]+$/, '') };
      if (!next[0].text) next.shift();
      if (next.length && !next[next.length - 1].text) next.pop();
    }
    if (next.length) kept.push(next);
  }
  while (kept.length && kept[kept.length - 1].length === 0) kept.pop();
  while (kept.length && kept[0].length === 0) kept.shift();
  return { lines: kept, hashtags };
}

/** 본문을 줄 단위 글자 조각으로 나눈다 */
export function parseRichContent(raw: RawContent): Run[][] {
  let src = raw.html.replace(/\r\n?/g, '\n');
  // Band는 첨부(사진, 동영상 등) 자리를 본문에 태그로 남긴다. 앞뒤 줄바꿈 하나와 함께 없앤다
  src = src.replace(/(\n)?<band:attachment\b(?:[^>"']|"[^"]*"|'[^']*')*>(?:\s*<\/band:attachment>)?(\n)?/gi, (_m, a, b) => (a && b ? '\n' : ''));
  // 화면 본문은 줄바꿈이 <br>이고, 태그 사이의 줄바꿈 문자는 화면에 보이는 줄바꿈이 아닐 수도 있다
  const literalNewlines = raw.format === 'band' || !/<br\b/i.test(src);

  const stack: Frame[] = [];
  const lines: Run[][] = [[]];
  let skip: string | null = null;
  const flag = (key: 'bold' | 'italic' | 'underline' | 'strike') => stack.some((f) => f[key]);
  const inherit = (key: 'color' | 'background' | 'size') => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i][key] !== undefined) return stack[i][key] ?? null;
    return null;
  };
  const newline = () => lines.push([]);
  const pushText = (text: string) => {
    const parts = text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) newline();
      if (part) {
        lines[lines.length - 1].push({
          text: part,
          bold: flag('bold'),
          italic: flag('italic'),
          underline: flag('underline'),
          strike: flag('strike'),
          color: inherit('color'),
          background: inherit('background'),
          size: inherit('size'),
        });
      }
    });
  };

  for (const m of src.matchAll(TOKEN)) {
    const [whole, closing, rawName, attrs = ''] = m;
    if (whole.startsWith('<!--')) continue;
    if (!rawName) {
      if (skip) continue;
      const text = decodeEntities(whole);
      pushText(literalNewlines ? text : text.replace(/\n/g, ' '));
      continue;
    }
    const name = rawName.toLowerCase();
    if (skip) {
      if (closing && name === skip) skip = null;
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) {
      if (!closing && !/\/\s*$/.test(attrs)) skip = name;
      continue;
    }
    if (name === 'br') {
      newline();
      continue;
    }
    if (closing) {
      const at = stack.map((f) => f.name).lastIndexOf(name);
      if (at >= 0) stack.splice(at);
      if (BLOCK.has(name) && lines[lines.length - 1].length) newline();
      continue;
    }
    if (BLOCK.has(name) && lines[lines.length - 1].length) newline();
    if (/\/\s*$/.test(attrs) || name === 'img' || name === 'hr' || name === 'input' || name === 'wbr') continue;
    const frame: Frame = { name, bold: name === 'b' || name === 'strong', italic: name === 'i' || name === 'em', underline: name === 'u', strike: name === 's' || name === 'del' || name === 'strike', color: undefined, background: undefined, size: undefined };
    if (name === 'band:color' || name === 'band:bgcolor') {
      const value = (attr(attrs, 'value') ?? '').trim().toLowerCase();
      frame[name === 'band:color' ? 'color' : 'background'] = BAND_COLORS[value] ?? null;
    } else if (name === 'band:size') {
      frame.size = fontSize((attr(attrs, 'value') ?? '').trim().toLowerCase());
    }
    const style = attr(attrs, 'style');
    if (style) {
      const declared = styleDecl(style, 'color');
      if (declared) frame.color = paletteColor(declared);
      const bgDeclared = styleDecl(style, 'background-color') ?? styleDecl(style, 'background');
      if (bgDeclared) frame.background = paletteColor(bgDeclared);
      const size = fontSize(styleDecl(style, 'font-size'));
      if (size) frame.size = size;
      if (/(?:^|;)\s*font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) frame.bold = true;
      if (/(?:^|;)\s*font-style\s*:\s*italic/i.test(style)) frame.italic = true;
      const deco = styleDecl(style, 'text-decoration') ?? styleDecl(style, 'text-decoration-line');
      if (deco && !/none/i.test(deco)) {
        if (/underline/i.test(deco)) frame.underline = true;
        if (/line-through/i.test(deco)) frame.strike = true;
      }
    }
    if (name === 'font') {
      const raw = attr(attrs, 'color');
      if (raw) frame.color = paletteColor(raw);
    }
    stack.push(frame);
  }

  const cleaned = lines.map((runs) => {
    const merged: Run[] = [];
    for (const r of runs) {
      const text = r.text.replace(/\u00a0/g, ' ');
      const last = merged[merged.length - 1];
      if (last && sameStyle(last, r)) last.text += text;
      else merged.push({ ...r, text });
    }
    // 줄 끝 공백 정리
    while (merged.length) {
      const last = merged[merged.length - 1];
      last.text = last.text.replace(/[ \t]+$/, '');
      if (last.text) break;
      merged.pop();
    }
    return collapseTrackingRuns(merged);
  });
  const out: Run[][] = [];
  for (const line of cleaned) {
    const blank = line.length === 0;
    if (blank && (out.length === 0 || out[out.length - 1].length === 0)) continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1].length === 0) out.pop();
  return out;
}

export function lineText(line: Run[]): string {
  return line.map((r) => r.text).join('');
}

export function hasFormatting(lines: Run[][]): boolean {
  return lines.some((l) => l.some((r) => r.text.trim() && (r.bold || r.italic || r.underline || r.strike || r.color || r.background || r.size)));
}

/** CKEditor 5 getData()와 같은 감싸기 순서: span, i, s, strong, u */
function renderRun(r: Run): string {
  let html = escapeHtml(r.text);
  if (r.underline) html = `<u>${html}</u>`;
  if (r.bold) html = `<strong>${html}</strong>`;
  if (r.strike) html = `<s>${html}</s>`;
  if (r.italic) html = `<i>${html}</i>`;
  const style: string[] = [];
  if (r.background && PALETTE.has(r.background)) style.push(`background-color:${r.background}`);
  if (r.color && PALETTE.has(r.color)) style.push(`color:${r.color}`);
  if (r.size && SIZES.has(r.size)) style.push(`font-size:${r.size}`);
  if (style.length) html = `<span style="${style.join(';')};">${html}</span>`;
  return html;
}

export function renderRuns(lines: Run[][]): string {
  return lines.map((line) => (line.length ? `<p>${line.map(renderRun).join('')}</p>` : '<p>&nbsp;</p>')).join('');
}

const SAFE_TAG = /<(?:p|\/p|strong|\/strong|i|\/i|u|\/u|s|\/s|\/span|span style="([^"]*)")>/g;

function isSafeStyle(style: string): boolean {
  if (!style.endsWith(';')) return false;
  const parts = style.slice(0, -1).split(';');
  if (!parts.length || parts.some((p) => !p || /\s/.test(p))) return false;
  let prev = '';
  const seen = new Set<string>();
  for (const part of parts) {
    const cut = part.indexOf(':');
    if (cut <= 0) return false;
    const key = part.slice(0, cut);
    const value = part.slice(cut + 1);
    if (seen.has(key) || key <= prev) return false;
    prev = key;
    seen.add(key);
    if ((key === 'color' || key === 'background-color') && PALETTE.has(value)) continue;
    if (key === 'font-size' && SIZES.has(value)) continue;
    return false;
  }
  return true;
}

/** 허용한 태그 말고는 <, >가 하나도 남지 않았는지 마지막으로 확인한다 */
export function assertSafeHtml(html: string): string {
  const rest = html.replace(SAFE_TAG, (whole, style: string | undefined) => {
    if (whole.startsWith('<span') && !isSafeStyle(style ?? '')) return whole;
    return '';
  });
  if (/[<>]/.test(rest)) throw new Error('본문 서식 변환 결과가 안전하지 않습니다');
  return html;
}

export type FormattedBody = {
  /** community_photos.content에 넣을 HTML. 서식이 하나도 없으면 null */
  html: string | null;
  /** 같은 내용의 평문(확인용) */
  text: string;
};

/**
 * 조황 게시판 내용으로 쓸 서식 HTML. 제목으로 쓴 첫 줄은 description과 똑같이 뺀다.
 * titles: 첫 줄이 이것 중 하나와 같으면 뺀다
 */
/** 편집창 HTML을 앱에 넣을 수 있는 글자색·굵게만 남긴다. 나머지 태그는 글자만 남기고 버린다 */
export function normalizeEditorHtml(html: string): FormattedBody & { hashtags: string[] } {
  const split = splitHashtagLines(parseRichContent({ format: 'dom', html }));
  const text = split.lines.map(lineText).join('\n');
  if (!hasFormatting(split.lines)) return { html: null, text, hashtags: split.hashtags };
  return { html: assertSafeHtml(renderRuns(split.lines)), text, hashtags: split.hashtags };
}

export function formattedBody(raw: RawContent | null | undefined, titles: string[]): FormattedBody {
  if (!raw || !raw.html) return { html: null, text: '' };
  const lines = parseRichContent(raw);
  const wanted = new Set(titles.map((t) => t.trim()).filter(Boolean));
  if (lines.length && wanted.has(lineText(lines[0]).trim())) {
    lines.shift();
    while (lines.length && lines[0].length === 0) lines.shift();
  }
  const split = splitHashtagLines(lines);
  const text = split.lines.map(lineText).join('\n');
  if (!hasFormatting(split.lines)) return { html: null, text };
  return { html: assertSafeHtml(renderRuns(split.lines)), text };
}
