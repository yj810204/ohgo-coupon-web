import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import {
  parseBoardType,
  sortBoardList,
  COMMUNITY_POST_DELETED_MESSAGE,
  type CommunityBoardType,
  type CommunityPhoto,
} from '@/utils/community-service.shared';
import type { TripGuide } from '@/utils/trip-guide-shared';
import type { PublicCommunityCounts, PublicHomeFeed } from '@/lib/public-feed-types';

const LIST_COLUMNS =
  'id, image_urls, uploaded_by, uploaded_by_name, created_at, title, description, content, photo_date, template_id, comment_count, board_type, accepted_comment_id, category, is_notice';

const TRIP_COLUMNS =
  'id, date, destination, departure_time, return_time, species, capacity, price, notes, contact, created_at';

function anonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function kstYmd(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function weekRangeYmd(ymd: string): { start: string; end: string } {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (utc.getUTCDay() + 6) % 7;
  const start = new Date(utc);
  start.setUTCDate(utc.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

function mapPhoto(row: Record<string, unknown>): CommunityPhoto {
  const imageUrls = (row.image_urls as string[] | null) ?? undefined;
  const description = (row.description as string) ?? '';
  const content = row.content as string | undefined;
  const markedDeleted =
    row.is_deleted === true ||
    description === COMMUNITY_POST_DELETED_MESSAGE ||
    content === COMMUNITY_POST_DELETED_MESSAGE;
  return {
    photoId: row.id as string,
    imageUrl: imageUrls?.[0] ?? '',
    imageUrls,
    uploadedBy: (row.uploaded_by as string) ?? '',
    uploadedByName: (row.uploaded_by_name as string) ?? '',
    uploadedAt: row.created_at as string,
    title: (row.title as string) ?? '',
    description,
    content,
    photoDate: row.photo_date as string | undefined,
    templateId: row.template_id as string | undefined,
    commentCount: (row.comment_count as number) ?? 0,
    isDeleted: markedDeleted,
    boardType: parseBoardType(row.board_type),
    acceptedCommentId: (row.accepted_comment_id as string) || undefined,
    category: typeof row.category === 'string' && row.category.trim() ? row.category.trim() : undefined,
    isNotice: row.is_notice === true,
  };
}

function mapTrip(row: Record<string, unknown>): TripGuide {
  const date = row.date as string;
  return {
    id: row.id as string,
    date: typeof date === 'string' ? date.split('T')[0] : String(date),
    destination: (row.destination as string) ?? '',
    departureTime: (row.departure_time as string) ?? '',
    returnTime: (row.return_time as string) ?? undefined,
    species: (row.species as string) ?? undefined,
    capacity: row.capacity != null ? Number(row.capacity) : undefined,
    price: row.price != null ? Number(row.price) : undefined,
    notes: (row.notes as string) ?? undefined,
    contact: (row.contact as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

async function fetchBoard(
  supabase: SupabaseClient,
  boardType: CommunityBoardType,
  limitCount: number,
): Promise<CommunityPhoto[] | null> {
  const { data, error } = await supabase
    .from('community_photos')
    .select(LIST_COLUMNS)
    .eq('board_type', boardType)
    .order('is_notice', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limitCount);
  if (error) return null;
  return sortBoardList((data ?? []).map((row) => mapPhoto(row as Record<string, unknown>)));
}

async function loadHomeFeed(): Promise<PublicHomeFeed | null> {
  const supabase = anonClient();
  if (!supabase) return null;
  const ymd = kstYmd();
  const week = weekRangeYmd(ymd);
  const [photos, faq, qna, trips] = await Promise.all([
    fetchBoard(supabase, 'photo', 4),
    fetchBoard(supabase, 'faq', 3),
    fetchBoard(supabase, 'qna', 3),
    supabase
      .from('trip_guides')
      .select(TRIP_COLUMNS)
      .gte('date', week.start)
      .lte('date', week.end)
      .order('date', { ascending: true }),
  ]);
  if (!photos || !faq || !qna || trips.error) return null;
  return {
    photos,
    faq,
    qna,
    weekTrips: (trips.data ?? []).map((row) => mapTrip(row as Record<string, unknown>)),
  };
}

async function loadCommunityCounts(): Promise<PublicCommunityCounts | null> {
  const supabase = anonClient();
  if (!supabase) return null;
  const boards = ['photo', 'faq', 'qna'] as const;
  const counts = await Promise.all(
    boards.map(async (board) => {
      const { count, error } = await supabase
        .from('community_photos')
        .select('id', { count: 'exact', head: true })
        .eq('board_type', board);
      if (error) return null;
      return count ?? 0;
    }),
  );
  if (counts.some((count) => count == null)) return null;
  return { photos: counts[0]!, faq: counts[1]!, qna: counts[2]! };
}

async function loadMonthTrips(yearMonth: string): Promise<TripGuide[] | null> {
  const supabase = anonClient();
  if (!supabase) return null;
  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = `${yearMonth}-01`;
  const end = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('trip_guides')
    .select(TRIP_COLUMNS)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true });
  if (error) return null;
  return (data ?? []).map((row) => mapTrip(row as Record<string, unknown>));
}

export const getPublicHomeFeed = unstable_cache(loadHomeFeed, ['public-home-feed'], {
  revalidate: 60,
});

export const getPublicCommunityCounts = unstable_cache(loadCommunityCounts, ['public-community-counts'], {
  revalidate: 60,
});

export function getPublicMonthTrips(yearMonth: string) {
  return unstable_cache(() => loadMonthTrips(yearMonth), ['public-month-trips', yearMonth], {
    revalidate: 60,
  })();
}
