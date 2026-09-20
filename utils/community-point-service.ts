import { isFirebaseDataSource } from '@/lib/data-source';
import {
  creditCommunityPoints,
  deductCommunityPoints,
  getFirebasePointBalance,
} from '@/lib/firebase/user-points';
import * as supa from './community-point-service.supabase';

export const getRemainingPoints = supa.getRemainingPoints;
export const getPointRules = supa.getPointRules;
export const savePointSettings = supa.savePointSettings;

export async function getCommunityPoints(userId: string): Promise<number> {
  if (!isFirebaseDataSource()) return supa.getCommunityPoints(userId);
  const balance = await getFirebasePointBalance(userId);
  return balance.communityPoints;
}

export async function awardCommentPoints(
  userId: string,
  photoId: string,
  commentId: string,
  photoUploadedBy?: string
): Promise<{ points: number; totalPoints: number; isLimitReached: boolean; reason?: string }> {
  if (!isFirebaseDataSource()) {
    return supa.awardCommentPoints(userId, photoId, commentId, photoUploadedBy);
  }

  const evalResult = await supa.evaluateCommentPointAward(userId, photoId, commentId, photoUploadedBy);
  if (evalResult.pointsToAward <= 0) {
    return {
      points: 0,
      totalPoints: await getCommunityPoints(userId),
      isLimitReached: evalResult.isLimitReached,
      reason: evalResult.reason,
    };
  }

  const totalPoints = await creditCommunityPoints(userId, evalResult.pointsToAward, {
    reason: 'community_comment',
    sourceId: commentId,
  });
  return {
    points: evalResult.pointsToAward,
    totalPoints,
    isLimitReached: evalResult.isLimitReached,
  };
}

export async function awardQnaAcceptedPoints(
  userId: string,
  commentId: string,
  photoUploadedBy?: string
): Promise<{ points: number; totalPoints: number; reason?: string }> {
  if (!isFirebaseDataSource()) {
    return supa.awardQnaAcceptedPoints(userId, commentId, photoUploadedBy);
  }

  if (photoUploadedBy && photoUploadedBy === userId) {
    return {
      points: 0,
      totalPoints: await getCommunityPoints(userId),
      reason: '본인 작성글에는 포인트가 적립되지 않습니다.',
    };
  }

  const rules = await getPointRules();
  if (rules.pointsPerComment <= 0) {
    return { points: 0, totalPoints: await getCommunityPoints(userId) };
  }
  const totalPoints = await creditCommunityPoints(userId, rules.pointsPerComment, {
    reason: 'community_qna_accepted',
    sourceId: commentId,
  });
  return { points: rules.pointsPerComment, totalPoints };
}

export async function deductCommentPoints(userId: string, pointsToDeduct: number): Promise<number> {
  if (!isFirebaseDataSource()) return supa.deductCommentPoints(userId, pointsToDeduct);
  return deductCommunityPoints(userId, pointsToDeduct, { reason: 'community_comment_recall' });
}
