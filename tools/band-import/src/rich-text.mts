/**
 * Band 본문의 글자색과 굵게를 오고피씽 community_photos.content(HTML)로 옮긴다.
 *
 * 앱 상세 화면은 content를 걸러 내지 않고 그대로 innerHTML로 그리므로, 여기서 만든 HTML에는
 * <b>, </b>, <br>, <span style="color:#rrggbb">(아래 팔레트 색만), </span> 외에는 아무것도 들어가지 않는다.
 * 나머지 태그는 모두 버리고(글자는 남김) 글자는 모두 이스케이프한다.
 */

/**
 * Band 웹(boot.bundle.js 2026-10 기준)의 band:color 값 → 화면 색.
 * color12는 기본색(색 없음)이다.
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

export type RawContent = {
  /** band: API의 content(band:color 같은 Band 마크업), dom: 화면 본문의 innerHTML */
  format: 'band' | 'dom';
  html: string;
};

export type Run = { text: string; bold: boolean; color: string | null };

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

/** 색을 지정했으면 팔레트 색 또는 null(색 없음). 색 지정이 없으면 undefined */
function declaredColor(style: string | null, fontColor: string | null): string | null | undefined {
  const m = style ? /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style) : null;
  if (m) return paletteColor(m[1].replace(/!important/i, ''));
  if (fontColor) return paletteColor(fontColor);
  return undefined;
}

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;

/** 본문을 줄 단위 글자 조각으로 나눈다 */
export function parseRichContent(raw: RawContent): Run[][] {
  let src = raw.html.replace(/\r\n?/g, '\n');
  // Band는 첨부(사진, 동영상 등) 자리를 본문에 태그로 남긴다. 앞뒤 줄바꿈 하나와 함께 없앤다
  src = src.replace(/(\n)?<band:attachment\b(?:[^>"']|"[^"]*"|'[^']*')*>(?:\s*<\/band:attachment>)?(\n)?/gi, (_m, a, b) => (a && b ? '\n' : ''));
  // 화면 본문은 줄바꿈이 <br>이고, 태그 사이의 줄바꿈 문자는 화면에 보이는 줄바꿈이 아닐 수도 있다
  const literalNewlines = raw.format === 'band' || !/<br\b/i.test(src);

  type Frame = { name: string; bold: boolean; color: string | null | undefined };
  const stack: Frame[] = [];
  const lines: Run[][] = [[]];
  let skip: string | null = null;
  const bold = () => stack.some((f) => f.bold);
  const color = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].color !== undefined) return stack[i].color ?? null;
    return null;
  };
  const newline = () => lines.push([]);
  const pushText = (text: string) => {
    const parts = text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) newline();
      if (part) lines[lines.length - 1].push({ text: part, bold: bold(), color: color() });
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
    const frame: Frame = { name, bold: name === 'b' || name === 'strong', color: undefined };
    if (name === 'band:color') {
      const value = (attr(attrs, 'value') ?? '').trim().toLowerCase();
      frame.color = BAND_COLORS[value] ?? null;
    } else if (name === 'span' || name === 'font') {
      const declared = declaredColor(attr(attrs, 'style'), name === 'font' ? attr(attrs, 'color') : null);
      if (declared !== undefined) frame.color = declared;
      if (/(?:^|;)\s*font-weight\s*:\s*(bold|[6-9]00)/i.test(attr(attrs, 'style') ?? '')) frame.bold = true;
    }
    stack.push(frame);
  }

  const cleaned = lines.map((runs) => {
    const merged: Run[] = [];
    for (const r of runs) {
      const text = r.text.replace(/\u00a0/g, ' ');
      const last = merged[merged.length - 1];
      if (last && last.bold === r.bold && last.color === r.color) last.text += text;
      else merged.push({ ...r, text });
    }
    // 줄 끝 공백 정리
    while (merged.length) {
      const last = merged[merged.length - 1];
      last.text = last.text.replace(/[ \t]+$/, '');
      if (last.text) break;
      merged.pop();
    }
    return merged;
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
  return lines.some((l) => l.some((r) => r.text.trim() && (r.bold || r.color)));
}

export function renderRuns(lines: Run[][]): string {
  return lines
    .map((line) =>
      line
        .map((r) => {
          let html = escapeHtml(r.text);
          if (r.bold) html = `<b>${html}</b>`;
          if (r.color && PALETTE.has(r.color)) html = `<span style="color:${r.color}">${html}</span>`;
          return html;
        })
        .join(''),
    )
    .join('<br>');
}

const SAFE_TAG = /<(?:b|\/b|br|\/span|span style="color:#[0-9a-f]{6}")>/g;

/** 허용한 태그 말고는 <, >가 하나도 남지 않았는지 마지막으로 확인한다 */
export function assertSafeHtml(html: string): string {
  const rest = html.replace(SAFE_TAG, '');
  if (/[<>]/.test(rest)) throw new Error('본문 서식 변환 결과가 안전하지 않습니다');
  for (const m of html.matchAll(/<span style="color:(#[0-9a-f]{6})">/g)) {
    if (!PALETTE.has(m[1])) throw new Error('본문 서식 변환 결과가 안전하지 않습니다');
  }
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
export function normalizeEditorHtml(html: string): FormattedBody {
  const lines = parseRichContent({ format: 'dom', html });
  const text = lines.map(lineText).join('\n');
  if (!hasFormatting(lines)) return { html: null, text };
  return { html: assertSafeHtml(renderRuns(lines)), text };
}

export function formattedBody(raw: RawContent | null | undefined, titles: string[]): FormattedBody {
  if (!raw || !raw.html) return { html: null, text: '' };
  const lines = parseRichContent(raw);
  const wanted = new Set(titles.map((t) => t.trim()).filter(Boolean));
  if (lines.length && wanted.has(lineText(lines[0]).trim())) {
    lines.shift();
    while (lines.length && lines[0].length === 0) lines.shift();
  }
  const text = lines.map(lineText).join('\n');
  if (!hasFormatting(lines)) return { html: null, text };
  return { html: assertSafeHtml(renderRuns(lines)), text };
}
