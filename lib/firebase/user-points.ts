import { doc, getDocFromServer, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import {
  appendCommunityPointHistory,
  type CommunityPointHistoryMeta,
} from '@/lib/firebase/community-point-history';
import { requireFirestoreUserId, resolveFirestoreUserId } from '@/lib/firebase/resolve-user-id';
import { cachedFetch, invalidateCache } from '@/lib/query-cache';
import { getCommunityPoints as getSupabaseCommunityPoints } from '@/utils/community-point-service.supabase';

/**
 * 구앱과 같은 사용 가능 잔액은 `users.totalPoint`.
 * `communityPoint`는 표시용 잔여 커뮤니티 적립분(구앱은 무시하는 추가 필드).
 * gamePoints = totalPoint - communityPoint.
 */
export type FirebasePointBalance = {
  gamePoints: number;
  communityPoints: number;
  total: number;
};

export const POINT_CACHE_PREFIX = 'points:';

export function invalidatePointCache() {
  invalidateCache(POINT_CACHE_PREFIX);
}

export function splitPointBalance(totalPoint: number, communityPoint: number): FirebasePointBalance {
  const total = Math.max(0, Number(totalPoint) || 0);
  const community = Math.min(Math.max(0, Number(communityPoint) || 0), total);
  return {
    gamePoints: Math.max(0, total - community),
    communityPoints: community,
    total,
  };
}

async function readAndMaybeMigrate(sessionUserId: string): Promise<FirebasePointBalance> {
  const fbUserId = await resolveFirestoreUserId(sessionUserId);
  if (!fbUserId) return { gamePoints: 0, communityPoints: 0, total: 0 };

  const userRef = doc(getFirebaseDb(), 'users', fbUserId);
  const snap = await getDocFromServer(userRef);
  if (!snap.exists()) return { gamePoints: 0, communityPoints: 0, total: 0 };

  const data = snap.data();
  const totalPoint = Number(data.totalPoint) || 0;
  const hasCommunityField = data.communityPoint !== undefined && data.communityPoint !== null;

  if (!hasCommunityField) {
    const legacyCommunity = await getSupabaseCommunityPoints(sessionUserId);
    if (legacyCommunity > 0) {
      const nextTotal = totalPoint + legacyCommunity;
      try {
        await updateDoc(userRef, { totalPoint: nextTotal, communityPoint: legacyCommunity });
        return splitPointBalance(nextTotal, legacyCommunity);
      } catch (e) {
        console.error('community point migrate failed:', e);
      }
    }
    return splitPointBalance(totalPoint, 0);
  }

  return splitPointBalance(totalPoint, Number(data.communityPoint) || 0);
}

export async function getFirebasePointBalance(sessionUserId: string): Promise<FirebasePointBalance> {
  return cachedFetch(`${POINT_CACHE_PREFIX}balance:${sessionUserId}`, 15_000, () =>
    readAndMaybeMigrate(sessionUserId)
  );
}

export async function creditCommunityPoints(
  sessionUserId: string,
  amount: number,
  meta?: CommunityPointHistoryMeta
): Promise<number> {
  await readAndMaybeMigrate(sessionUserId);
  const fbUserId = await requireFirestoreUserId(sessionUserId);
  const userRef = doc(getFirebaseDb(), 'users', fbUserId);
  const snap = await getDocFromServer(userRef);
  if (!snap.exists()) throw new Error('사용자를 찾을 수 없습니다.');

  const data = snap.data();
  const totalPoint = Math.max(0, (Number(data.totalPoint) || 0) + amount);
  const communityPoint = Math.max(0, (Number(data.communityPoint) || 0) + amount);
  await updateDoc(userRef, { totalPoint, communityPoint });
  await appendCommunityPointHistory(fbUserId, amount, {
    reason: meta?.reason || 'community_comment',
    sourceId: meta?.sourceId,
  });
  invalidatePointCache();
  return communityPoint;
}

export async function deductCommunityPoints(
  sessionUserId: string,
  amount: number,
  meta?: CommunityPointHistoryMeta
): Promise<number> {
  if (amount <= 0) {
    const balance = await getFirebasePointBalance(sessionUserId);
    return balance.communityPoints;
  }

  await readAndMaybeMigrate(sessionUserId);
  const fbUserId = await requireFirestoreUserId(sessionUserId);
  const userRef = doc(getFirebaseDb(), 'users', fbUserId);
  const snap = await getDocFromServer(userRef);
  if (!snap.exists()) throw new Error('사용자를 찾을 수 없습니다.');

  const data = snap.data();
  const totalPoint = Math.max(0, (Number(data.totalPoint) || 0) - amount);
  const communityPoint = Math.max(0, (Number(data.communityPoint) || 0) - amount);
  await updateDoc(userRef, { totalPoint, communityPoint });
  await appendCommunityPointHistory(fbUserId, -amount, {
    reason: meta?.reason || 'community_comment_recall',
    sourceId: meta?.sourceId,
  });
  invalidatePointCache();
  return communityPoint;
}
