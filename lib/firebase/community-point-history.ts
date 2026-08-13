import { addDoc, collection } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';

export const COMMUNITY_POINT_HISTORY_COLLECTION = 'communityPointHistory';

export type CommunityPointHistoryMeta = {
  reason?: string;
  sourceId?: string;
};

export async function appendCommunityPointHistory(
  fbUserId: string,
  point: number,
  meta?: CommunityPointHistoryMeta
): Promise<void> {
  if (!fbUserId || !point) return;
  try {
    await addDoc(collection(getFirebaseDb(), 'users', fbUserId, COMMUNITY_POINT_HISTORY_COLLECTION), {
      point,
      reason: meta?.reason || (point >= 0 ? 'community_comment' : 'community_comment_recall'),
      sourceId: meta?.sourceId ?? null,
      at: new Date(),
    });
  } catch (e) {
    console.error('community point history write failed:', e);
  }
}
