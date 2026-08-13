import {
  collection,
  getDocs,
  getDocsFromServer,
  orderBy,
  query,
} from 'firebase/firestore';
import { isFirebaseDataSource } from '@/lib/data-source';
import { getFirebaseDb } from '@/lib/firebase/client';
import { resolveFirestoreUserId } from '@/lib/firebase/resolve-user-id';
import { COMMUNITY_POINT_HISTORY_COLLECTION } from '@/lib/firebase/community-point-history';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export type PointHistoryItem = {
  id: string;
  title: string;
  detail?: string;
  points: number;
  at: Date | null;
};

function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const fn = (value as { toDate?: () => Date }).toDate;
    if (typeof fn === 'function') {
      const d = fn.call(value);
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function sortByAtDesc(items: PointHistoryItem[]): PointHistoryItem[] {
  return [...items].sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
}

async function fetchSubcollection(
  fbUserId: string,
  sub: string
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const ref = collection(getFirebaseDb(), 'users', fbUserId, sub);
  try {
    const snap = await getDocsFromServer(query(ref, orderBy('at', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
  } catch {
    const snap = await getDocs(ref);
    return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
  }
}

function communityReasonLabel(reason: string, points: number): string {
  if (reason === 'community_comment_recall' || points < 0) return '댓글 삭제 · 포인트 회수';
  if (reason === 'community_comment') return '댓글 적립';
  return reason || '커뮤니티 포인트';
}

async function fetchCommunityCommentsFallback(userId: string): Promise<PointHistoryItem[]> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('comments')
      .select('id, content, point_awarded, created_at')
      .eq('user_id', userId)
      .gt('point_awarded', 0)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return data.map((row) => {
      const content = String(row.content ?? '').replace(/\s+/g, ' ').trim();
      return {
        id: `comment:${row.id}`,
        title: '댓글 적립',
        detail: content ? (content.length > 40 ? `${content.slice(0, 40)}…` : content) : undefined,
        points: Number(row.point_awarded) || 0,
        at: toDate(row.created_at),
      };
    });
  } catch {
    return [];
  }
}

async function fetchSupabasePoints(userId: string, kind: 'game' | 'community'): Promise<PointHistoryItem[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('points')
    .select('id, amount, reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data) return [];

  return data
    .filter((row) => {
      const reason = String(row.reason ?? '');
      const isCommunity = reason.startsWith('community');
      return kind === 'community' ? isCommunity : !isCommunity;
    })
    .map((row) => {
      const points = Number(row.amount) || 0;
      const reason = String(row.reason ?? '');
      return {
        id: String(row.id),
        title: kind === 'community' ? communityReasonLabel(reason, points) : reason || '게임 포인트',
        points,
        at: toDate(row.created_at),
      };
    });
}

export async function getGamePointHistory(userId: string): Promise<PointHistoryItem[]> {
  if (!isFirebaseDataSource()) return fetchSupabasePoints(userId, 'game');

  const fbUserId = await resolveFirestoreUserId(userId);
  if (!fbUserId) return [];

  const rows = await fetchSubcollection(fbUserId, 'points');
  const items = rows.map(({ id, data }) => {
    const points = Number(data.point ?? data.amount) || 0;
    const title = String(data.fishName || data.gameType || data.reason || '게임');
    const score = Number(data.score);
    const level = Number(data.level ?? data.fishLevel);
    const parts: string[] = [];
    if (Number.isFinite(score) && score > 0) parts.push(`점수 ${score.toLocaleString('ko-KR')}`);
    if (Number.isFinite(level) && level > 0) parts.push(`레벨 ${level}`);
    return {
      id,
      title,
      detail: parts.length ? parts.join(' · ') : undefined,
      points,
      at: toDate(data.at),
    };
  });
  return sortByAtDesc(items);
}

export async function getCommunityPointHistory(userId: string): Promise<PointHistoryItem[]> {
  if (!isFirebaseDataSource()) {
    const [fromPoints, fromComments] = await Promise.all([
      fetchSupabasePoints(userId, 'community'),
      fetchCommunityCommentsFallback(userId),
    ]);
    const seen = new Set(fromPoints.map((i) => i.id));
    return sortByAtDesc([
      ...fromPoints,
      ...fromComments.filter((i) => !seen.has(i.id)),
    ]);
  }

  const fbUserId = await resolveFirestoreUserId(userId);
  const [ledger, comments] = await Promise.all([
    fbUserId ? fetchSubcollection(fbUserId, COMMUNITY_POINT_HISTORY_COLLECTION) : Promise.resolve([]),
    fetchCommunityCommentsFallback(userId),
  ]);

  const fromLedger: PointHistoryItem[] = ledger.map(({ id, data }) => {
    const points = Number(data.point ?? data.amount) || 0;
    const reason = String(data.reason ?? '');
    return {
      id,
      title: communityReasonLabel(reason, points),
      points,
      at: toDate(data.at),
      sourceId: data.sourceId ? String(data.sourceId) : undefined,
    } as PointHistoryItem & { sourceId?: string };
  });

  const sourceIds = new Set(
    fromLedger
      .map((i) => ('sourceId' in i ? String((i as { sourceId?: string }).sourceId ?? '') : ''))
      .filter(Boolean)
  );
  const extraComments = comments.filter((c) => {
    const commentId = c.id.replace(/^comment:/, '');
    return !sourceIds.has(commentId);
  });

  return sortByAtDesc([...fromLedger, ...extraComments]).map(({ id, title, detail, points, at }) => ({
    id,
    title,
    detail,
    points,
    at,
  }));
}
