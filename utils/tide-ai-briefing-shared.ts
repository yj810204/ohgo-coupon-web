import { parseTripSpecies } from '@/lib/tide-fish-recommend';

export const TIDE_AI_BRIEFING_COLLECTION = 'tide_ai_briefings';
export const TIDE_BRIEFING_TITLE = 'AI 출조 브리핑';
export const TIDE_BRIEFING_ONPAGE_FOOTER = '전날 저녁에 게시된 AI 출조 브리핑입니다.';
export const TIDE_BRIEFING_EMPTY = '전날 저녁 브리핑이 올라오면 여기에 표시됩니다.';
export const TIDE_BRIEFING_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_TEXT = 12_000;
const MAX_MARKDOWN = 24_000;

export type TideAiBriefing = {
  date: string;
  summary: string;
  rig: string;
  operation: string;
  markdown: string;
  species: string[];
  title?: string;
  publishedAt: string;
  updatedAt: string;
};

export type TideAiBriefingInput = {
  date: string;
  summary?: string;
  rig?: string;
  operation?: string;
  markdown?: string;
  species?: string[] | string;
  title?: string;
};

const HEADING_ALIASES: Record<'summary' | 'rig' | 'operation', string[]> = {
  summary: ['요약', '브리핑', '개요', '총평', '한줄', '한 줄'],
  rig: ['채비', '낚시채비', '장비'],
  operation: ['운용', '운영', '공략', '포인트', '흐름'],
};

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function cleanText(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== 'string') return '';
  return clip(value.replace(/\r\n/g, '\n').trim(), max);
}

function headingKind(title: string): 'summary' | 'rig' | 'operation' | null {
  const normalized = title.replace(/[#*_`[\]【】]/g, '').trim();
  for (const [kind, aliases] of Object.entries(HEADING_ALIASES) as Array<
    ['summary' | 'rig' | 'operation', string[]]
  >) {
    if (aliases.some((alias) => normalized === alias || normalized.startsWith(`${alias} `))) {
      return kind;
    }
  }
  return null;
}

/** `## 요약` / `【채비】` 같은 제목을 구조 필드로 나눈다. */
export function parseBriefingMarkdown(markdown: string): Pick<TideAiBriefing, 'summary' | 'rig' | 'operation'> {
  const text = cleanText(markdown, MAX_MARKDOWN);
  const empty = { summary: '', rig: '', operation: '' };
  if (!text) return empty;

  const lines = text.split('\n');
  const sections: Array<{ kind: 'summary' | 'rig' | 'operation'; body: string[] }> = [];
  let current: (typeof sections)[number] | null = null;

  for (const line of lines) {
    const heading =
      /^\s{0,3}#{1,3}\s+(.+)$/.exec(line) ??
      /^\s*【\s*(.+?)\s*】\s*$/.exec(line) ??
      /^\s*\*\*(.+?)\*\*\s*$/.exec(line);
    if (heading) {
      const kind = headingKind(heading[1] ?? '');
      if (kind) {
        current = { kind, body: [] };
        sections.push(current);
        continue;
      }
    }
    if (current) current.body.push(line);
  }

  if (sections.length === 0) {
    return { summary: text, rig: '', operation: '' };
  }

  const next = { ...empty };
  for (const section of sections) {
    const body = section.body.join('\n').trim();
    if (!next[section.kind]) next[section.kind] = body;
  }
  return next;
}

export function hasTideAiBriefingContent(
  value: Pick<TideAiBriefing, 'summary' | 'rig' | 'operation' | 'markdown'>,
): boolean {
  return Boolean(value.summary || value.rig || value.operation || value.markdown);
}

function hasOwn(raw: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(raw, key);
}

function readTextField(raw: TideAiBriefingInput, key: 'summary' | 'rig' | 'operation' | 'markdown'): string | undefined {
  if (!hasOwn(raw, key)) return undefined;
  return cleanText(raw[key], key === 'markdown' ? MAX_MARKDOWN : MAX_TEXT);
}

const SECTION_HEADING_RE = /^(요약|채비|운용|브리핑|개요|총평)$/;

function stripSectionHeadingMarks(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,3}\s+/, '')
    .replace(/^\s*【\s*(.+?)\s*】\s*$/, '$1')
    .replace(/^\s*\*\*(.+?)\*\*\s*$/, '$1')
    .replace(/^\s*__(.+?)__\s*$/, '$1')
    .replace(/^\s*<(?:u|b|strong|em)>(.+?)<\/(?:u|b|strong|em)>\s*$/i, '$1')
    .trim();
}

/** 카드에는 긴 글을 그대로 보여 주고, 칸 제목(요약·채비·운용)과 제목 마크만 걷어낸다. `**강조**`는 남긴다. */
export function formatBriefingProse(markdown: string): string {
  return cleanText(markdown, MAX_MARKDOWN)
    .replace(/^\s{0,3}#{1,3}\s+/gm, '')
    .replace(/^\s*【\s*(.+?)\s*】\s*$/gm, '$1')
    .split('\n')
    .filter((line) => !SECTION_HEADING_RE.test(stripSectionHeadingMarks(line)))
    .join('\n')
    .trim();
}

export const BRIEFING_HTML_TAGS = ['u', 'b', 'strong', 'em', 'br'] as const;
type BriefingHtmlTag = (typeof BRIEFING_HTML_TAGS)[number];

const BRIEFING_HTML_TAG_SET = new Set<string>(BRIEFING_HTML_TAGS);

export type BriefingMarkupNode =
  | { type: 'text'; text: string }
  | { type: 'br' }
  | { type: Exclude<BriefingHtmlTag, 'br'>; children: BriefingMarkupNode[] };

function isWrapperTag(name: string): name is Exclude<BriefingHtmlTag, 'br'> {
  return name === 'u' || name === 'b' || name === 'strong' || name === 'em';
}

/** `**굵게**`만 HTML로 바꾼다. 밑줄은 `<u>`를 쓴다. */
export function expandBriefingMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/**
 * 허용 태그만 남긴다: u, b, strong, em, br.
 * 속성·스크립트·링크·이미지는 버리고 안쪽 글만 살린다.
 */
export function parseBriefingMarkup(text: string): BriefingMarkupNode[] {
  const source = expandBriefingMarkdown(text);
  const root: BriefingMarkupNode[] = [];
  const stack: Array<{ type: Exclude<BriefingHtmlTag, 'br'>; children: BriefingMarkupNode[] }> = [];

  const current = () => (stack.length > 0 ? stack[stack.length - 1].children : root);
  const pushText = (value: string) => {
    if (value) current().push({ type: 'text', text: value });
  };

  const tagRe = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = tagRe.exec(source);
  while (match) {
    pushText(source.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;
    const closing = Boolean(match[1]);
    const name = match[2].toLowerCase();
    if (!BRIEFING_HTML_TAG_SET.has(name)) {
      match = tagRe.exec(source);
      continue;
    }
    if (name === 'br') {
      if (!closing) current().push({ type: 'br' });
      match = tagRe.exec(source);
      continue;
    }
    if (!isWrapperTag(name)) {
      match = tagRe.exec(source);
      continue;
    }
    if (closing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].type === name) {
          stack.length = index;
          break;
        }
      }
      match = tagRe.exec(source);
      continue;
    }
    const node = { type: name, children: [] as BriefingMarkupNode[] };
    current().push(node);
    stack.push(node);
    match = tagRe.exec(source);
  }
  pushText(source.slice(lastIndex));
  return root;
}

/** 테스트·간단 렌더용. 트리를 굵게/밑줄 플래그로 펼친다. */
export function parseBriefingEmphasis(text: string): Array<{ text: string; bold?: boolean; underline?: boolean }> {
  const parts: Array<{ text: string; bold?: boolean; underline?: boolean }> = [];
  const walk = (nodes: BriefingMarkupNode[], bold: boolean, underline: boolean) => {
    for (const node of nodes) {
      if (node.type === 'text') {
        const prev = parts[parts.length - 1];
        if (prev && Boolean(prev.bold) === bold && Boolean(prev.underline) === underline) {
          prev.text += node.text;
          continue;
        }
        const part: { text: string; bold?: boolean; underline?: boolean } = { text: node.text };
        if (bold) part.bold = true;
        if (underline) part.underline = true;
        parts.push(part);
        continue;
      }
      if (node.type === 'br') {
        parts.push({ text: '\n' });
        continue;
      }
      walk(node.children, bold || node.type === 'b' || node.type === 'strong', underline || node.type === 'u');
    }
  };
  walk(parseBriefingMarkup(text), false, false);
  return parts.length > 0 ? parts : [{ text }];
}

export type TideBriefingDisplaySection = {
  key: string;
  label: string;
  body: string;
};

/** markdown이 있으면 한 편의 긴 글로 보여 주고, 짧은 칸은 쓰지 않는다. */
export function briefingDisplaySections(briefing: TideAiBriefing): TideBriefingDisplaySection[] {
  const prose = formatBriefingProse(briefing.markdown);
  if (prose) {
    return [{ key: 'markdown', label: TIDE_BRIEFING_TITLE, body: prose }];
  }
  return [
    { key: 'summary', label: '요약', body: briefing.summary },
    { key: 'rig', label: '채비', body: briefing.rig },
    { key: 'operation', label: '운용', body: briefing.operation },
  ].filter((section) => section.body);
}

/** Firestore setDoc은 undefined를 거절한다. null도 쓰지 않는다. */
export function omitUndefinedNull<T extends object>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined && value !== null),
  ) as T;
}

export function normalizeTideAiBriefingInput(raw: TideAiBriefingInput): TideAiBriefingInput & { date: string } {
  const date = typeof raw.date === 'string' ? raw.date.trim() : '';
  const markdown = readTextField(raw, 'markdown') ?? '';
  const title = cleanText(raw.title, 80);
  function shortField(key: 'summary' | 'rig' | 'operation'): string {
    if (hasOwn(raw, key)) return cleanText(raw[key]);
    return '';
  }

  return omitUndefinedNull({
    date,
    summary: shortField('summary'),
    rig: shortField('rig'),
    operation: shortField('operation'),
    markdown,
    species: parseTripSpecies(raw.species ?? []),
    title: title || undefined,
  });
}

export function toTideAiBriefing(
  input: ReturnType<typeof normalizeTideAiBriefingInput>,
  timestamps?: { publishedAt?: string; updatedAt?: string },
): TideAiBriefing {
  const now = new Date().toISOString();
  const title = cleanText(input.title, 80);
  return omitUndefinedNull({
    date: input.date,
    summary: input.summary ?? '',
    rig: input.rig ?? '',
    operation: input.operation ?? '',
    markdown: input.markdown ?? '',
    species: input.species ?? [],
    title: title || undefined,
    publishedAt: timestamps?.publishedAt || now,
    updatedAt: timestamps?.updatedAt || now,
  });
}

export function toBriefingWritePayload(briefing: TideAiBriefing): Record<string, unknown> {
  return omitUndefinedNull({
    date: briefing.date,
    summary: briefing.summary ?? '',
    rig: briefing.rig ?? '',
    operation: briefing.operation ?? '',
    markdown: briefing.markdown ?? '',
    species: Array.isArray(briefing.species) ? briefing.species : [],
    title: cleanText(briefing.title, 80) || undefined,
    publishedAt: briefing.publishedAt,
    updatedAt: briefing.updatedAt,
  });
}

export function isTideAiBriefing(value: unknown): value is TideAiBriefing {
  if (!value || typeof value !== 'object') return false;
  const item = value as TideAiBriefing;
  return (
    TIDE_BRIEFING_DATE_RE.test(String(item.date ?? '')) &&
    typeof item.summary === 'string' &&
    typeof item.rig === 'string' &&
    typeof item.operation === 'string' &&
    typeof item.markdown === 'string' &&
    Array.isArray(item.species) &&
    item.species.every((name) => typeof name === 'string')
  );
}

export function briefingFromUnknown(value: unknown): TideAiBriefing | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const dateRaw = row.date ?? row.id;
  const date = typeof dateRaw === 'string' ? dateRaw.split('T')[0] : '';
  if (!TIDE_BRIEFING_DATE_RE.test(date)) return null;
  const markdown = cleanText(row.markdown, MAX_MARKDOWN);
  const briefing = toTideAiBriefing(
    {
      date,
      summary: cleanText(row.summary),
      rig: cleanText(row.rig),
      operation: cleanText(row.operation),
      markdown,
      species: parseTripSpecies((row.species as string[] | string | undefined) ?? []),
      title: cleanText(row.title, 80) || undefined,
    },
    omitUndefinedNull({
      publishedAt: cleanText(row.publishedAt ?? row.published_at, 40) || undefined,
      updatedAt: cleanText(row.updatedAt ?? row.updated_at, 40) || undefined,
    }),
  );
  return hasTideAiBriefingContent(briefing) ? briefing : null;
}
