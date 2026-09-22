import { DATA_SOURCE } from '@/lib/data-source';
import {
  hasTideAiBriefingContent,
  normalizeTideAiBriefingInput,
  TIDE_BRIEFING_DATE_RE,
  toTideAiBriefing,
  type TideAiBriefing,
  type TideAiBriefingInput,
} from '@/utils/tide-ai-briefing-shared';

type BriefingStore = {
  getTideAiBriefing(date: string): Promise<TideAiBriefing | null>;
  publishTideAiBriefing(briefing: TideAiBriefing): Promise<TideAiBriefing>;
};

export type {
  TideAiBriefing,
  TideAiBriefingInput,
} from '@/utils/tide-ai-briefing-shared';
export {
  briefingFromUnknown,
  hasTideAiBriefingContent,
  isTideAiBriefing,
  normalizeTideAiBriefingInput,
  omitUndefinedNull,
  parseBriefingMarkdown,
  briefingDisplaySections,
  formatBriefingProse,
  parseBriefingEmphasis,
  toBriefingWritePayload,
  TIDE_AI_BRIEFING_COLLECTION,
  TIDE_BRIEFING_DATE_RE,
  TIDE_BRIEFING_EMPTY,
  TIDE_BRIEFING_ONPAGE_FOOTER,
  TIDE_BRIEFING_TITLE,
} from '@/utils/tide-ai-briefing-shared';

export type TideAiBriefingStoreKind = 'firebase' | 'supabase' | 'file';

function hasFirebaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  );
}

function hasSupabaseAdmin(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function resolveTideAiBriefingStore(): TideAiBriefingStoreKind {
  const forced = process.env.TIDE_BRIEFING_STORE?.toLowerCase().trim();
  if (forced === 'firebase' || forced === 'supabase' || forced === 'file') return forced;

  if (DATA_SOURCE === 'firebase' && hasFirebaseConfig()) return 'firebase';
  if (DATA_SOURCE === 'supabase' && hasSupabaseAdmin()) return 'supabase';
  if (hasFirebaseConfig()) return 'firebase';
  if (hasSupabaseAdmin()) return 'supabase';
  if (process.env.NODE_ENV !== 'production') return 'file';
  throw new Error(
    'AI 출조 브리핑 저장소를 찾을 수 없습니다. NEXT_PUBLIC_DATA_SOURCE에 맞는 Firebase/Supabase 환경 변수를 확인하세요.',
  );
}

async function impl(): Promise<BriefingStore> {
  const store = resolveTideAiBriefingStore();
  if (store === 'firebase') return import('@/utils/tide-ai-briefing-service.firebase');
  if (store === 'supabase') return import('@/utils/tide-ai-briefing-service.supabase');
  return import('@/utils/tide-ai-briefing-service.file');
}

export async function getTideAiBriefing(date: string): Promise<TideAiBriefing | null> {
  if (!TIDE_BRIEFING_DATE_RE.test(date)) return null;
  return (await impl()).getTideAiBriefing(date);
}

export async function publishTideAiBriefing(raw: TideAiBriefingInput): Promise<TideAiBriefing> {
  const input = normalizeTideAiBriefingInput(raw);
  if (!TIDE_BRIEFING_DATE_RE.test(input.date)) {
    throw Object.assign(new Error('날짜가 올바르지 않습니다.'), { code: 'INVALID_DATE' });
  }
  if (!hasTideAiBriefingContent(toTideAiBriefing(input))) {
    throw Object.assign(new Error('요약·채비·운용 또는 markdown이 필요합니다.'), { code: 'EMPTY_BRIEFING' });
  }
  return (await impl()).publishTideAiBriefing(toTideAiBriefing(input));
}
