function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** CKEditor가 만든 HTML인지. 예전 일반 글은 태그가 없다. */
export function isRichHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(value);
}

export function htmlToPlainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isEmptyRichText(value: string): boolean {
  return htmlToPlainText(value).length === 0;
}

export function storedRichText(value: string): string {
  const cleaned = sanitizeRichHtml(value);
  return isEmptyRichText(cleaned) ? '' : cleaned.trim();
}

/** 예전 줄바꿈 글을 에디터에 넣을 때 줄바꿈을 유지한다. */
export function toEditorHtml(value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (isRichHtml(value)) return sanitizeRichHtml(value);
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'noscript',
  'template', 'textarea', 'select', 'form', 'link', 'meta', 'base', 'title', 'head',
]);
const ALLOWED = new Set([
  'p', 'br', 'strong', 'b', 'i', 'em', 'u', 's', 'del', 'strike', 'span', 'a',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'figure', 'figcaption', 'img', 'hr',
]);
const VOID = new Set(['br', 'img', 'hr', 'col']);
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
const TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[code.toLowerCase()] ?? '';
  });
}

function escapeText(text: string): string {
  return escapeHtml(decodeEntities(text)).replace(/\u00a0/g, '&nbsp;');
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : null;
}

function safeColor(value: string): string | null {
  const v = value.trim().replace(/\s+/g, '');
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return v.toLowerCase();
  if (/^(?:rgb|rgba|hsl|hsla)\([0-9.%,/]+\)$/i.test(v)) return v.toLowerCase();
  if (v.toLowerCase() === 'transparent') return 'transparent';
  return null;
}

function safeStyle(style: string): string | null {
  const kept: string[] = [];
  for (const part of style.split(';')) {
    const cut = part.indexOf(':');
    if (cut <= 0) continue;
    const key = part.slice(0, cut).trim().toLowerCase();
    const raw = part.slice(cut + 1).trim();
    if (!key || !raw || /expression|url\s*\(|javascript:|@import|behavior|-moz-binding/i.test(raw)) continue;
    if (key === 'color' || key === 'background-color') {
      const color = safeColor(raw);
      if (color) kept.push(`${key}:${color}`);
    } else if (key === 'font-size' && /^(?:18|22)px$/i.test(raw.replace(/\s+/g, ''))) {
      kept.push(`font-size:${raw.replace(/\s+/g, '').toLowerCase()}`);
    } else if (key === 'text-align' && /^(?:left|right|center|justify)$/i.test(raw)) {
      kept.push(`text-align:${raw.toLowerCase()}`);
    } else if ((key === 'width' || key === 'height') && /^[\d.]+(?:px|%)$/i.test(raw.replace(/\s+/g, ''))) {
      kept.push(`${key}:${raw.replace(/\s+/g, '').toLowerCase()}`);
    }
  }
  return kept.length ? `${kept.join(';')};` : null;
}

function safeUrl(value: string): string | null {
  const v = value.trim();
  if (!v || /[\u0000-\u001f]/.test(v)) return null;
  if (/^(?:javascript|data|vbscript):/i.test(v)) return null;
  if (/^(?:https?:|mailto:|tel:)/i.test(v)) return v;
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  if (v.startsWith('#') && !/[<>"]/.test(v)) return v;
  return null;
}

function safeAttrs(name: string, attrs: string): string {
  const out: string[] = [];
  const style = safeStyle(attr(attrs, 'style') ?? '');
  if (style) out.push(`style="${escapeHtml(style)}"`);
  if (name === 'a') {
    const href = safeUrl(attr(attrs, 'href') ?? '');
    if (href) out.push(`href="${escapeHtml(href)}"`);
    if ((attr(attrs, 'target') ?? '').toLowerCase() === '_blank') out.push('target="_blank" rel="noopener noreferrer"');
  } else if (name === 'img') {
    const src = safeUrl(attr(attrs, 'src') ?? '');
    if (src) out.push(`src="${escapeHtml(src)}"`);
    const alt = attr(attrs, 'alt');
    if (alt != null) out.push(`alt="${escapeHtml(alt)}"`);
  } else if (name === 'td' || name === 'th') {
    for (const key of ['colspan', 'rowspan']) {
      const n = attr(attrs, key);
      if (n && /^[1-9]\d*$/.test(n)) out.push(`${key}="${n}"`);
    }
  }
  return out.length ? ` ${out.join(' ')}` : '';
}

/**
 * 글 HTML에서 스크립트, 이벤트, javascript: 주소를 빼고
 * 글자색, 배경색, 18px, 22px와 편집기가 쓰는 태그만 남긴다.
 * 태그가 없는 예전 글은 그대로 둔다.
 */
export function sanitizeRichHtml(value: string): string {
  if (!value || !isRichHtml(value)) return value;
  const src = value.replace(/\r\n?/g, '\n');
  let skip: string | null = null;
  let html = '';
  const stack: string[] = [];
  for (const m of src.matchAll(TOKEN)) {
    const [whole, closing, rawName, attrs = ''] = m;
    if (whole.startsWith('<!--')) continue;
    if (!rawName) {
      if (!skip) html += escapeText(whole);
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
    if (!ALLOWED.has(name)) continue;
    if (closing) {
      const at = stack.lastIndexOf(name);
      if (at >= 0) {
        while (stack.length > at) {
          html += `</${stack.pop()}>`;
        }
      }
      continue;
    }
    const selfClose = VOID.has(name) || /\/\s*$/.test(attrs);
    html += `<${name}${safeAttrs(name, attrs)}>`;
    if (!selfClose) stack.push(name);
  }
  while (stack.length) html += `</${stack.pop()}>`;
  return html;
}
