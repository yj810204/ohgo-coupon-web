function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
  return isEmptyRichText(value) ? '' : value.trim();
}

/** 예전 줄바꿈 글을 에디터에 넣을 때 줄바꿈을 유지한다. */
export function toEditorHtml(value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (isRichHtml(value)) return value;
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
