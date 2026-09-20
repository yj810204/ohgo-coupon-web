import { addDoc, collection, deleteDoc, getDocs, Timestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { resolveFirestoreUserId } from '@/lib/firebase/resolve-user-id';
import type { UserActionLog } from './user-action-log-service.shared';

export async function getUserActionLogs(userId: string): Promise<UserActionLog[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, `users/${userId}/logs`));
  return snap.docs
    .map((d) => {
      const data = d.data();
      const ts = data.timestamp?.toDate?.() ?? new Date();
      return {
        id: d.id,
        action: String(data.action ?? ''),
        detail: String(data.detail ?? ''),
        timestamp: ts instanceof Date ? ts : new Date(),
      };
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export async function clearUserActionLogs(userId: string): Promise<void> {
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, `users/${userId}/logs`));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export async function addUserActionLog(
  userId: string,
  action: string,
  detail: string
): Promise<void> {
  const db = getFirebaseDb();
  await addDoc(collection(db, `users/${userId}/logs`), {
    action,
    detail,
    timestamp: Timestamp.now(),
  });
}

export async function updateLatestUserActionLog(
  userId: string,
  action: string,
  fromDetail: string,
  toDetail: string
): Promise<boolean> {
  const db = getFirebaseDb();
  const mapped = (await resolveFirestoreUserId(userId)) ?? userId;
  const ids = mapped === userId ? [userId] : [mapped, userId];

  for (const id of ids) {
    const snap = await getDocs(collection(db, `users/${id}/logs`));
    const match = snap.docs
      .filter((d) => d.data().action === action && d.data().detail === fromDetail)
      .sort((a, b) => {
        const at = a.data().timestamp?.toMillis?.() ?? 0;
        const bt = b.data().timestamp?.toMillis?.() ?? 0;
        return bt - at;
      })[0];
    if (!match) continue;
    await updateDoc(match.ref, { detail: toDetail });
    return true;
  }
  return false;
}
