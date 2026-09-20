import { getSettingsValue, setSettingsValue } from '@/lib/settings-store';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export type BoardCategoryScope = 'qna' | 'faq' | 'market';

export interface BoardCategory {
  id: string;
  label: string;
  order: number;
  isActive: boolean;
}

const SETTINGS_KEY: Record<BoardCategoryScope, string> = {
  qna: 'qna_categories',
  faq: 'faq_categories',
  market: 'market_categories',
};

export const DEFAULT_MARKET_CATEGORIES: BoardCategory[] = [
  { id: 'rod', label: '낚싯대', order: 0, isActive: true },
  { id: 'reel', label: '릴', order: 1, isActive: true },
  { id: 'lure', label: '루어·채비', order: 2, isActive: true },
  { id: 'line', label: '라인·훅', order: 3, isActive: true },
  { id: 'etc', label: '기타', order: 4, isActive: true },
];

export const DEFAULT_QNA_CATEGORIES: BoardCategory[] = [
  { id: 'gear', label: '장비', order: 0, isActive: true },
  { id: 'rig', label: '채비', order: 1, isActive: true },
  { id: 'spot', label: '포인트', order: 2, isActive: true },
  { id: 'trip', label: '출조', order: 3, isActive: true },
  { id: 'etc', label: '기타', order: 4, isActive: true },
];

export const DEFAULT_FAQ_CATEGORIES: BoardCategory[] = [
  { id: 'prep', label: '출조 준비', order: 0, isActive: true },
  { id: 'boat', label: '선상 팁', order: 1, isActive: true },
  { id: 'faq', label: '자주 묻는 질문', order: 2, isActive: true },
  { id: 'etc', label: '기타', order: 3, isActive: true },
];

const DEFAULTS: Record<BoardCategoryScope, BoardCategory[]> = {
  qna: DEFAULT_QNA_CATEGORIES,
  faq: DEFAULT_FAQ_CATEGORIES,
  market: DEFAULT_MARKET_CATEGORIES,
};

const labelCache: Record<BoardCategoryScope, Map<string, string>> = {
  qna: new Map(DEFAULT_QNA_CATEGORIES.map((item) => [item.id, item.label])),
  faq: new Map(DEFAULT_FAQ_CATEGORIES.map((item) => [item.id, item.label])),
  market: new Map(DEFAULT_MARKET_CATEGORIES.map((item) => [item.id, item.label])),
};

function rememberLabels(scope: BoardCategoryScope, items: BoardCategory[]) {
  const map = new Map<string, string>();
  for (const item of items) {
    if (item.id && item.label) map.set(item.id, item.label);
  }
  labelCache[scope] = map;
}

function normalizeItems(raw: unknown, fallback: BoardCategory[]): BoardCategory[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : null;
  if (!list) return fallback.map((item) => ({ ...item }));

  const items = list
    .map((row, index) => {
      if (!row || typeof row !== 'object') return null;
      const item = row as Partial<BoardCategory>;
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      const label = typeof item.label === 'string' ? item.label.trim() : '';
      if (!id || !label) return null;
      return {
        id,
        label,
        order: typeof item.order === 'number' ? item.order : index,
        isActive: item.isActive !== false,
      } satisfies BoardCategory;
    })
    .filter((item): item is BoardCategory => Boolean(item))
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index }));

  return items.length > 0 ? items : fallback.map((item) => ({ ...item }));
}

export function createCategoryId(): string {
  return `cat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeCategoryId(raw: string): string {
  return raw.trim().replace(/\s+/g, '-');
}

export async function reassignCategorySlug(
  scope: BoardCategoryScope,
  fromId: string,
  toId: string
): Promise<void> {
  if (!fromId || !toId || fromId === toId) return;
  const supabase = getSupabaseBrowserClient();
  if (scope === 'market') {
    const { error } = await supabase.from('market_listings').update({ category: toId }).eq('category', fromId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('community_photos')
    .update({ category: toId })
    .eq('board_type', scope)
    .eq('category', fromId);
  if (error) throw error;
}

export async function getBoardCategories(
  scope: BoardCategoryScope,
  options?: { includeInactive?: boolean }
): Promise<BoardCategory[]> {
  const stored = await getSettingsValue<unknown>(SETTINGS_KEY[scope], null);
  const items = normalizeItems(stored, DEFAULTS[scope]);
  rememberLabels(scope, items);
  if (options?.includeInactive) return items;
  return items.filter((item) => item.isActive);
}

export async function saveBoardCategories(
  scope: BoardCategoryScope,
  items: BoardCategory[]
): Promise<BoardCategory[]> {
  const normalized = items
    .map((item, index) => ({
      id: item.id.trim(),
      label: item.label.trim(),
      order: index,
      isActive: item.isActive !== false,
    }))
    .filter((item) => item.id && item.label);
  if (normalized.length === 0) {
    throw new Error('카테고리를 1개 이상 남겨 주세요.');
  }
  await setSettingsValue(SETTINGS_KEY[scope], { items: normalized });
  rememberLabels(scope, normalized);
  return normalized;
}

export function categoryLabel(
  scope: BoardCategoryScope,
  categoryId?: string | null,
  items?: BoardCategory[]
): string {
  if (!categoryId) return '';
  if (items) {
    return items.find((item) => item.id === categoryId)?.label || categoryId;
  }
  return labelCache[scope].get(categoryId) || categoryId;
}

export function activeOrFallback(
  items: BoardCategory[],
  currentId?: string
): string {
  if (currentId && items.some((item) => item.id === currentId)) return currentId;
  return items.find((item) => item.isActive)?.id || items[0]?.id || 'etc';
}
