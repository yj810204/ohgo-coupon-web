import { collection, deleteDoc, getDocs } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
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
