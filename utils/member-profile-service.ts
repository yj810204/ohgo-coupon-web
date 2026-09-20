import { doc, updateDoc } from 'firebase/firestore';
import { DATA_SOURCE, isFirebaseDataSource } from '@/lib/data-source';
import { getFirebaseDb } from '@/lib/firebase/client';
import { requireFirestoreUserId } from '@/lib/firebase/resolve-user-id';
import { invalidatePointCache } from '@/lib/firebase/user-points';
import { invalidateCache } from '@/lib/query-cache';
import * as supa from './member-profile-service.supabase';
import * as fb from './member-profile-service.firebase';

const impl = DATA_SOURCE === 'firebase' ? fb : supa;

export const getAvatarPublicUrl: typeof supa.getAvatarPublicUrl = (...a) =>
  impl.getAvatarPublicUrl(...a);
export const uploadAvatar: typeof supa.uploadAvatar = (...a) => impl.uploadAvatar(...a);
export const getMemberProfile: typeof supa.getMemberProfile = (...a) =>
  impl.getMemberProfile(...a);
export const resetTotalPoint: typeof supa.resetTotalPoint = async (userId) => {
  await impl.resetTotalPoint(userId);
  if (isFirebaseDataSource()) {
    try {
      const fbUserId = await requireFirestoreUserId(userId);
      await updateDoc(doc(getFirebaseDb(), 'users', fbUserId), { communityPoint: 0 });
    } catch (e) {
      console.error('reset communityPoint failed:', e);
    }
    invalidatePointCache();
  }
};
export const updateBaitCoupons: typeof supa.updateBaitCoupons = async (...a) => {
  const result = await impl.updateBaitCoupons(...a);
  invalidateCache('bait:');
  return result;
};
export const saveExpoPushToken: typeof supa.saveExpoPushToken = (...a) =>
  impl.saveExpoPushToken(...a);
export const getMemberTripCount: typeof supa.getMemberTripCount = (...a) =>
  impl.getMemberTripCount(...a);
export const updateTripCount: typeof supa.updateTripCount = async (...a) => {
  const result = await impl.updateTripCount(...a);
  invalidateCache('admin-stats:');
  return result;
};
