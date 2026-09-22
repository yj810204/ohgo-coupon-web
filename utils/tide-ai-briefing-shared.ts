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

/** Firestore setDoc은 undefined를 거절한다. null도 쓰지 않는다. */
export function omitUndefinedNull<T extends object>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined && value !== null),
  ) as T;
}

export function normalizeTideAiBriefingInput(raw: TideAiBriefingInput): TideAiBriefingInput & { date: string } {
  const date = typeof raw.date === 'string' ? raw.date.trim() : '';
  const markdown = cleanText(raw.markdown, MAX_MARKDOWN);
  const parsed = parseBriefingMarkdown(markdown);
  const title = cleanText(raw.title, 80);
  return omitUndefinedNull({
    date,
    summary: cleanText(raw.summary) || parsed.summary,
    rig: cleanText(raw.rig) || parsed.rig,
    operation: cleanText(raw.operation) || parsed.operation,
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
  const parsed = parseBriefingMarkdown(markdown);
  const briefing = toTideAiBriefing(
    {
      date,
      summary: cleanText(row.summary) || parsed.summary,
      rig: cleanText(row.rig) || parsed.rig,
      operation: cleanText(row.operation) || parsed.operation,
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
