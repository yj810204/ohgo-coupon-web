import { createAdminClient } from '@/lib/supabase/admin';
import {
  briefingFromUnknown,
  TIDE_AI_BRIEFING_COLLECTION,
  type TideAiBriefing,
} from '@/utils/tide-ai-briefing-shared';

function mapRow(row: Record<string, unknown> | null): TideAiBriefing | null {
  if (!row) return null;
  return briefingFromUnknown({
    date: row.date,
    summary: row.summary,
    rig: row.rig,
    operation: row.operation,
    markdown: row.markdown,
    species: row.species,
    title: row.title,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  });
}

export async function getTideAiBriefing(date: string): Promise<TideAiBriefing | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(TIDE_AI_BRIEFING_COLLECTION)
    .select('date, summary, rig, operation, markdown, species, title, published_at, updated_at')
    .eq('date', date)
    .maybeSingle();
  if (error) throw error;
  return mapRow((data as Record<string, unknown> | null) ?? null);
}

export async function publishTideAiBriefing(briefing: TideAiBriefing): Promise<TideAiBriefing> {
  const supabase = createAdminClient();
  const existing = await getTideAiBriefing(briefing.date);
  const publishedAt = existing?.publishedAt || briefing.publishedAt;
  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from(TIDE_AI_BRIEFING_COLLECTION)
    .upsert({
      date: briefing.date,
      summary: briefing.summary,
      rig: briefing.rig,
      operation: briefing.operation,
      markdown: briefing.markdown,
      species: briefing.species,
      title: briefing.title ?? null,
      published_at: publishedAt,
      updated_at: updatedAt,
    })
    .select('date, summary, rig, operation, markdown, species, title, published_at, updated_at')
    .single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>) ?? { ...briefing, publishedAt, updatedAt };
}
