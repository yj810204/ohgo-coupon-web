import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const DEFAULT_POINTS_PER_COMMENT = 1;
const DEFAULT_DAILY_POINT_LIMIT = 10;
const SETTINGS_KEY = 'community_points';

async function getPointSettings(): Promise<{ pointsPerComment: number; dailyLimit: number }> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  const value = (data?.value ?? {}) as { pointsPerComment?: number; dailyLimit?: number };
  return {
    pointsPerComment: value.pointsPerComment ?? DEFAULT_POINTS_PER_COMMENT,
    dailyLimit: value.dailyLimit ?? DEFAULT_DAILY_POINT_LIMIT,
  };
}

function getTodayStartIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  return start.toISOString();
}

async function getCommentsByUserAndPhoto(
  userId: string,
  photoId: string,
  excludeCommentId?: string
): Promise<Array<{ commentId: string; pointAwarded: number }>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('comments')
    .select('id, point_awarded')
    .eq('photo_id', photoId)
    .eq('user_id', userId);

  if (error) return [];

  return (data ?? [])
    .filter((row) => row.id !== excludeCommentId)
    .map((row) => ({
      commentId: row.id,
      pointAwarded: row.point_awarded ?? 0,
    }));
}

async function getTodayPoints(userId: string): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('comments')
    .select('point_awarded')
    .eq('user_id', userId)
    .gte('created_at', getTodayStartIso());

  if (error) return 0;
  return (data ?? []).reduce((sum, row) => sum + (row.point_awarded ?? 0), 0);
}

export type CommentPointAwardEval = {
  pointsToAward: number;
  isLimitReached: boolean;
  reason?: string;
  todayPoints: number;
  dailyLimit: number;
};

/** 일일 한도·중복 댓글 등 적립 자격만 판별. 잔액 쓰기는 호출측. */
export async function evaluateCommentPointAward(
  userId: string,
  photoId: string,
  commentId: string,
  photoUploadedBy?: string
): Promise<CommentPointAwardEval> {
  if (photoUploadedBy && photoUploadedBy === userId) {
    return {
      pointsToAward: 0,
      isLimitReached: false,
      reason: '본인 작성글에는 포인트가 적립되지 않습니다.',
      todayPoints: 0,
      dailyLimit: 0,
    };
  }

  const existingComments = await getCommentsByUserAndPhoto(userId, photoId, commentId);
  if (existingComments.length > 0) {
    return {
      pointsToAward: 0,
      isLimitReached: false,
      reason: '같은 게시글에는 한 번만 포인트가 적립됩니다.',
      todayPoints: 0,
      dailyLimit: 0,
    };
  }

  const settings = await getPointSettings();
  const todayPoints = await getTodayPoints(userId);

  if (todayPoints >= settings.dailyLimit) {
    return { pointsToAward: 0, isLimitReached: true, todayPoints, dailyLimit: settings.dailyLimit };
  }

  const availablePoints = settings.dailyLimit - todayPoints;
  const pointsToAward = Math.min(settings.pointsPerComment, availablePoints);

  if (pointsToAward <= 0) {
    return { pointsToAward: 0, isLimitReached: true, todayPoints, dailyLimit: settings.dailyLimit };
  }

  return {
    pointsToAward,
    isLimitReached: todayPoints + pointsToAward >= settings.dailyLimit,
    todayPoints,
    dailyLimit: settings.dailyLimit,
  };
}

export async function awardCommentPoints(
  userId: string,
  photoId: string,
  commentId: string,
  photoUploadedBy?: string
): Promise<{ points: number; totalPoints: number; isLimitReached: boolean; reason?: string }> {
  const evalResult = await evaluateCommentPointAward(userId, photoId, commentId, photoUploadedBy);
  if (evalResult.pointsToAward <= 0) {
    return {
      points: 0,
      totalPoints: await getCommunityPoints(userId),
      isLimitReached: evalResult.isLimitReached,
      reason: evalResult.reason,
    };
  }

  const pointsToAward = evalResult.pointsToAward;
  const supabase = getSupabaseBrowserClient();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('community_point')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }

  const nextCommunityPoints = (profile.community_point ?? 0) + pointsToAward;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ community_point: nextCommunityPoints })
    .eq('id', userId);

  if (updateError) throw updateError;

  await supabase.from('points').insert({
    user_id: userId,
    amount: pointsToAward,
    reason: 'community_comment',
    source_id: commentId,
  });

  return {
    points: pointsToAward,
    totalPoints: nextCommunityPoints,
    isLimitReached: evalResult.isLimitReached,
  };
}

export async function awardQnaAcceptedPoints(
  userId: string,
  commentId: string,
  photoUploadedBy?: string
): Promise<{ points: number; totalPoints: number; reason?: string }> {
  if (photoUploadedBy && photoUploadedBy === userId) {
    return {
      points: 0,
      totalPoints: await getCommunityPoints(userId),
      reason: '본인 작성글에는 포인트가 적립되지 않습니다.',
    };
  }

  const settings = await getPointSettings();
  const pointsToAward = settings.pointsPerComment;
  if (pointsToAward <= 0) {
    return { points: 0, totalPoints: await getCommunityPoints(userId) };
  }

  const supabase = getSupabaseBrowserClient();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('community_point')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }

  const nextCommunityPoints = (profile.community_point ?? 0) + pointsToAward;
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ community_point: nextCommunityPoints })
    .eq('id', userId);
  if (updateError) throw updateError;

  await supabase.from('points').insert({
    user_id: userId,
    amount: pointsToAward,
    reason: 'community_qna_accepted',
    source_id: commentId,
  });

  return { points: pointsToAward, totalPoints: nextCommunityPoints };
}

export async function getRemainingPoints(userId: string): Promise<number> {
  const settings = await getPointSettings();
  const todayPoints = await getTodayPoints(userId);
  return Math.max(0, settings.dailyLimit - todayPoints);
}

export async function getPointRules(): Promise<{ pointsPerComment: number; dailyLimit: number }> {
  return getPointSettings();
}

export async function savePointSettings(
  pointsPerComment: number,
  dailyLimit: number
): Promise<void> {
  if (pointsPerComment < 1) throw new Error('댓글당 포인트는 1 이상이어야 합니다.');
  if (dailyLimit < 1) throw new Error('하루 최대 포인트는 1 이상이어야 합니다.');

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('site_settings').upsert({
    key: SETTINGS_KEY,
    value: { pointsPerComment, dailyLimit, updatedAt: new Date().toISOString() },
  });

  if (error) throw error;
}

export async function getCommunityPoints(userId: string): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase
    .from('profiles')
    .select('community_point')
    .eq('id', userId)
    .maybeSingle();

  return data?.community_point ?? 0;
}

export async function deductCommentPoints(userId: string, pointsToDeduct: number): Promise<number> {
  if (pointsToDeduct <= 0) return getCommunityPoints(userId);

  const supabase = getSupabaseBrowserClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('community_point')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) throw new Error('사용자를 찾을 수 없습니다.');

  const next = Math.max(0, (profile.community_point ?? 0) - pointsToDeduct);
  await supabase.from('profiles').update({ community_point: next }).eq('id', userId);

  return next;
}
